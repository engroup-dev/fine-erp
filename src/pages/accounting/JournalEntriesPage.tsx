import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpenText, Plus, AlertTriangle, Trash2, ChevronDown, ChevronUp, PencilLine, Undo2, Search, Printer, FileSpreadsheet } from "lucide-react";
import { useClients } from "../../hooks/useClients";
import { useEmployeesForParty } from "../../hooks/useEmployees";
import { useOperatingUnits } from "../../hooks/usePartners";
import type { Client, Employee } from "../../types/entities";
import { useJournalEntries, useCreateManualEntry, useAccounts, useReverseEntry, useIsCompanyWide } from "../../hooks/useAccounting";
import { toCsv, downloadCsv } from "../../lib/utils/csv";
import { PrintDialog, PrintDocument, PrintTable, Cell } from "../../components/print/PrintDocument";
import { usePermissions } from "../../hooks/usePermissions";
import { LEDGER_ERROR_MESSAGE, apiErrorMessage, apiErrorPayload } from "../../api/endpoints/production";
import {
  accountingApi,
  JOURNAL_ENTRY_TYPE_LABEL,
  MANUAL_ENTRY_TYPES,
  type JournalEntry,
  type JournalEntryType,
  type JournalLine,
} from "../../api/endpoints/accounting";
import { formatDate, formatNumber } from "../../lib/utils/format";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useJournalLinesColumns } from "../../components/table-columns/journalLinesColumns";
import { EMPLOYEE_ADVANCES_ROOT_CODE, accountSubtreeIds, leafAccounts } from "../../lib/utils/coa";

const num = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const RECEIVABLE_ROOT_CODE = "122";

/** One journal entry laid out as a printed voucher table (FR-FREP-014). */
const EntryPrintTable: React.FC<{ entry: JournalEntry }> = ({ entry }) => (
  <PrintTable head={["الحساب", "الوحدة", "البيان", "مدين", "دائن"]}>
    {(entry.lines ?? []).map((line) => (
      <tr key={line.id}>
        <Cell><span className="font-mono">{line.account?.account_code}</span> {line.account?.name}</Cell>
        <Cell>{line.operating_unit?.name ?? ""}</Cell>
        <Cell>{line.memo ?? ""}</Cell>
        <Cell className="text-end font-mono">
          {Number(line.debit) > 0 ? (
            <div className="flex flex-col items-end">
              <span>{formatNumber(Number(line.debit))}</span>
              {line.currency && line.original_amount && (
                <span className="text-[10px] text-gray-500">
                  {formatNumber(Number(line.original_amount))} {line.currency}
                  {line.fx_rate ? ` × ${Number(line.fx_rate)}` : ""}
                </span>
              )}
            </div>
          ) : ""}
        </Cell>
        <Cell className="text-end font-mono">
          {Number(line.credit) > 0 ? (
            <div className="flex flex-col items-end">
              <span>{formatNumber(Number(line.credit))}</span>
              {line.currency && line.original_amount && (
                <span className="text-[10px] text-gray-500">
                  {formatNumber(Number(line.original_amount))} {line.currency}
                  {line.fx_rate ? ` × ${Number(line.fx_rate)}` : ""}
                </span>
              )}
            </div>
          ) : ""}
        </Cell>
      </tr>
    ))}
    <tr className="font-bold">
      <Cell colSpan={3}>الإجمالي</Cell>
      <Cell className="text-end font-mono">{formatNumber((entry.lines ?? []).reduce((s, l) => s + Number(l.debit), 0))}</Cell>
      <Cell className="text-end font-mono">{formatNumber((entry.lines ?? []).reduce((s, l) => s + Number(l.credit), 0))}</Cell>
    </tr>
  </PrintTable>
);

const TYPE_BADGE: Record<JournalEntryType, string> = {
  automatic: "bg-app-accent-subtle text-app-accent",
  manual: "bg-app-status-yellow/15 text-app-status-yellow",
  adjustment: "bg-app-status-yellow/15 text-app-status-yellow",
  opening: "bg-app-status-info/15 text-app-status-info",
  closing: "bg-app-status-info/15 text-app-status-info",
  reversal: "bg-app-status-danger/10 text-app-status-danger",
};

const FILTER_TYPES: JournalEntryType[] = ["automatic", "manual", "adjustment", "opening", "closing", "reversal"];

const today = () => new Date().toISOString().slice(0, 10);

/** An entry can be reversed once, and never if it is a closing entry or a reversal itself (ACC-13). */
const isReversible = (entry: JournalEntry) =>
  !entry.reversal && entry.entry_type !== "closing" && entry.entry_type !== "reversal";

const PARTY_ERROR_MESSAGES: Record<string, string> = {
  PARTY_ON_NON_RECEIVABLE: "لا يمكن ربط عميل إلا بحساب ذمم مدينة",
  PARTY_ACCOUNT_MISMATCH: "حساب العميل لا يطابق الحساب المختار",
};

interface FormLine {
  key: string;
  account_code: string;
  client_id: string;
  employee_id: string;
  /** W5-00: a deliberate untagged 1215 credit that clears a pre-W5-00 balance (credit lines only). */
  legacy_clear: boolean;
  /** The unit whose untagged balance the legacy credit clears ("" = balances posted with no unit). */
  legacy_unit_id: string;
  side: "debit" | "credit";
  amount: string;
  memo: string;
  is_foreign: boolean;
  currency: string;
  original_amount: string;
  fx_rate: string;
}

const emptyLine = (side: "debit" | "credit"): FormLine => ({
  key: Math.random().toString(36).slice(2),
  account_code: "",
  client_id: "",
  employee_id: "",
  legacy_clear: false,
  legacy_unit_id: "",
  side,
  amount: "",
  memo: "",
  is_foreign: false,
  currency: "USD",
  original_amount: "",
  fx_rate: "",
});

const calcLydAmount = (original: string, rate: string): string => {
  const o = Number(original);
  const r = Number(rate);
  if (!Number.isFinite(o) || !Number.isFinite(r) || o <= 0 || r <= 0) {
    return "";
  }
  const val = Math.round(o * r * 10000) / 10000;
  return val.toString();
};

/** The debit/credit breakdown shown inside an expanded journal entry row. */
const JournalLinesTable: React.FC<{ lines: JournalLine[] }> = ({ lines }) => {
  const columns = useJournalLinesColumns();

  const table = useDataTable({
    // One CSV button per grid: the page's own CSV button exports every line (all=1).
    enableExport: false,
    columns,
    data: lines,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (l) => l.id,
  });

  return (
    <DataTable table={table} className="rounded-none border-0 shadow-none">
      <DataTable.Content emptyMessage="لا توجد سطور." />
    </DataTable>
  );
};

export const JournalEntriesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<JournalEntryType | "">("");
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [accountFilterId, setAccountFilterId] = useState("");
  const [reversing, setReversing] = useState<JournalEntry | null>(null);
  const [reverseDate, setReverseDate] = useState("");
  const [reverseReason, setReverseReason] = useState("");
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<JournalEntryType>("manual");
  const [voucher, setVoucher] = useState<JournalEntry | null>(null);
  const [book, setBook] = useState<JournalEntry[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const companyWide = useIsCompanyWide();
  const [page, setPage] = useState(1);

  useEffect(() => {
    const q = searchParams.get("search");
    if (q !== null) {
      setSearch(q);
      setPage(1);
    }
  }, [searchParams]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine("debit"), emptyLine("credit")]);

  const { data: entries, isLoading } = useJournalEntries({
    from: from || undefined,
    to: to || undefined,
    entry_type: typeFilter ? [typeFilter] : undefined,
    search: search.trim() || undefined,
    account_id: accountFilterId || undefined,
    page,
  });
  const reverseMutation = useReverseEntry();
  const { hasRole } = usePermissions();
  const canReverse = hasRole(["owner", "accounting-manager"]);
  const { data: accounts } = useAccounts();
  const { data: clients = [] } = useClients();
  const { data: units = [] } = useOperatingUnits();
  // Manual entries are for company-wide roles, and the backend takes an employee of any unit (it
  // fills in the employee's unit), so list every unit's employees, not just the pinned unit's.
  const unitIds = useMemo(() => units.map((u) => u.id), [units]);
  const { data: employees } = useEmployeesForParty(companyWide, unitIds);
  const unitNameById = useMemo(() => new Map(units.map((u) => [u.id, u.name])), [units]);
  const createMutation = useCreateManualEntry();

  const totalDebit = lines.reduce((s, l) => s + (l.side === "debit" ? num(l.amount) : 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.side === "credit" ? num(l.amount) : 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.0001 && totalDebit > 0;

  // Receivable subtree: account 122 plus every descendant, walked via parent_account_id.
  const receivableCodes = useMemo(() => {
    const byId = new Map((accounts ?? []).map((a) => [a.id, a]));
    const inSubtree = (id: string): boolean => {
      const seen = new Set<string>();
      let cur = byId.get(id);
      while (cur && !seen.has(cur.id)) {
        if (cur.account_code === RECEIVABLE_ROOT_CODE) return true;
        seen.add(cur.id);
        cur = cur.parent_account_id ? byId.get(cur.parent_account_id) : undefined;
      }
      return false;
    };
    return new Set((accounts ?? []).filter((a) => inSubtree(a.id)).map((a) => a.account_code));
  }, [accounts]);

  // W5-00 employee advances subtree: account 1215 plus every descendant, by parent_account_id.
  const advanceCodes = useMemo(() => {
    const ids = accountSubtreeIds(accounts ?? [], EMPLOYEE_ADVANCES_ROOT_CODE);
    return new Set((accounts ?? []).filter((a) => ids.has(a.id)).map((a) => a.account_code));
  }, [accounts]);

  // The employee is required on every advances line. The one exception the backend allows — a
  // manual credit with no employee clearing an older untagged 1215 balance of one unit, up to that
  // balance — is an explicit per-line opt-out, never the default.
  const isLegacyClear = (l: FormLine) => advanceCodes.has(l.account_code) && l.side === "credit" && l.legacy_clear;
  const employeeRequired = (l: FormLine) => advanceCodes.has(l.account_code) && !isLegacyClear(l);

  // A client bound to a sub-account may only sit on that account (backend PARTY_ACCOUNT_MISMATCH).
  const clientFitsAccount = (client: Client, accountId: string | undefined): boolean =>
    !client.account_id || client.account_id === accountId;

  const patchLine = (key: string, patch: Partial<FormLine>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (lines.some((l) => employeeRequired(l) && !l.employee_id)) {
      setError(LEDGER_ERROR_MESSAGE.PARTY_EMPLOYEE_REQUIRED);
      return;
    }
    createMutation.mutate(
      {
        entry_type: entryType,
        description,
        entry_date: entryDate || undefined,
        lines: lines.map((l) => ({
          account_code: l.account_code,
          [l.side]: num(l.amount),
          memo: l.memo || undefined,
          ...(l.client_id && receivableCodes.has(l.account_code) ? { client_id: l.client_id } : {}),
          ...(l.employee_id && employeeRequired(l) ? { employee_id: l.employee_id } : {}),
          // The backend checks the untagged balance of the line's unit (none = lines posted without one).
          ...(isLegacyClear(l) && l.legacy_unit_id ? { operating_unit_id: l.legacy_unit_id } : {}),
          ...(l.is_foreign && l.currency.trim()
            ? {
                currency: l.currency.trim().toUpperCase(),
                original_amount: num(l.original_amount),
                fx_rate: l.fx_rate ? num(l.fx_rate) : undefined,
              }
            : {}),
        })),
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setDescription("");
          setEntryDate("");
          setEntryType("manual");
          setLines([emptyLine("debit"), emptyLine("credit")]);
        },
        onError: (err) => {
          const payload = apiErrorPayload(err);
          const message =
            (payload?.code && PARTY_ERROR_MESSAGES[payload.code]) || apiErrorMessage(err, "تعذر ترحيل القيد.");
          setError(
            payload?.code === "PARTY_EMPLOYEE_REQUIRED" && payload.untagged_balance != null
              ? `${message} الرصيد القديم غير المحدد بموظف المتاح للتسوية دون موظف: ${formatNumber(Number(payload.untagged_balance))} د.ل`
              : message,
          );
        },
      },
    );
  };

  const filters = {
    from: from || undefined,
    to: to || undefined,
    entry_type: typeFilter ? [typeFilter] : undefined,
    search: search.trim() || undefined,
    account_id: accountFilterId || undefined,
  };

  /** Every entry in the current filters, for the journal book print and CSV. */
  const fetchAll = async (): Promise<JournalEntry[] | null> => {
    setError(null);
    setExporting(true);
    try {
      return (await accountingApi.getJournalEntries({ ...filters, all: true, company_wide: companyWide || undefined })).data.data;
    } catch (err) {
      setError(apiErrorMessage(err, "تعذر تجهيز دفتر اليومية."));
      return null;
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = async () => {
    const all = await fetchAll();
    if (!all) return;
    const rows = all.flatMap((entry) => (entry.lines ?? []).map((line) => ({ entry, line })));
    const csv = toCsv(rows, [
      { header: "المرجع", value: (r) => r.entry.reference },
      { header: "التاريخ", value: (r) => r.entry.entry_date?.slice(0, 10) ?? "" },
      { header: "النوع", value: (r) => JOURNAL_ENTRY_TYPE_LABEL[r.entry.entry_type] ?? r.entry.entry_type },
      { header: "الوصف", value: (r) => r.entry.description },
      { header: "رمز الحساب", value: (r) => r.line.account?.account_code ?? "" },
      { header: "الحساب", value: (r) => r.line.account?.name ?? "" },
      { header: "الوحدة", value: (r) => r.line.operating_unit?.name ?? "" },
      { header: "البيان", value: (r) => r.line.memo ?? "" },
      { header: "العملة", value: (r) => r.line.currency ?? "" },
      { header: "المبلغ الأصلي", value: (r) => (r.line.original_amount ? Number(r.line.original_amount) : "") },
      { header: "سعر الصرف", value: (r) => (r.line.fx_rate ? Number(r.line.fx_rate) : "") },
      { header: "مدين", value: (r) => Number(r.line.debit) },
      { header: "دائن", value: (r) => Number(r.line.credit) },
    ]);
    downloadCsv(`journal-${from || "start"}-${to || "today"}.csv`, csv);
  };

  const openBook = async () => {
    const all = await fetchAll();
    if (all) setBook(all);
  };

  const openReverse = (entry: JournalEntry) => {
    setReversing(entry);
    setReverseDate(today());
    setReverseReason("");
    setReverseError(null);
  };

  const submitReverse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversing) return;
    setReverseError(null);
    reverseMutation.mutate(
      { id: reversing.id, entry_date: reverseDate || undefined, reason: reverseReason.trim() },
      {
        onSuccess: () => setReversing(null),
        onError: (err) => setReverseError(apiErrorMessage(err, "تعذر عكس القيد.")),
      },
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <BookOpenText className="w-7 h-7 text-app-accent" />
            دفتر اليومية (Journal)
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            كل قيد هنا مُرحّل تلقائيًا من عملية تشغيلية أو مُدخل يدويًا كتسوية. القيود المؤتمتة للقراءة فقط.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" /> CSV
          </button>
          <button
            type="button"
            onClick={openBook}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" /> طباعة الدفتر
          </button>
          <button
            onClick={() => { setShowForm(true); setError(null); }}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
          >
            <PencilLine className="w-4 h-4" /> قيد تسوية يدوي
          </button>
        </div>
      </div>

      {error && !showForm && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-app-label-secondary">
          من
          <input
            type="date" value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-app-label-secondary">
          إلى
          <input
            type="date" value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-secondary focus-within:border-app-accent">
          <Search className="w-3.5 h-3.5" />
          <input
            type="search" value={search} placeholder="رقم القيد أو الوصف"
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-40 bg-transparent text-app-label-primary focus:outline-none"
          />
        </label>
        <div className="w-56">
          <SearchableSelect<{ id: string; account_code: string; name: string }>
            options={accounts ?? []}
            value={accounts?.find((a) => a.id === accountFilterId) ?? null}
            onChange={(a) => { setAccountFilterId(a ? a.id : ""); setPage(1); }}
            getOptionId={(a) => a.id}
            getOptionLabel={(a) => `${a.account_code} · ${a.name}`}
            getOptionSearchText={(a) => `${a.account_code} ${a.name}`}
            placeholder="كل الحسابات"
            size="sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="نوع القيد">
        {(["", ...FILTER_TYPES] as (JournalEntryType | "")[]).map((t) => (
          <button
            key={t || "all"}
            type="button"
            aria-pressed={typeFilter === t}
            onClick={() => { setTypeFilter(t); setPage(1); }}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold border transition-colors ${
              typeFilter === t
                ? "border-app-accent bg-app-accent text-white"
                : "border-app-separator bg-app-bg-secondary text-app-label-secondary hover:bg-app-fill-f1"
            }`}
          >
            {t ? JOURNAL_ENTRY_TYPE_LABEL[t] : "الكل"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-xs text-app-label-secondary">جارٍ التحميل…</div>
        ) : (
          <div className="divide-y divide-app-separator">
            {entries?.data.map((entry) => (
              <div key={entry.id}>
                <button
                  onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  className="w-full flex flex-wrap items-center gap-3 p-4 text-start hover:bg-app-fill-f1"
                >
                  <span className="font-mono font-bold text-app-accent text-sm">{entry.reference}</span>
                  <span className="text-xs font-mono text-app-label-secondary">{entry.entry_date ? formatDate(entry.entry_date) : ""}</span>
                  <span className="text-xs text-app-label-primary">{entry.description}</span>
                  <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${TYPE_BADGE[entry.entry_type] ?? TYPE_BADGE.automatic}`}>
                    {JOURNAL_ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}
                  </span>
                  {entry.reversal && (
                    <span className="text-[10px] font-semibold text-app-status-danger">عُكس بالقيد {entry.reversal.reference}</span>
                  )}
                  {entry.reversal_of && (
                    <span className="text-[10px] font-semibold text-app-label-secondary">عكس للقيد {entry.reversal_of.reference}</span>
                  )}
                  <span className="ms-auto text-app-label-tertiary">
                    {expanded === entry.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </button>

                {expanded === entry.id && (
                  <div className="px-4 pb-4 space-y-3">
                    <JournalLinesTable lines={entry.lines ?? []} />
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-app-label-secondary">
                      {entry.source_document_type && <span>المصدر: {entry.source_document_type}</span>}
                      {entry.reversal_reason && <span>سبب العكس: {entry.reversal_reason}</span>}
                      <button
                        type="button"
                        onClick={() => setVoucher(entry)}
                        className="ms-auto flex items-center gap-1.5 rounded-xl border border-app-separator px-3 py-1.5 font-semibold text-app-label-primary hover:bg-app-fill-f1"
                      >
                        <Printer className="w-3.5 h-3.5" /> طباعة السند
                      </button>
                      {canReverse && isReversible(entry) && (
                        <button
                          type="button"
                          onClick={() => openReverse(entry)}
                          className="flex items-center gap-1.5 rounded-xl border border-app-separator px-3 py-1.5 font-semibold text-app-label-primary hover:bg-app-fill-f1"
                        >
                          <Undo2 className="w-3.5 h-3.5" /> عكس القيد
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {entries?.data.length === 0 && (
              <div className="p-10 text-center text-xs text-app-label-tertiary">لا توجد قيود في هذه الفترة.</div>
            )}
          </div>
        )}
      </div>

      {entries && entries.last_page > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-xl border border-app-separator px-3 py-1.5 font-semibold text-app-label-secondary hover:bg-app-fill-f1 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="font-mono text-app-label-secondary">{page} / {entries.last_page}</span>
          <button
            disabled={page >= entries.last_page}
            onClick={() => setPage(page + 1)}
            className="rounded-xl border border-app-separator px-3 py-1.5 font-semibold text-app-label-secondary hover:bg-app-fill-f1 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent size="2xl">
          <DialogHeader>
            <div>
              <DialogTitle>قيد تسوية يدوي</DialogTitle>
              <DialogDescription>
                للتصحيحات فقط (ACC-04). لن يُقبل القيد ما لم يتساوَ طرفاه.
              </DialogDescription>
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody className="space-y-3">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form id="journal-entry-form" onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">وصف القيد / سبب التسوية</label>
                <input
                  type="text" required placeholder="وصف القيد — سبب التسوية"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs border-app-separator focus:border-app-accent focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-app-label-secondary">
                نوع القيد
                <select
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as JournalEntryType)}
                  className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                >
                  {MANUAL_ENTRY_TYPES.map((t) => (
                    <option key={t} value={t}>{JOURNAL_ENTRY_TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-app-label-secondary">
                تاريخ القيد (اختياري — اليوم افتراضيًا)
                <input
                  type="date" value={entryDate} max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </label>

              {lines.map((l) => (
                <div key={l.key} className="rounded-xl border border-app-separator bg-app-bg-secondary/40 p-2.5 space-y-2">
                  <div className="flex gap-2 items-end">
                    <div className="flex flex-col flex-1">
                      <label className="block text-[10px] font-semibold text-app-label-secondary mb-0.5">الحساب</label>
                      <SearchableSelect<{ id: string; account_code: string; name: string; type?: string }>
                        options={leafAccounts(accounts ?? [], ["122"])}
                        value={
                          accounts?.find((a) => a.account_code === l.account_code) ??
                          null
                        }
                        onChange={(a) =>
                          patchLine(l.key, {
                            account_code: a ? a.account_code : "",
                            client_id:
                              a &&
                              receivableCodes.has(a.account_code) &&
                              clients.some((c) => c.id === l.client_id && clientFitsAccount(c, a.id))
                                ? l.client_id
                                : "",
                            employee_id: a && advanceCodes.has(a.account_code) ? l.employee_id : "",
                            legacy_clear: a && advanceCodes.has(a.account_code) ? l.legacy_clear : false,
                          })
                        }
                        getOptionId={(a) => a.id}
                        getOptionLabel={(a) => a.name}
                        getOptionSubLabel={(a) => `${a.account_code} · ${a.type ?? ""}`}
                        getOptionSearchText={(a) =>
                          `${a.account_code} ${a.name}`
                        }
                        placeholder="الحساب…"
                        size="sm"
                        required
                      />
                    </div>
                    {receivableCodes.has(l.account_code) && (
                      <div className="flex flex-col w-44">
                        <label className="block text-[10px] font-semibold text-app-label-secondary mb-0.5">العميل (اختياري)</label>
                        <SearchableSelect<Client>
                          options={clients.filter((c) =>
                            clientFitsAccount(c, accounts?.find((a) => a.account_code === l.account_code)?.id),
                          )}
                          value={clients.find((c) => c.id === l.client_id) ?? null}
                          onChange={(c) => patchLine(l.key, { client_id: c ? c.id : "" })}
                          getOptionId={(c) => c.id}
                          getOptionLabel={(c) => c.entity?.name ?? c.id}
                          getOptionSearchText={(c) => c.entity?.name ?? c.id}
                          placeholder="العميل…"
                          size="sm"
                        />
                      </div>
                    )}
                    {employeeRequired(l) && (
                      <div className="flex flex-col w-44">
                        <label className="block text-[10px] font-semibold text-app-label-secondary mb-0.5">
                          الموظف <span className="text-app-status-danger">*</span>
                        </label>
                        <SearchableSelect<Employee>
                          options={employees}
                          value={employees.find((emp) => emp.id === l.employee_id) ?? null}
                          onChange={(emp) => patchLine(l.key, { employee_id: emp ? emp.id : "" })}
                          getOptionId={(emp) => emp.id}
                          getOptionLabel={(emp) => emp.entity?.name ?? emp.id}
                          getOptionSubLabel={(emp) => {
                            const unitName = emp.operating_unit?.name ?? unitNameById.get(emp.operating_unit_id);
                            return [emp.job_title, companyWide ? unitName : null].filter(Boolean).join(" — ") || undefined;
                          }}
                          getOptionSearchText={(emp) =>
                            `${emp.entity?.name ?? ""} ${emp.job_title ?? ""} ${emp.operating_unit?.name ?? unitNameById.get(emp.operating_unit_id) ?? ""}`
                          }
                          placeholder="الموظف…"
                          required
                          size="sm"
                        />
                      </div>
                    )}
                    {isLegacyClear(l) && (
                      <div className="flex flex-col w-44">
                        <label className="block text-[10px] font-semibold text-app-label-secondary mb-0.5">
                          وحدة الرصيد القديم
                        </label>
                        <select
                          value={l.legacy_unit_id}
                          onChange={(e) => patchLine(l.key, { legacy_unit_id: e.target.value })}
                          className="w-full px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
                        >
                          <option value="">بدون وحدة (قيود يدوية قديمة)</option>
                          {units.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex flex-col">
                      <label className="block text-[10px] font-semibold text-app-label-secondary mb-0.5">الطرف</label>
                      <select
                        value={l.side}
                        onChange={(e) => patchLine(l.key, { side: e.target.value as FormLine["side"] })}
                        className="w-24 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
                      >
                        <option value="debit">مدين</option>
                        <option value="credit">دائن</option>
                      </select>
                    </div>
                    <div className="flex flex-col">
                      <label className="block text-[10px] font-semibold text-app-label-secondary mb-0.5">المبلغ (LYD)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        required
                        placeholder="المبلغ"
                        value={l.amount}
                        readOnly={l.is_foreign}
                        onChange={(e) => patchLine(l.key, { amount: e.target.value })}
                        className={`w-28 px-2 py-1.5 border border-app-separator rounded-lg text-xs font-mono focus:border-app-accent focus:outline-none ${
                          l.is_foreign
                            ? "bg-app-fill-f1 text-app-label-secondary cursor-not-allowed"
                            : "bg-app-bg-secondary text-app-label-primary"
                        }`}
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="block text-[10px] font-semibold text-app-label-secondary mb-0.5">البيان</label>
                      <input
                        type="text"
                        placeholder="بيان"
                        value={l.memo}
                        onChange={(e) => patchLine(l.key, { memo: e.target.value })}
                        className="w-32 px-2 py-1.5 border border-app-separator rounded-lg bg-app-bg-secondary text-xs focus:border-app-accent focus:outline-none"
                      />
                    </div>
                    {lines.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                        className="p-1 text-app-label-tertiary hover:text-app-status-danger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-app-separator/40 text-xs">
                    {advanceCodes.has(l.account_code) && l.side === "credit" && (
                      <label
                        className="flex items-center gap-1.5 cursor-pointer text-app-label-secondary hover:text-app-label-primary"
                        title="قيد دائن دون موظف يسوّي رصيداً قديماً على حساب السلف سُجّل قبل ربط السلف بالموظفين، ولا يتجاوز ذلك الرصيد."
                      >
                        <input
                          type="checkbox"
                          checked={l.legacy_clear}
                          onChange={(e) =>
                            patchLine(l.key, {
                              legacy_clear: e.target.checked,
                              employee_id: e.target.checked ? "" : l.employee_id,
                            })
                          }
                          className="rounded border-app-separator text-app-accent focus:ring-app-accent h-3.5 w-3.5"
                        />
                        <span className="text-[11px] font-medium">تسوية رصيد قديم غير محدد بموظف</span>
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 cursor-pointer text-app-label-secondary hover:text-app-label-primary">
                      <input
                        type="checkbox"
                        checked={l.is_foreign}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            const cur = l.currency || "USD";
                            const orig = l.original_amount || "";
                            const rate = l.fx_rate || "";
                            const computed = calcLydAmount(orig, rate);
                            patchLine(l.key, {
                              is_foreign: true,
                              currency: cur,
                              original_amount: orig,
                              fx_rate: rate,
                              amount: computed || l.amount,
                            });
                          } else {
                            patchLine(l.key, {
                              is_foreign: false,
                            });
                          }
                        }}
                        className="rounded border-app-separator text-app-accent focus:ring-app-accent h-3.5 w-3.5"
                      />
                      <span className="text-[11px] font-medium">عملة أجنبية</span>
                    </label>

                    {l.is_foreign && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-app-label-secondary">العملة:</span>
                          <input
                            type="text"
                            maxLength={3}
                            value={l.currency}
                            onChange={(e) => patchLine(l.key, { currency: e.target.value.toUpperCase() })}
                            placeholder="USD"
                            className="w-14 px-2 py-1 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono uppercase text-center focus:border-app-accent focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-app-label-secondary">المبلغ الأصلي:</span>
                          <input
                            type="number"
                            step="0.0001"
                            min="0.0001"
                            value={l.original_amount}
                            onChange={(e) => {
                              const orig = e.target.value;
                              const amount = calcLydAmount(orig, l.fx_rate);
                              patchLine(l.key, { original_amount: orig, amount });
                            }}
                            placeholder="المبلغ الأصلي"
                            className="w-24 px-2 py-1 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-app-label-secondary">سعر الصرف:</span>
                          <input
                            type="number"
                            step="0.0001"
                            min="0.0001"
                            value={l.fx_rate}
                            onChange={(e) => {
                              const rate = e.target.value;
                              const amount = calcLydAmount(l.original_amount, rate);
                              patchLine(l.key, { fx_rate: rate, amount });
                            }}
                            placeholder="سعر الصرف"
                            className="w-20 px-2 py-1 border border-app-separator rounded-lg bg-app-bg-secondary text-xs font-mono focus:border-app-accent focus:outline-none"
                          />
                        </div>
                        {l.amount && (
                          <span className="font-mono text-[11px] text-app-label-tertiary">
                            (≈ {formatNumber(num(l.amount))} د.ل)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLines([...lines, emptyLine("credit")])}
                className="flex items-center gap-1 text-xs font-semibold text-app-accent hover:opacity-80"
              >
                <Plus className="w-3.5 h-3.5" /> إضافة سطر
              </button>

              <div className={`flex justify-between rounded-xl px-4 py-2 text-xs font-bold font-mono ${isBalanced ? "bg-app-status-positive/10 text-app-status-positive" : "bg-app-status-yellow/15 text-app-status-yellow"}`}>
                <span>مدين: {formatNumber(totalDebit)}</span>
                <span>دائن: {formatNumber(totalCredit)}</span>
                <span>{isBalanced ? "متوازن" : "غير متوازن"}</span>
              </div>

            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="journal-entry-form"
              disabled={
                createMutation.isPending ||
                !isBalanced ||
                lines.some((l) => !l.account_code) ||
                lines.some(
                  (l) =>
                    l.is_foreign &&
                    (!l.currency || l.currency.trim().length !== 3 || num(l.original_amount) <= 0 || num(l.fx_rate) <= 0),
                )
              }
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {createMutation.isPending ? "جارٍ الترحيل…" : "ترحيل القيد"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintDialog open={voucher !== null} onClose={() => setVoucher(null)} title="طباعة سند القيد">
        {voucher && (
          <PrintDocument
            title="سند قيد"
            number={voucher.reference}
            meta={[
              { label: "التاريخ", value: voucher.entry_date ? formatDate(voucher.entry_date) : "" },
              { label: "النوع", value: JOURNAL_ENTRY_TYPE_LABEL[voucher.entry_type] ?? voucher.entry_type },
              { label: "البيان", value: voucher.description },
              ...(voucher.source_document_type ? [{ label: "المصدر", value: voucher.source_document_type }] : []),
              ...(voucher.reversal_of ? [{ label: "عكس للقيد", value: voucher.reversal_of.reference }] : []),
            ]}
            signatures={["المحاسب", "المدير المالي"]}
          >
            <EntryPrintTable entry={voucher} />
          </PrintDocument>
        )}
      </PrintDialog>

      <PrintDialog open={book !== null} onClose={() => setBook(null)} title="طباعة دفتر اليومية">
        {book && (
          <PrintDocument
            title="دفتر اليومية"
            number={`${from || "بداية الدفاتر"} — ${to || "اليوم"}`}
            meta={[
              { label: "عدد القيود", value: book.length },
              ...(typeFilter ? [{ label: "النوع", value: JOURNAL_ENTRY_TYPE_LABEL[typeFilter] }] : []),
            ]}
          >
            <div className="space-y-4">
              {book.map((entry) => (
                <section key={entry.id} className="space-y-1 break-inside-avoid">
                  <div className="flex flex-wrap gap-x-4 text-[11px] font-bold">
                    <span className="font-mono">{entry.reference}</span>
                    <span>{entry.entry_date ? formatDate(entry.entry_date) : ""}</span>
                    <span>{JOURNAL_ENTRY_TYPE_LABEL[entry.entry_type] ?? entry.entry_type}</span>
                    <span className="font-normal">{entry.description}</span>
                  </div>
                  <EntryPrintTable entry={entry} />
                </section>
              ))}
            </div>
          </PrintDocument>
        )}
      </PrintDialog>

      <Dialog open={reversing !== null} onOpenChange={(open) => { if (!open) setReversing(null); }}>
        <DialogContent size="md">
          <DialogHeader>
            <div>
              <DialogTitle>عكس القيد {reversing?.reference}</DialogTitle>
              <DialogDescription>
                يُرحّل قيد معاكس مرتبط بالقيد الأصلي، ويبقى القيد الأصلي كما هو. لا يمكن عكس القيد إلا مرة واحدة.
              </DialogDescription>
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody className="space-y-3">
            {reversing?.entry_type === "automatic" && (
              <div className="flex items-start gap-2 rounded-xl border border-app-status-yellow/30 bg-app-status-yellow/10 p-3 text-xs text-app-status-yellow">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>هذا قيد تلقائي. عكسه يصحّح الدفاتر فقط ولا يلغي المستند المصدر (البيع أو حركة المخزون أو الرواتب).</span>
              </div>
            )}
            {reverseError && (
              <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{reverseError}</span>
              </div>
            )}
            <form id="reverse-entry-form" onSubmit={submitReverse} className="space-y-3">
              <label className="flex flex-col gap-1 text-xs text-app-label-secondary">
                تاريخ القيد العكسي
                <input
                  type="date" required value={reverseDate}
                  min={reversing?.entry_date?.slice(0, 10)} max={today()}
                  onChange={(e) => setReverseDate(e.target.value)}
                  className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-app-label-secondary">
                سبب العكس
                <textarea
                  required maxLength={500} rows={3} value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="مثال: رُحّل إلى حساب خاطئ"
                  className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </label>
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setReversing(null)}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="reverse-entry-form"
              disabled={reverseMutation.isPending || !reverseReason.trim()}
              className="px-4 py-2 text-xs font-bold text-white bg-app-status-danger hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {reverseMutation.isPending ? "جارٍ العكس…" : "عكس القيد"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
