import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileSpreadsheet,
  History,
  Loader2,
  Search,
} from "lucide-react";
import { DataTable, useDataTable, type ColumnDef } from "../../components/ui/DataTable";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/Dialog";
import { AuditLogFiltersBar } from "../../components/audit-log/AuditLogFilters";
import { AuditLogDiff } from "../../components/audit-log/AuditLogDiff";
import { ACTION_CHIP, ACTION_LABEL } from "../../components/audit-log/AuditLogTimeline";
import {
  retryUnlessClientError,
  useAuditLogSearch,
  useAuditTables,
  useOperatingUnits,
} from "../../hooks/useOperatingUnits";
import { useUsers } from "../../hooks/useUsers";
import { useAuthStore } from "../../stores/authStore";
import { searchAuditLogs } from "../../api/endpoints/auditLogs";
import { apiErrorMessage } from "../../api/endpoints/production";
import type { User } from "../../types/auth/types";
import { auditRecordPath, auditTableLabel } from "../../config/auditTables";
import { downloadCsv, toCsv } from "../../lib/utils/csv";
import { formatDateTime, formatInteger, localDateIso } from "../../lib/utils/format";
import { cn } from "../../lib/utils/utils";
import { toast } from "../../stores/toastStore";
import type { AuditLogEntry, AuditLogSearchFilters } from "../../types/entities";

const PAGE_SIZES = [25, 50, 100, 200];
/** The server caps per_page at 200; the CSV walks the pages up to this many rows. */
const CSV_PAGE_SIZE = 200;
const CSV_MAX_ROWS = 10000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inputClass =
  "rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1.5 text-xs text-app-label-primary focus:outline-none";

/** The field names an entry touched (created/deleted rows list every logged field). */
const changedFields = (entry: AuditLogEntry): string[] => {
  const old = entry.old_values ?? {};
  const fresh = entry.new_values ?? {};
  const keys = new Set([...Object.keys(old), ...Object.keys(fresh)]);
  return [...keys].filter((key) => JSON.stringify(old[key]) !== JSON.stringify(fresh[key]));
};

const jsonOrEmpty = (value: Record<string, unknown> | null | undefined): string =>
  value && Object.keys(value).length > 0 ? JSON.stringify(value) : "";

/** The roles that may read the log (AuditLogController::READER_ROLES). */
const READER_ROLES = ["owner", "admin"];

/**
 * Mirrors AuditLogController::scopeToUnit: only an owner or admin role bound to no unit
 * reads every unit. A company-wide non-reader role (e.g. accounting manager) does not widen
 * a unit admin, so useIsCompanyWide() is the wrong test here.
 */
const isCompanyWideReader = (user: User | null): boolean =>
  Boolean(
    user?.roles?.some(
      (r) => READER_ROLES.includes(r.slug) && r.pivot !== undefined && r.pivot.operating_unit_id === null,
    ),
  );

/** The server's 403 and 422 messages are English — say them in Arabic. */
const auditErrorMessage = (err: unknown, fallback: string): string => {
  const status = (err as { response?: { status?: number } } | undefined)?.response?.status;
  if (status === 403) {
    return "لا تملك صلاحية عرض سجل التدقيق في الوحدة المحددة — اختر وحدة تكون فيها مالكاً أو مديراً.";
  }
  if (status === 422) {
    return "قيم التصفية غير صالحة (تاريخ «إلى» يجب ألا يسبق «من»).";
  }
  return apiErrorMessage(err, fallback);
};

const userLabel = (entry: AuditLogEntry): string =>
  entry.user?.name ?? (entry.user_id ? "—" : "النظام");

/** No link for a deleted record, or a table without a detail page. */
const recordPath = (entry: AuditLogEntry): string | null =>
  entry.action === "deleted" ? null : auditRecordPath(entry.table_name, entry.record_id);

const RecordLink: React.FC<{ entry: AuditLogEntry }> = ({ entry }) => {
  const path = recordPath(entry);
  const shortId = `${entry.record_id.slice(0, 8)}…`;
  if (!path) {
    return (
      <span className="font-mono text-[11px] text-app-label-secondary" title={entry.record_id}>
        {shortId}
      </span>
    );
  }
  return (
    <Link
      to={path}
      onClick={(e) => e.stopPropagation()}
      title={entry.record_id}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-app-accent hover:underline"
    >
      {shortId}
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
};

export const AuditLogPage: React.FC = () => {
  const authUser = useAuthStore((s) => s.user);
  const isCompanyWide = isCompanyWideReader(authUser);
  // The filters and the page live together so a filter change resets the page in the same update.
  const [view, setView] = useState<{ filters: AuditLogSearchFilters; page: number }>({
    filters: {},
    page: 1,
  });
  const { filters, page } = view;
  const setPage = useCallback(
    (next: (p: number) => number) => setView((v) => ({ ...v, page: next(v.page) })),
    [],
  );
  const [searchInput, setSearchInput] = useState("");
  const [recordInput, setRecordInput] = useState("");
  const [perPage, setPerPage] = useState(50);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  /** Any real filter change starts again from the first page. */
  const setFilters = useCallback(
    (next: AuditLogSearchFilters | ((f: AuditLogSearchFilters) => AuditLogSearchFilters)) => {
      setView((v) => {
        const value = typeof next === "function" ? next(v.filters) : next;
        return value === v.filters ? v : { filters: value, page: 1 };
      });
    },
    [],
  );

  // The free-text search is debounced so typing does not fire a request per key.
  useEffect(() => {
    const handle = setTimeout(() => {
      const term = searchInput.trim().slice(0, 100);
      setFilters((f) => ((f.search ?? "") === term ? f : { ...f, search: term || undefined }));
    }, 400);
    return () => clearTimeout(handle);
  }, [searchInput, setFilters]);

  // record_id must be a uuid (the server answers 422 otherwise) — send it only once complete.
  const recordInvalid = recordInput.trim() !== "" && !UUID_RE.test(recordInput.trim());
  useEffect(() => {
    const id = recordInput.trim();
    const next = id !== "" && UUID_RE.test(id) ? id : undefined;
    setFilters((f) => (f.record_id === next ? f : { ...f, record_id: next }));
  }, [recordInput, setFilters]);

  const query = useMemo(() => ({ ...filters, page, per_page: perPage }), [filters, page, perPage]);
  const logsQuery = useAuditLogSearch(query);
  const tablesQuery = useAuditTables();
  // Rows written in a since-deleted unit still name it, so list trashed units too.
  const unitsQuery = useOperatingUnits({ withTrashed: true });
  // Deleted users keep their name on the log (withTrashed on the server), so list them too.
  // A narrowed admin gets a final 403 here — do not retry it.
  const usersQuery = useUsers({ withTrashed: true, retry: retryUnlessClientError });

  const rows = useMemo(() => logsQuery.data?.data ?? [], [logsQuery.data]);
  const meta = logsQuery.data?.meta;
  const lastPage = meta?.last_page ?? 1;

  // A unit switch (UnitSwitcher invalidates every query) or new data can shrink the result set
  // below the current page; fall back to the last page the server has.
  useEffect(() => {
    if (meta && page > Math.max(1, meta.last_page)) setPage(() => Math.max(1, meta.last_page));
  }, [meta, page, setPage]);

  // GET /users needs the manage-users/view-users permission; an admin whose role was narrowed
  // gets 403 there. The actors seen on loaded rows keep the picker usable either way, and are
  // remembered so a chosen user stays selectable after the filter narrows the rows.
  const [seenActors, setSeenActors] = useState<Record<string, string>>({});
  useEffect(() => {
    const fresh = rows.filter((r) => r.user && !(r.user.id in seenActors));
    if (fresh.length === 0) return;
    setSeenActors((prev) => {
      const next = { ...prev };
      fresh.forEach((r) => {
        if (r.user) next[r.user.id] = r.user.name;
      });
      return next;
    });
  }, [rows, seenActors]);

  const userOptions = useMemo(() => {
    const map = new Map<string, string>(Object.entries(seenActors));
    (usersQuery.data ?? []).forEach((u) => {
      map.set(u.id, u.deleted_at ? `${u.name} (محذوف)` : u.name);
    });
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [usersQuery.data, seenActors]);

  const unitName = useMemo(() => {
    const map: Record<string, string> = {};
    (unitsQuery.data ?? []).forEach((u) => {
      map[u.id] = u.deleted_at ? `${u.name} (محذوفة)` : u.name;
    });
    return map;
  }, [unitsQuery.data]);

  const unitLabel = useCallback(
    (id?: string | null) => (id ? unitName[id] ?? "—" : "على مستوى الشركة"),
    [unitName],
  );

  const updateFilters = (next: AuditLogSearchFilters) => {
    setFilters(next);
    // Only the bar's "clear" (an empty object) also empties the two typed inputs; an action
    // or date change must not wipe a half-typed uuid or a search still inside the debounce.
    if (Object.keys(next).length === 0) {
      setSearchInput("");
      setRecordInput("");
    }
  };

  const showRecordHistory = (entry: AuditLogEntry) => {
    setSelected(null);
    setRecordInput(entry.record_id);
    setSearchInput("");
    setFilters({ table_name: entry.table_name, record_id: entry.record_id });
  };

  const columns = useMemo<ColumnDef<AuditLogEntry>[]>(
    () => [
      {
        id: "created_at",
        header: "التاريخ",
        cell: ({ row }) => (
          <span className="font-mono text-[11px] whitespace-nowrap">
            {row.original.created_at ? formatDateTime(row.original.created_at) : "—"}
          </span>
        ),
      },
      {
        id: "user",
        header: "المستخدم",
        cell: ({ row }) => <span className="font-semibold">{userLabel(row.original)}</span>,
      },
      {
        id: "unit",
        header: "الوحدة",
        cell: ({ row }) => (
          <span className="text-app-label-secondary">{unitLabel(row.original.operating_unit_id)}</span>
        ),
      },
      {
        id: "table",
        header: "الجدول",
        cell: ({ row }) => (
          <span title={row.original.table_name}>{auditTableLabel(row.original.table_name)}</span>
        ),
      },
      {
        id: "record",
        header: "السجل",
        cell: ({ row }) => <RecordLink entry={row.original} />,
      },
      {
        id: "action",
        header: "الإجراء",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex h-6 items-center rounded-full px-2 text-[10px] font-bold",
              ACTION_CHIP[row.original.action] ?? "bg-app-bg-secondary text-app-label-secondary",
            )}
          >
            {ACTION_LABEL[row.original.action] ?? row.original.action}
          </span>
        ),
      },
      {
        id: "changes",
        header: "التغييرات",
        cell: ({ row }) => {
          const fields = changedFields(row.original);
          return (
            <span className="text-[11px] text-app-label-secondary" title={fields.join("، ")}>
              {fields.length === 0 ? "—" : `${formatInteger(fields.length)} حقل`}
            </span>
          );
        },
      },
    ],
    [unitLabel],
  );

  const table = useDataTable({
    // One CSV button per grid: the page's own CSV button exports every page of the log.
    enableExport: false,
    columns,
    data: rows,
    enablePagination: false,
    getRowId: (r) => r.id,
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: AuditLogEntry[] = [];
      // New rows written during the export shift older ones onto later pages; skip repeats.
      const seen = new Set<string>();
      let current = 1;
      let last = 1;
      do {
        const res = await searchAuditLogs({ ...filters, page: current, per_page: CSV_PAGE_SIZE });
        res.data.forEach((r) => {
          if (seen.has(r.id)) return;
          seen.add(r.id);
          all.push(r);
        });
        last = res.meta?.last_page ?? 1;
        current += 1;
      } while (current <= last && all.length < CSV_MAX_ROWS);

      const truncated = current <= last;
      const csv = toCsv<AuditLogEntry>(all.slice(0, CSV_MAX_ROWS), [
        { header: "التاريخ", value: (r) => (r.created_at ? formatDateTime(r.created_at) : "") },
        { header: "المستخدم", value: (r) => userLabel(r) },
        { header: "الوحدة", value: (r) => unitLabel(r.operating_unit_id) },
        { header: "الجدول", value: (r) => auditTableLabel(r.table_name) },
        { header: "اسم الجدول", value: (r) => r.table_name },
        { header: "معرّف السجل", value: (r) => r.record_id },
        { header: "الإجراء", value: (r) => ACTION_LABEL[r.action] ?? r.action },
        { header: "الحقول المتغيرة", value: (r) => changedFields(r).join(" | ") },
        { header: "القيم السابقة", value: (r) => jsonOrEmpty(r.old_values) },
        { header: "القيم الجديدة", value: (r) => jsonOrEmpty(r.new_values) },
        { header: "عنوان IP", value: (r) => r.ip_address ?? "" },
      ]);
      downloadCsv(`audit-log-${localDateIso()}.csv`, csv);
      if (truncated) {
        toast.warning(`صُدّر أول ${formatInteger(CSV_MAX_ROWS)} سجل فقط — ضيّق التصفية لتصدير الباقي.`);
      }
    } catch (err) {
      toast.error(auditErrorMessage(err, "تعذّر تصدير سجل التدقيق."));
    } finally {
      setExporting(false);
    }
  };

  const navBtn =
    "rounded-lg p-1.5 text-app-label-secondary hover:bg-app-fill-f1 disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <History className="w-7 h-7 text-app-accent" />
            سجل التدقيق
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            كل إنشاء وتعديل وحذف على السجلات المراقبة، الأحدث أولاً.
            {isCompanyWide
              ? " يظهر هنا نشاط كل الوحدات."
              : " يظهر هنا النشاط الذي تم داخل وحدتك التشغيلية فقط."}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting || rows.length === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 disabled:opacity-40"
        >
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} CSV
        </button>
      </div>

      <AuditLogFiltersBar
        filters={filters}
        onChange={updateFilters}
        hasPendingInput={searchInput.trim() !== "" || recordInput.trim() !== ""}
      >
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-app-label-secondary">بحث</label>
          <div className="relative">
            <Search className="absolute inset-y-0 start-2 my-auto h-3.5 w-3.5 text-app-label-tertiary pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              maxLength={100}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="اسم مستخدم، قيمة، معرّف سجل…"
              className={cn(inputClass, "w-52 ps-7")}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-app-label-secondary">الجدول</label>
          <select
            value={filters.table_name ?? ""}
            onChange={(e) => setFilters({ ...filters, table_name: e.target.value || undefined })}
            className={inputClass}
          >
            <option value="">كل الجداول</option>
            {(tablesQuery.data ?? []).map((t) => (
              <option key={t} value={t}>
                {auditTableLabel(t)}
              </option>
            ))}
          </select>
        </div>

        {isCompanyWide && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-app-label-secondary">الوحدة</label>
            <select
              value={filters.operating_unit_id ?? ""}
              onChange={(e) => setFilters({ ...filters, operating_unit_id: e.target.value || undefined })}
              className={inputClass}
            >
              <option value="">كل الوحدات</option>
              {(unitsQuery.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {unitName[u.id]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-app-label-secondary">المستخدم</label>
          <select
            value={filters.user_id ?? ""}
            onChange={(e) => setFilters({ ...filters, user_id: e.target.value || undefined })}
            className={inputClass}
          >
            <option value="">كل المستخدمين</option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          {usersQuery.isError && (
            <span className="text-[10px] text-app-label-tertiary">قائمة المستخدمين غير متاحة — تظهر أسماء من في النتائج فقط.</span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-app-label-secondary">معرّف السجل</label>
          <input
            type="text"
            value={recordInput}
            onChange={(e) => setRecordInput(e.target.value)}
            placeholder="UUID"
            dir="ltr"
            className={cn(inputClass, "w-72 font-mono", recordInvalid && "border-app-status-danger")}
          />
        </div>
      </AuditLogFiltersBar>

      {recordInvalid && (
        <p className="-mt-4 text-[11px] text-app-status-danger">معرّف السجل غير مكتمل — يُطبّق عند إدخال UUID صحيح.</p>
      )}

      {logsQuery.isError ? (
        <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          {auditErrorMessage(logsQuery.error, "تعذّر تحميل سجل التدقيق.")}
        </div>
      ) : (
        <DataTable table={table}>
          <DataTable.Content
            isLoading={logsQuery.isLoading}
            emptyMessage="لا توجد سجلات مطابقة."
            emptyIcon={History}
            onRowClick={setSelected}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app-separator bg-app-bg-secondary px-4 py-3 text-xs text-app-label-secondary">
            <div className="flex items-center gap-2">
              <span>
                {formatInteger(meta?.total ?? rows.length)} سجل
                {logsQuery.isFetching && !logsQuery.isLoading && (
                  <Loader2 className="ms-2 inline h-3 w-3 animate-spin" />
                )}
              </span>
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(() => 1);
                }}
                className="rounded-lg border border-app-separator bg-app-bg-primary px-2 py-1 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} / صفحة
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className={navBtn}
                aria-label="الصفحة السابقة"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <span className="px-2 font-semibold text-app-label-primary">
                صفحة {page} من {lastPage}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage}
                className={navBtn}
                aria-label="الصفحة التالية"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </DataTable>
      )}

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <DialogContent size="2xl">
            <DialogHeader>
              <div>
                <DialogTitle>
                  {ACTION_LABEL[selected.action] ?? selected.action} — {auditTableLabel(selected.table_name)}
                </DialogTitle>
                <DialogDescription>
                  <span className="font-semibold">{userLabel(selected)}</span>
                  {" · "}
                  <span className="font-mono">
                    {selected.created_at ? formatDateTime(selected.created_at) : "—"}
                  </span>
                  {" · "}
                  {unitLabel(selected.operating_unit_id)}
                  {selected.ip_address && (
                    <>
                      {" · "}
                      <span className="font-mono">{selected.ip_address}</span>
                    </>
                  )}
                </DialogDescription>
              </div>
              <DialogClose />
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-app-label-secondary">السجل:</span>
                <span className="font-mono text-[11px] text-app-label-primary" dir="ltr">
                  {selected.record_id}
                </span>
                {recordPath(selected) && (
                  <Link
                    to={recordPath(selected) as string}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-app-accent hover:underline"
                  >
                    فتح السجل
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => showRecordHistory(selected)}
                  className="rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-[11px] font-semibold text-app-label-primary hover:bg-app-fill-f1"
                >
                  كل تاريخ هذا السجل
                </button>
              </div>
              <AuditLogDiff oldValues={selected.old_values} newValues={selected.new_values} />
            </DialogBody>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
};

export default AuditLogPage;
