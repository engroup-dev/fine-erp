import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, EyeOff, Plus } from "lucide-react";
import { useStockCounts } from "../../hooks/useStockCounts";
import { usePermissions } from "../../hooks/usePermissions";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import type { ColumnDef } from "../../components/ui/DataTable";
import { NewStockCountDialog, useCountableWarehouses } from "../../components/inventory/StockCountDialogs";
import { STOCK_COUNT_COUNTER_ROLES } from "../../routes/routes.config";
import { formatDate, formatInteger } from "../../lib/utils/format";
import {
  STOCK_COUNT_STATUS_LABEL,
  STOCK_COUNT_STATUS_STYLE,
  StockCountListItem,
  StockCountStatus,
} from "../../api/endpoints/stockCounts";

const STATUS_FILTERS: { value: "" | StockCountStatus; label: string }[] = [
  { value: "", label: "كل الحالات" },
  { value: "draft", label: STOCK_COUNT_STATUS_LABEL.draft },
  { value: "counting", label: STOCK_COUNT_STATUS_LABEL.counting },
  { value: "submitted", label: STOCK_COUNT_STATUS_LABEL.submitted },
  { value: "approved", label: STOCK_COUNT_STATUS_LABEL.approved },
  { value: "cancelled", label: STOCK_COUNT_STATUS_LABEL.cancelled },
];

export const StockCountsPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasRole, hasPermission } = usePermissions();
  const canCount = hasRole(STOCK_COUNT_COUNTER_ROLES) && hasPermission("edit-inventory");

  const [status, setStatus] = useState<"" | StockCountStatus>("");
  const [warehouseId, setWarehouseId] = useState("");
  const [page, setPage] = useState(1);
  const [isNewOpen, setIsNewOpen] = useState(false);

  // Paged on the server (newest first): the API caps per_page at 100.
  const { data, isLoading } = useStockCounts({
    status: status || undefined,
    warehouse_id: warehouseId || undefined,
    page,
    per_page: 20,
  });
  const lastPage = data?.last_page ?? 1;
  const warehouses = useCountableWarehouses();

  const columns = useMemo<ColumnDef<StockCountListItem, unknown>[]>(
    () => [
      {
        id: "number",
        header: "رقم الجرد",
        meta: { exportValue: (c) => c.number, className: "font-mono font-bold text-app-accent" },
        cell: ({ row }) => row.original.number,
      },
      {
        id: "count_date",
        header: "تاريخ الجرد",
        meta: { exportValue: (c) => c.count_date.slice(0, 10), className: "font-mono text-xs text-app-label-secondary" },
        cell: ({ row }) => formatDate(row.original.count_date.slice(0, 10)),
      },
      {
        id: "warehouse",
        header: "المخزن",
        meta: { exportValue: (c) => [c.warehouse?.name, c.category ? `الفئة: ${c.category.name}` : null].filter(Boolean).join(" — ") },
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="text-xs text-app-label-primary">{row.original.warehouse?.name ?? "—"}</div>
            {row.original.category && (
              <div className="text-[10px] text-app-label-tertiary">الفئة: {row.original.category.name}</div>
            )}
          </div>
        ),
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (c) => `${STOCK_COUNT_STATUS_LABEL[c.status]}${c.blind ? " (جرد أعمى)" : ""}` },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${STOCK_COUNT_STATUS_STYLE[row.original.status]}`}>
              {STOCK_COUNT_STATUS_LABEL[row.original.status]}
            </span>
            {row.original.blind && (
              <span title="جرد أعمى" className="text-app-label-tertiary">
                <EyeOff className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        ),
      },
      {
        id: "lines_count",
        header: "عدد الأسطر",
        enableSorting: false,
        meta: { exportValue: (c) => c.lines_count ?? 0, align: "center", className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => formatInteger(row.original.lines_count ?? 0),
      },
      {
        id: "people",
        header: "فتحه / اعتمده",
        meta: { exportValue: (c) => [c.created_by?.name, c.approved_by?.name].filter(Boolean).join(" / ") },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-[11px] text-app-label-secondary">
            <div>{row.original.created_by?.name ?? "—"}</div>
            {row.original.approved_by && <div className="text-app-status-positive">{row.original.approved_by.name}</div>}
          </div>
        ),
      },
    ],
    [],
  );

  const tableData = useMemo(() => data?.data ?? [], [data]);
  const table = useDataTable({
    exportFileName: "stock-counts",
    columns,
    data: tableData,
    enableSorting: true,
    enablePagination: false,
    getRowId: (c) => c.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-app-accent" />
            الجرد
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            افتح جرداً لمخزن (أو لفئة منه)، أدخل الكميات المعدودة وأرسله، ثم يعتمده المالك أو المدير المالي — شخص غير الذي عدّه. الفروقات المعتمدة تعدّل اللوتات وتُرحّل قيداً واحداً.
          </p>
        </div>

        {canCount && (
          <button
            onClick={() => setIsNewOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> جرد جديد
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "" | StockCountStatus);
            setPage(1);
          }}
          className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={warehouseId}
          onChange={(e) => {
            setWarehouseId(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
        >
          <option value="">كل المخازن</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable table={table}>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد عمليات جرد بعد."
          emptyIcon={ClipboardCheck}
          onRowClick={(c: StockCountListItem) => navigate(`/inventory/counts/${c.id}`)}
        />
      </DataTable>

      {lastPage > 1 && (
        <div className="flex items-center justify-between text-xs px-2">
          <span className="text-app-label-secondary font-mono">إجمالي عمليات الجرد: {formatInteger(data?.total ?? 0)}</span>
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

      <NewStockCountDialog
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreated={(count) => navigate(`/inventory/counts/${count.id}`)}
      />
    </div>
  );
};
