import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package2, Plus } from "lucide-react";
import { useBundles, useDeleteBundle } from "../../hooks/useBundles";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useBundlesColumns } from "../../components/table-columns/bundlesColumns";
import { Bundle } from "../../api/endpoints/bundles";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { toast } from "../../stores/toastStore";

export const BundlesPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: bundles, isLoading } = useBundles();
  const deleteMutation = useDeleteBundle();
  const [pendingDelete, setPendingDelete] = useState<Bundle | null>(null);

  const openCreatePage = () => navigate("/settings/products/bundles/new");
  const openEditPage = (bundle: Bundle) => navigate(`/settings/products/bundles/${bundle.id}/edit`);

  const columns = useBundlesColumns({ onEdit: openEditPage, onDelete: setPendingDelete });

  const tableData = useMemo(() => bundles ?? [], [bundles]);
  const table = useDataTable({
    exportFileName: "bundles",
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 20,
    getRowId: (b) => b.id,
  });

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
      toast.success("تم حذف الحزمة بنجاح");
      setPendingDelete(null);
    } catch {
      toast.error("فشل حذف الحزمة");
    }
  };

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Package2 className="w-7 h-7 text-app-accent" />
            الحزم
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            مجموعات أصناف تُباع معًا (مثل طقم غرفة نوم). الكمية والسعر يُحددان عند البيع، وليس هنا.
          </p>
        </div>

        <button
          onClick={openCreatePage}
          className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> إضافة حزمة
        </button>
      </div>

      <DataTable table={table}>
        <DataTable.Header>
          <DataTable.Toolbar>
            <DataTable.SearchInput placeholder="بحث باسم الحزمة…" />
          </DataTable.Toolbar>
        </DataTable.Header>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد حزم بعد."
          emptyIcon={Package2}
          onRowClick={openEditPage}
        />
        <DataTable.Pagination />
      </DataTable>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title="تأكيد حذف الحزمة"
        message={`هل أنت متأكد من حذف الحزمة "${pendingDelete?.name ?? ""}"؟ لا يمكن التراجع عن هذه العملية.`}
        confirmText="حذف"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
