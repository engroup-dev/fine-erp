import React, { useState, useEffect } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../ui/Dialog";
import { PasswordInput } from "../ui/PasswordInput";
import { formatNumber } from "../../lib/utils/format";
import type { PriceFloorViolationLine, PriceOverrideInput } from "../../api/endpoints/sales";

interface PriceOverrideDialogProps {
  open: boolean;
  lines: PriceFloorViolationLine[];
  isBusy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (override: PriceOverrideInput) => void;
}

export const PriceOverrideDialog: React.FC<PriceOverrideDialogProps> = ({
  open,
  lines,
  isBusy = false,
  error,
  onClose,
  onConfirm,
}) => {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Clear credentials when dialog opens or closes - never persist the password
  useEffect(() => {
    if (!open) {
      setLogin("");
      setPassword("");
      setReason("");
      setValidationError(null);
    }
  }, [open]);

  const handleClose = () => {
    setLogin("");
    setPassword("");
    setReason("");
    setValidationError(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedLogin = login.trim();
    const trimmedReason = reason.trim();

    if (!trimmedLogin) {
      setValidationError("يرجى إدخال اسم المستخدم أو البريد الإلكتروني للمدير.");
      return;
    }
    if (!password) {
      setValidationError("يرجى إدخال كلمة مرور المدير.");
      return;
    }
    if (!trimmedReason) {
      setValidationError("يرجى إدخال سبب الموافقة على البيع تحت الحد الأدنى.");
      return;
    }

    onConfirm({
      login: trimmedLogin,
      password,
      reason: trimmedReason,
    });
  };

  const activeError = error || validationError;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isBusy) {
          handleClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-app-accent" />
            <DialogTitle>موافقة المدير على تجاوز الحد الأدنى للسعر</DialogTitle>
          </div>
          <DialogClose />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-app-status-warning/40 bg-app-status-warning/10 p-3 text-xs text-app-label-primary">
              <AlertTriangle className="h-4 w-4 text-app-status-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-app-status-warning">سعر بعض البنود أقل من الحد الأدنى للبيع</p>
                <p className="text-[11px] text-app-label-secondary mt-0.5">
                  يتطلب إتمام هذا البيع إدخال بيانات اعتماد مدير يحمل صلاحية الموافقة على تخطي الحد الأدنى للسعر.
                </p>
              </div>
            </div>

            {/* Offending lines */}
            <div className="rounded-xl border border-app-separator overflow-hidden">
              <div className="bg-app-bg-secondary px-3 py-2 text-xs font-bold text-app-label-primary border-b border-app-separator">
                البنود المخالفة للحد الأدنى ({lines.length})
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-app-separator bg-app-bg-secondary/60 text-app-label-secondary">
                    <tr>
                      <th className="px-3 py-2 text-start font-semibold">الصنف</th>
                      <th className="px-3 py-2 text-center font-semibold">الصافي للوحدة</th>
                      <th className="px-3 py-2 text-center font-semibold">الحد الأدنى</th>
                      <th className="px-3 py-2 text-start font-semibold">السبب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-separator">
                    {lines.map((l) => (
                      <tr key={`${l.position}-${l.item_id}`}>
                        <td className="px-3 py-2 font-semibold text-app-label-primary">{l.item_name}</td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-app-status-danger">
                          {formatNumber(l.net_price)} د.ل
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-app-label-secondary">
                          {formatNumber(l.floor)} د.ل
                        </td>
                        <td className="px-3 py-2 text-app-label-secondary">
                          {l.reason === "cost" ? "أقل من التكلفة" : "أقل من الحد الأدنى"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Credentials and reason */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  اسم المستخدم أو البريد للمدير
                </label>
                <input
                  type="text"
                  autoFocus
                  disabled={isBusy}
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="البريد الإلكتروني أو رقم الهاتف للمدير"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs focus:border-app-accent focus:outline-none disabled:opacity-50"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  كلمة المرور
                </label>
                <PasswordInput
                  disabled={isBusy}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="كلمة مرور المدير"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  سبب الموافقة (مطلوب)
                </label>
                <textarea
                  rows={2}
                  disabled={isBusy}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="بيان سبب الموافقة على تخطي الحد الأدنى..."
                  className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs focus:border-app-accent focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            {activeError && (
              <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger font-semibold">
                {activeError}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleClose}
              className="rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isBusy || !login.trim() || !password || !reason.trim()}
              className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-40"
            >
              {isBusy ? "جارٍ التحقق وإتمام البيع…" : "تأكيد الموافقة وإتمام البيع"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
