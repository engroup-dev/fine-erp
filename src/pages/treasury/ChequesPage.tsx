import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileCheck,
  Plus,
  Search,
  Wallet,
  Landmark,
  CalendarClock,
  AlertTriangle,
  Ban,
  Eye,
  CheckCircle2,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import {
  DataTable,
  useDataTable,
  type ColumnDef,
} from "../../components/ui/DataTable";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { ChequeReceiveDialog } from "../../components/treasury/ChequeReceiveDialog";
import { ChequeIssueDialog } from "../../components/treasury/ChequeIssueDialog";
import {
  ChequeActionDialog,
  type ChequeActionType,
} from "../../components/treasury/ChequeActionDialog";
import { ChequeDetailsDialog } from "../../components/treasury/ChequeDetailsDialog";
import { useCheques, useChequeSummary } from "../../hooks/useCheques";
import { useClients } from "../../hooks/useClients";
import { useSuppliers } from "../../hooks/useProcurement";
import { usePermissions } from "../../hooks/usePermissions";
import { formatNumber } from "../../lib/utils/format";
import type { Cheque, ChequeStatus } from "../../api/endpoints/cheques";
import type { Client } from "../../types/entities";
import type { Supplier } from "../../types/procurement";

const INCOMING_STATUS_TABS: { label: string; value: "" | ChequeStatus }[] = [
  { label: "الكل", value: "" },
  { label: "في الحافظة", value: "in_portfolio" },
  { label: "برسم التحصيل", value: "deposited" },
  { label: "محصل", value: "cleared" },
  { label: "مرتجع", value: "bounced" },
  { label: "معادة للساحب", value: "returned" },
];

const OUTGOING_STATUS_TABS: { label: string; value: "" | ChequeStatus }[] = [
  { label: "الكل", value: "" },
  { label: "صادرة", value: "issued" },
  { label: "مصروفة", value: "cleared" },
  { label: "ملغاة", value: "cancelled" },
];

const STATUS_LABELS: Record<ChequeStatus, string> = {
  in_portfolio: "في الحافظة",
  deposited: "برسم التحصيل",
  cleared: "محصل",
  bounced: "مرتجع",
  returned: "معادة للساحب",
  issued: "صادر",
  cancelled: "ملغى",
};

export const ChequesPage: React.FC = () => {
  const { hasRole } = usePermissions();
  const canMutate = hasRole(["owner", "accounting-manager", "treasury-officer"]);

  const [searchParams, setSearchParams] = useSearchParams();
  const currentDirection: "incoming" | "outgoing" =
    searchParams.get("direction") === "outgoing" ? "outgoing" : "incoming";

  // Filter State
  const [statusFilter, setStatusFilter] = useState<"" | ChequeStatus>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Dialog States
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [detailsChequeId, setDetailsChequeId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Action Dialog State
  const [actionCheque, setActionCheque] = useState<Cheque | null>(null);
  const [actionType, setActionType] = useState<ChequeActionType | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);

  const { data: clients = [] } = useClients();
  const { data: suppliers = [] } = useSuppliers();
  const { data: summary } = useChequeSummary(currentDirection);

  const { data: chequesData, isLoading } = useCheques({
    direction: currentDirection,
    status: statusFilter || undefined,
    client_id:
      currentDirection === "incoming" ? selectedClientId || undefined : undefined,
    supplier_id:
      currentDirection === "outgoing" ? selectedSupplierId || undefined : undefined,
    due_from: dueFrom || undefined,
    due_to: dueTo || undefined,
    search: search.trim() || undefined,
    page,
    per_page: 20,
  });

  const cheques = chequesData?.data ?? [];
  const lastPage = chequesData?.meta?.last_page ?? chequesData?.last_page ?? 1;
  const totalRecords =
    chequesData?.meta?.total ?? chequesData?.total ?? cheques.length;

  const handleTabChange = (dir: "incoming" | "outgoing") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (dir === "outgoing") {
        next.set("direction", "outgoing");
      } else {
        next.delete("direction");
      }
      return next;
    });
    setStatusFilter("");
    setSelectedClientId("");
    setSelectedSupplierId("");
    setDueFrom("");
    setDueTo("");
    setSearch("");
    setPage(1);
  };

  const handleOpenAction = (cheque: Cheque, action: ChequeActionType) => {
    setActionCheque(cheque);
    setActionType(action);
    setActionDialogOpen(true);
  };

  const handleOpenDetails = (cheque: Cheque) => {
    setDetailsChequeId(cheque.id);
    setDetailsOpen(true);
  };

  const selectedClient =
    clients.find((c) => c.id === selectedClientId) ?? null;
  const selectedSupplier =
    suppliers.find((s) => s.id === selectedSupplierId) ?? null;

  const incomingColumns = useMemo<ColumnDef<Cheque>[]>(
    () => [
      {
        id: "number",
        header: "الرقم",
        accessorKey: "number",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono font-bold text-app-label-primary">
            {row.original.number}
          </span>
        ),
      },
      {
        id: "cheque_no",
        header: "رقم الشيك",
        accessorKey: "cheque_no",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-app-label-primary">
            {row.original.cheque_no}
          </span>
        ),
      },
      {
        id: "bank_name",
        header: "المصرف",
        accessorKey: "bank_name",
        cell: ({ row }) => (
          <span className="text-xs text-app-label-primary font-medium">
            {row.original.bank_name}
          </span>
        ),
      },
      {
        id: "client",
        header: "العميل",
        meta: { exportValue: (c) => c.client?.name },
        cell: ({ row }) => (
          <span className="text-xs font-semibold text-app-label-primary">
            {row.original.client?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "drawer_name",
        header: "الساحب",
        accessorKey: "drawer_name",
        cell: ({ row }) => (
          <span className="text-xs text-app-label-secondary">
            {row.original.drawer_name || "—"}
          </span>
        ),
      },
      {
        id: "amount",
        header: "المبلغ",
        meta: { exportAs: [{ header: "المبلغ", value: (c) => Number(c.amount) }, { header: "العملة", value: (c) => c.currency }], align: "end" },
        cell: ({ row }) => (
          <div className="font-mono text-end text-xs font-bold text-app-label-primary whitespace-nowrap">
            {formatNumber(row.original.amount)} {row.original.currency}
          </div>
        ),
      },
      {
        id: "due_date",
        header: "تاريخ الاستحقاق",
        accessorKey: "due_date",
        cell: ({ row }) => {
          const c = row.original;
          const isOverdue = c.status === "in_portfolio" && c.days_to_due < 0;
          const isDueSoon =
            c.days_to_due >= 0 &&
            c.days_to_due <= 7 &&
            (c.status === "in_portfolio" || c.status === "deposited");
          return (
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-xs text-app-label-primary whitespace-nowrap">
                {c.due_date}
              </span>
              {isOverdue && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-app-status-danger/10 text-app-status-danger border border-app-status-danger/20 w-fit">
                  متأخر
                </span>
              )}
              {isDueSoon && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-app-status-yellow/15 text-app-status-yellow border border-app-status-yellow/25 w-fit">
                  خلال {c.days_to_due} يوم
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "is_certified",
        header: "مصدق",
        meta: { exportValue: (c) => (c.is_certified ? "مصدق" : "عادي") },
        cell: ({ row }) =>
          row.original.is_certified ? (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              مصدق
            </span>
          ) : (
            <span className="text-[11px] text-app-label-tertiary">عادي</span>
          ),
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (c) => c.status_label || STATUS_LABELS[c.status] || c.status },
        cell: ({ row }) => {
          const s = row.original.status;
          const label =
            row.original.status_label || STATUS_LABELS[s] || s;
          let colorCls = "bg-app-accent/10 text-app-accent border-app-accent/20";
          if (s === "cleared")
            colorCls =
              "bg-app-status-positive/10 text-app-status-positive border-app-status-positive/20";
          else if (s === "bounced")
            colorCls =
              "bg-app-status-danger/10 text-app-status-danger border-app-status-danger/20";
          else if (s === "deposited")
            colorCls =
              "bg-app-status-yellow/15 text-app-status-yellow border-app-status-yellow/25";
          else if (s === "returned")
            colorCls = "bg-app-fill-f2 text-app-label-tertiary border-app-separator";

          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${colorCls}`}
            >
              {label}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div
              className="flex items-center justify-end gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {canMutate && c.status === "in_portfolio" && (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenAction(c, "deposit")}
                    className="rounded-lg border border-app-accent/30 bg-app-accent/10 px-2 py-1 text-xs font-bold text-app-accent hover:bg-app-accent/20 transition-colors"
                    title="إيداع الشيك برسم التحصيل بالمصرف"
                  >
                    إيداع
                  </button>
                  {c.is_certified && (
                    <button
                      type="button"
                      onClick={() => handleOpenAction(c, "clear")}
                      className="rounded-lg border border-app-status-positive/30 bg-app-status-positive/10 px-2 py-1 text-xs font-bold text-app-status-positive hover:bg-app-status-positive/20 transition-colors"
                      title="تحصيل مباشر للشيك المصدق إلى الحساب المصرفي"
                    >
                      تحصيل مباشر
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenAction(c, "bounce")}
                    className="rounded-lg border border-app-status-danger/30 bg-app-status-danger/10 px-2 py-1 text-xs font-bold text-app-status-danger hover:bg-app-status-danger/20 transition-colors"
                    title="تسجيل ارتداد الشيك"
                  >
                    ارتجاع
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAction(c, "return")}
                    className="rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 transition-colors"
                    title="إعادة الشيك للساحب"
                  >
                    إعادة للساحب
                  </button>
                </>
              )}

              {canMutate && c.status === "deposited" && (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenAction(c, "clear")}
                    className="rounded-lg border border-app-status-positive/30 bg-app-status-positive/10 px-2 py-1 text-xs font-bold text-app-status-positive hover:bg-app-status-positive/20 transition-colors"
                    title="تحصيل الشيك وإيداعه بالمصرف"
                  >
                    تحصيل
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAction(c, "bounce")}
                    className="rounded-lg border border-app-status-danger/30 bg-app-status-danger/10 px-2 py-1 text-xs font-bold text-app-status-danger hover:bg-app-status-danger/20 transition-colors"
                    title="تسجيل ارتداد الشيك"
                  >
                    ارتجاع
                  </button>
                </>
              )}

              {canMutate && c.status === "bounced" && (
                <button
                  type="button"
                  onClick={() => handleOpenAction(c, "deposit")}
                  className="rounded-lg border border-app-accent/30 bg-app-accent/10 px-2 py-1 text-xs font-bold text-app-accent hover:bg-app-accent/20 transition-colors"
                  title="إعادة إيداع الشيك برسم التحصيل"
                >
                  إعادة إيداع
                </button>
              )}

              <button
                type="button"
                onClick={() => handleOpenDetails(c)}
                className="flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary transition-colors"
                title="عرض تفاصيل الشيك وسجل الحركات"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>تفاصيل</span>
              </button>
            </div>
          );
        },
      },
    ],
    [canMutate],
  );

  const outgoingColumns = useMemo<ColumnDef<Cheque>[]>(
    () => [
      {
        id: "number",
        header: "الرقم",
        accessorKey: "number",
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono font-bold text-app-label-primary">
            {row.original.number}
          </span>
        ),
      },
      {
        id: "cheque_no",
        header: "رقم الشيك",
        accessorKey: "cheque_no",
        cell: ({ row }) => (
          <span className="font-mono text-xs font-semibold text-app-label-primary">
            {row.original.cheque_no}
          </span>
        ),
      },
      {
        id: "bank_drawn",
        header: "المصرف المسحوب عليه",
        meta: { exportValue: (c) => c.deposit_cash_account?.name || c.bank_name },
        cell: ({ row }) => (
          <span className="text-xs text-app-label-primary font-medium">
            {row.original.deposit_cash_account?.name ||
              row.original.bank_name ||
              "—"}
          </span>
        ),
      },
      {
        id: "payee",
        header: "المستفيد",
        meta: { exportValue: (c) => c.supplier?.name || c.payee_name },
        cell: ({ row }) => (
          <span className="text-xs font-semibold text-app-label-primary">
            {row.original.supplier?.name || row.original.payee_name || "—"}
          </span>
        ),
      },
      {
        id: "counter_account",
        header: "الحساب المقابل",
        meta: { exportValue: (c) => (c.counter_account ? `${c.counter_account.code} — ${c.counter_account.name}` : null) },
        cell: ({ row }) => (
          <span className="text-xs text-app-label-secondary font-medium">
            {row.original.counter_account
              ? `${row.original.counter_account.code} — ${row.original.counter_account.name}`
              : "—"}
          </span>
        ),
      },
      {
        id: "amount",
        header: "المبلغ",
        meta: { exportAs: [{ header: "المبلغ", value: (c) => Number(c.amount) }, { header: "العملة", value: (c) => c.currency }], align: "end" },
        cell: ({ row }) => (
          <div className="font-mono text-end text-xs font-bold text-app-label-primary whitespace-nowrap">
            {formatNumber(row.original.amount)} {row.original.currency}
          </div>
        ),
      },
      {
        id: "due_date",
        header: "تاريخ الاستحقاق",
        accessorKey: "due_date",
        cell: ({ row }) => {
          const c = row.original;
          const isOverdue = c.status === "issued" && c.days_to_due < 0;
          const isDueSoon =
            c.status === "issued" && c.days_to_due >= 0 && c.days_to_due <= 7;
          return (
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-xs text-app-label-primary whitespace-nowrap">
                {c.due_date}
              </span>
              {isOverdue && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-app-status-danger/10 text-app-status-danger border border-app-status-danger/20 w-fit">
                  متأخر
                </span>
              )}
              {isDueSoon && (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-app-status-yellow/15 text-app-status-yellow border border-app-status-yellow/25 w-fit">
                  خلال {c.days_to_due} يوم
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (c) => c.status_label || (c.status === "issued" ? "صادر" : c.status === "cleared" ? "محصل" : c.status === "cancelled" ? "ملغى" : c.status) },
        cell: ({ row }) => {
          const s = row.original.status;
          const label =
            row.original.status_label ||
            (s === "issued"
              ? "صادر"
              : s === "cleared"
              ? "محصل"
              : s === "cancelled"
              ? "ملغى"
              : s);
          let colorCls = "bg-app-accent/10 text-app-accent border-app-accent/20";
          if (s === "cleared") {
            colorCls =
              "bg-app-status-positive/10 text-app-status-positive border-app-status-positive/20";
          } else if (s === "cancelled") {
            colorCls =
              "bg-app-status-danger/10 text-app-status-danger border-app-status-danger/20";
          }

          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${colorCls}`}
            >
              {label}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div
              className="flex items-center justify-end gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              {canMutate && c.status === "issued" && (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenAction(c, "clear")}
                    className="rounded-lg border border-app-status-positive/30 bg-app-status-positive/10 px-2 py-1 text-xs font-bold text-app-status-positive hover:bg-app-status-positive/20 transition-colors"
                    title="صرف الشيك من المصرف"
                  >
                    صرف من المصرف
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenAction(c, "cancel")}
                    className="rounded-lg border border-app-status-danger/30 bg-app-status-danger/10 px-2 py-1 text-xs font-bold text-app-status-danger hover:bg-app-status-danger/20 transition-colors"
                    title="إلغاء الشيك وعكس قيد إصداره"
                  >
                    إلغاء
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => handleOpenDetails(c)}
                className="flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary transition-colors"
                title="عرض تفاصيل الشيك وسجل الحركات"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>تفاصيل</span>
              </button>
            </div>
          );
        },
      },
    ],
    [canMutate],
  );

  const columns =
    currentDirection === "outgoing" ? outgoingColumns : incomingColumns;

  const table = useDataTable({
    exportFileName: `cheques-${currentDirection}`,
    columns,
    data: cheques,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (c) => c.id,
  });

  const statusTabs =
    currentDirection === "outgoing"
      ? OUTGOING_STATUS_TABS
      : INCOMING_STATUS_TABS;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Direction Tabs Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-separator/70 pb-3">
        <div className="inline-flex items-center gap-1 rounded-2xl border border-app-separator bg-app-bg-secondary p-1">
          <button
            type="button"
            onClick={() => handleTabChange("incoming")}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              currentDirection === "incoming"
                ? "bg-app-accent text-white shadow-sm"
                : "text-app-label-secondary hover:text-app-label-primary"
            }`}
          >
            <ArrowDownLeft className="h-3.5 w-3.5" />
            <span>الشيكات الواردة</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("outgoing")}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              currentDirection === "outgoing"
                ? "bg-app-accent text-white shadow-sm"
                : "text-app-label-secondary hover:text-app-label-primary"
            }`}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>الشيكات الصادرة</span>
          </button>
        </div>

        {canMutate && (
          <div>
            {currentDirection === "incoming" ? (
              <button
                type="button"
                onClick={() => setReceiveDialogOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                استلام شيك
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIssueDialogOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                إصدار شيك
              </button>
            )}
          </div>
        )}
      </div>

      {/* Header Title and Description */}
      <div>
        <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
          <FileCheck className="h-6 w-6 text-app-accent" />
          {currentDirection === "incoming"
            ? "الشيكات الواردة"
            : "الشيكات الصادرة"}
        </h1>
        <p className="text-xs text-app-label-secondary mt-0.5">
          {currentDirection === "incoming"
            ? "سجل متابعة وتحصيل الشيكات الواردة من العملاء ومراحل تحصيلها المصرفي"
            : "سجل الشيكات الصادرة للموردين والجهات الأخرى ومتابعة صرفها المصرفي أو إلغائها"}
        </p>
      </div>

      {/* Summary Cards Top Section */}
      {currentDirection === "incoming" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* In Portfolio */}
          <div
            onClick={() => {
              setStatusFilter("in_portfolio");
              setPage(1);
            }}
            className={`cursor-pointer rounded-2xl border p-3 transition-colors ${
              statusFilter === "in_portfolio"
                ? "border-app-accent bg-app-accent/10"
                : "border-app-separator bg-app-bg-secondary hover:border-app-accent/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-app-label-secondary">
              <span className="font-semibold">في الحافظة</span>
              <Wallet className="h-4 w-4 text-app-accent" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-label-primary">
                {summary?.by_status?.in_portfolio?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-label-secondary whitespace-nowrap">
                {formatNumber(summary?.by_status?.in_portfolio?.total ?? 0)} د.ل
              </span>
            </div>
          </div>

          {/* Deposited */}
          <div
            onClick={() => {
              setStatusFilter("deposited");
              setPage(1);
            }}
            className={`cursor-pointer rounded-2xl border p-3 transition-colors ${
              statusFilter === "deposited"
                ? "border-app-status-yellow bg-app-status-yellow/10"
                : "border-app-separator bg-app-bg-secondary hover:border-app-status-yellow/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-app-label-secondary">
              <span className="font-semibold">برسم التحصيل</span>
              <Landmark className="h-4 w-4 text-app-status-yellow" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-label-primary">
                {summary?.by_status?.deposited?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-label-secondary whitespace-nowrap">
                {formatNumber(summary?.by_status?.deposited?.total ?? 0)} د.ل
              </span>
            </div>
          </div>

          {/* Due within 7 days */}
          <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-3">
            <div className="flex items-center justify-between text-xs text-app-label-secondary">
              <span className="font-semibold">مستحقة خلال 7 أيام</span>
              <CalendarClock className="h-4 w-4 text-app-status-orange" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-label-primary">
                {summary?.due_within_7_days?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-label-secondary whitespace-nowrap">
                {formatNumber(summary?.due_within_7_days?.total ?? 0)} د.ل
              </span>
            </div>
          </div>

          {/* Overdue */}
          <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/5 p-3">
            <div className="flex items-center justify-between text-xs text-app-status-danger">
              <span className="font-semibold">متأخرة</span>
              <AlertTriangle className="h-4 w-4 text-app-status-danger" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-status-danger">
                {summary?.overdue?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-status-danger whitespace-nowrap">
                {formatNumber(summary?.overdue?.total ?? 0)} د.ل
              </span>
            </div>
          </div>

          {/* Bounced */}
          <div
            onClick={() => {
              setStatusFilter("bounced");
              setPage(1);
            }}
            className={`cursor-pointer rounded-2xl border p-3 transition-colors ${
              statusFilter === "bounced"
                ? "border-app-status-danger bg-app-status-danger/10"
                : "border-app-separator bg-app-bg-secondary hover:border-app-status-danger/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-app-label-secondary">
              <span className="font-semibold">مرتجعة</span>
              <Ban className="h-4 w-4 text-app-status-danger" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-label-primary">
                {summary?.by_status?.bounced?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-label-secondary whitespace-nowrap">
                {formatNumber(summary?.by_status?.bounced?.total ?? 0)} د.ل
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Issued (Not Cleared) */}
          <div
            onClick={() => {
              setStatusFilter("issued");
              setPage(1);
            }}
            className={`cursor-pointer rounded-2xl border p-3 transition-colors ${
              statusFilter === "issued"
                ? "border-app-accent bg-app-accent/10"
                : "border-app-separator bg-app-bg-secondary hover:border-app-accent/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-app-label-secondary">
              <span className="font-semibold">صادرة غير مصروفة</span>
              <Wallet className="h-4 w-4 text-app-accent" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-label-primary">
                {summary?.by_status?.issued?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-label-secondary whitespace-nowrap">
                {formatNumber(summary?.by_status?.issued?.total ?? 0)} د.ل
              </span>
            </div>
          </div>

          {/* Due within 7 days */}
          <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-3">
            <div className="flex items-center justify-between text-xs text-app-label-secondary">
              <span className="font-semibold">مستحقة خلال 7 أيام</span>
              <CalendarClock className="h-4 w-4 text-app-status-orange" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-label-primary">
                {summary?.due_within_7_days?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-label-secondary whitespace-nowrap">
                {formatNumber(summary?.due_within_7_days?.total ?? 0)} د.ل
              </span>
            </div>
          </div>

          {/* Overdue */}
          <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/5 p-3">
            <div className="flex items-center justify-between text-xs text-app-status-danger">
              <span className="font-semibold">متأخرة</span>
              <AlertTriangle className="h-4 w-4 text-app-status-danger" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-status-danger">
                {summary?.overdue?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-status-danger whitespace-nowrap">
                {formatNumber(summary?.overdue?.total ?? 0)} د.ل
              </span>
            </div>
          </div>

          {/* Cleared / Paid */}
          <div
            onClick={() => {
              setStatusFilter("cleared");
              setPage(1);
            }}
            className={`cursor-pointer rounded-2xl border p-3 transition-colors ${
              statusFilter === "cleared"
                ? "border-app-status-positive bg-app-status-positive/10"
                : "border-app-separator bg-app-bg-secondary hover:border-app-status-positive/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-app-label-secondary">
              <span className="font-semibold">مصروفة</span>
              <CheckCircle2 className="h-4 w-4 text-app-status-positive" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-label-primary">
                {summary?.by_status?.cleared?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-label-secondary whitespace-nowrap">
                {formatNumber(summary?.by_status?.cleared?.total ?? 0)} د.ل
              </span>
            </div>
          </div>

          {/* Cancelled */}
          <div
            onClick={() => {
              setStatusFilter("cancelled");
              setPage(1);
            }}
            className={`cursor-pointer rounded-2xl border p-3 transition-colors ${
              statusFilter === "cancelled"
                ? "border-app-status-danger bg-app-status-danger/10"
                : "border-app-separator bg-app-bg-secondary hover:border-app-status-danger/50"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-app-label-secondary">
              <span className="font-semibold">ملغاة</span>
              <Ban className="h-4 w-4 text-app-status-danger" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-app-label-primary">
                {summary?.by_status?.cancelled?.count ?? 0}
              </span>
              <span className="text-xs font-mono font-semibold text-app-label-secondary whitespace-nowrap">
                {formatNumber(summary?.by_status?.cancelled?.total ?? 0)} د.ل
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[13rem]">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-app-label-secondary" />
            <input
              type="text"
              placeholder={
                currentDirection === "outgoing"
                  ? "ابحث برقم الشيك، المصرف، المستفيد…"
                  : "ابحث برقم الشيك، المصرف، الساحب، العميل…"
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full ps-9 pe-3 py-1.5 border border-app-separator rounded-xl bg-app-bg-primary text-xs focus:border-app-accent focus:outline-none"
            />
          </div>

          {/* Entity Searchable Select (Clients for incoming, Suppliers for outgoing) */}
          {currentDirection === "incoming" ? (
            <div className="min-w-[14rem]">
              <SearchableSelect<Client>
                options={clients}
                value={selectedClient}
                onChange={(c) => {
                  setSelectedClientId(c ? c.id : "");
                  setPage(1);
                }}
                getOptionId={(c) => c.id}
                getOptionLabel={(c) => c.entity?.name ?? c.id}
                getOptionSubLabel={(c) =>
                  c.entity?.primary_contact?.phone ?? undefined
                }
                getOptionSearchText={(c) =>
                  `${c.entity?.name ?? ""} ${c.entity?.primary_contact?.phone ?? ""}`
                }
                placeholder="كل العملاء…"
                clearable
                size="sm"
              />
            </div>
          ) : (
            <div className="min-w-[14rem]">
              <SearchableSelect<Supplier>
                options={suppliers}
                value={selectedSupplier}
                onChange={(s) => {
                  setSelectedSupplierId(s ? s.id : "");
                  setPage(1);
                }}
                getOptionId={(s) => s.id}
                getOptionLabel={(s) => s.name}
                getOptionSubLabel={(s) =>
                  s.account
                    ? `${s.account.account_code} — ${s.account.name}`
                    : undefined
                }
                getOptionSearchText={(s) =>
                  `${s.name} ${s.account?.account_code ?? ""}`
                }
                placeholder="كل الموردين…"
                clearable
                size="sm"
              />
            </div>
          )}

          {/* Due Date Range: from & to */}
          <div className="flex items-center gap-1.5 text-xs text-app-label-secondary">
            <span>الاستحقاق من:</span>
            <input
              type="date"
              value={dueFrom}
              onChange={(e) => {
                setDueFrom(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-app-separator bg-app-bg-primary px-2.5 py-1 text-xs font-mono focus:border-app-accent focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-app-label-secondary">
            <span>إلى:</span>
            <input
              type="date"
              value={dueTo}
              onChange={(e) => {
                setDueTo(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-app-separator bg-app-bg-primary px-2.5 py-1 text-xs font-mono focus:border-app-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Status Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-app-separator/60 text-xs">
          <span className="text-app-label-secondary font-semibold ms-1">
            الحالة:
          </span>
          {statusTabs.map((tab) => (
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
          emptyMessage="لا توجد شيكات مطابقة لمعايير البحث."
          emptyIcon={FileCheck}
          onRowClick={(row: Cheque) => handleOpenDetails(row)}
        />
      </DataTable>

      {/* Server-side Pagination Controls */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between text-xs px-2">
          <span className="text-app-label-secondary font-mono">
            إجمالي الشيكات: {totalRecords}
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

      {/* Receive Cheque Dialog (Incoming) */}
      <ChequeReceiveDialog
        open={receiveDialogOpen}
        onClose={() => setReceiveDialogOpen(false)}
        onSuccess={(newCheque) => {
          handleOpenDetails(newCheque);
        }}
      />

      {/* Issue Cheque Dialog (Outgoing) */}
      <ChequeIssueDialog
        open={issueDialogOpen}
        onClose={() => setIssueDialogOpen(false)}
        onSuccess={(newCheque) => {
          handleOpenDetails(newCheque);
        }}
      />

      {/* Action Dialog (Deposit, Clear, Bounce, Return, Cancel) */}
      <ChequeActionDialog
        open={actionDialogOpen}
        onClose={() => {
          setActionDialogOpen(false);
          setActionCheque(null);
          setActionType(null);
        }}
        cheque={actionCheque}
        action={actionType}
        onSuccess={(updated) => {
          if (detailsChequeId === updated.id) {
            // Details dialog handles refetch via query invalidation
          }
        }}
      />

      {/* Cheque Details Dialog */}
      <ChequeDetailsDialog
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsChequeId(null);
        }}
        chequeId={detailsChequeId}
        onTriggerAction={(cheque, action) => {
          setDetailsOpen(false);
          handleOpenAction(cheque, action);
        }}
      />
    </div>
  );
};
