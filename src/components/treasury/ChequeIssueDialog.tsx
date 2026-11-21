import React, { useState, useEffect, useMemo } from "react";
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
import { TreasurySelect } from "./TreasurySelect";
import { CoaAccountSelector } from "../accounting/CoaAccountSelector";
import { useSuppliers } from "../../hooks/useProcurement";
import { useOperatingUnits } from "../../hooks/usePartners";
import { useAccounts, useIsCompanyWide } from "../../hooks/useAccounting";
import { useIssueCheque } from "../../hooks/useCheques";
import { localDateIso } from "../../lib/utils/format";
import { EMPLOYEE_ADVANCES_ROOT_CODE, TREASURY_ROOT_CODE, accountSubtreeIds } from "../../lib/utils/coa";
import { apiErrorMessage } from "../../api/endpoints/production";
import type { Cheque, IssueChequePayload } from "../../api/endpoints/cheques";
import type { Supplier } from "../../types/procurement";

export interface ChequeIssueDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (cheque: Cheque) => void;
}

export const ChequeIssueDialog: React.FC<ChequeIssueDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const today = localDateIso();

  const [cashAccountId, setCashAccountId] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [issueDate, setIssueDate] = useState(today);
  const [mode, setMode] = useState<"supplier" | "account">("supplier");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [payeeName, setPayeeName] = useState("");
  const [notes, setNotes] = useState("");
  const [operatingUnitId, setOperatingUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isCompanyWide = useIsCompanyWide();
  const { data: suppliers = [] } = useSuppliers();
  const { data: accounts = [] } = useAccounts();
  const { data: units = [] } = useOperatingUnits();

  // Treasury accounts are the 121 subtree by parent (W5-00 moved 1214/1215 out to 12).
  // A cheque carries no employee, so the advances subtree (1215, needs one) is left out too.
  const excludedCounterIds = useMemo(() => {
    const ids = accountSubtreeIds(accounts, TREASURY_ROOT_CODE);
    accountSubtreeIds(accounts, EMPLOYEE_ADVANCES_ROOT_CODE).forEach((id) => ids.add(id));
    return ids;
  }, [accounts]);

  const issueMutation = useIssueCheque();

  useEffect(() => {
    if (open) {
      setCashAccountId("");
      setChequeNo("");
      setAmount("");
      setDueDate("");
      setIssueDate(localDateIso());
      setMode("supplier");
      setSupplierId(null);
      setSelectedAccountId(null);
      setPayeeName("");
      setNotes("");
      setOperatingUnitId("");
      setError(null);
    }
  }, [open]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cashAccountId) {
      setError("يجب اختيار الحساب المصرفي المسحوب عليه الشيك.");
      return;
    }

    if (!chequeNo.trim()) {
      setError("رقم الشيك مطلوب.");
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setError("المبلغ يجب أن يكون أكبر من صفر.");
      return;
    }

    if (!dueDate) {
      setError("تاريخ الاستحقاق مطلوب.");
      return;
    }

    if (mode === "supplier") {
      if (!supplierId) {
        setError("يجب اختيار المورد.");
        return;
      }
    } else {
      if (!selectedAccount) {
        setError("يجب اختيار الحساب المقابل من الدليل.");
        return;
      }
      if (!payeeName.trim()) {
        setError("اسم المستفيد مطلوب.");
        return;
      }
    }

    if (isCompanyWide && !operatingUnitId) {
      setError("يرجى اختيار الوحدة التشغيلية.");
      return;
    }

    const payload: IssueChequePayload = {
      cash_account_id: cashAccountId,
      cheque_no: chequeNo.trim(),
      amount: numAmount,
      due_date: dueDate,
      issue_date: issueDate || undefined,
      supplier_id: mode === "supplier" && supplierId ? supplierId : undefined,
      counter_account_code:
        mode === "account" && selectedAccount
          ? selectedAccount.account_code
          : undefined,
      payee_name: mode === "account" ? payeeName.trim() : undefined,
      notes: notes.trim() || undefined,
      operating_unit_id:
        isCompanyWide && operatingUnitId ? operatingUnitId : undefined,
    };

    issueMutation.mutate(payload, {
      onSuccess: (newCheque) => {
        onClose();
        if (onSuccess) {
          onSuccess(newCheque);
        }
      },
      onError: (err) => {
        setError(apiErrorMessage(err, "تعذر إصدار الشيك."));
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle>إصدار شيك جديد (شيكات صادرة)</DialogTitle>
          <DialogClose />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            {error && (
              <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs font-semibold text-app-status-danger">
                {error}
              </div>
            )}

            {/* Bank drawn on (TreasurySelect showing balance) */}
            <TreasurySelect
              kind="bank"
              label="المصرف المسحوب عليه"
              value={cashAccountId}
              onChange={setCashAccountId}
              required
            />

            {/* Cheque No & Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  رقم الشيك <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={chequeNo}
                  onChange={(e) => setChequeNo(e.target.value)}
                  placeholder="مثال: 0045678"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  المبلغ (د.ل) <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-sm font-mono focus:border-app-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Dates: Due Date, Issue Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  تاريخ الاستحقاق <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  تاريخ الإصدار / التحرير <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="date"
                  required
                  max={today}
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Counterparty Toggle: Supplier vs Other Account */}
            <div className="rounded-xl border border-app-separator bg-app-bg-secondary/40 p-3 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-app-label-secondary">
                  المستفيد (الطرف المقابل):
                </span>
                <div className="inline-flex items-center rounded-xl border border-app-separator bg-app-bg-secondary p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMode("supplier")}
                    className={`rounded-lg px-3 py-1 font-semibold transition-colors ${
                      mode === "supplier"
                        ? "bg-app-accent text-white shadow-sm"
                        : "text-app-label-secondary hover:text-app-label-primary"
                    }`}
                  >
                    مورد
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("account")}
                    className={`rounded-lg px-3 py-1 font-semibold transition-colors ${
                      mode === "account"
                        ? "bg-app-accent text-white shadow-sm"
                        : "text-app-label-secondary hover:text-app-label-primary"
                    }`}
                  >
                    حساب آخر
                  </button>
                </div>
              </div>

              {mode === "supplier" ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-app-label-secondary">
                    المورد <span className="text-app-status-danger">*</span>
                  </label>
                  <SearchableSelect<Supplier>
                    options={suppliers}
                    value={selectedSupplier}
                    onChange={(s) => setSupplierId(s ? s.id : null)}
                    getOptionId={(s) => s.id}
                    getOptionLabel={(s) => s.name}
                    getOptionSubLabel={(s) =>
                      s.account
                        ? `${s.account.account_code} — ${s.account.name}`
                        : undefined
                    }
                    getOptionSearchText={(s) =>
                      `${s.name} ${s.account?.account_code ?? ""}`
                    }
                    placeholder="ابحث عن المورد بالاسم أو الرمز…"
                    size="sm"
                  />
                  {selectedSupplier && selectedSupplier.account && (
                    <div className="flex flex-wrap items-center justify-between rounded-lg border border-app-separator bg-app-bg-secondary/60 px-3 py-1.5 text-[11px] font-mono text-app-label-secondary">
                      <span>حساب الأستاذ للمورد:</span>
                      <span className="font-bold text-app-label-primary">
                        {selectedSupplier.account.account_code} —{" "}
                        {selectedSupplier.account.name}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                      اسم المستفيد <span className="text-app-status-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={payeeName}
                      onChange={(e) => setPayeeName(e.target.value)}
                      placeholder="اسم الجهة أو الشخص المستفيد من الشيك…"
                      className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                    />
                  </div>

                  <div className="pt-1">
                    <CoaAccountSelector
                      entityTypeLabel="الحساب المقابل"
                      selectedAccountId={selectedAccountId}
                      onSelectedAccountIdChange={(id) => {
                        setSelectedAccountId(id);
                        const acc = accounts.find((a) => a.id === id);
                        if (acc?.name && !payeeName.trim()) {
                          setPayeeName(acc.name);
                        }
                      }}
                      filter={(a) => !excludedCounterIds.has(a.id)}
                      hideActionToggle
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                ملاحظات
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات أو بيانات إضافية حول إصدار الشيك…"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
              />
            </div>

            {/* Unit Select (Required for company-wide users, no "automatic" option) */}
            {isCompanyWide && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  الوحدة التشغيلية <span className="text-app-status-danger">*</span>
                </label>
                <select
                  required
                  value={operatingUnitId}
                  onChange={(e) => setOperatingUnitId(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                >
                  <option value="">اختر الوحدة…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={issueMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={issueMutation.isPending}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {issueMutation.isPending ? "جارٍ الإصدار…" : "تأكيد وإصدار الشيك"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
