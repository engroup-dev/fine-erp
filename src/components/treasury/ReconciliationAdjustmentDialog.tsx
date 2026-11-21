import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../ui/Dialog";
import { CoaAccountSelector } from "../accounting/CoaAccountSelector";
import { SearchableSelect } from "../ui/SearchableSelect";
import { useAccounts } from "../../hooks/useAccounting";
import { useClients } from "../../hooks/useClients";
import { useTreasuryOptions } from "../../hooks/useProcurement";
import { useAddReconciliationAdjustment } from "../../hooks/useBankReconciliations";
import { apiErrorMessage } from "../../api/endpoints/production";
import { TREASURY_ROOT_CODE, accountSubtreeIds } from "../../lib/utils/coa";
import { formatDate } from "../../lib/utils/format";
import {
  ADJUSTMENT_TYPES,
  type AddReconciliationAdjustmentPayload,
  type BankReconciliationAdjustmentType,
} from "../../api/endpoints/bankReconciliations";
import type { Client } from "../../types/entities";

export interface ReconciliationAdjustmentDialogProps {
  open: boolean;
  onClose: () => void;
  reconciliationId: string;
  /** Adjustments are dated on or before the statement date. */
  statementDate: string;
  currency: string;
}

/**
 * CR 9: a bank charge, interest or direct deposit/debit that is on the
 * statement but not in the books is posted from here as a voucher on the bank
 * and cleared at once, so the difference can reach zero.
 */
export const ReconciliationAdjustmentDialog: React.FC<ReconciliationAdjustmentDialogProps> = ({
  open,
  onClose,
  reconciliationId,
  statementDate,
  currency,
}) => {
  const [type, setType] = useState<BankReconciliationAdjustmentType>("bank_charge");
  const [counterMode, setCounterMode] = useState<"account" | "client">("account");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState("");
  const [date, setDate] = useState(statementDate);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: accounts = [] } = useAccounts();
  const { data: clients = [] } = useClients();
  const { data: treasuries = [] } = useTreasuryOptions();
  const addMutation = useAddReconciliationAdjustment();

  const typeInfo = ADJUSTMENT_TYPES.find((t) => t.value === type) ?? ADJUSTMENT_TYPES[0];
  const isForeign = Boolean(currency) && currency !== "LYD" && currency !== "د.ل";

  useEffect(() => {
    if (open) {
      setType("bank_charge");
      setCounterMode("account");
      setSelectedAccountId(null);
      setClientId(null);
      setAmount("");
      setFxRate("");
      setDate(statementDate);
      setDescription("");
      setError(null);
    }
  }, [open, statementDate]);

  const handleTypeChange = (next: BankReconciliationAdjustmentType) => {
    setType(next);
    setSelectedAccountId(null);
    const info = ADJUSTMENT_TYPES.find((t) => t.value === next);
    if (info?.direction === "out") {
      setCounterMode("account");
      setClientId(null);
    }
  };

  // The backend refuses treasury accounts as the counter side (VOUCHER_COUNTER_IS_TREASURY).
  const treasuryAccountIds = useMemo(() => accountSubtreeIds(accounts, TREASURY_ROOT_CODE), [accounts]);
  const linkedTreasuryCodes = useMemo(
    () => new Set(treasuries.map((t) => t.account_code).filter((code): code is string => Boolean(code))),
    [treasuries],
  );

  const client = clients.find((c) => c.id === clientId) ?? null;
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const defaultAccount = typeInfo.defaultAccountCode
    ? accounts.find((a) => a.account_code === typeInfo.defaultAccountCode)
    : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numAmount = Number(amount);
    if (!amount.trim() || !Number.isFinite(numAmount) || numAmount <= 0) {
      setError("أدخل مبلغاً أكبر من صفر.");
      return;
    }

    const payload: AddReconciliationAdjustmentPayload = {
      type,
      amount: numAmount,
      date,
      description: description.trim() || undefined,
    };

    if (counterMode === "client") {
      if (!clientId) {
        setError("اختر العميل.");
        return;
      }
      payload.client_id = clientId;
    } else if (selectedAccount) {
      payload.counter_account_code = selectedAccount.account_code;
    } else if (!typeInfo.defaultAccountCode) {
      setError("اختر الحساب المقابل لهذا البند.");
      return;
    }

    if (isForeign) {
      const numFx = Number(fxRate);
      if (!Number.isFinite(numFx) || numFx <= 0) {
        setError("أدخل سعر الصرف لهذا الحساب بالعملة الأجنبية.");
        return;
      }
      payload.fx_rate = numFx;
    }

    addMutation.mutate(
      { id: reconciliationId, payload },
      {
        onSuccess: () => onClose(),
        onError: (err) => setError(apiErrorMessage(err, "تعذر إضافة التسوية.")),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <div>
            <DialogTitle>إضافة بند من كشف البنك</DialogTitle>
            <p className="text-xs text-app-label-secondary mt-1">
              لبنود ظاهرة في الكشف وغير مسجلة في الدفاتر. يُرحَّل البند كسند على الحساب المصرفي
              ويُعلَّم كمطابق مباشرة.
            </p>
          </div>
          <DialogClose />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            {error && (
              <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs font-semibold text-app-status-danger">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                نوع البند <span className="text-app-status-danger">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {ADJUSTMENT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => handleTypeChange(t.value)}
                    className={`rounded-lg border py-2 px-3 font-bold text-start transition-colors ${
                      type === t.value
                        ? "border-app-accent bg-app-accent/10 text-app-accent"
                        : "border-app-separator bg-app-bg-primary text-app-label-secondary hover:text-app-label-primary"
                    }`}
                  >
                    <span className={t.direction === "in" ? "text-emerald-600" : "text-rose-600"}>
                      {t.direction === "in" ? "+" : "−"}
                    </span>{" "}
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  المبلغ ({currency}) <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-2 text-sm font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">التاريخ</label>
                <input
                  type="date"
                  value={date}
                  max={statementDate}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-app-label-tertiary">
                  حتى تاريخ الكشف ({formatDate(statementDate)}).
                </p>
              </div>
            </div>

            {isForeign && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  سعر الصرف ({currency} ← د.ل) <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="number"
                  step="0.00000001"
                  min="0"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-2 text-sm font-mono"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-app-label-secondary">
                الحساب المقابل
                {!typeInfo.defaultAccountCode && <span className="text-app-status-danger"> *</span>}
              </label>
              {typeInfo.direction === "in" && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setCounterMode("account")}
                    className={`rounded-lg border py-2 px-3 font-bold transition-colors ${
                      counterMode === "account"
                        ? "border-app-accent bg-app-accent/10 text-app-accent"
                        : "border-app-separator bg-app-bg-primary text-app-label-secondary"
                    }`}
                  >
                    حساب من دليل الحسابات
                  </button>
                  <button
                    type="button"
                    onClick={() => setCounterMode("client")}
                    className={`rounded-lg border py-2 px-3 font-bold transition-colors ${
                      counterMode === "client"
                        ? "border-app-accent bg-app-accent/10 text-app-accent"
                        : "border-app-separator bg-app-bg-primary text-app-label-secondary"
                    }`}
                  >
                    عميل أودع مباشرة
                  </button>
                </div>
              )}

              {counterMode === "client" ? (
                <SearchableSelect<Client>
                  options={clients}
                  value={client}
                  onChange={(c) => setClientId(c ? c.id : null)}
                  getOptionId={(c) => c.id}
                  getOptionLabel={(c) => c.entity?.name ?? c.id}
                  getOptionSubLabel={(c) => c.entity?.primary_contact?.phone ?? undefined}
                  getOptionSearchText={(c) => `${c.entity?.name ?? ""} ${c.entity?.primary_contact?.phone ?? ""}`}
                  placeholder="ابحث عن العميل بالاسم أو الهاتف…"
                  size="sm"
                />
              ) : (
                <>
                  <CoaAccountSelector
                    entityTypeLabel="الحساب المقابل"
                    selectedAccountId={selectedAccountId}
                    onSelectedAccountIdChange={setSelectedAccountId}
                    filter={(a) => !treasuryAccountIds.has(a.id) && !linkedTreasuryCodes.has(a.account_code)}
                    hideActionToggle
                  />
                  {typeInfo.defaultAccountCode && !selectedAccountId && (
                    <p className="text-[11px] text-app-label-tertiary">
                      إن تُرك فارغاً يُستخدم الحساب {typeInfo.defaultAccountCode}
                      {defaultAccount ? ` — ${defaultAccount.name}` : ""}.
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">البيان</label>
              <input
                type="text"
                value={description}
                maxLength={250}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={`${typeInfo.label} — تسوية مصرفية`}
                className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-2 text-sm"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:text-app-label-primary"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={addMutation.isPending}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {addMutation.isPending ? "جارٍ الترحيل…" : "ترحيل البند ومطابقته"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
