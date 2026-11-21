import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../ui/Dialog";
import { TreasurySelect } from "./TreasurySelect";
import { useTreasuryOptions } from "../../hooks/useProcurement";
import { useOperatingUnits } from "../../hooks/usePartners";
import { useIsCompanyWide } from "../../hooks/useAccounting";
import { formatNumber, localDateIso } from "../../lib/utils/format";
import { apiErrorMessage } from "../../api/endpoints/production";
import { useCreateTreasuryTransfer } from "../../hooks/useTreasuryTransfers";
import type { CreateTreasuryTransferPayload } from "../../api/endpoints/treasuryTransfers";
import { AlertTriangle } from "lucide-react";

export interface TreasuryTransferDialogProps {
  open: boolean;
  onClose: () => void;
}

export const TreasuryTransferDialog: React.FC<TreasuryTransferDialogProps> = ({
  open,
  onClose,
}) => {
  const [fromCashAccountId, setFromCashAccountId] = useState("");
  const [toCashAccountId, setToCashAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState("");
  const today = localDateIso();
  const [transferDate, setTransferDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [operatingUnitId, setOperatingUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isCompanyWide = useIsCompanyWide();
  const { data: treasuries = [] } = useTreasuryOptions();
  const { data: units = [] } = useOperatingUnits();

  const createMutation = useCreateTreasuryTransfer();

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setFromCashAccountId("");
      setToCashAccountId("");
      setAmount("");
      setFxRate("");
      setTransferDate(localDateIso());
      setNotes("");
      setOperatingUnitId("");
      setError(null);
    }
  }, [open]);

  const fromTreasury = treasuries.find((t) => t.id === fromCashAccountId);
  const toTreasury = treasuries.find((t) => t.id === toCashAccountId);

  const isSameTreasury = Boolean(
    fromCashAccountId && toCashAccountId && fromCashAccountId === toCashAccountId,
  );

  const isCurrencyMismatch = Boolean(
    fromTreasury &&
      toTreasury &&
      fromTreasury.currency &&
      toTreasury.currency &&
      fromTreasury.currency !== toTreasury.currency,
  );

  const isNonLyd = Boolean(
    fromTreasury &&
      fromTreasury.currency &&
      fromTreasury.currency !== "LYD" &&
      fromTreasury.currency !== "د.ل",
  );

  const numAmount = Number(amount);
  const numFxRate = Number(fxRate);
  const computedLyd = (numAmount || 0) * (numFxRate || 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fromCashAccountId) {
      setError("يرجى اختيار الخزينة المحوَّل منها.");
      return;
    }

    if (!toCashAccountId) {
      setError("يرجى اختيار الخزينة المحوَّل إليها.");
      return;
    }

    if (isSameTreasury) {
      setError("لا يمكن التحويل إلى نفس الخزينة.");
      return;
    }

    if (isCurrencyMismatch) {
      setError("عملة الخزينتين مختلفة — تحويل العملات يتم عبر المشتريات.");
      return;
    }

    if (isCompanyWide && !operatingUnitId) {
      setError("يرجى اختيار الوحدة التشغيلية.");
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setError("المبلغ يجب أن يكون أكبر من صفر.");
      return;
    }

    if (isNonLyd && fxRate.trim() && (isNaN(numFxRate) || numFxRate <= 0)) {
      setError("سعر الصرف يجب أن يكون رقماً أكبر من صفر.");
      return;
    }

    const payload: CreateTreasuryTransferPayload = {
      from_cash_account_id: fromCashAccountId,
      to_cash_account_id: toCashAccountId,
      amount: numAmount,
      transfer_date: transferDate || undefined,
      notes: notes.trim() || undefined,
      operating_unit_id:
        isCompanyWide && operatingUnitId ? operatingUnitId : undefined,
    };

    if (isNonLyd && fxRate.trim() && numFxRate > 0) {
      payload.fx_rate = numFxRate;
    }

    createMutation.mutate(payload, {
      onSuccess: () => {
        onClose();
      },
      onError: (err) => {
        setError(apiErrorMessage(err, "تعذر إنشاء التحويل."));
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
      <DialogContent size="lg">
        <DialogHeader>
          <div>
            <DialogTitle>تحويل جديد بين الخزائن</DialogTitle>
            <p className="text-xs text-app-label-secondary mt-1">
              يُرحَّل التحويل بعد اعتماده من شخص آخر.
            </p>
          </div>
          <DialogClose />
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            {error && (
              <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs font-semibold text-app-status-danger">
                {error}
              </div>
            )}

            {/* From Treasury */}
            <div className="space-y-1.5">
              <TreasurySelect
                value={fromCashAccountId}
                onChange={setFromCashAccountId}
                label="من خزينة"
                required
              />
              {fromTreasury && (
                <div className="flex items-center justify-between rounded-lg border border-app-separator bg-app-bg-secondary/60 px-3 py-1.5 text-[11px] font-mono text-app-label-secondary">
                  <span>الرصيد الدفتري الحالي:</span>
                  <span className="font-bold text-app-label-primary">
                    {formatNumber(fromTreasury.ledger_balance)} {fromTreasury.currency || "LYD"}
                  </span>
                </div>
              )}
            </div>

            {/* To Treasury */}
            <div className="space-y-1.5">
              <TreasurySelect
                value={toCashAccountId}
                onChange={setToCashAccountId}
                label="إلى خزينة"
                required
              />
              {toTreasury && (
                <div className="flex items-center justify-between rounded-lg border border-app-separator bg-app-bg-secondary/60 px-3 py-1.5 text-[11px] font-mono text-app-label-secondary">
                  <span>الرصيد الدفتري الحالي:</span>
                  <span className="font-bold text-app-label-primary">
                    {formatNumber(toTreasury.ledger_balance)} {toTreasury.currency || "LYD"}
                  </span>
                </div>
              )}
            </div>

            {/* Warnings */}
            {isSameTreasury && (
              <div className="flex items-center gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-2.5 text-xs text-app-status-danger font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>لا يمكن التحويل إلى نفس الخزينة.</span>
              </div>
            )}

            {isCurrencyMismatch && (
              <div className="flex items-center gap-2 rounded-xl border border-app-status-yellow/30 bg-app-status-yellow/10 p-2.5 text-xs text-app-status-yellow font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>عملة الخزينتين مختلفة — تحويل العملات يتم عبر المشتريات.</span>
              </div>
            )}

            {/* Amount and FX Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  المبلغ ({fromTreasury?.currency || "LYD"}) <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-sm font-mono focus:border-app-accent focus:outline-none"
                />
              </div>

              {isNonLyd ? (
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    سعر الصرف (اختياري عند الإنشاء)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    value={fxRate}
                    onChange={(e) => setFxRate(e.target.value)}
                    placeholder="سعر الصرف مقابل الدينار…"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-sm font-mono focus:border-app-accent focus:outline-none"
                  />
                  {fxRate.trim() && numFxRate > 0 ? (
                    <div className="mt-1 text-[11px] font-mono text-app-label-secondary">
                      المعادل بالدينار:{" "}
                      <span className="font-bold text-app-label-primary">
                        {formatNumber(computedLyd)} د.ل
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    التاريخ <span className="text-app-status-danger">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    max={today}
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                  />
                </div>
              )}
            </div>

            {isNonLyd && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  التاريخ <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="date"
                  required
                  max={today}
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                ملاحظات
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات توضيحية للتحويل (اختياري)…"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
              />
            </div>

            {/* Operating Unit for Company-Wide Users */}
            {isCompanyWide && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  الوحدة التشغيلية <span className="text-app-status-danger">*</span>
                </label>
                <select
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
              disabled={createMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={
                createMutation.isPending ||
                isSameTreasury ||
                isCurrencyMismatch ||
                !fromCashAccountId ||
                !toCashAccountId ||
                !amount
              }
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {createMutation.isPending ? "جارٍ الحفظ…" : "حفظ وإرسال للاعتماد"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
