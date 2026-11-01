import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, Building2, CalendarClock, FileSpreadsheet, Filter, Hourglass, Layers, Printer, Wallet } from "lucide-react";
import { useStagnantStock } from "../../hooks/useStagnantStock";
import { useLeafItemCategories } from "../../hooks/useCategories";
import type { LeafItemCategory } from "../../hooks/useCategories";
import { useCountableWarehouses } from "../../components/inventory/StockCountDialogs";
import { useWarehouses } from "../../hooks/useWarehouses";
import { useIsCompanyWide } from "../../hooks/useAccounting";
import { useOperatingUnits } from "../../hooks/useOperatingUnits";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import type { ColumnDef } from "../../components/ui/DataTable";
import { PrintDialog, PrintDocument, PrintTable, Cell, money } from "../../components/print/PrintDocument";
import {
  STAGNANT_DEFAULT_DAYS,
  STAGNANT_MAX_DAYS,
  StagnantLotStatus,
  StagnantStockRow,
} from "../../api/endpoints/stagnantStock";
import { apiErrorMessage, apiErrorPayload } from "../../api/endpoints/production";
import { UOM_LABELS } from "../../api/endpoints/inventory";
import { LOT_STATUS_LABEL } from "../../api/endpoints/stockCounts";
import { downloadCsv, toCsv } from "../../lib/utils/csv";
import { formatDate, formatInteger, formatNumber, localDateIso } from "../../lib/utils/format";

const DAY_PRESETS = [30, 60, 90, 180, 365];

const STATUS_CHIP: Record<StagnantLotStatus, string> = {
  available: "bg-app-status-positive/15 text-app-status-positive",
  reserved: "bg-app-accent/15 text-app-accent",
  quarantined: "bg-app-status-danger/15 text-app-status-danger",
};

const qty = (v: number): string => formatNumber(v, { maximumFractionDigits: 4 });
const uom = (u: string | null): string => (u ? UOM_LABELS[u] ?? u : "");
const statusLabel = (s: string): string => LOT_STATUS_LABEL[s] ?? s;

/** A whole number of days the server accepts (1–3650), else null. */
const parseDays = (raw: string): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= STAGNANT_MAX_DAYS ? n : null;
};

/** Calendar date in the viewer's local time zone, as the table and print show it. */
const localDay = (iso: string | null): string => (iso ? localDateIso(new Date(iso)) : "");

/** The backend's warehouse_id refusal is English and code-less; say it in Arabic. */
const reportErrorMessage = (err: unknown): string =>
  apiErrorPayload(err)?.errors?.warehouse_id
    ? "المخزن المحدد غير موجود في الوحدة الحالية."
    : apiErrorMessage(err, "تعذّر تحميل تقرير المخزون الراكد.");

/**
 * Stagnant stock report (W4-04, FR-SREP-018): lots holding stock (available,
 * reserved or quarantined) whose last real movement — warehouse transfers and
 * reservation splits don't count — is older than the chosen number of days,
 * valued at quantity × unit cost. Opened from the warehouse ledger, optionally
 * with ?warehouse_id= to start filtered on one warehouse.
 */
export const StagnantStockReportPage: React.FC = () => {
  // The warehouse filter lives in the URL (?warehouse_id=), so the plain
  // /inventory/stagnant tab / nav link clears it and the ledger deep link sets it.
  const [searchParams, setSearchParams] = useSearchParams();
  const warehouseId = searchParams.get("warehouse_id") ?? "";
  const setWarehouseId = useCallback(
    (id: string) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("warehouse_id", id);
          else next.delete("warehouse_id");
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  const [categoryId, setCategoryId] = useState("");
  const [daysInput, setDaysInput] = useState(String(STAGNANT_DEFAULT_DAYS));
  const [days, setDays] = useState(STAGNANT_DEFAULT_DAYS);
  const [printing, setPrinting] = useState(false);

  // Typed days apply once they settle on a valid value (no request per keystroke).
  const parsedDays = parseDays(daysInput);
  useEffect(() => {
    if (parsedDays === null || parsedDays === days) return;
    const timer = window.setTimeout(() => setDays(parsedDays), 400);
    return () => window.clearTimeout(timer);
  }, [parsedDays, days]);

  const pickPreset = (d: number) => {
    setDaysInput(String(d));
    setDays(d);
  };

  const { data, isLoading, isFetching, error } = useStagnantStock({
    days,
    warehouse_id: warehouseId || undefined,
    category_id: categoryId || undefined,
  });
  const warehouses = useCountableWarehouses();
  const { data: warehouseTree } = useWarehouses();
  // A warehouse not in the current unit's list (unit switched, deleted, bad
  // deep link) would keep filtering behind a select showing «كل المخازن» — drop it.
  useEffect(() => {
    if (warehouseId && warehouseTree && !warehouses.some((w) => w.id === warehouseId)) setWarehouseId("");
  }, [warehouseId, warehouseTree, warehouses, setWarehouseId]);

  // Company-wide roles with no unit pinned see every unit's lots, so each row names its unit.
  const isCompanyWide = useIsCompanyWide();
  const pinnedUnitId = useServerConfigStore((s) => s.operatingUnitId);
  const { data: units } = useOperatingUnits();
  const showUnit = isCompanyWide && !pinnedUnitId;
  const unitName = useCallback(
    (id: string | null): string => (id ? units?.find((u) => u.id === id)?.name ?? "—" : "—"),
    [units],
  );
  const scopeUnitLabel = pinnedUnitId ? unitName(pinnedUnitId) : "كل الوحدات";
  // Items hang off leaf categories and the backend filter is an exact match, so only leaves are offered.
  const { data: categories } = useLeafItemCategories();

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const summary = data?.summary;
  const oldestDays = useMemo(() => rows.reduce((max, r) => Math.max(max, r.days_idle), 0), [rows]);

  const warehouseLabel = (row: StagnantStockRow): string =>
    warehouses.find((w) => w.id === row.warehouse_id)?.label ?? row.warehouse_name ?? "—";
  const selectedWarehouseLabel = warehouseId ? warehouses.find((w) => w.id === warehouseId)?.label ?? "—" : "كل المخازن";
  const selectedCategoryLabel = categoryId ? categories.find((c) => c.id === categoryId)?.path ?? "—" : "كل الفئات";

  const columns = useMemo<ColumnDef<StagnantStockRow, unknown>[]>(
    () => [
      ...(showUnit
        ? [
            {
              id: "unit",
              header: "الوحدة",
              enableSorting: false,
              cell: ({ row }) => (
                <span className="text-xs text-app-label-secondary">{unitName(row.original.operating_unit_id)}</span>
              ),
            } satisfies ColumnDef<StagnantStockRow, unknown>,
          ]
        : []),
      {
        id: "item",
        header: "الصنف",
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div className="text-xs font-semibold text-app-label-primary">{row.original.item_name ?? "—"}</div>
            <div className="font-mono text-[10px] text-app-label-tertiary">{row.original.item_code}</div>
          </div>
        ),
      },
      {
        id: "lot_number",
        accessorKey: "lot_number",
        header: "رقم الدفعة",
        meta: { className: "font-mono text-xs" },
      },
      {
        id: "warehouse",
        header: "المخزن",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-xs text-app-label-secondary">
            {warehouses.find((w) => w.id === row.original.warehouse_id)?.label ?? row.original.warehouse_name ?? "—"}
            {row.original.bin_location && (
              <div className="font-mono text-[10px] text-app-label-tertiary">{row.original.bin_location}</div>
            )}
          </div>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: "الحالة",
        cell: ({ row }) => (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CHIP[row.original.status] ?? "bg-app-fill-f1 text-app-label-secondary"}`}
          >
            {statusLabel(row.original.status)}
          </span>
        ),
      },
      {
        id: "quantity",
        accessorKey: "quantity",
        header: "الكمية",
        meta: { className: "font-mono" },
        cell: ({ row }) => (
          <span className="text-app-label-primary">
            {qty(row.original.quantity)}{" "}
            <span className="font-sans text-[10px] text-app-label-tertiary">{uom(row.original.unit_of_measure)}</span>
          </span>
        ),
      },
      {
        id: "unit_cost",
        accessorKey: "unit_cost",
        header: "تكلفة الوحدة",
        meta: { className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => formatNumber(row.original.unit_cost, { maximumFractionDigits: 4 }),
      },
      {
        id: "value",
        accessorKey: "value",
        header: "القيمة",
        meta: { className: "font-mono" },
        cell: ({ row }) => <span className="font-bold text-app-label-primary">{formatNumber(row.original.value)}</span>,
      },
      {
        id: "last_movement_at",
        header: "آخر حركة فعلية",
        enableSorting: false,
        cell: ({ row }) =>
          row.original.last_movement_at ? (
            <span className="font-mono text-xs text-app-label-secondary">{formatDate(row.original.last_movement_at)}</span>
          ) : (
            // Split lots (-XFER, -R) carry the parent's idle-since as received_at, so
            // this is not necessarily a receipt date — stay neutral.
            <span className="text-[11px] text-app-label-tertiary">
              لا حركة فعلية على هذه الدفعة — راكدة منذ{" "}
              <span className="font-mono">{formatDate(row.original.idle_since)}</span>
            </span>
          ),
      },
      {
        id: "days_idle",
        accessorKey: "days_idle",
        header: "أيام الركود",
        meta: { className: "font-mono" },
        cell: ({ row }) => (
          <span className="font-bold text-app-status-danger">{formatInteger(row.original.days_idle)}</span>
        ),
      },
    ],
    [warehouses, showUnit, unitName],
  );

  const table = useDataTable({
    // One CSV button per grid: the page's own CSV button exports this report.
    enableExport: false,
    columns,
    data: rows,
    enableSorting: true,
    pageSize: 25,
    getRowId: (r) => r.stock_lot_id,
  });

  const exportCsv = () => {
    const csv = toCsv<StagnantStockRow>(rows, [
      ...(showUnit ? [{ header: "الوحدة", value: (r: StagnantStockRow) => unitName(r.operating_unit_id) }] : []),
      { header: "رمز الصنف", value: (r) => r.item_code },
      { header: "الصنف", value: (r) => r.item_name },
      { header: "رقم الدفعة", value: (r) => r.lot_number },
      { header: "المخزن", value: warehouseLabel },
      { header: "موقع الرف", value: (r) => r.bin_location },
      { header: "الحالة", value: (r) => statusLabel(r.status) },
      { header: "الكمية", value: (r) => r.quantity, decimals: 4 },
      { header: "وحدة القياس", value: (r) => uom(r.unit_of_measure) },
      { header: "تكلفة الوحدة", value: (r) => r.unit_cost, decimals: 4 },
      { header: "القيمة", value: (r) => r.value },
      { header: "آخر حركة فعلية", value: (r) => localDay(r.last_movement_at) },
      { header: "راكد منذ", value: (r) => localDay(r.idle_since) },
      { header: "أيام الركود", value: (r) => r.days_idle, decimals: 0 },
    ]);
    downloadCsv(`stagnant-stock-${days}d-${localDateIso()}.csv`, csv);
  };

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Hourglass className="w-7 h-7 text-app-accent" />
            المخزون الراكد
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            الدفعات التي ما زالت تحمل رصيداً (متاحة أو محجوزة أو في الحجر الصحي) ولم تتحرك حركة فعلية منذ أكثر من عدد الأيام
            المحدد. النقل بين المخازن وتجزئة الحجز لا يُعدّان حركة. القيمة = الكمية × تكلفة الوحدة للدفعة.
          </p>
          {isCompanyWide && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-app-fill-f1 px-2.5 py-1 text-[11px] text-app-label-secondary">
              <Building2 className="h-3.5 w-3.5" />
              {pinnedUnitId ? (
                <span>
                  يعرض التقرير دفعات الوحدة المحددة فقط:{" "}
                  <span className="font-bold text-app-label-primary">{scopeUnitLabel}</span> — غيّر الوحدة من الشريط
                  العلوي لعرض وحدة أخرى.
                </span>
              ) : (
                <span>يعرض التقرير دفعات كل الوحدات، والإجمالي يشملها جميعاً. اختر وحدة من الشريط العلوي لحصره بها.</span>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4" /> CSV
          </button>
          <button
            type="button"
            onClick={() => setPrinting(true)}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 disabled:opacity-40"
          >
            <Printer className="w-4 h-4" /> طباعة
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm">
        <Filter className="hidden lg:block w-4 h-4 text-app-label-secondary" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-app-label-secondary">
            راكد منذ أكثر من
            <input
              type="number"
              min={1}
              max={STAGNANT_MAX_DAYS}
              step={1}
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              aria-invalid={parsedDays === null}
              className={`w-20 rounded-xl border bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:outline-none ${
                parsedDays === null ? "border-app-status-danger" : "border-app-separator focus:border-app-accent"
              }`}
            />
            يوماً
          </label>
          <div className="flex items-center gap-1">
            {DAY_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pickPreset(d)}
                className={`rounded-lg px-2 py-1 text-[11px] font-mono font-semibold ${
                  days === d && parsedDays === d
                    ? "bg-app-accent text-white"
                    : "bg-app-fill-f1 text-app-label-secondary hover:text-app-label-primary"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
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
        {parsedDays === null && (
          <span className="text-[11px] text-app-status-danger">أدخل عدداً صحيحاً من 1 إلى {STAGNANT_MAX_DAYS}.</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-app-accent/10 text-app-accent rounded-xl">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-app-label-secondary">الدفعات الراكدة</div>
            <div className="text-xl font-bold font-mono text-app-label-primary">{formatInteger(summary?.lots ?? 0)}</div>
          </div>
        </div>
        <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-app-status-danger/10 text-app-status-danger rounded-xl">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-app-label-secondary">القيمة الإجمالية</div>
            <div className="text-xl font-bold font-mono text-app-label-primary">{money(summary?.total_value ?? 0)}</div>
          </div>
        </div>
        <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-app-fill-f1 text-app-label-secondary rounded-xl">
            <Hourglass className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-app-label-secondary">أطول مدة ركود</div>
            <div className="text-xl font-bold font-mono text-app-label-primary">
              {formatInteger(oldestDays)} <span className="font-sans text-xs text-app-label-tertiary">يوماً</span>
            </div>
          </div>
        </div>
        <div className="bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm flex items-center gap-3">
          <div className="p-2.5 bg-app-fill-f1 text-app-label-secondary rounded-xl">
            <CalendarClock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-app-label-secondary">لم تتحرك منذ ما قبل</div>
            <div className="text-xl font-bold font-mono text-app-label-primary">
              {summary ? formatDate(summary.cutoff) : "—"}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{reportErrorMessage(error)}</span>
        </div>
      )}

      <DataTable table={table}>
        <DataTable.Content
          isLoading={isLoading || (isFetching && rows.length === 0)}
          emptyMessage="لا يوجد مخزون راكد بهذه الشروط."
          emptyIcon={Hourglass}
        />
        <DataTable.Pagination />
      </DataTable>

      <PrintDialog open={printing} onClose={() => setPrinting(false)} title="طباعة تقرير المخزون الراكد">
        {summary && (
          <PrintDocument
            title="تقرير المخزون الراكد"
            number={`أكثر من ${summary.days} يوماً`}
            date={new Date().toISOString()}
            meta={[
              { label: "الوحدة", value: scopeUnitLabel },
              { label: "المخزن", value: selectedWarehouseLabel },
              { label: "الفئة", value: selectedCategoryLabel },
              { label: "لم تتحرك منذ ما قبل", value: formatDate(summary.cutoff) },
              { label: "عدد الدفعات", value: formatInteger(summary.lots) },
              { label: "القيمة الإجمالية", value: money(summary.total_value) },
            ]}
            signatures={["أمين المخزن", "مدير المخزون"]}
            footerNote="النقل بين المخازن وتجزئة الحجز لا يُعدّان حركة فعلية. «—» في آخر حركة فعلية: لا حركة فعلية على الدفعة نفسها."
          >
            <PrintTable
              head={[
                ...(showUnit ? ["الوحدة"] : []),
                "الصنف",
                "رقم الدفعة",
                "المخزن",
                "الحالة",
                "الكمية",
                "تكلفة الوحدة",
                "القيمة",
                "آخر حركة فعلية",
                "راكد منذ",
                "أيام الركود",
              ]}
            >
              {rows.map((r) => (
                <tr key={r.stock_lot_id}>
                  {showUnit && <Cell>{unitName(r.operating_unit_id)}</Cell>}
                  <Cell>
                    {r.item_name ?? "—"}
                    {r.item_code && <div className="font-mono text-[10px] text-gray-600">{r.item_code}</div>}
                  </Cell>
                  <Cell className="font-mono">{r.lot_number}</Cell>
                  <Cell>{warehouseLabel(r)}</Cell>
                  <Cell>{statusLabel(r.status)}</Cell>
                  <Cell className="text-end font-mono">
                    {qty(r.quantity)} <span className="font-sans text-[10px]">{uom(r.unit_of_measure)}</span>
                  </Cell>
                  <Cell className="text-end font-mono">{formatNumber(r.unit_cost, { maximumFractionDigits: 4 })}</Cell>
                  <Cell className="text-end font-mono">{formatNumber(r.value)}</Cell>
                  <Cell className="font-mono">{r.last_movement_at ? formatDate(r.last_movement_at) : "—"}</Cell>
                  <Cell className="font-mono">{formatDate(r.idle_since)}</Cell>
                  <Cell className="text-end font-mono">{formatInteger(r.days_idle)}</Cell>
                </tr>
              ))}
              <tr className="font-bold">
                <Cell colSpan={showUnit ? 7 : 6}>الإجمالي</Cell>
                <Cell className="text-end font-mono">{formatNumber(summary.total_value)}</Cell>
                <Cell colSpan={3} />
              </tr>
            </PrintTable>
          </PrintDocument>
        )}
      </PrintDialog>
    </div>
  );
};
