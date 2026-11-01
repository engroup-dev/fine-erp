import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import {
  Column,
  ColumnDef,
  RowSelectionState,
  SortingState,
  PaginationState,
  Table as TanstackTable,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileSpreadsheet,
  Inbox,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "../../lib/utils/utils";
import { downloadCsv, toCsv } from "../../lib/utils/csv";
import { localDateIso } from "../../lib/utils/format";
import { toast } from "../../stores/toastStore";
import { apiErrorMessage } from "../../api/endpoints/production";

// Lets column defs carry the same per-column display hints the old hand-rolled
// table took as props (align/className), read back in DataTable.Content.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: "start" | "center" | "end";
    className?: string;
    headerClassName?: string;
    /** CSV export: `false` leaves the column out (actions, selection, row tools). */
    export?: boolean;
    /**
     * CSV export: the plain value of this column for one row. Needed by columns
     * whose cell is JSX with no accessor; overrides the accessor value otherwise
     * (e.g. an enum shown as an Arabic label).
     */
    exportValue?: (row: TData) => string | number | boolean | null | undefined;
    /** CSV export: header text when `header` is not a plain string. */
    exportHeader?: string;
    /**
     * CSV export: this column becomes several CSV columns, in order (it wins over
     * exportValue). Lets an amount shown with its currency export as a plain number
     * plus its own currency column, so a spreadsheet can still sum it.
     */
    exportAs?: Array<{
      header: string;
      value: (row: TData) => string | number | boolean | null | undefined;
    }>;
  }
}

export type { ColumnDef } from "@tanstack/react-table";

function getAlignClass(align?: "start" | "center" | "end"): string {
  switch (align) {
    case "center":
      return "text-center";
    case "end":
      return "text-end";
    default:
      return "text-start";
  }
}

/** Prepend to `columns` when building the instance to get a checkbox column for row selection. */
export function createSelectionColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: "__select__",
    header: ({ table }) => (
      <input
        type="checkbox"
        checked={table.getIsAllPageRowsSelected()}
        ref={(el) => {
          if (el)
            el.indeterminate =
              table.getIsSomePageRowsSelected() &&
              !table.getIsAllPageRowsSelected();
        }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
        className="rounded border-app-separator text-app-accent focus:ring-app-accent"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
        className="rounded border-app-separator text-app-accent focus:ring-app-accent"
      />
    ),
    size: 36,
    enableSorting: false,
    meta: { align: "center" },
  };
}

export interface UseDataTableOptions<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  /** Click a column header to sort. Off by default — opt in per table. */
  enableSorting?: boolean;
  /** Wires DataTable.SearchInput to filter every column's text client-side. */
  enableGlobalFilter?: boolean;
  /** Adds a checkbox column and tracks selected rows (read via table.getSelectedRowModel()). */
  enableRowSelection?: boolean;
  /** Client-side pagination. On by default per the app's convention. */
  enablePagination?: boolean;
  pageSize?: number;
  getRowId?: (row: TData, index: number) => string;
  /**
   * Server-side paging: `data` is one page of a Laravel paginator and the
   * footer drives `page` / `per_page` through onChange instead of slicing rows.
   */
  serverPagination?: ServerPagination;
  /** Show the CSV export button (on by default). */
  enableExport?: boolean;
  /** File name stem for the CSV export; today's date and .csv are appended. */
  exportFileName?: string;
  /**
   * The all-pages plug-in point for server-paginated grids. When given, the
   * export button writes what this resolves to instead of the loaded rows.
   * Set where the endpoint can already return every row (paged lists walked with
   * fetchAllPages, or an `all=1` endpoint); the other server-paged grids leave it
   * unset and export the rows on screen until their endpoints accept `all=1`
   * (W6-04 backend half).
   */
  fetchAllRowsForExport?: () => Promise<TData[]>;
}

export interface ServerPagination {
  /** 1-based, as Laravel counts. */
  page: number;
  perPage: number;
  /** Total rows across every page (paginator `total`). */
  total: number;
  lastPage: number;
  onChange: (page: number, perPage: number) => void;
}

export interface DataTableInstance<TData> {
  table: TanstackTable<TData>;
  enableSorting: boolean;
  enableGlobalFilter: boolean;
  enableRowSelection: boolean;
  enablePagination: boolean;
  enableExport: boolean;
  exportFileName: string;
  fetchAllRowsForExport?: () => Promise<TData[]>;
}

/**
 * Headless TanStack Table wiring. Returns a bundle you pass to <DataTable table={...}>,
 * and keep around in your page component to read selection / call table.setGlobalFilter etc.
 */
export function useDataTable<TData>({
  columns,
  data,
  enableSorting: enableSortingOption = false,
  enableGlobalFilter = false,
  enableRowSelection = false,
  enablePagination = true,
  pageSize = 10,
  getRowId,
  serverPagination,
  enableExport = true,
  exportFileName = "export",
  fetchAllRowsForExport,
}: UseDataTableOptions<TData>): DataTableInstance<TData> {
  // Server-paged grids hold one page and their endpoints keep a fixed order, so a
  // header sort would reorder that page alone while looking catalogue-wide: off.
  const enableSorting = enableSortingOption && !serverPagination;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const finalColumns = useMemo(
    () =>
      enableRowSelection
        ? [createSelectionColumn<TData>(), ...columns]
        : columns,
    [columns, enableRowSelection],
  );

  // A page past the end (its last rows were deleted, or fewer match now) steps back to the last one.
  const serverPage = serverPagination?.page;
  const serverLastPage = serverPagination?.lastPage;
  const serverOnChange = serverPagination?.onChange;
  const serverPerPage = serverPagination?.perPage;
  useEffect(() => {
    if (
      serverPage !== undefined &&
      serverLastPage !== undefined &&
      serverLastPage >= 1 &&
      serverPage > serverLastPage
    ) {
      serverOnChange?.(serverLastPage, serverPerPage ?? pageSize);
    }
  }, [serverPage, serverLastPage, serverOnChange, serverPerPage, pageSize]);

  const serverState: PaginationState | undefined = serverPagination && {
    pageIndex: serverPagination.page - 1,
    pageSize: serverPagination.perPage,
  };

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: {
      ...(enableSorting ? { sorting } : {}),
      ...(enableGlobalFilter ? { globalFilter } : {}),
      ...(enableRowSelection ? { rowSelection } : {}),
      ...(serverState
        ? { pagination: serverState }
        : enablePagination
          ? { pagination }
          : {}),
    },
    onSortingChange: enableSorting ? setSorting : undefined,
    onGlobalFilterChange: enableGlobalFilter ? setGlobalFilter : undefined,
    onRowSelectionChange: enableRowSelection ? setRowSelection : undefined,
    onPaginationChange: serverPagination
      ? (updater) => {
          const current = serverState ?? pagination;
          const next =
            typeof updater === "function" ? updater(current) : updater;
          // A new page size starts over from the first page.
          const page =
            next.pageSize !== serverPagination.perPage ? 1 : next.pageIndex + 1;
          serverPagination.onChange(page, next.pageSize);
        }
      : enablePagination
        ? setPagination
        : undefined,
    manualPagination: Boolean(serverPagination),
    pageCount: serverPagination ? Math.max(1, serverPagination.lastPage) : undefined,
    rowCount: serverPagination?.total,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: enableSorting ? getSortedRowModel() : undefined,
    getFilteredRowModel: enableGlobalFilter ? getFilteredRowModel() : undefined,
    getPaginationRowModel: enablePagination
      ? getPaginationRowModel()
      : undefined,
    enableRowSelection,
    getRowId: getRowId as ((row: TData, index: number) => string) | undefined,
  });

  return {
    table,
    enableSorting,
    enableGlobalFilter,
    enableRowSelection,
    enablePagination: enablePagination || Boolean(serverPagination),
    enableExport,
    exportFileName,
    fetchAllRowsForExport,
  };
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
// Laravel 'date' casts (app timezone UTC) serialize as midnight UTC: a calendar date, not an instant.
const ISO_UTC_MIDNIGHT = /^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|\+00:00)$/;

/** One CSV field: numbers stay numeric text, booleans read نعم/لا, objects drop out. */
function exportText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    // API timestamps (ISO, UTC) read as this machine's local date and time.
    // Date-only columns keep their calendar date; shifting them to local time would add a fake
    // hour (or move the day back west of UTC).
    if (ISO_UTC_MIDNIGHT.test(value)) return value.slice(0, 10);
    if (ISO_TIMESTAMP.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${localDateIso(d)} ${hh}:${mm}`;
      }
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // 15 significant digits drop float noise from computed values (3.3000000000000003 -> 3.3)
    // while keeping every stored decimal, fx rates included.
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(15)));
  }
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (value instanceof Date) return localDateIso(value);
  if (Array.isArray(value)) return value.map(exportText).filter(Boolean).join("، ");
  return null;
}

/** Visible columns that carry data: selection, export=false and value-less (JSX-only) columns drop out. */
function exportColumns<TData>(table: TanstackTable<TData>): Column<TData, unknown>[] {
  return table.getVisibleLeafColumns().filter((column) => {
    const meta = column.columnDef.meta;
    if (column.id === "__select__" || meta?.export === false) return false;
    return Boolean(meta?.exportAs?.length || meta?.exportValue || column.accessorFn);
  });
}

function exportHeader<TData>(column: Column<TData, unknown>): string {
  const header = column.columnDef.header;
  if (typeof header === "string" && header.trim() !== "") return header;
  return column.columnDef.meta?.exportHeader ?? column.id;
}

/** Filtered + sorted rows × visible columns as CSV (BOM + formula guard from csv.ts). */
export function dataTableToCsv<TData>(
  table: TanstackTable<TData>,
  rows: TData[],
): string {
  const indexOf = new Map(rows.map((row, i) => [row, i]));
  return toCsv<TData>(
    rows,
    exportColumns(table).flatMap((column) => {
      const meta = column.columnDef.meta;
      if (meta?.exportAs?.length) {
        return meta.exportAs.map((part) => ({
          header: part.header,
          value: (row: TData) => exportText(part.value(row)),
        }));
      }
      return [
        {
          header: exportHeader(column),
          value: (row: TData) => {
            if (meta?.exportValue) return exportText(meta.exportValue(row));
            return exportText(column.accessorFn?.(row, indexOf.get(row) ?? 0));
          },
        },
      ];
    }),
  );
}

interface DataTableContextValue<TData> extends DataTableInstance<TData> {
  /** How many Header / Pagination strips are mounted — picks where the export button sits. */
  slots: { header: number; pagination: number };
  registerSlot: (slot: "header" | "pagination") => () => void;
}

const DataTableContext = createContext<DataTableContextValue<any> | null>(null);

function useDataTableContext<TData>(
  component: string,
): DataTableContextValue<TData> {
  const ctx = useContext(DataTableContext);
  if (!ctx) {
    throw new Error(`<${component}> must be used inside a <DataTable>`);
  }
  return ctx;
}

/** Marks a strip as mounted before paint, so the export button never flickers between spots. */
function useRegisterSlot(
  registerSlot: DataTableContextValue<unknown>["registerSlot"],
  slot: "header" | "pagination",
  active = true,
) {
  useLayoutEffect(() => (active ? registerSlot(slot) : undefined), [
    registerSlot,
    slot,
    active,
  ]);
}

export interface DataTableProps<TData> {
  table: DataTableInstance<TData>;
  children: React.ReactNode;
  className?: string;
}

function DataTableRoot<TData>({
  table,
  children,
  className,
}: DataTableProps<TData>) {
  const [slots, setSlots] = useState({ header: 0, pagination: 0 });
  const registerSlot = useMemo(
    () => (slot: "header" | "pagination") => {
      setSlots((s) => ({ ...s, [slot]: s[slot] + 1 }));
      return () => setSlots((s) => ({ ...s, [slot]: s[slot] - 1 }));
    },
    [],
  );
  const value = useMemo(
    () => ({ ...table, slots, registerSlot }),
    [table, slots, registerSlot],
  );
  // No header or footer strip on this table: the export button gets its own.
  const ownStrip =
    table.enableExport && slots.header === 0 && slots.pagination === 0;

  return (
    <DataTableContext.Provider value={value}>
      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm",
          className,
        )}
        dir="rtl"
      >
        {children}
        {ownStrip && (
          <div className="flex justify-end border-t border-app-separator bg-app-bg-secondary px-4 py-2">
            <DataTableExportButton />
          </div>
        )}
      </div>
    </DataTableContext.Provider>
  );
}

/**
 * CSV of what the table shows: filtered + sorted rows (every client page) ×
 * visible columns. Rendered automatically — in the Header when there is one,
 * else in the Pagination footer, else in a strip of its own.
 */
const DataTableExportButton: React.FC<{ className?: string }> = ({
  className,
}) => {
  const { table, enableExport, exportFileName, fetchAllRowsForExport } =
    useDataTableContext("DataTable export button");
  const [busy, setBusy] = useState(false);
  if (!enableExport) return null;

  const loadedRows = table.getPrePaginationRowModel().rows;
  // A search box on a server-paged grid narrows the page on screen only; with one
  // typed in, the export writes the matching rows shown rather than every page.
  const searching =
    String((table.getState().globalFilter as string | undefined) ?? "").trim() !== "";
  const fetchAll = searching ? undefined : fetchAllRowsForExport;

  const onExport = async () => {
    setBusy(true);
    try {
      const rows = fetchAll
        ? await fetchAll()
        : loadedRows.map((r) => r.original);
      downloadCsv(
        `${exportFileName}-${localDateIso()}.csv`,
        dataTableToCsv(table, rows),
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "تعذر تصدير البيانات."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={busy || (!fetchAll && loadedRows.length === 0)}
      title={fetchAll ? "تصدير كل الصفوف المطابقة للفلاتر إلى ملف CSV" : "تصدير الصفوف الظاهرة إلى ملف CSV"}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-primary px-3 py-1.5 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 disabled:opacity-40",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-3.5 w-3.5" />
      )}
      تصدير CSV
    </button>
  );
};

export interface DataTableSlotProps {
  children?: React.ReactNode;
  className?: string;
}

/** Optional top strip inside the table card — put a DataTable.Toolbar and/or DataTable.Actions in it. */
const DataTableHeader: React.FC<DataTableSlotProps> = ({
  children,
  className,
}) => {
  const { registerSlot } = useDataTableContext("DataTable.Header");
  useRegisterSlot(registerSlot, "header");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-app-separator bg-app-bg-secondary px-4 py-3",
        className,
      )}
    >
      {children}
      <DataTableExportButton />
    </div>
  );
};

/** Left-hand (search/filters) side of the header — free-form children. */
const DataTableToolbar: React.FC<DataTableSlotProps> = ({
  children,
  className,
}) => (
  <div className={cn("flex flex-1 flex-wrap items-center gap-2", className)}>
    {children}
  </div>
);

/** Right-hand action buttons (e.g. "Add New") — free-form children. */
const DataTableActions: React.FC<DataTableSlotProps> = ({
  children,
  className,
}) => (
  <div className={cn("flex shrink-0 items-center gap-2", className)}>
    {children}
  </div>
);

/** Search box wired to the table's global filter. Requires enableGlobalFilter on useDataTable. */
const DataTableSearchInput: React.FC<{
  placeholder?: string;
  className?: string;
}> = ({ placeholder = "بحث…", className }) => {
  const { table } = useDataTableContext("DataTable.SearchInput");
  return (
    <div className={cn("relative min-w-[10rem] flex-1", className)}>
      <Search className="absolute inset-y-0 start-3 my-auto h-3.5 w-3.5 text-app-label-tertiary pointer-events-none" />
      <input
        type="text"
        value={(table.getState().globalFilter as string) ?? ""}
        onChange={(e) => table.setGlobalFilter(e.target.value)}
        placeholder={placeholder}
        className="w-full ps-9 pe-3 py-2 border border-app-separator rounded-xl bg-app-bg-primary text-xs text-app-label-primary placeholder-app-label-tertiary focus:border-app-accent focus:outline-none"
      />
    </div>
  );
};

/** Bar that appears only while rows are selected — put bulk-action buttons in it. */
const DataTableBulkActions: React.FC<DataTableSlotProps> = ({
  children,
  className,
}) => {
  const { table, enableRowSelection } = useDataTableContext(
    "DataTable.BulkActions",
  );
  if (!enableRowSelection) return null;
  const count = table.getSelectedRowModel().rows.length;
  if (count === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-b border-app-separator bg-app-accent-tint px-4 py-2.5",
        className,
      )}
    >
      <span className="text-xs font-bold text-app-accent">{count} محدد</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
};

export interface DataTableContentProps<TData> {
  isLoading?: boolean;
  skeletonRows?: number;
  emptyMessage?: string;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  onRowClick?: (row: TData) => void;
  className?: string;
}

function DataTableContent<TData>({
  isLoading = false,
  skeletonRows = 4,
  emptyMessage = "لا توجد بيانات متاحة حالياً.",
  emptyIcon: EmptyIcon = Inbox,
  onRowClick,
  className,
}: DataTableContentProps<TData>) {
  const { table, enableSorting } =
    useDataTableContext<TData>("DataTable.Content");
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-start text-xs">
        <thead className="border-b border-app-separator bg-app-bg-secondary text-app-label-secondary font-bold">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = enableSorting && header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const meta = header.column.columnDef.meta;
                return (
                  <th
                    key={header.id}
                    style={
                      header.getSize() !== 150
                        ? { width: header.getSize() }
                        : undefined
                    }
                    className={cn(
                      "px-4 py-3",
                      getAlignClass(meta?.align),
                      canSort && "cursor-pointer select-none",
                      meta?.headerClassName,
                    )}
                    onClick={
                      canSort
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : (
                      <span className="inline-flex items-center gap-1">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {canSort &&
                          (sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          ))}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>

        <tbody className="divide-y divide-app-separator text-app-label-primary">
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, rowIdx) => (
              <tr key={`skeleton-${rowIdx}`} className="animate-pulse">
                {Array.from({ length: columnCount }).map((_, colIdx) => (
                  <td key={colIdx} className="px-4 py-4">
                    <div className="h-3.5 rounded bg-app-fill-f2 w-3/4" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="py-14 text-center">
                <div className="flex flex-col items-center justify-center gap-2 text-app-label-tertiary">
                  <EmptyIcon className="h-8 w-8 text-app-label-secondary/40 mb-1" />
                  <span className="text-xs font-semibold text-app-label-secondary">
                    {emptyMessage}
                  </span>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={
                  onRowClick ? () => onRowClick(row.original) : undefined
                }
                className={cn(
                  "transition-colors",
                  onRowClick
                    ? "cursor-pointer hover:bg-app-fill-f1"
                    : "hover:bg-app-fill-f1/40",
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "px-4 py-3",
                        getAlignClass(meta?.align),
                        meta?.className,
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200, 500, 1000];
/** Server pages: list endpoints cap per_page (inventory items at 100), so no larger sizes. */
const SERVER_PAGE_SIZE_OPTIONS = [15, 25, 50, 100];

const DataTablePagination: React.FC<{
  pageSizeOptions?: number[];
  className?: string;
}> = ({ pageSizeOptions, className }) => {
  const { table, enablePagination, registerSlot, slots, enableExport } =
    useDataTableContext("DataTable.Pagination");
  useRegisterSlot(registerSlot, "pagination", enablePagination);
  if (!enablePagination) return null;

  const serverPaged = Boolean(table.options.manualPagination);
  const sizeOptions =
    pageSizeOptions ??
    (serverPaged ? SERVER_PAGE_SIZE_OPTIONS : PAGE_SIZE_OPTIONS);
  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = serverPaged
    ? table.getRowCount()
    : table.getFilteredRowModel().rows.length;
  const start = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min(totalRows, (pageIndex + 1) * pageSize);
  const pageCount = table.getPageCount() || 1;

  const navBtn =
    "rounded-lg p-1.5 text-app-label-secondary hover:bg-app-fill-f1 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-app-separator bg-app-bg-secondary px-4 py-3 text-xs text-app-label-secondary",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span>
          عرض {start}–{end} من {totalRows}
        </span>
        <select
          value={pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
          className="rounded-lg border border-app-separator bg-app-bg-primary px-2 py-1 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
        >
          {sizeOptions.map((n) => (
            <option key={n} value={n}>
              {n} / صفحة
            </option>
          ))}
        </select>
        {enableExport && slots.header === 0 && <DataTableExportButton />}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          className={navBtn}
          aria-label="الصفحة الأولى"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className={navBtn}
          aria-label="الصفحة السابقة"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 font-semibold text-app-label-primary">
          صفحة {pageIndex + 1} من {pageCount}
        </span>
        <button
          type="button"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className={navBtn}
          aria-label="الصفحة التالية"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => table.setPageIndex(pageCount - 1)}
          disabled={!table.getCanNextPage()}
          className={navBtn}
          aria-label="الصفحة الأخيرة"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

export const DataTable = Object.assign(DataTableRoot, {
  Header: DataTableHeader,
  Toolbar: DataTableToolbar,
  Actions: DataTableActions,
  SearchInput: DataTableSearchInput,
  BulkActions: DataTableBulkActions,
  Content: DataTableContent,
  Pagination: DataTablePagination,
});
