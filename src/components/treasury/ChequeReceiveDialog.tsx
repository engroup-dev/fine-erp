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
import { SearchableSelect } from "../ui/SearchableSelect";
import { useClients } from "../../hooks/useClients";
import { useOperatingUnits } from "../../hooks/usePartners";
import { useIsCompanyWide } from "../../hooks/useAccounting";
import { useReceiveCheque } from "../../hooks/useCheques";
import { formatNumber, localDateIso } from "../../lib/utils/format";
import { apiErrorMessage } from "../../api/endpoints/production";
import type { Cheque, ReceiveChequePayload } from "../../api/endpoints/cheques";
import type { Client } from "../../types/entities";

export interface ChequeReceiveDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (cheque: Cheque) => void;
}

export const ChequeReceiveDialog: React.FC<ChequeReceiveDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const today = localDateIso();

  const [clientId, setClientId] = useState<string | null>(null);
  const [chequeNo, setChequeNo] = useState("");
  const [bankName, setBankName] = useState("");
  const [drawerName, setDrawerName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [receivedDate, setReceivedDate] = useState(today);
  const [isCertified, setIsCertified] = useState(false);
  const [notes, setNotes] = useState("");
  const [operatingUnitId, setOperatingUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isCompanyWide = useIsCompanyWide();
  const { data: clients = [] } = useClients();
  const { data: units = [] } = useOperatingUnits();

  const receiveMutation = useReceiveCheque();

  useEffect(() => {
    if (open) {
      setClientId(null);
      setChequeNo("");
      setBankName("");
      setDrawerName("");
      setAmount("");
      setDueDate("");
      setIssueDate("");
      setReceivedDate(localDateIso());
      setIsCertified(false);
      setNotes("");
      setOperatingUnitId("");
      setError(null);
    }
  }, [open]);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("يجب اختيار العميل.");
      return;
    }

    if (!chequeNo.trim()) {
      setError("رقم الشيك مطلوب.");
      return;
    }

    if (!bankName.trim()) {
      setError("اسم المصرف مطلوب.");
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

    if (isCompanyWide && !operatingUnitId) {
      setError("يرجى اختيار الوحدة التشغيلية.");
      return;
    }

    const payload: ReceiveChequePayload = {
      client_id: clientId,
      cheque_no: chequeNo.trim(),
      bank_name: bankName.trim(),
      drawer_name: drawerName.trim() || undefined,
      amount: numAmount,
      due_date: dueDate,
      issue_date: issueDate || undefined,
      received_date: receivedDate || undefined,
      is_certified: isCertified,
      notes: notes.trim() || undefined,
      operating_unit_id:
        isCompanyWide && operatingUnitId ? operatingUnitId : undefined,
    };

    receiveMutation.mutate(payload, {
      onSuccess: (newCheque) => {
        onClose();
        if (onSuccess) {
          onSuccess(newCheque);
        }
      },
      onError: (err) => {
        setError(apiErrorMessage(err, "تعذر استلام الشيك."));
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
          <DialogTitle>استلام شيك جديد (شيكات واردة)</DialogTitle>
          <DialogClose />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            {error && (
              <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs font-semibold text-app-status-danger">
                {error}
              </div>
            )}

            {/* Client Search */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-app-label-secondary">
                العميل <span className="text-app-status-danger">*</span>
              </label>
              <SearchableSelect<Client>
                options={clients}
                value={selectedClient}
                onChange={(c) => {
                  setClientId(c ? c.id : null);
                  if (c?.entity?.name && !drawerName.trim()) {
                    setDrawerName(c.entity.name);
                  }
                }}
                getOptionId={(c) => c.id}
                getOptionLabel={(c) => c.entity?.name ?? c.id}
                getOptionSubLabel={(c) => c.entity?.primary_contact?.phone ?? undefined}
                getOptionSearchText={(c) =>
                  `${c.entity?.name ?? ""} ${c.entity?.primary_contact?.phone ?? ""}`
                }
                placeholder="ابحث عن العميل بالاسم أو الهاتف…"
                size="sm"
              />
              {selectedClient && (
                <div className="flex flex-wrap items-center justify-between rounded-lg border border-app-separator bg-app-bg-secondary/60 px-3 py-1.5 text-[11px] font-mono text-app-label-secondary">
                  <span>الرصيد المستحق الحالي على العميل:</span>
                  <span className="font-bold text-app-label-primary">
                    {formatNumber(Number(selectedClient.current_balance ?? 0))} د.ل
                  </span>
                </div>
              )}
            </div>

            {/* Cheque No & Bank Name */}
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
                  placeholder="مثال: 0012345"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  المصرف المسحوب عليه <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="مثال: مصرف الجمهورية - فرع الميدان"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Drawer Name & Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  اسم الساحب
                </label>
                <input
                  type="text"
                  value={drawerName}
                  onChange={(e) => setDrawerName(e.target.value)}
                  placeholder="اسم صاحب الحساب أو الشركة الساحبة"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
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

            {/* Dates: Due Date, Issue Date, Received Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                  تاريخ التحرير / الإصدار
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  تاريخ الاستلام <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="date"
                  required
                  max={today}
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Certified Cheque Checkbox */}
            <div className="rounded-xl border border-app-separator bg-app-bg-secondary/40 p-3">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isCertified}
                  onChange={(e) => setIsCertified(e.target.checked)}
                  className="h-4 w-4 rounded border-app-separator text-app-accent focus:ring-app-accent"
                />
                <div>
                  <span className="text-xs font-bold text-app-label-primary">
                    شيك مصدق (Certified Cheque)
                  </span>
                  <p className="text-[11px] text-app-label-secondary mt-0.5">
                    الشيك المصدق يتيح التحصيل المباشر إلى الحساب المصرفي دون المرور بمرحلة الحافظة برسم التحصيل.
                  </p>
                </div>
              </label>
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
                placeholder="أي ملاحظات أو بيانات إضافية حول الشيك…"
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
              disabled={receiveMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={receiveMutation.isPending}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {receiveMutation.isPending ? "جارٍ الحفظ…" : "استلام وإيداع في الحافظة"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
