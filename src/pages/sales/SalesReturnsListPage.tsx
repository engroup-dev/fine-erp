import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Undo2 } from "lucide-react";
import { useSalesReturns } from "../../hooks/useSales";
import { REFUND_METHOD_LABEL, SalesReturn, salesReturnBuyer } from "../../api/endpoints/sales";
import { ColumnDef, DataTable, useDataTable } from "../../components/ui/DataTable";
import { formatDate, formatNumber } from "../../lib/utils/format";

/** Every sales return — the POS "المرتجعات" tab. A row opens the return's own page. */
export const SalesReturnsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSalesReturns({
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    per_page: 20,
  });
  const rows = useMemo(() => data?.data ?? [], [data]);

  const open = (r: SalesReturn) => navigate(`/sales/returns/${r.id}`);

  const columns = useMemo<ColumnDef<SalesReturn, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        header: "رقم المرتجع",
        meta: { className: "font-mono font-bold text-app-accent" },
      },
      {
        id: "return_date",
        header: "التاريخ",
        meta: { exportValue: (r) => r.return_date },
        cell: ({ row }) => <span className="font-mono">{formatDate(row.original.return_date)}</span>,
      },
      {
        id: "sale",
        header: "رقم البيع",
        meta: { exportValue: (r) => r.order?.order_number },
        cell: ({ row }) => <span className="font-mono">{row.original.order?.order_number ?? "—"}</span>,
      },
      {
        id: "buyer",
        header: "المشتري",
        meta: { exportValue: (r) => salesReturnBuyer(r) },
        cell: ({ row }) => salesReturnBuyer(row.original),
      },
      {
        id: "refund_method",
        header: "طريقة الرد",
        meta: { exportValue: (r) => `${REFUND_METHOD_LABEL[r.refund_method] ?? r.refund_method}${r.cash_account?.name ? ` — ${r.cash_account.name}` : ""}` },
        cell: ({ row }) => (
          <span className="text-app-label-secondary">
            {REFUND_METHOD_LABEL[row.original.refund_method] ?? row.original.refund_method}
            {row.original.cash_account?.name ? ` — ${row.original.cash_account.name}` : ""}
          </span>
        ),
      },
      {
        id: "amount",
        header: "المبلغ",
        meta: { exportValue: (r) => r.amount, className: "text-end" },
        cell: ({ row }) => <span className="font-mono font-bold">{formatNumber(row.original.amount)}</span>,
      },
      {
        id: "created_by",
        header: "أنشأه",
        meta: { exportValue: (r) => r.created_by?.name },
        cell: ({ row }) => <span className="text-app-label-secondary">{row.original.created_by?.name ?? "—"}</span>,
      },
    ],
    [],
  );

  const table = useDataTable({
    exportFileName: "sales-returns",
    columns,
    data: rows,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (r) => r.id,
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-app-label-secondary" />
          <input
            type="text"
            placeholder="ابحث برقم المرتجع أو رقم البيع أو اسم العميل…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full ps-9 pe-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-app-label-secondary">
          من
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-app-label-secondary">
          إلى
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
          />
        </label>
      </div>

      <DataTable table={table}>
        <DataTable.Content isLoading={isLoading} emptyMessage="لا توجد مرتجعات." emptyIcon={Undo2} onRowClick={open} />
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
