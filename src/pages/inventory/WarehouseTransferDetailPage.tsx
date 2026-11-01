import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, History, Pencil, XCircle } from "lucide-react";
import {
  useWarehouseTransfer,
  useCompleteWarehouseTransfer,
  useCancelWarehouseTransfer,
} from "../../hooks/useWarehouseTransfers";
import { useMovementsForDocument } from "../../hooks/useInventory";
import { formatNumber } from "../../lib/utils/format";
import { apiErrorPayload } from "../../api/endpoints/production";
import { toast } from "../../stores/toastStore";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useInventoryMovementColumns } from "../../components/table-columns/inventoryMovementColumns";
import type { WarehouseTransferStatus } from "../../api/endpoints/warehouseTransfers";

const STATUS_LABEL: Record<WarehouseTransferStatus, string> = {
  draft: "مسودة",
  completed: "مكتمل",
  cancelled: "ملغى",
};

const STATUS_STYLE: Record<WarehouseTransferStatus, string> = {
  draft: "bg-app-bg-secondary text-app-label-secondary",
  completed: "bg-app-status-positive/15 text-app-status-positive",
  cancelled: "bg-app-status-danger/15 text-app-status-danger",
};

const WarehouseTransferDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [confirmAction, setConfirmAction] = useState<"complete" | "cancel" | null>(null);

  const { data: transfer, isLoading } = useWarehouseTransfer(id);
  const { data: movements, isLoading: isLoadingMovements } = useMovementsForDocument("WarehouseTransfer", id);
  const completeMutation = useCompleteWarehouseTransfer();
  const cancelMutation = useCancelWarehouseTransfer();

  const movementColumns = useInventoryMovementColumns();
  const movementRows = useMemo(() => movements ?? [], [movements]);
  const movementsTable = useDataTable({
    exportFileName: "transfer-movements",
    columns: movementColumns,
    data: movementRows,
    enableSorting: true,
    pageSize: 10,
    getRowId: (m) => m.id,
  });

  const isDraft = transfer?.status === "draft";

  const handleConfirm = async () => {
    if (!id || !confirmAction) return;
    try {
      if (confirmAction === "complete") {
        await completeMutation.mutateAsync(id);
        toast.success("تم إتمام النقل بنجاح.");
      } else {
        await cancelMutation.mutateAsync(id);
        toast.success("تم إلغاء النقل.");
      }
      setConfirmAction(null);
    } catch (err) {
      toast.error(apiErrorPayload(err)?.message ?? "تعذر تنفيذ الإجراء.");
      setConfirmAction(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-app-label-secondary">
        جارٍ تحميل بيانات النقل…
      </div>
    );
  }

  if (!transfer) {
    return (
      <div className="p-6 text-center text-xs text-app-label-secondary">تعذر العثور على عملية النقل.</div>
    );
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <button
        onClick={() => navigate("/inventory/transfers")}
        className="flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline w-fit"
      >
        <ArrowRight className="h-4 w-4" />
        العودة إلى النقل بين المخازن
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
            <span className="font-mono">{transfer.transfer_number}</span>
            <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${STATUS_STYLE[transfer.status]}`}>
              {STATUS_LABEL[transfer.status]}
            </span>
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            {transfer.from_warehouse?.name ?? "—"} ← {transfer.to_warehouse?.name ?? "—"}
            {transfer.reason ? ` — ${transfer.reason}` : ""}
          </p>
        </div>

        {isDraft && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/inventory/transfers/${transfer.id}/edit`)}
              className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> تعديل
            </button>
            <button
              onClick={() => setConfirmAction("cancel")}
              className="flex items-center gap-1.5 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 px-3 py-2 text-xs font-semibold text-app-status-danger hover:bg-app-status-danger/20 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" /> إلغاء النقل
            </button>
            <button
              onClick={() => setConfirmAction("complete")}
              className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" /> إتمام النقل
            </button>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="overflow-hidden rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
        <table className="w-full text-start text-xs">
          <thead className="border-b border-app-separator bg-app-bg-secondary text-app-label-secondary font-bold">
            <tr>
              <th className="px-4 py-3">الصنف</th>
              <th className="px-4 py-3">الكمية</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-separator text-app-label-primary">
            {transfer.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{line.inventory_item?.name ?? "—"}</div>
                  <div className="text-xs text-app-label-tertiary font-mono">{line.inventory_item?.code}</div>
                </td>
                <td className="px-4 py-3 font-mono">
                  {formatNumber(line.quantity)} {line.inventory_item?.unit_of_measure}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Movement history — only meaningful once the transfer actually executed */}
      {transfer.status !== "draft" && (
        <div>
          <h2 className="text-sm font-bold text-app-label-primary mb-2 flex items-center gap-1.5">
            <History className="w-4 h-4 text-app-accent" /> سجل الحركة
          </h2>
          <DataTable table={movementsTable}>
            <DataTable.Content
              isLoading={isLoadingMovements}
              emptyMessage="لا توجد حركات مسجلة لهذا النقل."
              emptyIcon={History}
            />
            <DataTable.Pagination />
          </DataTable>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        title={confirmAction === "complete" ? "تأكيد إتمام النقل" : "تأكيد إلغاء النقل"}
        message={
          confirmAction === "complete"
            ? `سيتم نقل جميع أصناف "${transfer.transfer_number}" فعلياً بين المخزنين الآن. هل تريد المتابعة؟`
            : `سيتم إلغاء "${transfer.transfer_number}" دون أي تأثير على المخزون. هل تريد المتابعة؟`
        }
        confirmText={confirmAction === "complete" ? "إتمام النقل" : "إلغاء النقل"}
        cancelText="تراجع"
        variant={confirmAction === "cancel" ? "danger" : "primary"}
        isLoading={completeMutation.isPending || cancelMutation.isPending}
      />
    </div>
  );
};

export default WarehouseTransferDetailPage;
