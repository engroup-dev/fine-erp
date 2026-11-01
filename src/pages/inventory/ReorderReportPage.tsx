import React, { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Building2, CheckCircle2, Filter, Gauge, SlidersHorizontal, Truck } from "lucide-react";
import { useReorderReport } from "../../hooks/useStockLevels";
import { useLeafItemCategories } from "../../hooks/useCategories";
import type { LeafItemCategory } from "../../hooks/useCategories";
import { usePermissions } from "../../hooks/usePermissions";
import { useIsCompanyWide } from "../../hooks/useAccounting";
import { useOperatingUnits } from "../../hooks/useOperatingUnits";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import { useCountableWarehouses } from "../../components/inventory/StockCountDialogs";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import type { ColumnDef } from "../../components/ui/DataTable";
import { ReorderReportRow, stockLevelErrorMessage } from "../../api/endpoints/stockLevels";
import { UOM_LABELS } from "../../api/endpoints/inventory";
import { RESTOCK_ROLES } from "../../routes/routes.config";
import type { RestockPrefill } from "../sales/RestockRequestsPage";
import type { StockLevelsBackState } from "./InventoryItemStockLevelsPage";
import { formatInteger, formatNumber } from "../../lib/utils/format";

/** The levels page's back link returns here. */
const levelsBackState: StockLevelsBackState = { backTo: "/inventory/reorder", backLabel: "تقرير إعادة الطلب" };

const qty = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : formatNumber(v, { maximumFractionDigits: 4 });

/**
 * Reorder report (W4-02, FR-STK-007): every warehouse/item pair with limits,
 * what its available lots hold and, once on hand reaches the minimum, the
 * quantity to order (max − on hand). "طلب تزويد" opens the internal restock
 * form prefilled with the suggested quantities.
 */
export const ReorderReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasRole, hasPermission } = usePermissions();
  // The report is scoped to the selected unit (through the warehouse). With no
  // unit in context a company-wide caller sees every unit's warehouses, and a
  // restock request (which is raised by one requesting unit) cannot be saved:
  // the server refuses it with OPERATING_UNIT_REQUIRED. So the restock actions
  // need a unit in context.
  const isCompanyWide = useIsCompanyWide();
  const pinnedUnitId = useServerConfigStore((s) => s.operatingUnitId);
  const { data: units } = useOperatingUnits();
  const pinnedUnitName = pinnedUnitId ? units?.find((u) => u.id === pinnedUnitId)?.name : undefined;
  const hasUnitContext = !isCompanyWide || Boolean(pinnedUnitId);
  // POST /internal-restock-requests is a write in the inventory group: it needs edit-inventory.
  const canRestock =
    hasUnitContext && hasRole(RESTOCK_ROLES) && hasPermission("view-inventory") && hasPermission("edit-inventory");

  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const { data, isLoading, error } = useReorderReport({
    warehouse_id: warehouseId || undefined,
    category_id: categoryId || undefined,
  });
  const warehouses = useCountableWarehouses();
  // Items hang off leaf categories and the backend filter is an exact match, so only leaves are offered.
  const { data: categories } = useLeafItemCategories();

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const toOrder = useMemo(() => rows.filter((r) => r.needs_reorder && r.suggested_qty > 0), [rows]);

  /** One restock line per item: the same item short in two warehouses is ordered once, summed. */
  const openRestock = useCallback(
    (picked: ReorderReportRow[]) => {
      const byItem = new Map<string, RestockPrefill["lines"][number]>();
      for (const row of picked) {
        const current = byItem.get(row.inventory_item_id);
        byItem.set(row.inventory_item_id, {
          inventory_item_id: row.inventory_item_id,
          name: row.item_name ?? row.item_code ?? "",
          code: row.item_code ?? "",
          quantity: Math.round(((current?.quantity ?? 0) + row.suggested_qty) * 10000) / 10000,
        });
      }
      const restockPrefill: RestockPrefill = { lines: [...byItem.values()] };
      navigate("/sales/restock", { state: { restockPrefill } });
    },
    [navigate],
  );

  const columns = useMemo<ColumnDef<ReorderReportRow, unknown>[]>(() => {
    const cols: ColumnDef<ReorderReportRow, unknown>[] = [
      {
        id: "item",
        header: "الصنف",
        meta: { exportValue: (r) => [r.item_code, r.item_name].filter(Boolean).join(" — ") },
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <Link
              to={`/inventory/items/${row.original.inventory_item_id}/levels`}
              state={levelsBackState}
              title="حدود المخزون"
              className="text-xs font-semibold text-app-label-primary hover:text-app-accent hover:underline"
            >
              {row.original.item_name ?? "—"}
            </Link>
            <div className="font-mono text-[10px] text-app-label-tertiary">{row.original.item_code}</div>
          </div>
        ),
      },
      {
        id: "warehouse",
        header: "المخزن",
        meta: { exportValue: (r) => warehouses.find((w) => w.id === r.warehouse_id)?.label ?? r.warehouse_name },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs text-app-label-secondary">
            {warehouses.find((w) => w.id === row.original.warehouse_id)?.label ?? row.original.warehouse_name ?? "—"}
          </span>
        ),
      },
      {
        id: "bin_location",
        header: "موقع الرف",
        enableSorting: false,
        meta: { exportValue: (r) => r.bin_location, className: "font-mono text-xs" },
        cell: ({ row }) => row.original.bin_location ?? "—",
      },
      {
        id: "on_hand",
        accessorKey: "on_hand",
        header: "الرصيد المتاح",
        meta: { className: "font-mono" },
        cell: ({ row }) => (
          <span className={row.original.needs_reorder ? "font-bold text-app-status-danger" : "text-app-label-primary"}>
            {qty(row.original.on_hand)}{" "}
            <span className="font-sans text-[10px] text-app-label-tertiary">
              {row.original.unit_of_measure ? UOM_LABELS[row.original.unit_of_measure] ?? row.original.unit_of_measure : ""}
            </span>
          </span>
        ),
      },
      {
        id: "min_qty",
        header: "الحد الأدنى",
        enableSorting: false,
        meta: { exportValue: (r) => r.min_qty, className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => qty(row.original.min_qty),
      },
      {
        id: "max_qty",
        header: "الحد الأقصى",
        enableSorting: false,
        meta: { exportValue: (r) => r.max_qty, className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => qty(row.original.max_qty),
      },
      {
        id: "reorder_qty",
        header: "كمية إعادة الطلب",
        enableSorting: false,
        meta: { exportValue: (r) => r.reorder_qty, className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => qty(row.original.reorder_qty),
      },
      {
        id: "suggested_qty",
        accessorKey: "suggested_qty",
        header: "الكمية المقترحة",
        meta: { exportValue: (r) => (r.needs_reorder ? r.suggested_qty : null), className: "font-mono" },
        cell: ({ row }) =>
          row.original.needs_reorder ? (
            <span className="font-bold text-app-accent">{qty(row.original.suggested_qty)}</span>
          ) : (
            <span className="text-app-label-tertiary">—</span>
          ),
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (r) => (r.needs_reorder ? "يحتاج إعادة طلب" : "كافٍ") },
        enableSorting: false,
        cell: ({ row }) =>
          row.original.needs_reorder ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-app-status-danger/15 px-2 py-0.5 text-[10px] font-bold text-app-status-danger">
              <AlertTriangle className="h-3 w-3" /> يحتاج إعادة طلب
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-app-status-positive/15 px-2 py-0.5 text-[10px] font-bold text-app-status-positive">
              <CheckCircle2 className="h-3 w-3" /> كافٍ
            </span>
          ),
      },
    ];

    cols.push({
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { export: false, align: "end" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2">
          <Link
            to={`/inventory/items/${row.original.inventory_item_id}/levels`}
            state={levelsBackState}
            className="inline-flex items-center gap-1 rounded-xl border border-app-separator px-2.5 py-1 text-[11px] font-semibold text-app-label-secondary hover:bg-app-fill-f1"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" /> الحدود
          </Link>
          {canRestock && row.original.needs_reorder && row.original.suggested_qty > 0 && (
            <button
              type="button"
              onClick={() => openRestock([row.original])}
              className="inline-flex items-center gap-1 rounded-xl border border-app-accent/40 px-2.5 py-1 text-[11px] font-bold text-app-accent hover:bg-app-accent/10"
            >
              <Truck className="h-3.5 w-3.5" /> طلب تزويد
            </button>
          )}
        </div>
      ),
    });

    return cols;
  }, [canRestock, openRestock, warehouses]);

  const table = useDataTable({
    exportFileName: "reorder-report",
    columns,
    data: rows,
    enableSorting: true,
    pageSize: 25,
    getRowId: (r) => r.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Gauge className="w-7 h-7 text-app-accent" />
            تقرير إعادة الطلب
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            الرصيد المتاح لكل صنف في كل مخزن مقابل حدوده. عندما يصل الرصيد إلى الحد الأدنى أو أقل تُقترح كمية = الحد الأقصى −
            الرصيد. تُضبط حدود الصنف وموقع رفه من زر «الحدود» في صفه.
          </p>
          {isCompanyWide && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-app-fill-f1 px-2.5 py-1 text-[11px] text-app-label-secondary">
              <Building2 className="h-3.5 w-3.5" />
              {pinnedUnitId ? (
                <span>
                  يعرض التقرير مخازن الوحدة المحددة فقط:{" "}
                  <span className="font-bold text-app-label-primary">{pinnedUnitName ?? "—"}</span> — غيّر الوحدة من
                  الشريط العلوي لعرض وحدة أخرى.
                </span>
              ) : (
                <span>يعرض التقرير مخازن كل الوحدات. اختر وحدة من الشريط العلوي لإنشاء طلب تزويد.</span>
              )}
            </p>
          )}
        </div>

        {canRestock && (
          <button
            type="button"
            onClick={() => openRestock(toOrder)}
            disabled={toOrder.length === 0}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            <Truck className="w-4 h-4" /> طلب تزويد
            {toOrder.length > 0 && <span className="font-mono">({formatInteger(toOrder.length)})</span>}
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm">
        <Filter className="hidden sm:block w-4 h-4 text-app-label-secondary" />
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          aria-label="المخزن"
          className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
        >
          <option value="">كل المخازن</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
        <div className="min-w-[12rem]">
          <SearchableSelect<LeafItemCategory>
            options={categories}
            value={categories.find((c) => c.id === categoryId) ?? null}
            onChange={(c) => setCategoryId(c ? c.id : "")}
            getOptionId={(c) => c.id}
            getOptionLabel={(c) => c.path}
            placeholder="كل الفئات"
            size="sm"
          />
        </div>

        <div className="sm:ms-auto flex items-center gap-3 text-xs">
          <span className="text-app-label-secondary">
            الأصناف: <span className="font-mono font-bold text-app-label-primary">{formatInteger(data?.summary.rows ?? 0)}</span>
          </span>
          <span className="text-app-label-secondary">
            تحتاج إعادة طلب:{" "}
            <span className="font-mono font-bold text-app-status-danger">
              {formatInteger(data?.summary.needs_reorder_count ?? 0)}
            </span>
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{stockLevelErrorMessage(error, "تعذّر تحميل تقرير إعادة الطلب.")}</span>
        </div>
      )}

      <DataTable table={table}>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد أصناف لها حدود مخزون في هذه المخازن."
          emptyIcon={Gauge}
        />
        <DataTable.Pagination />
      </DataTable>
    </div>
  );
};
