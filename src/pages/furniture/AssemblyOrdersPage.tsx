import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Sofa } from "lucide-react";
import { useAssemblyOrders } from "../../hooks/useAssemblyOrders";
import { usePermissions } from "../../hooks/usePermissions";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import type { ColumnDef } from "../../components/ui/DataTable";
import { formatDate, formatInteger, formatNumber } from "../../lib/utils/format";
import {
  ASSEMBLY_STATUS_LABEL,
  ASSEMBLY_STATUS_STYLE,
  AssemblyOrderListItem,
  AssemblyOrderStatus,
} from "../../api/endpoints/assemblyOrders";

const STATUS_FILTERS: { value: "" | AssemblyOrderStatus; label: string }[] = [
  { value: "", label: "كل الحالات" },
  { value: "draft", label: ASSEMBLY_STATUS_LABEL.draft },
  { value: "completed", label: ASSEMBLY_STATUS_LABEL.completed },
  { value: "cancelled", label: ASSEMBLY_STATUS_LABEL.cancelled },
];

const filterClass =
  "rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none";

/** Furniture assembly orders (W4-07): the list, newest first, paged on the server. */
export const AssemblyOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("create-furniture");

  const [status, setStatus] = useState<"" | AssemblyOrderStatus>("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAssemblyOrders({
    status: status || undefined,
    search: search.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    per_page: 20,
  });
  const lastPage = data?.last_page ?? 1;

  const columns = useMemo<ColumnDef<AssemblyOrderListItem, unknown>[]>(
    () => [
      {
        id: "number",
        header: "رقم الأمر",
        meta: { exportValue: (o) => o.number, className: "font-mono font-bold text-app-accent" },
        cell: ({ row }) => row.original.number,
      },
      {
        id: "created_at",
        header: "التاريخ",
        meta: { exportValue: (o) => o.created_at, className: "font-mono text-xs text-app-label-secondary" },
        cell: ({ row }) => formatDate(row.original.created_at),
      },
      {
        id: "finished_item",
        header: "المنتج",
        meta: { exportValue: (o) => [o.finished_item?.code, o.finished_item?.name, o.bundle ? `من الحزمة: ${o.bundle.name}` : null].filter(Boolean).join(" — ") },
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="text-xs text-app-label-primary">{row.original.finished_item?.name ?? "—"}</div>
            <div className="text-[10px] font-mono text-app-label-tertiary">
              {row.original.finished_item?.code}
              {row.original.bundle ? ` · من الحزمة: ${row.original.bundle.name}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "quantity",
        header: "الكمية",
        enableSorting: false,
        meta: { exportValue: (o) => o.quantity, align: "center", className: "font-mono" },
        cell: ({ row }) => formatNumber(row.original.quantity, { maximumFractionDigits: 4 }),
      },
      {
        id: "lines_count",
        header: "المكونات",
        enableSorting: false,
        meta: { exportValue: (o) => o.lines_count ?? 0, align: "center", className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => formatInteger(row.original.lines_count ?? 0),
      },
      {
        id: "warehouse",
        header: "مخزن الإنتاج",
        meta: { exportValue: (o) => o.output_warehouse?.name },
        enableSorting: false,
        cell: ({ row }) => <span className="text-xs">{row.original.output_warehouse?.name ?? "—"}</span>,
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (o) => ASSEMBLY_STATUS_LABEL[o.status] },
        enableSorting: false,
        cell: ({ row }) => (
          <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${ASSEMBLY_STATUS_STYLE[row.original.status]}`}>
            {ASSEMBLY_STATUS_LABEL[row.original.status]}
          </span>
        ),
      },
      {
        id: "total_cost",
        header: "التكلفة الفعلية",
        enableSorting: false,
        meta: { exportValue: (o) => o.total_cost, align: "end", className: "font-mono" },
        cell: ({ row }) =>
          row.original.total_cost === null ? (
            <span className="text-app-label-tertiary">—</span>
          ) : (
            `${formatNumber(row.original.total_cost)} د.ل`
          ),
      },
      {
        id: "people",
        header: "أنشأه / أتمّه",
        meta: { exportValue: (o) => [o.created_by?.name, o.completed_by?.name].filter(Boolean).join(" / ") },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-[11px] text-app-label-secondary">
            <div>{row.original.created_by?.name ?? "—"}</div>
            {row.original.completed_by && <div className="text-app-status-positive">{row.original.completed_by.name}</div>}
          </div>
        ),
      },
    ],
    [],
  );

  const tableData = useMemo(() => data?.data ?? [], [data]);
  const table = useDataTable({
    exportFileName: "assembly-orders",
    columns,
    data: tableData,
    enableSorting: true,
    enablePagination: false,
    getRowId: (o) => o.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Sofa className="w-7 h-7 text-app-accent" />
            أوامر تجميع الأثاث
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            أمر التجميع يبني منتج أثاث تاماً من لوتات المكونات، من قالب حزمة أو يدوياً. المسودة لا تحجز شيئاً؛ عند الإتمام تُستهلك المكونات ويدخل لوت المنتج التام بمجموع تكلفتها الفعلية.
          </p>
        </div>

        {canCreate && (
          <button
            onClick={() => navigate("/furniture/assembly/new")}
            className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> أمر تجميع جديد
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-app-label-tertiary" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="رقم الأمر…"
            className={`${filterClass} ps-9 font-mono`}
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "" | AssemblyOrderStatus);
            setPage(1);
          }}
          className={filterClass}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-app-label-secondary">
          من
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className={`${filterClass} font-mono`}
            dir="ltr"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-app-label-secondary">
          إلى
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className={`${filterClass} font-mono`}
            dir="ltr"
          />
        </label>
      </div>

      <DataTable table={table}>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد أوامر تجميع بعد."
          emptyIcon={Sofa}
          onRowClick={(o: AssemblyOrderListItem) => navigate(`/furniture/assembly/${o.id}`)}
        />
      </DataTable>

      {lastPage > 1 && (
        <div className="flex items-center justify-between text-xs px-2">
          <span className="text-app-label-secondary font-mono">إجمالي الأوامر: {formatInteger(data?.total ?? 0)}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-xl border border-app-separator px-3 py-1.5 font-semibold text-app-label-secondary hover:bg-app-fill-f1 disabled:opacity-40"
            >
              السابق
            </button>
            <span className="font-mono text-app-label-secondary">
              {page} / {lastPage}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page >= lastPage}
              className="rounded-xl border border-app-separator px-3 py-1.5 font-semibold text-app-label-secondary hover:bg-app-fill-f1 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
