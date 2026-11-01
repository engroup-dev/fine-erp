import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ShoppingCart } from "lucide-react";
import { useSales } from "../../hooks/useSales";
import { Sale, SALE_STATUS_LABEL, salesApi } from "../../api/endpoints/sales";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useSalesColumns } from "../../components/table-columns/salesColumns";

const STATUS_TABS = ["", "open", "pending_approval", "completed", "rejected"] as const;

/** Every sale ever made — the history and follow-up screen: reprint, collect a receivable, track a bundle. */
export const SalesListPage: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filters = { status: status || undefined, search: search || undefined };
  const { data, isLoading } = useSales({ ...filters, page, per_page: 20 });
  const sales = data?.data ?? [];

  const columns = useSalesColumns({ onOpen: (sale: Sale) => navigate(`/sales/${sale.id}`) });
  const rows = useMemo(() => sales, [sales]);
  const table = useDataTable({
    exportFileName: "sales",
    // W6-04: every sale the status tab and search match, not just this page.
    fetchAllRowsForExport: async () => (await salesApi.list({ ...filters, all: 1 })).data.data,
    columns,
    data: rows,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (s) => s.id,
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-app-label-secondary" />
          <input
            type="text"
            placeholder="ابحث برقم البيع أو اسم العميل…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full ps-9 pe-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
          />
        </div>
        {STATUS_TABS.map((s) => (
          <button
            key={s || "all"}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
              status === s ? "bg-app-accent text-white" : "bg-app-fill-f1 text-app-label-secondary hover:bg-app-fill-f2"
            }`}
          >
            {s ? SALE_STATUS_LABEL[s as keyof typeof SALE_STATUS_LABEL] : "الكل"}
          </button>
        ))}
      </div>

      <DataTable table={table}>
        <DataTable.Content isLoading={isLoading} emptyMessage="لا توجد مبيعات." emptyIcon={ShoppingCart} onRowClick={(s: Sale) => navigate(`/sales/${s.id}`)} />
      </DataTable>

      {data && data.last_page > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-app-separator px-3 py-1.5 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-app-label-secondary">{page} / {data.last_page}</span>
          <button
            onClick={() => setPage((p) => Math.min(data.last_page, p + 1))}
            disabled={page >= data.last_page}
            className="rounded-lg border border-app-separator px-3 py-1.5 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
};
