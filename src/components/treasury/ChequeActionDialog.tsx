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
import {
  useDepositCheque,
  useClearCheque,
  useBounceCheque,
  useReturnCheque,
  useCancelCheque,
} from "../../hooks/useCheques";
import { formatNumber, localDateIso } from "../../lib/utils/format";
import { apiErrorMessage } from "../../api/endpoints/production";
import type { Cheque } from "../../api/endpoints/cheques";

export type ChequeActionType = "deposit" | "clear" | "bounce" | "return" | "cancel";

export interface ChequeActionDialogProps {
  open: boolean;
  onClose: () => void;
  cheque: Cheque | null;
  action: ChequeActionType | null;
  onSuccess?: (cheque: Cheque) => void;
}

export const ChequeActionDialog: React.FC<ChequeActionDialogProps> = ({
  open,
  onClose,
  cheque,
  action,
  onSuccess,
}) => {
  const today = localDateIso();
  const [date, setDate] = useState(today);
  const [cashAccountId, setCashAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const depositMutation = useDepositCheque();
  const clearMutation = useClearCheque();
  const bounceMutation = useBounceCheque();
  const returnMutation = useReturnCheque();
  const cancelMutation = useCancelCheque();

  useEffect(() => {
    if (open) {
      setDate(localDateIso());
      setCashAccountId(cheque?.deposit_cash_account?.id ?? "");
      setReason("");
      setNote("");
      setError(null);
    }
  }, [open, cheque, action]);

  if (!cheque || !action) return null;

  const isOutgoing = cheque.direction === "outgoing";
  const isBounced = cheque.status === "bounced";
  const isInPortfolio = cheque.status === "in_portfolio";
  const isDirectClear = !isOutgoing && action === "clear" && isInPortfolio;
  const needsBankSelect = !isOutgoing && (action === "deposit" || isDirectClear);

  let title = "";
  let explanation = "";
  let submitLabel = "";
  let isDanger = false;

  switch (action) {
    case "deposit":
      title = isBounced ? "إعادة إيداع الشيك" : "إيداع الشيك برسم التحصيل";
      explanation = isBounced
        ? "تتم إعادة إيداع الشيك المرتجع في المصرف برسم التحصيل."
        : "يُنقل الشيك من الحافظة إلى شيكات برسم التحصيل.";
      submitLabel = isBounced ? "تأكيد إعادة الإيداع" : "تأكيد الإيداع";
      break;
    case "clear":
      if (isOutgoing) {
        title = "صرف الشيك من المصرف";
        explanation = "يُصرف الشيك من المصرف المسحوب عليه.";
        submitLabel = "تأكيد الصرف";
      } else {
        title = isDirectClear ? "تحصيل مباشر للشيك المصدق" : "تحصيل الشيك";
        explanation = isDirectClear
          ? "يُحصّل الشيك المصدق مباشرة من الحافظة ويودع في الحساب المصرفي."
          : "يُحصّل الشيك ويودع المبلغ في الحساب المصرفي مع تسوية الشيكات برسم التحصيل.";
        submitLabel = "تأكيد التحصيل";
      }
      break;
    case "bounce":
      title = "تسجيل ارتداد الشيك";
      explanation = isInPortfolio
        ? "يُسجل ارتداد الشيك من الحافظة ويُعاد رصيد المديونية على العميل."
        : "يُسجل ارتداد الشيك من المصرف ويُعاد رصيد المديونية على العميل مع تسوية الشيكات برسم التحصيل.";
      submitLabel = "تأكيد الارتداد";
      isDanger = true;
      break;
    case "return":
      title = "إعادة الشيك للساحب";
      explanation = "يُعاد الشيك للساحب وتُلغى مديونية الشيك.";
      submitLabel = "تأكيد الإعادة";
      isDanger = true;
      break;
    case "cancel":
      title = "إلغاء الشيك الصادر";
      explanation = "سيُعكس قيد إصدار الشيك.";
      submitLabel = "تأكيد الإلغاء";
      isDanger = true;
      break;
  }

  const isSubmitting =
    depositMutation.isPending ||
    clearMutation.isPending ||
    bounceMutation.isPending ||
    returnMutation.isPending ||
    cancelMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (needsBankSelect && !cashAccountId) {
      setError("يجب إيداع الشيك في حساب مصرفي.");
      return;
    }

    if (action === "bounce" && !reason.trim()) {
      setError("يرجى كتابة سبب ارتداد الشيك.");
      return;
    }

    if (action === "cancel" && !reason.trim()) {
      setError("يرجى كتابة سبب إلغاء الشيك.");
      return;
    }

    if (action === "deposit") {
      depositMutation.mutate(
        { id: cheque.id, payload: { cash_account_id: cashAccountId, date } },
        {
          onSuccess: (updated) => {
            onClose();
            onSuccess?.(updated);
          },
          onError: (err) => {
            setError(apiErrorMessage(err, "تعذر إيداع الشيك."));
          },
        },
      );
    } else if (action === "clear") {
      clearMutation.mutate(
        {
          id: cheque.id,
          payload: {
            date,
            cash_account_id: isDirectClear ? cashAccountId : undefined,
          },
        },
        {
          onSuccess: (updated) => {
            onClose();
            onSuccess?.(updated);
          },
          onError: (err) => {
            setError(
              apiErrorMessage(
                err,
                isOutgoing ? "تعذر صرف الشيك." : "تعذر تحصيل الشيك.",
              ),
            );
          },
        },
      );
    } else if (action === "bounce") {
      bounceMutation.mutate(
        { id: cheque.id, payload: { date, reason: reason.trim() } },
        {
          onSuccess: (updated) => {
            onClose();
            onSuccess?.(updated);
          },
          onError: (err) => {
            setError(apiErrorMessage(err, "تعذر تسجيل ارتداد الشيك."));
          },
        },
      );
    } else if (action === "return") {
      returnMutation.mutate(
        { id: cheque.id, payload: { date, note: note.trim() || undefined } },
        {
          onSuccess: (updated) => {
            onClose();
            onSuccess?.(updated);
          },
          onError: (err) => {
            setError(apiErrorMessage(err, "تعذر إعادة الشيك."));
          },
        },
      );
    } else if (action === "cancel") {
      cancelMutation.mutate(
        { id: cheque.id, payload: { reason: reason.trim() } },
        {
          onSuccess: (updated) => {
            onClose();
            onSuccess?.(updated);
          },
          onError: (err) => {
            setError(apiErrorMessage(err, "تعذر إلغاء الشيك."));
          },
        },
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogClose />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            {/* Cheque Summary Card */}
            <div className="rounded-xl border border-app-separator bg-app-bg-secondary/70 p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-app-label-secondary">
                  الشيك:
                </span>
                <span className="font-mono font-bold text-app-label-primary whitespace-nowrap">
                  {cheque.number} ({cheque.cheque_no})
                </span>
              </div>
              {isOutgoing ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-app-label-secondary">المستفيد:</span>
                    <span className="font-semibold text-app-label-primary">
                      {cheque.supplier?.name || cheque.payee_name || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-app-label-secondary">المصرف المسحوب عليه:</span>
                    <span className="text-app-label-primary">
                      {cheque.deposit_cash_account?.name || cheque.bank_name || "—"}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-app-label-secondary">العميل:</span>
                    <span className="font-semibold text-app-label-primary">
                      {cheque.client?.name ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-app-label-secondary">المصرف:</span>
                    <span className="text-app-label-secondary">{cheque.bank_name}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-app-label-secondary">المبلغ:</span>
                <span className="font-mono font-bold text-app-label-primary whitespace-nowrap">
                  {formatNumber(cheque.amount)} {cheque.currency}
                </span>
              </div>
            </div>

            {/* Explanation Note */}
            <div className="rounded-xl border border-app-accent/20 bg-app-accent/10 p-3 text-xs text-app-accent font-medium leading-relaxed">
              {explanation}
            </div>

            {error && (
              <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-2.5 text-xs font-semibold text-app-status-danger">
                {error}
              </div>
            )}

            {/* Date Input (for non-cancel actions) */}
            {action !== "cancel" && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  تاريخ الإجراء <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="date"
                  required
                  max={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>
            )}

            {/* Bank Select (Bank Treasuries Only - for incoming deposit / direct clear) */}
            {needsBankSelect && (
              <TreasurySelect
                value={cashAccountId}
                onChange={setCashAccountId}
                kind="bank"
                label="الحساب المصرفي المودع فيه"
                required
              />
            )}

            {/* Reason for Bounce */}
            {action === "bounce" && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  سبب الارتداد <span className="text-app-status-danger">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="سبب ارتداد الشيك (مثال: عدم كفاية الرصيد، توقيع غير مطابق…)"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                />
              </div>
            )}

            {/* Reason for Cancel */}
            {action === "cancel" && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  سبب الإلغاء <span className="text-app-status-danger">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="سبب إلغاء الشيك الصادر (مطلوب)…"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                />
              </div>
            )}

            {/* Note for Return */}
            {action === "return" && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  ملاحظات الإعادة للساحب
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظات توضيحية حول سبب إعادة الشيك للساحب…"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                />
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              تراجع
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity ${
                isDanger ? "bg-app-status-danger" : "bg-app-accent"
              }`}
            >
              {isSubmitting ? "جارٍ التنفيذ…" : submitLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
