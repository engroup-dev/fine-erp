import React, { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Ban,
  Clock,
  AlertTriangle,
  ArrowLeft,
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
import { TreasuryTransferDialog } from "../../components/treasury/TreasuryTransferDialog";
import {
  useTreasuryTransfers,
  useApproveTreasuryTransfer,
  useRejectTreasuryTransfer,
  useCancelTreasuryTransfer,
} from "../../hooks/useTreasuryTransfers";
import { useTreasuryOptions } from "../../hooks/useProcurement";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuthStore } from "../../stores/authStore";
import { formatNumber } from "../../lib/utils/format";
import { apiErrorMessage } from "../../api/endpoints/production";
import type {
  TreasuryTransfer,
  TreasuryTransferStatus,
  ApproveTreasuryTransferPayload,
} from "../../api/endpoints/treasuryTransfers";

const STATUS_TABS: { label: string; value: "" | TreasuryTransferStatus }[] = [
  { label: "الكل", value: "" },
  { label: "بانتظار الاعتماد", value: "draft" },
  { label: "معتمد", value: "approved" },
  { label: "مرفوض", value: "rejected" },
  { label: "ملغى", value: "cancelled" },
];

export const TreasuryTransfersPage: React.FC = () => {
  const { hasRole, hasPermission, isOwner } = usePermissions();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const canCreate = hasRole(["owner", "accounting-manager", "treasury-officer"]);
  const canApproveOrReject =
    hasRole(["owner", "accounting-manager"]) || hasPermission("approve-treasury");

  // Filters & Pagination State
  const [statusFilter, setStatusFilter] = useState<"" | TreasuryTransferStatus>("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Dialog States
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Approve Dialog State
  const [approvingTransfer, setApprovingTransfer] = useState<TreasuryTransfer | null>(null);
  const [approveFxRate, setApproveFxRate] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [approveError, setApproveError] = useState<string | null>(null);

  // Reject Dialog State
  const [rejectingTransfer, setRejectingTransfer] = useState<TreasuryTransfer | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Cancel Dialog State
  const [cancellingTransfer, setCancellingTransfer] = useState<TreasuryTransfer | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { data: treasuries = [] } = useTreasuryOptions();

  // Pending Drafts for Top Section
  const { data: pendingData, isLoading: isPendingLoading } = useTreasuryTransfers({
    status: "draft",
    per_page: 50,
  });
  const pendingTransfers = pendingData?.data ?? [];

  // History List Query
  const { data: transfersData, isLoading } = useTreasuryTransfers({
    status: statusFilter || undefined,
    cash_account_id: cashAccountId || undefined,
    from: from || undefined,
    to: to || undefined,
    search: search.trim() || undefined,
    page,
    per_page: 20,
  });

  const approveMutation = useApproveTreasuryTransfer();
  const rejectMutation = useRejectTreasuryTransfer();
  const cancelMutation = useCancelTreasuryTransfer();

  const transfers = transfersData?.data ?? [];
  const lastPage = transfersData?.meta?.last_page ?? transfersData?.last_page ?? 1;
  const totalRecords = transfersData?.meta?.total ?? transfersData?.total ?? transfers.length;

  // Helpers to test permissions on a specific transfer
  const canApproveTransfer = (t: TreasuryTransfer): boolean => {
    if (t.status !== "draft") return false;
    if (!canApproveOrReject) return false;
    // Creator cannot approve their own transfer unless owner
    if (!isOwner && String(t.created_by?.id) === String(currentUserId)) {
      return false;
    }
    return true;
  };

  const canRejectTransfer = (t: TreasuryTransfer): boolean => {
    if (t.status !== "draft") return false;
    return canApproveOrReject;
  };

  const canCancelTransfer = (t: TreasuryTransfer): boolean => {
    if (t.status !== "draft") return false;
    return isOwner || String(t.created_by?.id) === String(currentUserId);
  };

  // Open Handlers
  const handleOpenApprove = (t: TreasuryTransfer) => {
    setApprovingTransfer(t);
    setApproveFxRate(t.fx_rate ? String(t.fx_rate) : "");
    setApproveNote("");
    setApproveError(null);
  };

  const handleOpenReject = (t: TreasuryTransfer) => {
    setRejectingTransfer(t);
    setRejectNote("");
    setRejectError(null);
  };

  const handleOpenCancel = (t: TreasuryTransfer) => {
    setCancellingTransfer(t);
    setCancelError(null);
  };

  // Confirm Actions
  const handleConfirmApprove = (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingTransfer) return;
    setApproveError(null);

    const isNonLyd =
      approvingTransfer.currency !== "LYD" && approvingTransfer.currency !== "د.ل";
    const hasStoredFxRate = Boolean(
      approvingTransfer.fx_rate && approvingTransfer.fx_rate > 0,
    );
    const isFxRateRequired = isNonLyd && !hasStoredFxRate;

    const numFxRate = Number(approveFxRate);
    if (isFxRateRequired && (!approveFxRate.trim() || isNaN(numFxRate) || numFxRate <= 0)) {
      setApproveError("سعر الصرف مطلوب للعملات الأجنبية ويجب أن يكون أكبر من صفر.");
      return;
    }

    const payload: ApproveTreasuryTransferPayload = {};
    if (isNonLyd && approveFxRate.trim() && numFxRate > 0) {
      payload.fx_rate = numFxRate;
    }
    if (approveNote.trim()) {
      payload.note = approveNote.trim();
    }

    approveMutation.mutate(
      { id: approvingTransfer.id, payload },
      {
        onSuccess: () => {
          setApprovingTransfer(null);
        },
        onError: (err) => {
          setApproveError(apiErrorMessage(err, "تعذر اعتماد التحويل."));
        },
      },
    );
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingTransfer) return;
    setRejectError(null);

    if (!rejectNote.trim()) {
      setRejectError("يرجى كتابة سبب الرفض.");
      return;
    }

    rejectMutation.mutate(
      { id: rejectingTransfer.id, payload: { note: rejectNote.trim() } },
      {
        onSuccess: () => {
          setRejectingTransfer(null);
          setRejectNote("");
        },
        onError: (err) => {
          setRejectError(apiErrorMessage(err, "تعذر رفض التحويل."));
        },
      },
    );
  };

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingTransfer) return;
    setCancelError(null);

    cancelMutation.mutate(cancellingTransfer.id, {
      onSuccess: () => {
        setCancellingTransfer(null);
      },
      onError: (err) => {
        setCancelError(apiErrorMessage(err, "تعذر إلغاء التحويل."));
      },
    });
  };

  const approvingFromTreasury = treasuries.find(
    (tr) => tr.id === approvingTransfer?.from_cash_account?.id,
  );
  const approvingIsNonLyd =
    approvingTransfer?.currency !== "LYD" && approvingTransfer?.currency !== "د.ل";
  const approvingHasStoredFxRate = Boolean(
    approvingTransfer?.fx_rate && approvingTransfer.fx_rate > 0,
  );
  const approvingFxRateRequired = approvingIsNonLyd && !approvingHasStoredFxRate;
  const approvingComputedLyd =
    (approvingTransfer?.amount ?? 0) * (Number(approveFxRate) || 1);

  const columns = useMemo<ColumnDef<TreasuryTransfer>[]>(
    () => [
      {
        id: "transfer_number",
        header: "الرقم",
        accessorKey: "transfer_number",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono font-bold text-app-label-primary">
            {row.original.transfer_number}
          </span>
        ),
      },
      {
        id: "transfer_date",
        header: "التاريخ",
        accessorKey: "transfer_date",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-app-label-secondary">
            {row.original.transfer_date}
          </span>
        ),
      },
      {
        id: "from_cash_account",
        header: "من",
        meta: { exportValue: (t) => t.from_cash_account?.name },
        cell: ({ row }) => (
          <span className="text-xs font-medium text-app-label-primary">
            {row.original.from_cash_account?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "to_cash_account",
        header: "إلى",
        meta: { exportValue: (t) => t.to_cash_account?.name },
        cell: ({ row }) => (
          <span className="text-xs font-medium text-app-label-primary">
            {row.original.to_cash_account?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "amount",
        header: "المبلغ",
        meta: { exportAs: [{ header: "المبلغ", value: (t) => Number(t.amount) }, { header: "العملة", value: (t) => t.currency }], align: "end" },
        cell: ({ row }) => {
          const t = row.original;
          const isNonLyd = t.currency !== "LYD" && t.currency !== "د.ل";
          return (
            <div className="font-mono text-end text-xs">
              <span className="font-bold text-app-label-primary">
                {formatNumber(t.amount)} {t.currency}
              </span>
              {isNonLyd && t.amount_lyd && (
                <div className="text-[10px] text-app-label-tertiary">
                  ≈ {formatNumber(t.amount_lyd)} د.ل
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (t) => t.status_label || ({ draft: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى" } as Record<string, string>)[t.status] || t.status },
        cell: ({ row }) => {
          const s = row.original.status;
          let badgeClass = "bg-app-fill-f2 text-app-label-tertiary";
          let label = row.original.status_label || s;

          if (s === "draft") {
            badgeClass =
              "bg-app-status-yellow/10 text-app-status-yellow border border-app-status-yellow/20";
            label = row.original.status_label || "بانتظار الاعتماد";
          } else if (s === "approved") {
            badgeClass =
              "bg-app-status-positive/10 text-app-status-positive border border-app-status-positive/20";
            label = row.original.status_label || "معتمد";
          } else if (s === "rejected") {
            badgeClass =
              "bg-app-status-danger/10 text-app-status-danger border border-app-status-danger/20";
            label = row.original.status_label || "مرفوض";
          } else if (s === "cancelled") {
            badgeClass = "bg-app-fill-f2 text-app-label-tertiary line-through";
            label = row.original.status_label || "ملغى";
          }

          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}
            >
              {label}
            </span>
          );
        },
      },
      {
        id: "decided_by",
        header: "المعتمد / الرافض",
        meta: { exportValue: (t) => (t.decided_by ? [t.decided_by.name, t.decision_note].filter(Boolean).join(" — ") : null) },
        cell: ({ row }) => {
          const t = row.original;
          if (t.decided_by) {
            return (
              <div className="text-xs">
                <span className="text-app-label-primary font-medium">
                  {t.decided_by.name}
                </span>
                {t.decision_note && (
                  <div
                    className="text-[10px] text-app-label-secondary line-clamp-1 max-w-[10rem]"
                    title={t.decision_note}
                  >
                    {t.decision_note}
                  </div>
                )}
              </div>
            );
          }
          return <span className="text-xs text-app-label-tertiary">—</span>;
        },
      },
      {
        id: "journal_entry",
        header: "القيد",
        meta: { exportValue: (t) => t.journal_entry?.reference },
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-xs text-app-label-secondary">
            {row.original.journal_entry?.reference ?? "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const t = row.original;
          if (t.status !== "draft") return null;

          const canApprove = canApproveTransfer(t);
          const canReject = canRejectTransfer(t);
          const canCancel = canCancelTransfer(t);

          if (!canApprove && !canReject && !canCancel) return null;

          return (
            <div className="flex items-center justify-end gap-1.5">
              {canApprove && (
                <button
                  type="button"
                  onClick={() => handleOpenApprove(t)}
                  className="flex items-center gap-1 rounded-lg border border-app-status-positive/30 bg-app-status-positive/10 px-2 py-1 text-xs font-semibold text-app-status-positive hover:bg-app-status-positive/20 transition-colors"
                  title="اعتماد وترحيل التحويل"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>اعتماد</span>
                </button>
              )}
              {canReject && (
                <button
                  type="button"
                  onClick={() => handleOpenReject(t)}
                  className="flex items-center gap-1 rounded-lg border border-app-status-danger/30 bg-app-status-danger/10 px-2 py-1 text-xs font-semibold text-app-status-danger hover:bg-app-status-danger/20 transition-colors"
                  title="رفض التحويل"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>رفض</span>
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => handleOpenCancel(t)}
                  className="flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary transition-colors"
                  title="إلغاء التحويل"
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>إلغاء</span>
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [canApproveOrReject, isOwner, currentUserId],
  );

  const table = useDataTable({
    exportFileName: "treasury-transfers",
    columns,
    data: transfers,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (t) => t.id,
  });

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header with Title and Create Action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
            <ArrowLeftRight className="h-6 w-6 text-app-accent" />
            التحويلات بين الخزائن
          </h1>
          <p className="text-xs text-app-label-secondary mt-0.5">
            إدارة ومتابعة واعتماد التحويلات المالية بين الخزائن والحسابات المصرفية
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            تحويل جديد
          </button>
        )}
      </div>

      {/* Highlighted "بانتظار الاعتماد" Section */}
      <div className="rounded-2xl border-2 border-app-status-yellow/30 bg-app-status-yellow/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-app-status-yellow" />
            <h2 className="text-sm font-bold text-app-label-primary">
              بانتظار الاعتماد
            </h2>
            <span className="rounded-full bg-app-status-yellow/20 px-2.5 py-0.5 font-mono text-xs font-bold text-app-status-yellow">
              {pendingTransfers.length}
            </span>
          </div>
          <span className="text-[11px] text-app-label-secondary">
            التحويلات المسودة التي تتطلب تدقيقاً وموافقة قبل الترحيل المالي
          </span>
        </div>

        {isPendingLoading ? (
          <p className="text-xs text-app-label-secondary py-2">جارٍ التحميل…</p>
        ) : pendingTransfers.length === 0 ? (
          <div className="rounded-xl border border-app-separator bg-app-bg-primary/50 p-4 text-center text-xs text-app-label-secondary">
            لا توجد تحويلات معلقة بانتظار الاعتماد حالياً.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {pendingTransfers.map((t) => {
              const canApprove = canApproveTransfer(t);
              const canReject = canRejectTransfer(t);
              const canCancel = canCancelTransfer(t);
              const isNonLyd = t.currency !== "LYD" && t.currency !== "د.ل";

              return (
                <div
                  key={t.id}
                  className="rounded-xl border border-app-separator bg-app-bg-primary p-3.5 space-y-3 shadow-xs hover:border-app-accent/40 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-app-accent">
                      {t.transfer_number}
                    </span>
                    <span className="font-mono text-[11px] text-app-label-secondary">
                      {t.transfer_date}
                    </span>
                  </div>

                  {/* Flow: From -> To */}
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-app-separator bg-app-bg-secondary/60 p-2 text-xs">
                    <div className="truncate">
                      <div className="text-[10px] text-app-label-tertiary">من خزينة:</div>
                      <div className="font-bold text-app-label-primary truncate">
                        {t.from_cash_account?.name}
                      </div>
                    </div>
                    <ArrowLeft className="h-4 w-4 shrink-0 text-app-label-secondary" />
                    <div className="truncate text-start">
                      <div className="text-[10px] text-app-label-tertiary">إلى خزينة:</div>
                      <div className="font-bold text-app-label-primary truncate">
                        {t.to_cash_account?.name}
                      </div>
                    </div>
                  </div>

                  {/* Amount and FX */}
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-app-label-secondary">المبلغ:</span>
                    <div className="font-mono text-end">
                      <span className="font-bold text-sm text-app-label-primary">
                        {formatNumber(t.amount)} {t.currency}
                      </span>
                      {isNonLyd && (
                        <div className="text-[10px] text-app-label-tertiary">
                          {t.fx_rate
                            ? `سعر الصرف: ${formatNumber(t.fx_rate)} (≈ ${formatNumber(t.amount_lyd)} د.ل)`
                            : "سعر الصرف: غير محدد"}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes & Creator */}
                  <div className="space-y-1 text-[11px] border-t border-app-separator/60 pt-2 text-app-label-secondary">
                    {t.notes && (
                      <div className="line-clamp-2" title={t.notes}>
                        <strong className="text-app-label-primary">ملاحظات:</strong> {t.notes}
                      </div>
                    )}
                    <div>
                      <span>أنشأه: </span>
                      <strong className="text-app-label-primary">
                        {t.created_by?.name ?? "—"}
                      </strong>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-app-separator/40">
                    {canApprove && (
                      <button
                        type="button"
                        onClick={() => handleOpenApprove(t)}
                        className="flex items-center gap-1 rounded-lg bg-app-status-positive px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        اعتماد
                      </button>
                    )}
                    {canReject && (
                      <button
                        type="button"
                        onClick={() => handleOpenReject(t)}
                        className="flex items-center gap-1 rounded-lg border border-app-status-danger/30 bg-app-status-danger/10 px-2.5 py-1.5 text-xs font-semibold text-app-status-danger hover:bg-app-status-danger/20 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        رفض
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => handleOpenCancel(t)}
                        className="flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2.5 py-1.5 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 transition-colors"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        إلغاء
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[14rem]">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-app-label-secondary" />
            <input
              type="text"
              placeholder="ابحث برقم التحويل، الملاحظات…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full ps-9 pe-3 py-1.5 border border-app-separator rounded-xl bg-app-bg-primary text-xs focus:border-app-accent focus:outline-none"
            />
          </div>

          {/* Treasury Filter */}
          <select
            value={cashAccountId}
            onChange={(e) => {
              setCashAccountId(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-app-separator bg-app-bg-primary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
          >
            <option value="">كل الخزائن</option>
            {treasuries.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* From / To Dates */}
          <div className="flex items-center gap-1.5 text-xs text-app-label-secondary">
            <span>من:</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-app-separator bg-app-bg-primary px-2.5 py-1 text-xs font-mono focus:border-app-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-app-label-secondary">
            <span>إلى:</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-app-separator bg-app-bg-primary px-2.5 py-1 text-xs font-mono focus:border-app-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Status Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-app-separator/60 text-xs">
          <span className="text-app-label-secondary font-semibold ms-1">الحالة:</span>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              type="button"
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                statusFilter === tab.value
                  ? "bg-app-accent text-white"
                  : "bg-app-bg-primary text-app-label-secondary hover:text-app-label-primary border border-app-separator"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <DataTable table={table}>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد تحويلات مطابقة لمعايير البحث."
          emptyIcon={ArrowLeftRight}
        />
      </DataTable>

      {/* Server-side Pagination Controls */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between text-xs px-2">
          <span className="text-app-label-secondary font-mono">
            إجمالي التحويلات: {totalRecords}
          </span>
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

      {/* Create Transfer Dialog */}
      <TreasuryTransferDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      {/* Approve Confirm Dialog */}
      {approvingTransfer && (
        <Dialog
          open={Boolean(approvingTransfer)}
          onOpenChange={(o) => {
            if (!o) setApprovingTransfer(null);
          }}
        >
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>
                اعتماد التحويل {approvingTransfer.transfer_number}
              </DialogTitle>
              <DialogClose />
            </DialogHeader>

            <form onSubmit={handleConfirmApprove}>
              <DialogBody className="space-y-4">
                {approveError && (
                  <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-2.5 text-xs font-semibold text-app-status-danger">
                    {approveError}
                  </div>
                )}

                {/* Transfer summary info */}
                <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-app-label-secondary">مسار التحويل:</span>
                    <span className="font-bold text-app-label-primary">
                      {approvingTransfer.from_cash_account?.name} ← {approvingTransfer.to_cash_account?.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-app-label-secondary">المبلغ المطلوب:</span>
                    <span className="font-mono font-bold text-app-label-primary">
                      {formatNumber(approvingTransfer.amount)} {approvingTransfer.currency}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-app-label-secondary">تاريخ التحويل:</span>
                    <span className="font-mono text-app-label-primary">
                      {approvingTransfer.transfer_date}
                    </span>
                  </div>
                </div>

                {/* From Treasury Balance Display */}
                <div className="rounded-xl border border-app-separator bg-app-bg-primary p-3 space-y-1 text-xs font-mono">
                  <div className="flex items-center justify-between">
                    <span className="text-app-label-secondary">
                      رصيد الخزينة المحوَّل منها ({approvingTransfer.from_cash_account?.name}):
                    </span>
                    <span className="font-bold text-app-label-primary">
                      {approvingFromTreasury
                        ? `${formatNumber(approvingFromTreasury.ledger_balance)} ${approvingFromTreasury.currency || "LYD"}`
                        : "—"}
                    </span>
                  </div>

                  {approvingFromTreasury &&
                    approvingFromTreasury.ledger_balance < approvingTransfer.amount && (
                      <div className="flex items-center gap-1.5 pt-1.5 text-app-status-danger font-semibold">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>تحذير: الرصيد الحالي لا يكفي لتغطية مبلغ التحويل.</span>
                      </div>
                    )}
                </div>

                {/* Exchange Rate Input for non-LYD */}
                {approvingIsNonLyd && (
                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                      سعر الصرف مقابل الدينار{" "}
                      {approvingFxRateRequired && (
                        <span className="text-app-status-danger">*</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      required={approvingFxRateRequired}
                      value={approveFxRate}
                      onChange={(e) => setApproveFxRate(e.target.value)}
                      placeholder="1.0000"
                      className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-sm font-mono focus:border-app-accent focus:outline-none"
                    />
                    {approveFxRate.trim() && Number(approveFxRate) > 0 && (
                      <div className="mt-1 text-[11px] font-mono text-app-label-secondary">
                        المعادل بالدينار:{" "}
                        <span className="font-bold text-app-label-primary">
                          {formatNumber(approvingComputedLyd)} د.ل
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Optional Note */}
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    ملاحظات الاعتماد (اختياري)
                  </label>
                  <textarea
                    rows={2}
                    value={approveNote}
                    onChange={(e) => setApproveNote(e.target.value)}
                    placeholder="ملاحظات الاعتماد…"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                  />
                </div>
              </DialogBody>

              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setApprovingTransfer(null)}
                  disabled={approveMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={approveMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-app-status-positive hover:opacity-90 rounded-xl disabled:opacity-50"
                >
                  {approveMutation.isPending ? "جارٍ الاعتماد…" : "تأكيد الاعتماد والترحيل"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Reject Dialog */}
      {rejectingTransfer && (
        <Dialog
          open={Boolean(rejectingTransfer)}
          onOpenChange={(o) => {
            if (!o) setRejectingTransfer(null);
          }}
        >
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>
                رفض التحويل {rejectingTransfer.transfer_number}
              </DialogTitle>
              <DialogClose />
            </DialogHeader>

            <form onSubmit={handleConfirmReject}>
              <DialogBody className="space-y-3">
                {rejectError && (
                  <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-2.5 text-xs font-semibold text-app-status-danger">
                    {rejectError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    سبب الرفض <span className="text-app-status-danger">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="اكتب سبب رفض هذا التحويل…"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                  />
                </div>
              </DialogBody>

              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setRejectingTransfer(null)}
                  disabled={rejectMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={rejectMutation.isPending || !rejectNote.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-app-status-danger hover:opacity-90 rounded-xl disabled:opacity-50"
                >
                  {rejectMutation.isPending ? "جارٍ الرفض…" : "تأكيد الرفض"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Confirm Dialog */}
      {cancellingTransfer && (
        <Dialog
          open={Boolean(cancellingTransfer)}
          onOpenChange={(o) => {
            if (!o) setCancellingTransfer(null);
          }}
        >
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>
                إلغاء التحويل {cancellingTransfer.transfer_number}
              </DialogTitle>
              <DialogClose />
            </DialogHeader>

            <form onSubmit={handleConfirmCancel}>
              <DialogBody className="space-y-3">
                {cancelError && (
                  <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-2.5 text-xs font-semibold text-app-status-danger">
                    {cancelError}
                  </div>
                )}
                <p className="text-xs text-app-label-secondary leading-relaxed">
                  هل أنت متأكد من رغبتك في إلغاء هذا التحويل المسودة؟ لن يمكن التراجع عن هذا الإجراء.
                </p>
              </DialogBody>

              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setCancellingTransfer(null)}
                  disabled={cancelMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={cancelMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-app-status-danger hover:opacity-90 rounded-xl disabled:opacity-50"
                >
                  {cancelMutation.isPending ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
