import React, { useEffect, useState } from "react";
import { Banknote, Landmark } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../ui/Dialog";
import { SearchableSelect } from "../ui/SearchableSelect";
import { useAccounts } from "../../hooks/useAccounting";
import { useCreateCashAccount, useUpdateCashAccount } from "../../hooks/useTreasury";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import { apiErrorPayload } from "../../api/endpoints/production";
import { formatNumber, localDateIso } from "../../lib/utils/format";
import type { Account } from "../../api/endpoints/accounting";
import type { CashAccount, CashAccountKind } from "../../types/procurement";
import { toast } from "../../stores/toastStore";
import { BANK_ROOT_CODE, TREASURY_ROOT_CODE, accountSubtreeIds, leafAccounts } from "../../lib/utils/coa";

interface CashAccountDialogProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing treasury; null creates a new one in the current unit. */
  cashAccount: CashAccount | null;
  /** CR 8: opened from the cash-box or bank page, a new treasury takes that kind and cannot switch. */
  fixedKind?: CashAccountKind;
}

export const CashAccountDialog: React.FC<CashAccountDialogProps> = ({ open, onClose, cashAccount, fixedKind }) => {
  const operatingUnitId = useServerConfigStore((s) => s.operatingUnitId);
  const { data: accounts = [] } = useAccounts();
  const createMutation = useCreateCashAccount();
  const updateMutation = useUpdateCashAccount();

  const [name, setName] = useState("");
  const [kind, setKind] = useState<CashAccountKind>("cash");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingDate, setOpeningDate] = useState(localDateIso());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(cashAccount?.name ?? "");
    setKind(cashAccount?.kind ?? fixedKind ?? "cash");
    setAccountId(cashAccount?.account_id ?? null);
    setOpeningBalance("");
    setOpeningDate(localDateIso());
    setError(null);
  }, [open, cashAccount, fixedKind]);

  // TRS-01: the opening balance reaches the ledger once; until then it can still be entered here.
  const canSetOpening = !cashAccount || !cashAccount.has_opening_entry;
  const kindLocked = !cashAccount && Boolean(fixedKind);

  // Treasuries and banks live in the 121 الأموال الجاهزة والنقدية subtree (by parent, not code prefix).
  const treasuryIds = accountSubtreeIds(accounts, TREASURY_ROOT_CODE);
  // CR 8: banks link under 1212 and cash boxes never do (the backend refuses the mix).
  const bankIds = accountSubtreeIds(accounts, BANK_ROOT_CODE);
  // The account already linked stays listed even if it is outside 121 (e.g. a pre-W5-00 link to
  // 1214/1215), so the form shows what the treasury actually holds instead of a blank picker.
  const linkedAccountId = cashAccount?.account_id ?? null;
  const treasuryAccounts = leafAccounts(accounts, [], [linkedAccountId]).filter(
    (a) =>
      a.id === linkedAccountId ||
      (treasuryIds.has(a.id) && a.account_code !== TREASURY_ROOT_CODE && (kind === "bank") === bankIds.has(a.id)),
  );
  const selectedAccount = treasuryAccounts.find((a) => a.id === accountId) ?? null;
  const selectedOutsideTreasury = selectedAccount !== null && !treasuryIds.has(selectedAccount.id);
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const opening = openingBalance.trim() === "" ? null : Number(openingBalance);
    if (opening !== null && !Number.isFinite(opening)) {
      setError("أدخل الرصيد الافتتاحي رقماً صحيحاً.");
      return;
    }
    const openingFields = canSetOpening && opening !== null && opening !== 0 ? { opening_date: openingDate } : {};
    const onError = (err: unknown) => setError(apiErrorPayload(err)?.message ?? "تعذّر حفظ الخزينة.");
    const onSuccess = () => {
      toast.success(cashAccount ? "تم حفظ الخزينة" : "تمت إضافة الخزينة");
      onClose();
    };

    if (cashAccount) {
      updateMutation.mutate(
        {
          id: cashAccount.id,
          payload: {
            name: name.trim(),
            kind,
            account_id: accountId,
            ...(openingFields.opening_date ? { opening_balance: opening as number, ...openingFields } : {}),
          },
        },
        { onSuccess, onError },
      );
      return;
    }

    if (!operatingUnitId) {
      setError("اختر الوحدة التشغيلية أولاً.");
      return;
    }

    createMutation.mutate(
      {
        operating_unit_id: operatingUnitId,
        name: name.trim(),
        kind,
        account_id: accountId,
        ...(openingFields.opening_date ? { balance: opening as number, ...openingFields } : {}),
      },
      { onSuccess, onError },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <div>
            <DialogTitle>
              {cashAccount
                ? "تعديل الخزينة"
                : fixedKind === "bank"
                  ? "حساب مصرفي جديد"
                  : fixedKind === "cash"
                    ? "خزينة نقدية جديدة"
                    : "خزينة أو حساب مصرفي جديد"}
            </DialogTitle>
            <DialogDescription>
              المبيعات النقدية والمصرفية تُقيَّد على الحساب المحاسبي المربوط بهذه الخزينة.
            </DialogDescription>
          </div>
          <DialogClose />
        </DialogHeader>
        <DialogBody>
          <form id="cash-account-form" onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">الاسم</label>
              <input
                type="text"
                required
                placeholder="مثال: خزينة الصالة"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
              />
            </div>

            <div className={kindLocked ? "hidden" : undefined}>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">النوع</label>
              <div className="flex gap-2">
                {([
                  { value: "cash", label: "خزينة نقدية", icon: Banknote },
                  { value: "bank", label: "حساب مصرفي", icon: Landmark },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setKind(opt.value);
                      if (opt.value !== kind) setAccountId(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border ${
                      kind === opt.value
                        ? "border-app-accent bg-app-accent text-white"
                        : "border-app-separator bg-app-bg-secondary text-app-label-secondary"
                    }`}
                  >
                    <opt.icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">الحساب المحاسبي</label>
              <SearchableSelect<Account>
                options={treasuryAccounts}
                value={selectedAccount}
                onChange={(a) => setAccountId(a ? a.id : null)}
                getOptionId={(a) => a.id}
                getOptionLabel={(a) => `${a.account_code} — ${a.name}`}
                getOptionSearchText={(a) => `${a.account_code} ${a.name}`}
                placeholder={kind === "bank" ? "اختر حساب المصرف…" : "اختر حساب الخزينة…"}
              />
              <p className="text-[11px] text-app-label-tertiary mt-1">
                {kind === "bank"
                  ? "من «حسابات المصارف» (1212)."
                  : "من «الخزائن النقدية» ضمن «الأموال الجاهزة والنقدية» (121)."}{" "}
                بدون ربط لا يمكن استلام مبيعات عليها.
              </p>
              {selectedOutsideTreasury && (
                <p className="text-[11px] text-app-status-warning mt-1">
                  الحساب المربوط حالياً لم يعد ضمن «الأموال الجاهزة والنقدية» (121) — اختر حساب خزينة أو مصرف بدلاً منه.
                </p>
              )}
            </div>

            {canSetOpening ? (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-app-separator bg-app-bg-secondary/50 p-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-app-separator rounded-xl bg-app-bg-primary text-xs font-mono focus:border-app-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">بتاريخ</label>
                  <input
                    type="date"
                    value={openingDate}
                    max={localDateIso()}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    className="w-full px-3 py-2 border border-app-separator rounded-xl bg-app-bg-primary text-xs focus:border-app-accent focus:outline-none"
                  />
                </div>
                <p className="col-span-2 text-[11px] text-app-label-tertiary">
                  يُرحَّل مرة واحدة كقيد افتتاحي (مدين الخزينة / دائن «أرصدة افتتاحية» 34)
                  {accountId ? "" : " عند ربط الخزينة بحساب محاسبي"}. بعد ترحيله يُصحَّح بقيد يومية فقط.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-app-label-tertiary">
                الرصيد الافتتاحي ({formatNumber(cashAccount?.balance ?? 0)}) مُرحَّل في الدفاتر.
              </p>
            )}
          </form>
        </DialogBody>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
          >
            إلغاء
          </button>
          <button
            type="submit"
            form="cash-account-form"
            disabled={isPending || !name.trim()}
            className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
          >
            {isPending ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
