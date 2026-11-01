import React, { useMemo, useState } from "react";
import {
  Search,
  Receipt,
  Plus,
  Printer,
  Ban,
  AlertTriangle,
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
import { TreasuryVoucherDialog } from "../../components/treasury/TreasuryVoucherDialog";
import { TreasuryVoucherPrint } from "../../components/treasury/TreasuryVoucherPrint";
import {
  useTreasuryVouchers,
  useCancelTreasuryVoucher,
} from "../../hooks/useTreasuryVouchers";
import { useTreasuryOptions } from "../../hooks/useProcurement";
import { usePermissions } from "../../hooks/usePermissions";
import { formatNumber } from "../../lib/utils/format";
import { apiErrorMessage } from "../../api/endpoints/production";
import type {
  TreasuryVoucher,
  TreasuryVoucherKind,
} from "../../api/endpoints/treasuryVouchers";

const KIND_TABS: { label: string; value: "" | TreasuryVoucherKind }[] = [
  { label: "الكل", value: "" },
  { label: "قبض", value: "receipt" },
  { label: "صرف", value: "payment" },
];

const STATUS_TABS: { label: string; value: "" | "posted" | "cancelled" }[] = [
  { label: "الكل", value: "" },
  { label: "مرحّل", value: "posted" },
  { label: "ملغى", value: "cancelled" },
];

export const TreasuryVouchersPage: React.FC = () => {
  const { hasRole } = usePermissions();
  const canCreate = hasRole(["owner", "accounting-manager", "treasury-officer"]);
  const canCancel = hasRole(["owner", "accounting-manager"]);

  // Filters & Pagination State
  const [kindFilter, setKindFilter] = useState<"" | TreasuryVoucherKind>("");
  const [statusFilter, setStatusFilter] = useState<"" | "posted" | "cancelled">("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Dialogs State
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createKind, setCreateKind] = useState<TreasuryVoucherKind>("receipt");
  const [printingVoucher, setPrintingVoucher] = useState<TreasuryVoucher | null>(null);

  // Cancel Dialog State
  const [cancellingVoucher, setCancellingVoucher] = useState<TreasuryVoucher | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { data: treasuries = [] } = useTreasuryOptions();

  const { data: vouchersData, isLoading } = useTreasuryVouchers({
    kind: kindFilter || undefined,
    status: statusFilter || undefined,
    cash_account_id: cashAccountId || undefined,
    from: from || undefined,
    to: to || undefined,
    search: search.trim() || undefined,
    page,
    per_page: 20,
  });

  const cancelMutation = useCancelTreasuryVoucher();

  const vouchers = vouchersData?.data ?? [];
  const lastPage = vouchersData?.meta?.last_page ?? vouchersData?.last_page ?? 1;
  const totalRecords = vouchersData?.meta?.total ?? vouchersData?.total ?? vouchers.length;

  const handleOpenCreate = (kind: TreasuryVoucherKind) => {
    setCreateKind(kind);
    setCreateDialogOpen(true);
  };

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingVoucher) return;
    setCancelError(null);

    if (!cancelReason.trim()) {
      setCancelError("يرجى كتابة سبب الإلغاء.");
      return;
    }

    cancelMutation.mutate(
      { id: cancellingVoucher.id, reason: cancelReason.trim() },
      {
        onSuccess: () => {
          setCancellingVoucher(null);
          setCancelReason("");
        },
        onError: (err) => {
          setCancelError(apiErrorMessage(err, "تعذر إلغاء السند."));
        },
      },
    );
  };

  const columns = useMemo<ColumnDef<TreasuryVoucher>[]>(
    () => [
      {
        id: "voucher_number",
        header: "الرقم",
        accessorKey: "voucher_number",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono font-bold text-app-label-primary">
            {row.original.voucher_number}
          </span>
        ),
      },
      {
        id: "kind",
        header: "النوع",
        meta: { exportValue: (v) => v.kind_label || (v.kind === "receipt" ? "قبض" : "صرف") },
        accessorKey: "kind",
        cell: ({ row }) => {
          const isReceipt = row.original.kind === "receipt";
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold border ${
                isReceipt
                  ? "bg-app-status-positive/10 text-app-status-positive border-app-status-positive/20"
                  : "bg-app-status-danger/10 text-app-status-danger border-app-status-danger/20"
              }`}
            >
              {row.original.kind_label || (isReceipt ? "قبض" : "صرف")}
            </span>
          );
        },
      },
      {
        id: "voucher_date",
        header: "التاريخ",
        accessorKey: "voucher_date",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-app-label-secondary">
            {row.original.voucher_date}
          </span>
        ),
      },
      {
        id: "cash_account",
        header: "الخزينة",
        meta: { exportValue: (v) => v.cash_account?.name },
        cell: ({ row }) => (
          <span className="text-xs font-medium text-app-label-primary">
            {row.original.cash_account?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "counter_party",
        header: "الطرف المقابل",
        meta: { exportValue: (v) => (v.client ? v.client.name : v.counter_account ? [`${v.counter_account.code} — ${v.counter_account.name}`, v.employee ? `الموظف: ${v.employee.name ?? v.employee.employee_number ?? v.employee.id.slice(0, 8)}` : null].filter(Boolean).join(" — ") : null) },
        cell: ({ row }) => {
          const v = row.original;
          if (v.client) {
            return (
              <span className="text-xs font-semibold text-app-label-primary">
                {v.client.name}
              </span>
            );
          }
          if (v.counter_account) {
            return (
              <span className="flex flex-col">
                <span className="font-mono text-xs text-app-label-secondary">
                  {v.counter_account.code} — {v.counter_account.name}
                </span>
                {v.employee && (
                  <span className="text-[11px] font-semibold text-app-label-primary">
                    الموظف: {v.employee.name ?? v.employee.employee_number ?? v.employee.id.slice(0, 8)}
                  </span>
                )}
              </span>
            );
          }
          return <span className="text-xs text-app-label-tertiary">—</span>;
        },
      },
      {
        id: "payee",
        header: "المستلم / الدافع",
        accessorKey: "payee",
        cell: ({ row }) => (
          <span className="text-xs text-app-label-secondary">
            {row.original.payee || "—"}
          </span>
        ),
      },
      {
        id: "description",
        header: "البيان",
        accessorKey: "description",
        cell: ({ row }) => (
          <span
            className="line-clamp-1 max-w-[13rem] text-xs text-app-label-secondary"
            title={row.original.description}
          >
            {row.original.description}
          </span>
        ),
      },
      {
        id: "amount",
        header: "المبلغ",
        meta: { exportAs: [{ header: "المبلغ", value: (v) => Number(v.amount) }, { header: "العملة", value: (v) => v.currency }], align: "end" },
        cell: ({ row }) => {
          const v = row.original;
          const isNonLyd = v.currency !== "LYD" && v.currency !== "د.ل";
          return (
            <div className="font-mono text-end text-xs">
              <span className="font-bold text-app-label-primary">
                {formatNumber(v.amount)} {v.currency}
              </span>
              {isNonLyd && (
                <div className="text-[10px] text-app-label-tertiary">
                  ≈ {formatNumber(v.amount_lyd)} د.ل
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (v) => v.status_label || (v.status === "cancelled" ? "ملغى" : "مرحّل") },
        cell: ({ row }) => {
          const isCancelled = row.original.status === "cancelled";
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                isCancelled
                  ? "line-through text-app-label-tertiary bg-app-fill-f2"
                  : "text-app-status-positive bg-app-status-positive/10 border border-app-status-positive/20"
              }`}
            >
              {row.original.status_label || (isCancelled ? "ملغى" : "مرحّل")}
            </span>
          );
        },
      },
      {
        id: "journal_entry",
        header: "القيد",
        meta: { exportValue: (v) => [v.journal_entry?.reference, v.cancel_entry ? `عكسي: ${v.cancel_entry.reference}` : null].filter(Boolean).join(" — ") },
        cell: ({ row }) => {
          const v = row.original;
          return (
            <div className="font-mono text-xs">
              <span className="whitespace-nowrap text-app-label-secondary">
                {v.journal_entry?.reference ?? "—"}
              </span>
              {v.cancel_entry && (
                <div className="text-[10px] text-app-status-danger line-through">
                  عكسي: {v.cancel_entry.reference}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const v = row.original;
          const isCancelled = v.status === "cancelled";
          return (
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setPrintingVoucher(v)}
                className="flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2.5 py-1 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary transition-colors"
                title="طباعة السند"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>طباعة</span>
              </button>

              {canCancel && !isCancelled && (
                <button
                  type="button"
                  onClick={() => {
                    setCancellingVoucher(v);
                    setCancelReason("");
                    setCancelError(null);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-app-status-danger/30 bg-app-status-danger/10 px-2 py-1 text-xs font-semibold text-app-status-danger hover:bg-app-status-danger/20 transition-colors"
                  title="إلغاء السند وعكس القيد المحاسبي"
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
    [canCancel],
  );

  const table = useDataTable({
    exportFileName: "treasury-vouchers",
    columns,
    data: vouchers,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (v) => v.id,
  });

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header with Title and Create Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
            <Receipt className="h-6 w-6 text-app-accent" />
            سندات القبض والصرف
          </h1>
          <p className="text-xs text-app-label-secondary mt-0.5">
            إدارة وتوثيق مقبوضات ومدفوعات الخزائن والترحيل المالي المباشر
          </p>
        </div>

        {canCreate && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenCreate("receipt")}
              className="flex items-center gap-1.5 rounded-xl bg-app-status-positive px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              سند قبض
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreate("payment")}
              className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              سند صرف
            </button>
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
              placeholder="ابحث برقم السند، البيان، المستلم/الدافع…"
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

        {/* Chips for Kind and Status */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-app-separator/60">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-app-label-secondary font-semibold ms-1">النوع:</span>
            {KIND_TABS.map((tab) => (
              <button
                key={tab.value || "all"}
                type="button"
                onClick={() => {
                  setKindFilter(tab.value);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  kindFilter === tab.value
                    ? "bg-app-accent text-white"
                    : "bg-app-bg-primary text-app-label-secondary hover:text-app-label-primary border border-app-separator"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs">
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
      </div>

      {/* Main Table */}
      <DataTable table={table}>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد سندات مطابقة لمعايير البحث."
          emptyIcon={Receipt}
        />
      </DataTable>

      {/* Server-side Pagination Controls */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between text-xs px-2">
          <span className="text-app-label-secondary font-mono">
            إجمالي السندات: {totalRecords}
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

      {/* Create Voucher Dialog */}
      <TreasuryVoucherDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        defaultKind={createKind}
        onSuccessPrint={(newVoucher) => setPrintingVoucher(newVoucher)}
      />

      {/* Cancel Voucher Dialog */}
      {cancellingVoucher && (
        <Dialog
          open={Boolean(cancellingVoucher)}
          onOpenChange={(o) => {
            if (!o) setCancellingVoucher(null);
          }}
        >
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>
                إلغاء السند {cancellingVoucher.voucher_number}
              </DialogTitle>
              <DialogClose />
            </DialogHeader>

            <form onSubmit={handleConfirmCancel}>
              <DialogBody className="space-y-3">
                {/* Warning Alert */}
                <div className="flex items-start gap-2.5 rounded-xl border border-app-status-yellow/30 bg-app-status-yellow/10 p-3 text-xs text-app-status-yellow">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-app-status-yellow mt-0.5" />
                  <div className="leading-relaxed">
                    <strong>تنبيه:</strong> سيُنشأ قيد عكسي ولا يُحذف السند.
                  </div>
                </div>

                {cancelError && (
                  <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-2.5 text-xs font-semibold text-app-status-danger">
                    {cancelError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    سبب الإلغاء <span className="text-app-status-danger">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="اكتب سبب إلغاء هذا السند بدقة…"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                  />
                </div>
              </DialogBody>

              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setCancellingVoucher(null)}
                  disabled={cancelMutation.isPending}
                  className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
                >
                  تراجع
                </button>
                <button
                  type="submit"
                  disabled={cancelMutation.isPending || !cancelReason.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-app-status-danger hover:opacity-90 rounded-xl disabled:opacity-50"
                >
                  {cancelMutation.isPending ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Voucher Print Preview Dialog */}
      <TreasuryVoucherPrint
        voucher={printingVoucher}
        open={Boolean(printingVoucher)}
        onClose={() => setPrintingVoucher(null)}
      />
    </div>
  );
};
