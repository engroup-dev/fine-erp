import React, { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../ui/Dialog";
import { useCreateClient } from "../../hooks/useClients";
import { LEDGER_ERROR_MESSAGE, apiErrorPayload } from "../../api/endpoints/production";
import type { Client, EntityType } from "../../types/entities";
import { toast } from "../../stores/toastStore";

interface QuickClientDialogProps {
  open: boolean;
  onClose: () => void;
  /** Receives the newly registered client so the caller can select it. */
  onCreated: (client: Client) => void;
  initialName?: string;
}

/**
 * Registers a client from the counter: name and phone are enough. The backend
 * puts the client in the current unit and opens its own receivable account
 * under 122 (coa_action "auto").
 */
export const QuickClientDialog: React.FC<QuickClientDialogProps> = ({ open, onClose, onCreated, initialName }) => {
  const createMutation = useCreateClient();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("individual");
  const [creditLimit, setCreditLimit] = useState("0");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setPhone("");
    setEntityType("individual");
    setCreditLimit("0");
    setError(null);
  }, [open, initialName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createMutation.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || undefined,
        entity_type: entityType,
        credit_limit: Number(creditLimit) || 0,
        coa_action: "auto",
      },
      {
        onSuccess: (client) => {
          toast.success(`تم تسجيل العميل ${client.entity?.name ?? name}`);
          onCreated(client);
          onClose();
        },
        onError: (err) => {
          const payload = apiErrorPayload(err);
          // W6-06: a coded refusal (e.g. CLIENT_ACCOUNT_TAKEN) in Arabic before the raw field error.
          const known = payload?.code ? LEDGER_ERROR_MESSAGE[payload.code] : undefined;
          const firstFieldError = payload?.errors ? Object.values(payload.errors)[0]?.[0] : undefined;
          setError(known ?? firstFieldError ?? payload?.message ?? "تعذّر تسجيل العميل.");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <div>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-app-accent" />
              تسجيل عميل جديد
            </DialogTitle>
            <DialogDescription>
              كل بيع يتم باسم عميل مسجل — حتى الزبون المباشر. يُفتح له حساب ذمم تلقائياً.
            </DialogDescription>
          </div>
          <DialogClose />
        </DialogHeader>
        <DialogBody>
          <form id="quick-client-form" onSubmit={handleSubmit} className="space-y-4">
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
                autoFocus
                placeholder="اسم العميل أو الشركة"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">الهاتف</label>
                <input
                  type="tel"
                  placeholder="09xxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">النوع</label>
                <select
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value as EntityType)}
                  className="w-full px-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
                >
                  <option value="individual">فرد</option>
                  <option value="organization">شركة / جهة</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">سقف الائتمان (د.ل)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full px-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
                dir="ltr"
              />
              <p className="text-[11px] text-app-label-tertiary mt-1">
                0 يعني أن البيع بالذمم يحتاج موافقة المدير.
              </p>
            </div>
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
            form="quick-client-form"
            disabled={createMutation.isPending || !name.trim()}
            className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
          >
            {createMutation.isPending ? "جارٍ التسجيل…" : "تسجيل واختيار"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
