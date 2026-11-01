import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ListChecks,
  Plus,
  Clock,
  Printer,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Building,
  FileSpreadsheet,
} from "lucide-react";
import {
  DataTable,
  useDataTable,
  type ColumnDef,
} from "../../components/ui/DataTable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../../components/ui/Dialog";
import {
  PrintDialog,
  PrintDocument,
  PrintTable,
  Cell,
} from "../../components/print/PrintDocument";
import {
  useBankReconciliations,
  useBankReconciliation,
  useCreateBankReconciliation,
  useToggleReconciliationLines,
  useFinishBankReconciliation,
  useDiscardBankReconciliation,
} from "../../hooks/useBankReconciliations";
import { useCashAccounts } from "../../hooks/useTreasury";
import { usePermissions } from "../../hooks/usePermissions";
import { formatNumber, formatDate, localDateIso } from "../../lib/utils/format";
import { apiErrorMessage } from "../../api/endpoints/production";
import { cn } from "../../lib/utils/utils";
import type {
  BankReconciliationItem,
  BankReconciliationLine,
} from "../../api/endpoints/bankReconciliations";

type LineFilter = "all" | "uncleared" | "cleared";

export const BankReconciliationPage: React.FC = () => {
  const { hasRole } = usePermissions();
  const canMutate = hasRole(["owner", "accounting-manager", "treasury-officer"]);

  // Cash Accounts (Bank Kind Only)
  const { data: cashAccounts = [], isLoading: isLoadingAccounts } = useCashAccounts();
  const bankAccounts = useMemo(
    () => cashAccounts.filter((a) => a.kind === "bank"),
    [cashAccounts],
  );

  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>("");

  useEffect(() => {
    if (
      bankAccounts.length > 0 &&
      (!selectedBankAccountId || !bankAccounts.some((a) => a.id === selectedBankAccountId))
    ) {
      setSelectedBankAccountId(bankAccounts[0].id);
    }
  }, [bankAccounts, selectedBankAccountId]);

  // Selected Bank Object
  const selectedBank = useMemo(
    () => bankAccounts.find((b) => b.id === selectedBankAccountId),
    [bankAccounts, selectedBankAccountId],
  );

  // Past Reconciliations for Selected Bank
  const {
    data: reconciliations = [],
    isLoading: isLoadingReconciliations,
  } = useBankReconciliations(selectedBankAccountId || undefined);

  // Draft Reconciliation (if exists)
  const draft = useMemo(
    () => reconciliations.find((r) => r.status === "draft"),
    [reconciliations],
  );

  // Selected Reconciliation ID (Working View)
  const [selectedReconciliationId, setSelectedReconciliationId] = useState<string | null>(null);

  useEffect(() => {
    if (reconciliations.length > 0) {
      const isValid =
        selectedReconciliationId &&
        reconciliations.some((r) => r.id === selectedReconciliationId);
      if (!isValid) {
        if (draft) {
          setSelectedReconciliationId(draft.id);
        } else {
          setSelectedReconciliationId(reconciliations[0].id);
        }
      }
    } else {
      setSelectedReconciliationId(null);
    }
  }, [reconciliations, draft, selectedReconciliationId]);

  // Detail Query for Active Reconciliation
  const {
    data: detail,
    isLoading: isLoadingDetail,
    error: detailError,
  } = useBankReconciliation(selectedReconciliationId);

  // Mutations
  const createMutation = useCreateBankReconciliation();
  const toggleMutation = useToggleReconciliationLines();
  const finishMutation = useFinishBankReconciliation();
  const discardMutation = useDiscardBankReconciliation();

  // Create Dialog State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statementDate, setStatementDate] = useState(localDateIso());
  const [statementBalance, setStatementBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Confirm Finish Dialog State
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Confirm Discard Dialog State
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  // Print Dialog State
  const [printDialogOpen, setPrintDialogOpen] = useState(false);

  // Lines Filter State
  const [lineFilter, setLineFilter] = useState<LineFilter>("all");

  const bankCurrency =
    detail?.reconciliation.cash_account.currency || selectedBank?.currency || "د.ل";

  const isFinished = detail?.reconciliation.status === "finished";
  const isDraft = detail?.reconciliation.status === "draft";
  const summary = detail?.summary;
  const difference = summary?.difference ?? 0;
  const isBalanced = Math.abs(difference) < 0.005;

  // Filtered Lines
  const allLines = detail?.lines ?? [];
  const filteredLines = useMemo(() => {
    if (lineFilter === "cleared") return allLines.filter((l) => l.cleared);
    if (lineFilter === "uncleared") return allLines.filter((l) => !l.cleared);
    return allLines;
  }, [allLines, lineFilter]);

  const allVisibleCleared =
    filteredLines.length > 0 && filteredLines.every((l) => l.cleared);
  const someVisibleCleared = filteredLines.some((l) => l.cleared);

  // Toggle handlers
  const handleToggleAllVisible = useCallback(() => {
    if (!detail || isFinished || filteredLines.length === 0) return;
    const target = !allVisibleCleared;
    toggleMutation.mutate({
      id: detail.reconciliation.id,
      payload: {
        line_ids: filteredLines.map((l) => l.id),
        cleared: target,
      },
    });
  }, [detail, isFinished, filteredLines, allVisibleCleared, toggleMutation]);

  const handleToggleLine = useCallback(
    (lineId: string, targetCleared: boolean) => {
      if (!detail || isFinished) return;
      toggleMutation.mutate({
        id: detail.reconciliation.id,
        payload: {
          line_ids: [lineId],
          cleared: targetCleared,
        },
      });
    },
    [detail, isFinished, toggleMutation],
  );

  // Open Create Dialog
  const handleOpenCreate = () => {
    setStatementDate(localDateIso());
    setStatementBalance("");
    setNotes("");
    setCreateError(null);
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBankAccountId) return;
    setCreateError(null);

    const numBalance = Number(statementBalance);
    if (statementBalance.trim() === "" || isNaN(numBalance)) {
      setCreateError("يرجى إدخال رصيد الكشف بصيغة رقمية صحيحة.");
      return;
    }

    createMutation.mutate(
      {
        cash_account_id: selectedBankAccountId,
        statement_date: statementDate,
        statement_balance: numBalance,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          setCreateDialogOpen(false);
          setSelectedReconciliationId(res.reconciliation.id);
        },
        onError: (err) => {
          setCreateError(apiErrorMessage(err, "تعذر بدء التسوية المصرفية."));
        },
      },
    );
  };

  const handleFinishConfirm = () => {
    if (!detail) return;
    setFinishError(null);
    finishMutation.mutate(detail.reconciliation.id, {
      onSuccess: () => {
        setFinishConfirmOpen(false);
      },
      onError: (err) => {
        setFinishError(apiErrorMessage(err, "تعذر إنهاء التسوية المصرفية."));
      },
    });
  };

  const handleDiscardConfirm = () => {
    if (!detail) return;
    setDiscardError(null);
    discardMutation.mutate(detail.reconciliation.id, {
      onSuccess: () => {
        setDiscardConfirmOpen(false);
        setSelectedReconciliationId(null);
      },
      onError: (err) => {
        setDiscardError(apiErrorMessage(err, "تعذر حذف مسودة التسوية."));
      },
    });
  };

  // Past Reconciliations Columns
  const pastColumns = useMemo<ColumnDef<BankReconciliationItem>[]>(
    () => [
      {
        accessorKey: "statement_date",
        header: "تاريخ الكشف",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{formatDate(row.original.statement_date)}</span>
        ),
      },
      {
        accessorKey: "statement_balance",
        header: "رصيد الكشف",
        meta: { exportAs: [{ header: "رصيد الكشف", value: (r) => Number(r.statement_balance) }, { header: "العملة", value: (r) => r.cash_account?.currency || bankCurrency }] },
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold">
            {formatNumber(row.original.statement_balance)}{" "}
            {row.original.cash_account?.currency || bankCurrency}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "الحالة",
        meta: { exportValue: (r) => r.status_label || (r.status === "finished" ? "منتهية" : "مسودة") },
        cell: ({ row }) => {
          const isFin = row.original.status === "finished";
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border",
                isFin
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                  : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
              )}
            >
              {isFin ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
              {row.original.status_label || (isFin ? "منتهية" : "مسودة")}
            </span>
          );
        },
      },
      {
        id: "finished_by",
        header: "أنهاها",
        meta: { exportValue: (r) => r.finished_by?.name },
        cell: ({ row }) => (
          <span className="text-xs text-app-label-secondary">
            {row.original.finished_by?.name || "—"}
          </span>
        ),
      },
      {
        id: "action_date",
        header: "التاريخ",
        meta: { exportValue: (r) => r.finished_at || r.created_at },
        cell: ({ row }) => {
          const d = row.original.finished_at || row.original.created_at;
          return (
            <span className="font-mono text-xs text-app-label-secondary">
              {d ? formatDate(d) : "—"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { export: false },
        cell: ({ row }) => {
          const isCurrent = selectedReconciliationId === row.original.id;
          return (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedReconciliationId(row.original.id);
                }}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors border",
                  isCurrent
                    ? "bg-app-accent text-white border-app-accent"
                    : "bg-app-bg-secondary text-app-label-secondary border-app-separator hover:bg-app-fill-f1 hover:text-app-label-primary",
                )}
              >
                {isCurrent ? "معروضة" : "عرض"}
              </button>
            </div>
          );
        },
      },
    ],
    [bankCurrency, selectedReconciliationId],
  );

  const pastTable = useDataTable({
    exportFileName: "bank-reconciliations",
    columns: pastColumns,
    data: reconciliations,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (r) => r.id,
  });

  // Lines Columns
  const lineColumns = useMemo<ColumnDef<BankReconciliationLine>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              aria-label="تحديد الكل الظاهر"
              className="h-4 w-4 rounded border-app-separator text-app-accent focus:ring-app-accent disabled:opacity-40 cursor-pointer"
              disabled={isFinished || filteredLines.length === 0 || toggleMutation.isPending}
              checked={allVisibleCleared}
              ref={(el) => {
                if (el) el.indeterminate = someVisibleCleared && !allVisibleCleared;
              }}
              onChange={handleToggleAllVisible}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              aria-label="تحديد القيد"
              className="h-4 w-4 rounded border-app-separator text-app-accent focus:ring-app-accent disabled:opacity-40 cursor-pointer"
              checked={row.original.cleared}
              disabled={isFinished || toggleMutation.isPending}
              onChange={() => handleToggleLine(row.original.id, !row.original.cleared)}
            />
          </div>
        ),
        meta: { exportValue: (l) => (l.cleared ? "مسوّى" : "غير مسوّى"), exportHeader: "التسوية",
          align: "center",
        },
        size: 50,
      },
      {
        accessorKey: "entry_date",
        header: "التاريخ",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-app-label-primary">
            {formatDate(row.original.entry_date)}
          </span>
        ),
        size: 110,
      },
      {
        accessorKey: "reference",
        header: "المرجع",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-app-label-secondary">
            {row.original.reference || "—"}
          </span>
        ),
        size: 120,
      },
      {
        accessorKey: "description",
        header: "البيان",
        meta: { exportValue: (l) => (l.memo ? `${l.description} — ${l.memo}` : l.description) },
        cell: ({ row }) => (
          <div>
            <div className="text-xs font-medium text-app-label-primary">
              {row.original.description}
            </div>
            {row.original.memo && (
              <div className="text-[11px] text-app-label-secondary mt-0.5">
                {row.original.memo}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "debit",
        header: "مدين (إيداع)",
        cell: ({ row }) => (
          <div className="text-end">
            {row.original.debit > 0 ? (
              <span className="font-mono text-xs font-semibold text-emerald-600">
                +{formatNumber(row.original.debit)} {bankCurrency}
              </span>
            ) : (
              <span className="font-mono text-xs text-app-label-tertiary">—</span>
            )}
          </div>
        ),
        meta: {
          align: "end",
        },
        size: 140,
      },
      {
        accessorKey: "credit",
        header: "دائن (سحب)",
        cell: ({ row }) => (
          <div className="text-end">
            {row.original.credit > 0 ? (
              <span className="font-mono text-xs font-semibold text-rose-600">
                -{formatNumber(row.original.credit)} {bankCurrency}
              </span>
            ) : (
              <span className="font-mono text-xs text-app-label-tertiary">—</span>
            )}
          </div>
        ),
        meta: {
          align: "end",
        },
        size: 140,
      },
    ],
    [
      isFinished,
      filteredLines,
      allVisibleCleared,
      someVisibleCleared,
      toggleMutation.isPending,
      bankCurrency,
      handleToggleAllVisible,
      handleToggleLine,
    ],
  );

  const linesTable = useDataTable({
    exportFileName: "bank-reconciliation-lines",
    columns: lineColumns,
    data: filteredLines,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (l) => l.id,
  });

  // Uncleared lists for print
  const unclearedDeposits = useMemo(
    () => allLines.filter((l) => !l.cleared && l.debit > 0),
    [allLines],
  );
  const unclearedPayments = useMemo(
    () => allLines.filter((l) => !l.cleared && l.credit > 0),
    [allLines],
  );

  // If no bank accounts exist
  if (!isLoadingAccounts && bankAccounts.length === 0) {
    return (
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-app-accent" />
            التسوية المصرفية
          </h1>
          <p className="text-xs text-app-label-secondary mt-0.5">
            مطابقة حركة الحسابات المصرفية مع كشوف الحسابات الصادرة عن المصارف
          </p>
        </div>

        <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-12 text-center">
          <Building className="mx-auto h-12 w-12 text-app-label-tertiary opacity-40 mb-3" />
          <h3 className="text-sm font-bold text-app-label-primary">
            لا توجد حسابات مصرفية — أضف خزينة من نوع مصرف أولاً.
          </h3>
          <p className="text-xs text-app-label-secondary mt-1 max-w-md mx-auto">
            التسوية المصرفية متاحة فقط للخزائن المحددة بنوع «مصرف». يمكنك إضافة أو تعديل نوع الخزينة من صفحة الخزينة وسعر الصرف.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header & Bank Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-app-accent" />
            التسوية المصرفية
          </h1>
          <p className="text-xs text-app-label-secondary mt-0.5">
            مطابقة حركة الحسابات المصرفية مع كشوف الحسابات الصادرة عن المصارف
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Bank Account Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="bank-account-select" className="text-xs font-semibold text-app-label-secondary">
              الحساب المصرفي:
            </label>
            <select
              id="bank-account-select"
              value={selectedBankAccountId}
              onChange={(e) => setSelectedBankAccountId(e.target.value)}
              disabled={isLoadingAccounts}
              className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs font-semibold text-app-label-primary focus:border-app-accent focus:outline-none"
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Action Button: Draft Continue OR New Reconciliation */}
          {draft ? (
            <button
              type="button"
              onClick={() => setSelectedReconciliationId(draft.id)}
              className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-500/10 px-3.5 py-1.5 text-xs font-bold text-amber-600 hover:bg-amber-500/20 transition-colors shadow-xs"
            >
              <Clock className="h-4 w-4" />
              <span>متابعة التسوية المفتوحة</span>
            </button>
          ) : (
            canMutate && (
              <button
                type="button"
                onClick={handleOpenCreate}
                disabled={!selectedBankAccountId}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50 shadow-xs"
              >
                <Plus className="h-4 w-4" />
                <span>تسوية جديدة</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Past Reconciliations Section */}
      <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-app-accent" />
            <h2 className="text-sm font-bold text-app-label-primary">
              سجل التسويات المصرفية ({reconciliations.length})
            </h2>
          </div>
          {selectedBank && (
            <span className="text-xs text-app-label-secondary font-mono">
              رصيد الدفاتر الحالي: {formatNumber(selectedBank.ledger_balance)} {selectedBank.currency}
            </span>
          )}
        </div>

        <DataTable table={pastTable}>
          <DataTable.Content
            isLoading={isLoadingReconciliations}
            emptyMessage="لا توجد تسويات سابقة لهذا الحساب المصرفي."
            emptyIcon={ListChecks}
            onRowClick={(item: BankReconciliationItem) => setSelectedReconciliationId(item.id)}
          />
        </DataTable>
      </div>

      {/* Working View of Selected Reconciliation */}
      {selectedReconciliationId && detail && (
        <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-5 space-y-6 shadow-xs">
          {/* Working View Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-app-separator pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-app-label-primary">
                  تسوية حساب: {detail.reconciliation.cash_account.name}
                </h2>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border",
                    isFinished
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                      : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800",
                  )}
                >
                  {isFinished ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                  {detail.reconciliation.status_label || (isFinished ? "منتهية" : "مسودة")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-app-label-secondary mt-1">
                <span>تاريخ الكشف: <strong className="font-mono text-app-label-primary">{formatDate(detail.reconciliation.statement_date)}</strong></span>
                <span>المُعد: <strong className="text-app-label-primary">{detail.reconciliation.created_by.name}</strong></span>
                {detail.reconciliation.finished_by && (
                  <span>أنهاها: <strong className="text-app-label-primary">{detail.reconciliation.finished_by.name}</strong></span>
                )}
                {detail.reconciliation.notes && (
                  <span className="text-app-label-tertiary">ملاحظات: {detail.reconciliation.notes}</span>
                )}
              </div>
            </div>

            {/* Actions for current reconciliation */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPrintDialogOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-primary px-3 py-1.5 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary transition-colors"
                title="طباعة مذكرة التسوية"
              >
                <Printer className="h-4 w-4" />
                <span>طباعة</span>
              </button>

              {isDraft && canMutate && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscardError(null);
                      setDiscardConfirmOpen(true);
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-rose-300/60 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900 transition-colors"
                    title="حذف هذه المسودة"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>حذف المسودة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFinishError(null);
                      setFinishConfirmOpen(true);
                    }}
                    disabled={!isBalanced || finishMutation.isPending}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-xs"
                    title={
                      !isBalanced
                        ? "لا يمكن إنهاء التسوية قبل أن يصبح الفرق صفراً"
                        : "إنهاء واعتماد التسوية"
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>إنهاء التسوية</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Read-only warning if finished */}
          {isFinished && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                هذه التسوية منتهية ومعتمدة (للقراءة فقط). أنهاها {detail.reconciliation.finished_by?.name || "المسؤول"} بتاريخ {detail.reconciliation.finished_at ? formatDate(detail.reconciliation.finished_at) : "—"}.
              </span>
            </div>
          )}

          {/* Summary Metrics Bar */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* 1. Book Balance */}
              <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-app-label-secondary">رصيد الدفاتر</span>
                <div className="mt-1 font-mono text-base font-bold text-app-label-primary">
                  {formatNumber(summary.book_balance)}
                  <span className="text-[10px] font-normal text-app-label-tertiary ms-1">{bankCurrency}</span>
                </div>
              </div>

              {/* 2. Opening Cleared Balance */}
              <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-app-label-secondary">الرصيد المسوّى السابق</span>
                <div className="mt-1 font-mono text-base font-bold text-app-label-primary">
                  {formatNumber(summary.opening_cleared_balance)}
                  <span className="text-[10px] font-normal text-app-label-tertiary ms-1">{bankCurrency}</span>
                </div>
              </div>

              {/* 3. Cleared in this statement (Debit / Credit) */}
              <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-app-label-secondary">المسوّى في هذا الكشف</span>
                <div className="mt-1 font-mono text-xs font-bold space-y-0.5">
                  <div className="text-emerald-600">
                    +{formatNumber(summary.cleared_debit)}
                  </div>
                  <div className="text-rose-600">
                    -{formatNumber(summary.cleared_credit)}
                  </div>
                </div>
              </div>

              {/* 4. Cleared Balance */}
              <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-app-label-secondary">الرصيد المسوّى</span>
                <div className="mt-1 font-mono text-base font-bold text-app-label-primary">
                  {formatNumber(summary.cleared_balance)}
                  <span className="text-[10px] font-normal text-app-label-tertiary ms-1">{bankCurrency}</span>
                </div>
              </div>

              {/* 5. Statement Balance */}
              <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3 flex flex-col justify-between">
                <span className="text-[11px] font-semibold text-app-label-secondary">رصيد الكشف</span>
                <div className="mt-1 font-mono text-base font-bold text-app-label-primary">
                  {formatNumber(summary.statement_balance)}
                  <span className="text-[10px] font-normal text-app-label-tertiary ms-1">{bankCurrency}</span>
                </div>
              </div>

              {/* 6. Difference (Large Figure) */}
              <div
                className={cn(
                  "rounded-xl border p-3 flex flex-col justify-between transition-colors",
                  isBalanced
                    ? "bg-emerald-500/10 border-emerald-400/80 text-emerald-800 dark:text-emerald-300"
                    : "bg-rose-500/10 border-rose-400/80 text-rose-800 dark:text-rose-300",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold">الفرق</span>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.2 rounded-full",
                      isBalanced
                        ? "bg-emerald-600 text-white"
                        : "bg-rose-600 text-white",
                    )}
                  >
                    {isBalanced ? "متطابق" : "غير متطابق"}
                  </span>
                </div>
                <div className="mt-1 font-mono text-xl font-black">
                  {formatNumber(difference)}
                  <span className="text-xs font-normal ms-1">{bankCurrency}</span>
                </div>
              </div>
            </div>

            {/* Below Summary: Uncleared Deposits and Payments */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-app-label-secondary">إيداعات غير ظاهرة في الكشف</div>
                  <div className="text-sm font-bold font-mono text-emerald-600 mt-0.5">
                    +{formatNumber(summary.uncleared_deposits)} {bankCurrency}
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-lg bg-app-fill-f2 font-mono text-app-label-secondary">
                  {unclearedDeposits.length} حركات
                </span>
              </div>

              <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-app-label-secondary">مدفوعات غير ظاهرة في الكشف</div>
                  <div className="text-sm font-bold font-mono text-rose-600 mt-0.5">
                    -{formatNumber(summary.uncleared_payments)} {bankCurrency}
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-lg bg-app-fill-f2 font-mono text-app-label-secondary">
                  {unclearedPayments.length} حركات
                </span>
              </div>
            </div>
          </div>

          {/* Lines Table Section */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-app-label-primary">
                قيود وحركات الحساب المصرفي ({allLines.length})
              </h3>

              {/* Filter Chips: الكل / غير المسوّى / المسوّى */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-app-fill-f1 border border-app-separator">
                {(
                  [
                    { id: "all", label: "الكل", count: allLines.length },
                    {
                      id: "uncleared",
                      label: "غير المسوّى",
                      count: allLines.filter((l) => !l.cleared).length,
                    },
                    {
                      id: "cleared",
                      label: "المسوّى",
                      count: allLines.filter((l) => l.cleared).length,
                    },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setLineFilter(chip.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                      lineFilter === chip.id
                        ? "bg-app-bg-secondary text-app-label-primary shadow-xs"
                        : "text-app-label-secondary hover:text-app-label-primary",
                    )}
                  >
                    <span>{chip.label}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-app-fill-f2 text-app-label-secondary">
                      {chip.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <DataTable table={linesTable}>
              <DataTable.Content
                isLoading={toggleMutation.isPending}
                emptyMessage="لا توجد قيود مطابقة لمعايير الفلترة."
                emptyIcon={ListChecks}
              />
            </DataTable>
          </div>
        </div>
      )}

      {/* Loading state for working view */}
      {selectedReconciliationId && isLoadingDetail && (
        <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-12 text-center text-xs text-app-label-secondary">
          جارٍ تحميل بيانات التسوية…
        </div>
      )}

      {/* Error state for working view */}
      {selectedReconciliationId && detailError && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-6 text-center text-xs text-rose-700">
          {apiErrorMessage(detailError, "تعذر تحميل تفاصيل التسوية المصرفية.")}
        </div>
      )}

      {/* New Reconciliation Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent size="md">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle>تسوية مصرفية جديدة</DialogTitle>
              <DialogClose />
            </DialogHeader>

            <DialogBody className="space-y-4">
              {createError && (
                <div className="flex items-center gap-2 rounded-xl bg-app-status-danger/10 border border-app-status-danger/30 p-3 text-xs text-app-status-danger font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  الحساب المصرفي
                </label>
                <input
                  type="text"
                  disabled
                  value={`${selectedBank?.name || ""} (${bankCurrency})`}
                  className="w-full rounded-xl border border-app-separator bg-app-fill-f1 px-3 py-2 text-xs font-semibold text-app-label-primary opacity-80"
                />
              </div>

              <div>
                <label
                  htmlFor="statement-date-input"
                  className="block text-xs font-semibold text-app-label-secondary mb-1"
                >
                  تاريخ الكشف <span className="text-app-status-danger">*</span>
                </label>
                <input
                  id="statement-date-input"
                  type="date"
                  max={localDateIso()}
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none"
                />
                <span className="text-[10px] text-app-label-tertiary mt-1 block">
                  يجب أن يكون تاريخ الكشف اليوم أو تاريخاً سابقاً وبعد آخر تسوية منتهية.
                </span>
              </div>

              <div>
                <label
                  htmlFor="statement-balance-input"
                  className="block text-xs font-semibold text-app-label-secondary mb-1"
                >
                  رصيد الكشف ({bankCurrency}) <span className="text-app-status-danger">*</span>
                </label>
                <input
                  id="statement-balance-input"
                  type="number"
                  step="0.001"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  placeholder="0.00"
                  required
                  className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs font-mono text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="reconciliation-notes-input"
                  className="block text-xs font-semibold text-app-label-secondary mb-1"
                >
                  ملاحظات (اختياري)
                </label>
                <textarea
                  id="reconciliation-notes-input"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أي ملاحظات حول كشف المصرف..."
                  className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs text-app-label-primary focus:border-app-accent focus:outline-none resize-none"
                />
              </div>
            </DialogBody>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setCreateDialogOpen(false)}
                className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {createMutation.isPending ? "جارٍ الإنشاء…" : "بدء التسوية"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Finish Confirmation Dialog */}
      <Dialog open={finishConfirmOpen} onOpenChange={setFinishConfirmOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تأكيد إنهاء التسوية المصرفية</DialogTitle>
            <DialogClose />
          </DialogHeader>

          <DialogBody className="space-y-3">
            {finishError && (
              <div className="flex items-center gap-2 rounded-xl bg-app-status-danger/10 border border-app-status-danger/30 p-3 text-xs text-app-status-danger font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{finishError}</span>
              </div>
            )}
            <p className="text-xs text-app-label-secondary leading-relaxed">
              هل أنت متأكد من إنهاء التسوية المصرفية؟ عند الإنهاء، تصبح التسوية مقفلة ولن يمكن تعديل القيود المسواة بعد ذلك.
            </p>
            <div className="rounded-xl bg-app-fill-f1 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-app-label-secondary">تاريخ الكشف:</span>
                <span className="font-mono font-bold">{detail && formatDate(detail.reconciliation.statement_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-app-label-secondary">رصيد الكشف:</span>
                <span className="font-mono font-bold">{detail && formatNumber(detail.summary.statement_balance)} {bankCurrency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-app-label-secondary">الفرق:</span>
                <span className="font-mono font-bold text-emerald-600">0.00 {bankCurrency}</span>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setFinishConfirmOpen(false)}
              className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              تراجع
            </button>
            <button
              type="button"
              onClick={handleFinishConfirm}
              disabled={finishMutation.isPending}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {finishMutation.isPending ? "جارٍ الإنهاء…" : "تأكيد وإنهاء التسوية"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard Confirmation Dialog */}
      <Dialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تأكيد حذف مسودة التسوية</DialogTitle>
            <DialogClose />
          </DialogHeader>

          <DialogBody className="space-y-3">
            {discardError && (
              <div className="flex items-center gap-2 rounded-xl bg-app-status-danger/10 border border-app-status-danger/30 p-3 text-xs text-app-status-danger font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{discardError}</span>
              </div>
            )}
            <p className="text-xs text-app-label-secondary leading-relaxed">
              هل أنت متأكد من حذف هذه المسودة؟ سيتم إلغاء تحديد كافة القيود وحذف سجل التسوية نهائياً.
            </p>
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setDiscardConfirmOpen(false)}
              className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleDiscardConfirm}
              disabled={discardMutation.isPending}
              className="rounded-xl bg-app-status-danger px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {discardMutation.isPending ? "جارٍ الحذف…" : "تأكيد الحذف"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Reconciliation Statement Dialog */}
      <PrintDialog
        open={printDialogOpen}
        onClose={() => setPrintDialogOpen(false)}
        title="طباعة مذكرة التسوية المصرفية"
        isLoading={isLoadingDetail}
        error={
          detailError
            ? apiErrorMessage(detailError, "تعذر تجهيز مستند التسوية للطباعة.")
            : null
        }
      >
        {detail && (
          <PrintDocument
            title="مذكرة التسوية المصرفية"
            number={`REC-${detail.reconciliation.id.slice(0, 8).toUpperCase()}`}
            date={detail.reconciliation.statement_date}
            issuer="شركة فاين للصناعات والإسفنج"
            meta={[
              { label: "المصرف", value: detail.reconciliation.cash_account.name },
              {
                label: "تاريخ الكشف",
                value: formatDate(detail.reconciliation.statement_date),
              },
              { label: "العملة", value: bankCurrency },
              {
                label: "الحالة",
                value:
                  detail.reconciliation.status_label ||
                  (isFinished ? "منتهية" : "مسودة"),
              },
              { label: "المُعد", value: detail.reconciliation.created_by.name },
              {
                label: "المُعتمد",
                value: detail.reconciliation.finished_by?.name || "—",
              },
            ]}
            signatures={["المحاسب", "المراجع"]}
          >
            <div className="space-y-5">
              {/* Summary Figures */}
              <div>
                <h3 className="font-bold text-[13px] mb-2 border-b border-black pb-1">
                  ملخص أرقام التسوية
                </h3>
                <PrintTable head={["البند", "المبلغ"]}>
                  <tr>
                    <Cell className="font-semibold">
                      رصيد كشف الحساب المصرفي في {formatDate(detail.reconciliation.statement_date)}
                    </Cell>
                    <Cell className="font-mono text-end font-bold">
                      {formatNumber(detail.summary.statement_balance)} {bankCurrency}
                    </Cell>
                  </tr>
                  <tr>
                    <Cell className="text-gray-700">
                      يضاف: إيداعات غير ظاهرة في الكشف (إيداعات معلقة)
                    </Cell>
                    <Cell className="font-mono text-end text-emerald-700">
                      +{formatNumber(detail.summary.uncleared_deposits)} {bankCurrency}
                    </Cell>
                  </tr>
                  <tr>
                    <Cell className="text-gray-700">
                      يخصم: مدفوعات وشيكات غير ظاهرة في الكشف (مدفوعات معلقة)
                    </Cell>
                    <Cell className="font-mono text-end text-rose-700">
                      -{formatNumber(detail.summary.uncleared_payments)} {bankCurrency}
                    </Cell>
                  </tr>
                  <tr className="bg-gray-50 font-bold">
                    <Cell>الرصيد المعدل (المسوّى)</Cell>
                    <Cell className="font-mono text-end">
                      {formatNumber(detail.summary.cleared_balance)} {bankCurrency}
                    </Cell>
                  </tr>
                  <tr>
                    <Cell className="font-semibold">رصيد الدفاتر (أستاذ المصرف)</Cell>
                    <Cell className="font-mono text-end font-bold">
                      {formatNumber(detail.summary.book_balance)} {bankCurrency}
                    </Cell>
                  </tr>
                  <tr className="bg-gray-100 font-bold">
                    <Cell>الفرق (المعدل - الدفاتر)</Cell>
                    <Cell className="font-mono text-end">
                      {formatNumber(detail.summary.difference)} {bankCurrency}
                    </Cell>
                  </tr>
                </PrintTable>
              </div>

              {/* Uncleared Deposits List */}
              <div>
                <h3 className="font-bold text-[13px] mb-2 border-b border-black pb-1">
                  إيداعات غير ظاهرة في الكشف (المجموع: {formatNumber(detail.summary.uncleared_deposits)} {bankCurrency})
                </h3>
                {unclearedDeposits.length > 0 ? (
                  <PrintTable head={["التاريخ", "المرجع", "البيان", "المبلغ"]}>
                    {unclearedDeposits.map((line) => (
                      <tr key={line.id}>
                        <Cell className="font-mono">{formatDate(line.entry_date)}</Cell>
                        <Cell className="font-mono">{line.reference || "—"}</Cell>
                        <Cell>
                          {line.description}
                          {line.memo ? ` (${line.memo})` : ""}
                        </Cell>
                        <Cell className="font-mono text-end font-semibold">
                          +{formatNumber(line.debit)} {bankCurrency}
                        </Cell>
                      </tr>
                    ))}
                  </PrintTable>
                ) : (
                  <p className="text-gray-500 text-xs italic py-1">
                    لا توجد إيداعات غير ظاهرة في الكشف.
                  </p>
                )}
              </div>

              {/* Uncleared Payments List */}
              <div>
                <h3 className="font-bold text-[13px] mb-2 border-b border-black pb-1">
                  مدفوعات وشيكات غير ظاهرة في الكشف (المجموع: {formatNumber(detail.summary.uncleared_payments)} {bankCurrency})
                </h3>
                {unclearedPayments.length > 0 ? (
                  <PrintTable head={["التاريخ", "المرجع", "البيان", "المبلغ"]}>
                    {unclearedPayments.map((line) => (
                      <tr key={line.id}>
                        <Cell className="font-mono">{formatDate(line.entry_date)}</Cell>
                        <Cell className="font-mono">{line.reference || "—"}</Cell>
                        <Cell>
                          {line.description}
                          {line.memo ? ` (${line.memo})` : ""}
                        </Cell>
                        <Cell className="font-mono text-end font-semibold">
                          -{formatNumber(line.credit)} {bankCurrency}
                        </Cell>
                      </tr>
                    ))}
                  </PrintTable>
                ) : (
                  <p className="text-gray-500 text-xs italic py-1">
                    لا توجد مدفوعات وشيكات غير ظاهرة في الكشف.
                  </p>
                )}
              </div>
            </div>
          </PrintDocument>
        )}
      </PrintDialog>
    </div>
  );
};
