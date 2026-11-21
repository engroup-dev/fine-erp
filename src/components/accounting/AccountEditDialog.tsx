import React, { useEffect, useMemo, useRef, useState } from "react";
import { Lock, GitMerge } from "lucide-react";
import { isAxiosError } from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../ui/Dialog";
import { SearchableSelect } from "../ui/SearchableSelect";
import type { Account, UpdateAccountPayload } from "../../api/endpoints/accounting";
import { useAccounts, useSaveAccountEdits } from "../../hooks/useAccounting";
import { toast } from "../../stores/toastStore";
import { apiErrorPayload } from "../../api/endpoints/production";

export interface AccountEditDialogProps {
  open: boolean;
  account: Account | null;
  onClose: () => void;
  onSubmit?: (payload: UpdateAccountPayload) => Promise<void> | void;
  isPending?: boolean;
}

interface ReparentConfirm {
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
}

export const AccountEditDialog: React.FC<AccountEditDialogProps> = ({
  open,
  account,
  onClose,
  onSubmit,
  isPending: externalIsPending = false,
}) => {
  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [currency, setCurrency] = useState("LYD");
  const [parentAccountId, setParentAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reparentConfirm, setReparentConfirm] = useState<ReparentConfirm | null>(null);

  const { data: accounts = [] } = useAccounts();
  const saveAccountEdits = useSaveAccountEdits();
  const isSaving = externalIsPending || saveAccountEdits.isPending;

  // Track the values that were open at the last open() so we can detect what changed.
  const initialParentRef = useRef<string | null>(null);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setAccountCode(account.account_code);
      setCurrency(account.currency);
      setParentAccountId(account.parent_account_id ?? null);
      initialParentRef.current = account.parent_account_id ?? null;
      setError(null);
      setReparentConfirm(null);
    }
  }, [account?.id, account?.name, account?.account_code, account?.currency, account?.parent_account_id, account]);

  /**
   * Same-type candidates, excluding the account itself + all descendants.
   * Allows main accounts (parent_account_id IS NULL) so the operator can move
   * a sub-account directly under a main account of matching type.
   */
  const parentCandidates = useMemo(() => {
    if (!account) return [] as Account[];

    const byParent = new Map<string | null, Account[]>();
    for (const a of accounts) {
      const key = a.parent_account_id;
      byParent.set(key, [...(byParent.get(key) ?? []), a]);
    }
    const forbidden = new Set<string>([account.id]);
    const walk = (parentId: string): void => {
      for (const child of byParent.get(parentId) ?? []) {
        if (forbidden.has(child.id)) continue;
        forbidden.add(child.id);
        walk(child.id);
      }
    };
    walk(account.id);

    return accounts.filter(
      (a) =>
        a.id !== account.id &&
        !forbidden.has(a.id) &&
        a.type === account.type,
    );
  }, [account, accounts]);

  if (!account) {
    return null;
  }

  const isMain = account.is_main;
  // The server locks the code of an account with postings (ACCOUNT_CODE_LOCKED).
  const hasPostings = (account.direct_debit ?? 0) + (account.direct_credit ?? 0) > 0;
  const codeLocked = isMain || hasPostings;
  const currentParentAccount = parentAccountId
    ? accounts.find((a) => a.id === parentAccountId) ?? null
    : null;

  const buildBasePayload = (): UpdateAccountPayload => {
    const trimmedName = name.trim();
    const payload: UpdateAccountPayload = {
      name: trimmedName,
      currency: currency.trim().toUpperCase() || account.currency,
    };
    if (!codeLocked && accountCode.trim() && accountCode.trim() !== account.account_code) {
      payload.account_code = accountCode.trim();
    }
    return payload;
  };

  const fireSave = async () => {
    setError(null);
    const payload = buildBasePayload();
    if (!payload.name) {
      setError("اسم الحساب مطلوب.");
      return;
    }
    try {
      await saveAccountEdits.mutateAsync({
        id: account.id,
        payload,
        newParentId: parentAccountId ?? undefined,
        currentParentId: account.parent_account_id ?? null,
      });
      toast.success("تم تحديث الحساب بنجاح");
      if (onSubmit) await onSubmit(payload);
      onClose();
    } catch (err: unknown) {
      const data = apiErrorPayload(err);
      toast.error(data?.message ?? "فشل تحديث الحساب");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMain || !isMain) {
      // No-op gate; we always re-enter below after confirming parent change.
    }
    const parentChanged =
      !isMain && (parentAccountId ?? null) !== (account.parent_account_id ?? null);
    if (parentChanged) {
      const from = accounts.find((a) => a.id === account.parent_account_id);
      const to = accounts.find((a) => a.id === parentAccountId);
      if (!to) {
        setError("لم يتم العثور على الحساب الأب المختار.");
        return;
      }
      setReparentConfirm({
        fromCode: from?.account_code ?? "—",
        fromName: from?.name ?? "(بلا أب)",
        toCode: to.account_code,
        toName: to.name,
      });
      return;
    }
    void fireSave();
  };

  const handleConfirmReparent = () => {
    setReparentConfirm(null);
    void fireSave();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تعديل الحساب</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-4">
              {error && (
                <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-2.5 text-xs text-app-status-danger">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-app-label-secondary">
                  كود الحساب
                  {isMain ? (
                    <span className="text-app-label-tertiary text-[10px] ms-1">
                      (الحساب الرئيسي — ثابت)
                    </span>
                  ) : hasPostings ? (
                    <span className="text-app-label-tertiary text-[10px] ms-1">
                      (لا يمكن تغيير رمز حساب عليه حركات)
                    </span>
                  ) : null}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={accountCode}
                    onChange={(e) => setAccountCode(e.target.value)}
                    disabled={codeLocked}
                    dir="ltr"
                    className={`w-full font-mono rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none ${
                      codeLocked ? "opacity-60 cursor-not-allowed" : ""
                    }`}
                  />
                  {codeLocked ? (
                    <Lock className="absolute end-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-app-label-tertiary" />
                  ) : null}
                </div>
                {isMain ? (
                  <p className="mt-1 text-[10px] text-app-label-tertiary">
                    لا يمكن تغيير كود الحسابات الرئيسية. أضف حسابًا فرعيًا تحت هذا الحساب بدلًا من ذلك.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-app-label-secondary">
                  اسم الحساب <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-app-label-secondary">
                  العملة <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  maxLength={3}
                  dir="ltr"
                  className="w-full font-mono uppercase rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-app-label-secondary">
                  <GitMerge className="h-3.5 w-3.5 text-app-accent" />
                  الحساب الأب
                  {isMain ? (
                    <span className="text-app-label-tertiary text-[10px]">
                      (الحسابات الرئيسية لا يمكن تغيير حسابها الأب)
                    </span>
                  ) : null}
                </label>
                {isMain ? (
                  <div className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-secondary">
                    لا يوجد — هذا حساب رئيسي.
                  </div>
                ) : (
                  <>
                    <SearchableSelect<Account>
                      options={parentCandidates}
                      value={
                        parentAccountId
                          ? parentCandidates.find((a) => a.id === parentAccountId) ?? null
                          : null
                      }
                      onChange={(a) => setParentAccountId(a ? a.id : null)}
                      getOptionId={(a) => a.id}
                      getOptionLabel={(a) => `${a.account_code} - ${a.name}`}
                      getOptionSearchText={(a) => `${a.account_code} ${a.name}`}
                      placeholder={
                        parentCandidates.length === 0
                          ? "لا توجد حسابات مرشحة من نفس النوع"
                          : "-- اختر الحساب الأب --"
                      }
                    />
                    <p className="mt-1 text-[10px] text-app-label-tertiary leading-relaxed">
                      الحسابات الرئيسية من نفس النوع ({account.type}) تظهر في القائمة.
                      عند تغيير الحساب الأب ستنتقل جميع الفروع الفرعية معه تلقائيًا.
                    </p>
                  </>
                )}
                {!isMain && currentParentAccount && (
                  <p className="mt-1 text-[10px] text-app-label-secondary">
                    الحالي: <span className="font-mono">{currentParentAccount.account_code}</span> — {currentParentAccount.name}
                  </p>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {isSaving ? "جارٍ الحفظ…" : "حفظ التعديلات"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reparent confirmation. Opens automatically when the parent picker
          changed and the operator clicks Save; on confirm, fires the full save
          (PUT + PATCH in sequence). On cancel, dialog stays open. */}
      <Dialog
        open={Boolean(reparentConfirm)}
        onOpenChange={(o) => { if (!o) setReparentConfirm(null); }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>تأكيد نقل الحساب الأب</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody className="space-y-3">
            {reparentConfirm && (
              <>
                <p className="text-xs text-app-label-secondary leading-relaxed">
                  هل تريد نقل الحساب{' '}
                  <span className="font-mono font-bold text-app-label-primary">
                    {account.account_code}
                  </span>{' '}
                  — {account.name} من الحساب{' '}
                  <span className="font-mono text-app-label-primary">
                    {reparentConfirm.fromCode}
                  </span>{' '}
                  — {reparentConfirm.fromName} إلى الحساب{' '}
                  <span className="font-mono text-app-label-primary">
                    {reparentConfirm.toCode}
                  </span>{' '}
                  — {reparentConfirm.toName}؟
                </p>
                <p className="rounded-xl border border-app-status-warning/30 bg-app-status-warning/10 p-2.5 text-[11px] text-app-status-warning">
                  الفروع الفرعية للحساب ستنتقل معه تلقائيًا. لا يمكن التراجع.
                </p>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setReparentConfirm(null)}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleConfirmReparent}
              className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90"
            >
              نعم، انقل
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
