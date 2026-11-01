import React, { useState } from "react";
import { Printer, Clock, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../ui/Dialog";
import { PrintDialog, PrintDocument } from "../print/PrintDocument";
import { useCheque } from "../../hooks/useCheques";
import { usePermissions } from "../../hooks/usePermissions";
import { formatNumber } from "../../lib/utils/format";
import type { Cheque, ChequeStatus } from "../../api/endpoints/cheques";
import type { ChequeActionType } from "./ChequeActionDialog";

export interface ChequeDetailsDialogProps {
  chequeId: string | null;
  open: boolean;
  onClose: () => void;
  onTriggerAction?: (cheque: Cheque, action: ChequeActionType) => void;
}

const STATUS_LABELS: Record<ChequeStatus, string> = {
  in_portfolio: "في الحافظة",
  deposited: "برسم التحصيل",
  cleared: "محصل",
  bounced: "مرتجع",
  returned: "معادة للساحب",
  issued: "صادر",
  cancelled: "ملغى",
};

export const ChequeDetailsDialog: React.FC<ChequeDetailsDialogProps> = ({
  chequeId,
  open,
  onClose,
  onTriggerAction,
}) => {
  const { hasRole } = usePermissions();
  const canMutate = hasRole(["owner", "accounting-manager", "treasury-officer"]);

  const [printOpen, setPrintOpen] = useState(false);

  const { data: cheque, isLoading } = useCheque(open ? chequeId : null);

  if (!open) return null;

  const isOutgoing = cheque?.direction === "outgoing";

  const isOverdue =
    cheque &&
    (isOutgoing
      ? cheque.status === "issued" && cheque.days_to_due < 0
      : cheque.status === "in_portfolio" && cheque.days_to_due < 0);

  const isDueSoon =
    cheque &&
    (isOutgoing
      ? cheque.status === "issued" &&
        cheque.days_to_due >= 0 &&
        cheque.days_to_due <= 7
      : cheque.days_to_due >= 0 &&
        cheque.days_to_due <= 7 &&
        (cheque.status === "in_portfolio" || cheque.status === "deposited"));

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent size="2xl">
          <DialogHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <DialogTitle>
                  {isOutgoing ? "تفاصيل الشيك الصادر" : "تفاصيل الشيك"}{" "}
                  {cheque ? cheque.number : "…"}
                </DialogTitle>
                {!isOutgoing && cheque?.is_certified && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    مصدق
                  </span>
                )}
                {cheque && (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                      cheque.status === "cleared"
                        ? "bg-app-status-positive/10 text-app-status-positive border-app-status-positive/20"
                        : cheque.status === "bounced" || cheque.status === "cancelled"
                        ? "bg-app-status-danger/10 text-app-status-danger border-app-status-danger/20"
                        : cheque.status === "deposited"
                        ? "bg-app-status-yellow/15 text-app-status-yellow border-app-status-yellow/25"
                        : cheque.status === "returned"
                        ? "bg-app-fill-f2 text-app-label-tertiary border-app-separator"
                        : "bg-app-accent/10 text-app-accent border-app-accent/20"
                    }`}
                  >
                    {cheque.status_label || STATUS_LABELS[cheque.status] || cheque.status}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPrintOpen(true)}
                disabled={!cheque}
                className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary transition-colors me-6"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{isOutgoing ? "طباعة الشيك" : "طباعة"}</span>
              </button>
            </div>
            <DialogClose />
          </DialogHeader>

          <DialogBody className="space-y-5">
            {isLoading || !cheque ? (
              <div className="py-12 text-center text-xs text-app-label-secondary">
                جارٍ تحميل تفاصيل الشيك…
              </div>
            ) : (
              <>
                {/* Due Date Alert Badges */}
                {isOverdue && (
                  <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs font-bold text-app-status-danger flex items-center justify-between">
                    <span>
                      {isOutgoing
                        ? "تنبيه: هذا الشيك متأخر عن موعد استحقاقه ولم يتم صرفه بعد!"
                        : "تنبيه: هذا الشيك متأخر عن موعد استحقاقه في الحافظة!"}
                    </span>
                    <span className="font-mono">متأخر منذ {Math.abs(cheque.days_to_due)} يوم</span>
                  </div>
                )}
                {isDueSoon && (
                  <div className="rounded-xl border border-app-status-yellow/30 bg-app-status-yellow/10 p-3 text-xs font-bold text-app-status-yellow flex items-center justify-between">
                    <span>تنبيه: الشيك يستحق خلال فترة قريبة.</span>
                    <span className="font-mono">متبقي {cheque.days_to_due} يوم</span>
                  </div>
                )}

                {/* Primary Data Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl border border-app-separator bg-app-bg-secondary/40 p-4 text-xs">
                  <div>
                    <span className="text-app-label-secondary block mb-0.5">رقم السجل:</span>
                    <span className="font-mono font-bold text-app-label-primary whitespace-nowrap">
                      {cheque.number}
                    </span>
                  </div>

                  <div>
                    <span className="text-app-label-secondary block mb-0.5">رقم الشيك الورقي:</span>
                    <span className="font-mono font-bold text-app-label-primary">
                      {cheque.cheque_no}
                    </span>
                  </div>

                  <div>
                    <span className="text-app-label-secondary block mb-0.5">المبلغ:</span>
                    <span className="font-mono font-bold text-sm text-app-label-primary whitespace-nowrap">
                      {formatNumber(cheque.amount)} {cheque.currency}
                    </span>
                  </div>

                  {isOutgoing ? (
                    <>
                      <div>
                        <span className="text-app-label-secondary block mb-0.5">المستفيد:</span>
                        <span className="font-semibold text-app-label-primary">
                          {cheque.supplier?.name || cheque.payee_name || "—"}
                        </span>
                      </div>

                      <div>
                        <span className="text-app-label-secondary block mb-0.5">الحساب المقابل:</span>
                        <span className="text-app-label-primary font-medium">
                          {cheque.counter_account
                            ? `${cheque.counter_account.code} — ${cheque.counter_account.name}`
                            : "—"}
                        </span>
                      </div>

                      <div>
                        <span className="text-app-label-secondary block mb-0.5">المصرف المسحوب عليه:</span>
                        <span className="text-app-label-primary font-medium">
                          {cheque.deposit_cash_account?.name || cheque.bank_name || "—"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-app-label-secondary block mb-0.5">العميل:</span>
                        <span className="font-semibold text-app-label-primary">
                          {cheque.client?.name ?? "—"}
                        </span>
                      </div>

                      <div>
                        <span className="text-app-label-secondary block mb-0.5">المصرف المسحوب عليه:</span>
                        <span className="text-app-label-primary font-medium">
                          {cheque.bank_name}
                        </span>
                      </div>

                      <div>
                        <span className="text-app-label-secondary block mb-0.5">اسم الساحب:</span>
                        <span className="text-app-label-primary">
                          {cheque.drawer_name || "—"}
                        </span>
                      </div>
                    </>
                  )}

                  <div>
                    <span className="text-app-label-secondary block mb-0.5">تاريخ الاستحقاق:</span>
                    <span className="font-mono font-bold text-app-label-primary">
                      {cheque.due_date}
                    </span>
                  </div>

                  <div>
                    <span className="text-app-label-secondary block mb-0.5">تاريخ الإصدار:</span>
                    <span className="font-mono text-app-label-secondary">
                      {cheque.issue_date || "—"}
                    </span>
                  </div>

                  {!isOutgoing && (
                    <div>
                      <span className="text-app-label-secondary block mb-0.5">تاريخ الاستلام:</span>
                      <span className="font-mono text-app-label-secondary">
                        {cheque.received_date || "—"}
                      </span>
                    </div>
                  )}

                  {!isOutgoing && cheque.deposit_cash_account && (
                    <div className="col-span-2">
                      <span className="text-app-label-secondary block mb-0.5">
                        الحساب المصرفي المودع فيه:
                      </span>
                      <span className="font-semibold text-app-label-primary">
                        {cheque.deposit_cash_account.name}
                      </span>
                    </div>
                  )}

                  {cheque.bounce_reason && (
                    <div className="col-span-2 sm:col-span-3 rounded-xl border border-app-status-danger/20 bg-app-status-danger/10 p-2.5">
                      <span className="text-app-status-danger font-bold block mb-0.5">
                        سبب الارتداد:
                      </span>
                      <span className="text-app-status-danger text-xs">
                        {cheque.bounce_reason}
                      </span>
                    </div>
                  )}

                  {cheque.cancel_reason && (
                    <div className="col-span-2 sm:col-span-3 rounded-xl border border-app-status-danger/20 bg-app-status-danger/10 p-2.5">
                      <span className="text-app-status-danger font-bold block mb-0.5">
                        سبب الإلغاء:
                      </span>
                      <span className="text-app-status-danger text-xs">
                        {cheque.cancel_reason}
                      </span>
                    </div>
                  )}

                  {cheque.notes && (
                    <div className="col-span-2 sm:col-span-3">
                      <span className="text-app-label-secondary block mb-0.5">ملاحظات:</span>
                      <p className="text-app-label-primary leading-relaxed bg-app-bg-secondary p-2 rounded-xl border border-app-separator">
                        {cheque.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Events Timeline */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-app-label-primary flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-app-accent" />
                    سجل حركات الشيك (Timeline)
                  </h3>

                  {(!cheque.events || cheque.events.length === 0) ? (
                    <div className="rounded-xl border border-app-separator bg-app-bg-secondary/40 p-4 text-center text-xs text-app-label-tertiary">
                      لا توجد حركات مسجلة على الشيك.
                    </div>
                  ) : (
                    <div className="space-y-2 border-s-2 border-app-separator ms-2 ps-4">
                      {cheque.events.map((evt) => (
                        <div
                          key={evt.id}
                          className="relative rounded-xl border border-app-separator bg-app-bg-secondary/60 p-3 space-y-1 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 font-bold text-app-label-primary">
                              <span>
                                {evt.from_status
                                  ? STATUS_LABELS[evt.from_status] || evt.from_status
                                  : isOutgoing
                                  ? "إصدار الشيك"
                                  : "استلام الشيك"}
                              </span>
                              <ArrowLeft className="h-3 w-3 text-app-label-tertiary" />
                              <span className="text-app-accent">
                                {evt.to_status_label || STATUS_LABELS[evt.to_status] || evt.to_status}
                              </span>
                            </div>

                            <span className="font-mono text-[11px] text-app-label-secondary">
                              {evt.event_date}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-app-label-secondary pt-1 border-t border-app-separator/50">
                            <span>
                              بواسطة: <strong>{evt.user?.name ?? "النظام"}</strong>
                            </span>
                            {evt.journal_entry && (
                              <span className="font-mono text-app-accent">
                                قيد اليومية: {evt.journal_entry.reference}
                              </span>
                            )}
                          </div>

                          {evt.note && (
                            <p className="text-[11px] text-app-label-primary bg-app-bg-primary/50 p-1.5 rounded-lg border border-app-separator/40 mt-1">
                              {evt.note}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogBody>

          <DialogFooter>
            {canMutate && cheque && onTriggerAction && (
              <div className="flex flex-wrap items-center gap-1.5 me-auto">
                {isOutgoing ? (
                  cheque.status === "issued" && (
                    <>
                      <button
                        type="button"
                        onClick={() => onTriggerAction(cheque, "clear")}
                        className="rounded-xl border border-app-status-positive/30 bg-app-status-positive/10 px-3 py-1.5 text-xs font-bold text-app-status-positive hover:bg-app-status-positive/20"
                      >
                        صرف من المصرف
                      </button>
                      <button
                        type="button"
                        onClick={() => onTriggerAction(cheque, "cancel")}
                        className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 px-3 py-1.5 text-xs font-bold text-app-status-danger hover:bg-app-status-danger/20"
                      >
                        إلغاء الشيك
                      </button>
                    </>
                  )
                ) : (
                  <>
                    {cheque.status === "in_portfolio" && (
                      <>
                        <button
                          type="button"
                          onClick={() => onTriggerAction(cheque, "deposit")}
                          className="rounded-xl border border-app-accent/30 bg-app-accent/10 px-3 py-1.5 text-xs font-bold text-app-accent hover:bg-app-accent/20"
                        >
                          إيداع بالمصرف
                        </button>
                        {cheque.is_certified && (
                          <button
                            type="button"
                            onClick={() => onTriggerAction(cheque, "clear")}
                            className="rounded-xl border border-app-status-positive/30 bg-app-status-positive/10 px-3 py-1.5 text-xs font-bold text-app-status-positive hover:bg-app-status-positive/20"
                          >
                            تحصيل مباشر
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onTriggerAction(cheque, "bounce")}
                          className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 px-3 py-1.5 text-xs font-bold text-app-status-danger hover:bg-app-status-danger/20"
                        >
                          ارتجاع
                        </button>
                        <button
                          type="button"
                          onClick={() => onTriggerAction(cheque, "return")}
                          className="rounded-xl border border-app-separator px-3 py-1.5 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
                        >
                          إعادة للساحب
                        </button>
                      </>
                    )}

                    {cheque.status === "deposited" && (
                      <>
                        <button
                          type="button"
                          onClick={() => onTriggerAction(cheque, "clear")}
                          className="rounded-xl border border-app-status-positive/30 bg-app-status-positive/10 px-3 py-1.5 text-xs font-bold text-app-status-positive hover:bg-app-status-positive/20"
                        >
                          تحصيل
                        </button>
                        <button
                          type="button"
                          onClick={() => onTriggerAction(cheque, "bounce")}
                          className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 px-3 py-1.5 text-xs font-bold text-app-status-danger hover:bg-app-status-danger/20"
                        >
                          ارتجاع
                        </button>
                      </>
                    )}

                    {cheque.status === "bounced" && (
                      <button
                        type="button"
                        onClick={() => onTriggerAction(cheque, "deposit")}
                        className="rounded-xl border border-app-accent/30 bg-app-accent/10 px-3 py-1.5 text-xs font-bold text-app-accent hover:bg-app-accent/20"
                      >
                        إعادة إيداع
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إغلاق
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
      {cheque && (
        <PrintDialog
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          title={
            isOutgoing
              ? `شيك صادر — ${cheque.number}`
              : `إشعار استلام شيك — ${cheque.number}`
          }
        >
          {isOutgoing ? (
            <PrintDocument
              title="شيك صادر"
              number={cheque.number}
              date={cheque.issue_date || cheque.created_at}
              meta={[
                {
                  label: "المستفيد",
                  value: cheque.supplier?.name || cheque.payee_name || "—",
                },
                {
                  label: "المبلغ بالأرقام",
                  value: `${formatNumber(cheque.amount)} ${cheque.currency}`,
                },
                { label: "تاريخ الاستحقاق", value: cheque.due_date },
                {
                  label: "المصرف المسحوب عليه",
                  value:
                    cheque.deposit_cash_account?.name ||
                    cheque.bank_name ||
                    "—",
                },
                { label: "رقم الشيك", value: cheque.cheque_no },
                {
                  label: "الحساب المقابل",
                  value: cheque.counter_account
                    ? `${cheque.counter_account.code} — ${cheque.counter_account.name}`
                    : "—",
                },
                {
                  label: "الحالة الحالية",
                  value:
                    cheque.status_label ||
                    STATUS_LABELS[cheque.status] ||
                    cheque.status,
                },
              ]}
              signatures={["المحاسب", "المدير المالي"]}
            >
              {cheque.notes && (
                <div className="rounded-lg border border-gray-300 p-3 text-xs">
                  <span className="font-bold">ملاحظات: </span>
                  <span>{cheque.notes}</span>
                </div>
              )}

              {cheque.events && cheque.events.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-bold border-b border-gray-300 pb-1">
                    سجل العمليات والقيود:
                  </div>
                  <table className="w-full text-start text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 font-bold">
                        <th className="py-1 text-start">التاريخ</th>
                        <th className="py-1 text-start">الإجراء</th>
                        <th className="py-1 text-start">المستخدم</th>
                        <th className="py-1 text-start">رقم القيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cheque.events.map((e) => (
                        <tr key={e.id} className="border-b border-gray-200">
                          <td className="py-1 font-mono">{e.event_date}</td>
                          <td className="py-1">
                            {e.to_status_label ||
                              STATUS_LABELS[e.to_status] ||
                              e.to_status}
                          </td>
                          <td className="py-1">{e.user?.name ?? "—"}</td>
                          <td className="py-1 font-mono">
                            {e.journal_entry?.reference ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PrintDocument>
          ) : (
            <PrintDocument
              title="إشعار استلام شيك وارد"
              number={cheque.number}
              date={cheque.received_date || cheque.created_at}
              meta={[
                { label: "رقم الشيك", value: cheque.cheque_no },
                { label: "المصرف المسحوب عليه", value: cheque.bank_name },
                { label: "العميل", value: cheque.client?.name ?? "—" },
                { label: "اسم الساحب", value: cheque.drawer_name ?? "—" },
                {
                  label: "المبلغ",
                  value: `${formatNumber(cheque.amount)} ${cheque.currency}`,
                },
                { label: "تاريخ الاستحقاق", value: cheque.due_date },
                {
                  label: "تاريخ الاستلام",
                  value: cheque.received_date || "—",
                },
                {
                  label: "نوع الشيك",
                  value: cheque.is_certified ? "شيك مصدق" : "شيك عادي",
                },
                {
                  label: "الحالة الحالية",
                  value:
                    cheque.status_label ||
                    STATUS_LABELS[cheque.status] ||
                    cheque.status,
                },
              ]}
              signatures={["أمين الخزينة المستلم", "المحاسب المالي", "العميل / المسلّم"]}
            >
              {cheque.notes && (
                <div className="rounded-lg border border-gray-300 p-3 text-xs">
                  <span className="font-bold">ملاحظات: </span>
                  <span>{cheque.notes}</span>
                </div>
              )}

              {cheque.events && cheque.events.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-bold border-b border-gray-300 pb-1">
                    سجل العمليات والقيود:
                  </div>
                  <table className="w-full text-start text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 font-bold">
                        <th className="py-1 text-start">التاريخ</th>
                        <th className="py-1 text-start">الإجراء</th>
                        <th className="py-1 text-start">المستخدم</th>
                        <th className="py-1 text-start">رقم القيد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cheque.events.map((e) => (
                        <tr key={e.id} className="border-b border-gray-200">
                          <td className="py-1 font-mono">{e.event_date}</td>
                          <td className="py-1">
                            {e.to_status_label ||
                              STATUS_LABELS[e.to_status] ||
                              e.to_status}
                          </td>
                          <td className="py-1">{e.user?.name ?? "—"}</td>
                          <td className="py-1 font-mono">
                            {e.journal_entry?.reference ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PrintDocument>
          )}
        </PrintDialog>
      )}
    </>
  );
};
