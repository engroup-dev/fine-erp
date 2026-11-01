import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useWarehouseTransfers } from "../../hooks/useWarehouseTransfers";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useWarehouseTransfersColumns } from "../../components/table-columns/warehouseTransfersColumns";
import { warehouseTransfersApi, type WarehouseTransfer } from "../../api/endpoints/warehouseTransfers";
import { fetchAllPages } from "../../lib/utils/fetchAllPages";

export const WarehouseTransfersPage: React.FC = () => {
  const navigate = useNavigate();
  // Server paging: the endpoint returns 15 transfers a page by default.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const { data, isLoading } = useWarehouseTransfers(
    { page, per_page: perPage },
    { keepPrevious: true },
  );

  const columns = useWarehouseTransfersColumns();
  const tableData = useMemo(() => data?.data ?? [], [data]);
  const table = useDataTable({
    exportFileName: "warehouse-transfers",
    // Every transfer, not just the page on screen.
    fetchAllRowsForExport: () =>
      fetchAllPages(async (p, size) =>
        (await warehouseTransfersApi.list({ page: p, per_page: size })).data,
      ),
    columns,
    data: tableData,
    enableSorting: true,
    getRowId: (t) => t.id,
    serverPagination: {
      page,
      perPage,
      total: data?.total ?? 0,
      lastPage: data?.last_page ?? 1,
      onChange: (p, size) => {
        setPage(p);
        setPerPage(size);
      },
    },
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <ArrowLeftRight className="w-7 h-7 text-app-accent" />
            النقل بين المخازن
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            أنشئ مسودة نقل تضم عدة أصناف، ثم أتممها لتنفيذ الحركة فعلياً — كل نقل يحتفظ بسجل كامل لما حدث.
          </p>
        </div>

        <button
          onClick={() => navigate("/inventory/transfers/new")}
          className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> إنشاء نقل
        </button>
      </div>

      <DataTable table={table}>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد عمليات نقل بعد."
          emptyIcon={ArrowLeftRight}
          onRowClick={(t: WarehouseTransfer) => navigate(`/inventory/transfers/${t.id}`)}
        />
        <DataTable.Pagination />
      </DataTable>
    </div>
  );
};
