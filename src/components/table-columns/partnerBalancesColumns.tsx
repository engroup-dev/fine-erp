import { useMemo } from "react";
import { Building2, FileText, Phone, MapPin } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { PartnerBalanceRow } from "../../api/endpoints/partnerReports";
import { formatNumber } from "../../lib/utils/format";

export interface UsePartnerBalancesColumnsArgs {
  partyType: "clients" | "suppliers";
  onViewStatement: (row: PartnerBalanceRow) => void;
}

export function usePartnerBalancesColumns({
  partyType,
  onViewStatement,
}: UsePartnerBalancesColumnsArgs): ColumnDef<PartnerBalanceRow, unknown>[] {
  const isClient = partyType === "clients";

  return useMemo<ColumnDef<PartnerBalanceRow, unknown>[]>(
    () => [
      {
        id: "name",
        header: isClient ? "اسم العميل" : "اسم المورد",
        accessorFn: (r) => r.name,
        meta: { className: "font-semibold" },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col">
              <span className="text-app-label-primary font-bold">{r.name}</span>
              <div className="flex items-center gap-2 text-[10px] text-app-label-secondary flex-wrap">
                {(r.phone || r.contact) && (
                  <span className="inline-flex items-center gap-0.5 text-app-label-primary font-mono font-medium" dir="ltr">
                    <Phone className="w-2.5 h-2.5 shrink-0 text-app-accent" />
                    {r.phone || r.contact}
                  </span>
                )}
                {r.city && (
                  <span className="inline-flex items-center gap-0.5 text-app-accent font-medium">
                    <MapPin className="w-2.5 h-2.5 shrink-0" />
                    {r.city}
                  </span>
                )}
                {r.credit_limit !== undefined && r.credit_limit > 0 && (
                  <span className="text-app-label-tertiary">
                    حد ائتماني: {formatNumber(r.credit_limit)}
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "operating_unit",
        header: "الوحدة التشغيلية",
        accessorFn: (r) => r.operating_unit_name,
        enableSorting: true,
        meta: { className: "text-app-label-secondary" },
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-[11px] text-app-label-secondary">
            <Building2 className="h-3 w-3 shrink-0" />
            <span>{row.original.operating_unit_name || "—"}</span>
          </div>
        ),
      },
      {
        id: "total_billed",
        header: isClient ? "إجمالي الفواتير (د.ل)" : "إجمالي المشتريات",
        accessorFn: (r) => isClient ? (r.total_debit ?? 0) : (r.total_purchases ?? 0),
        enableSorting: true,
        meta: { align: "end" },
        cell: ({ row }) => {
          const val = isClient ? (row.original.total_debit ?? 0) : (row.original.total_purchases ?? 0);
          return <span className="font-mono text-xs">{formatNumber(val)}</span>;
        },
      },
      {
        id: "total_paid",
        header: isClient ? "إجمالي المسدد (د.ل)" : "إجمالي المدفوع",
        accessorFn: (r) => isClient ? (r.total_credit ?? 0) : (r.total_payments ?? 0),
        enableSorting: true,
        meta: { align: "end" },
        cell: ({ row }) => {
          const val = isClient ? (row.original.total_credit ?? 0) : (row.original.total_payments ?? 0);
          return <span className="font-mono text-xs text-app-status-positive">{formatNumber(val)}</span>;
        },
      },
      {
        id: "net_balance",
        header: "صافي الرصيد المستحق",
        accessorFn: (r) => r.net_balance,
        enableSorting: true,
        meta: { align: "end" },
        cell: ({ row }) => {
          const r = row.original;
          const isSettled = Math.abs(r.net_balance) < 0.0001;

          let badgeText = "مسدد";
          let badgeStyle = "bg-app-status-positive/15 text-app-status-positive";

          if (!isSettled) {
            if (isClient) {
              if (r.net_balance > 0) {
                badgeText = "مدين (عليه)";
                badgeStyle = "bg-app-status-danger/15 text-app-status-danger";
              } else {
                badgeText = "دائن (له)";
                badgeStyle = "bg-app-status-info/15 text-app-status-info";
              }
            } else {
              if (r.net_balance > 0) {
                badgeText = "دائن (له)";
                badgeStyle = "bg-app-status-danger/15 text-app-status-danger";
              } else {
                badgeText = "مدين (دفعة مقدمة)";
                badgeStyle = "bg-app-status-info/15 text-app-status-info";
              }
            }
          }

          return (
            <div className="flex flex-col items-end gap-0.5">
              <span className="font-mono font-bold text-xs text-app-label-primary">
                {formatNumber(r.net_balance)}
              </span>
              <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${badgeStyle}`}>
                {badgeText}
              </span>
            </div>
          );
        },
      },
      {
        id: "aging_current",
        header: "جاري (0-30)",
        accessorFn: (r) => r.aging?.current ?? 0,
        enableSorting: true,
        meta: { align: "end" },
        cell: ({ row }) => {
          const val = row.original.aging?.current ?? 0;
          return <span className="font-mono text-[11px] text-app-label-secondary">{val > 0 ? formatNumber(val) : "—"}</span>;
        },
      },
      {
        id: "aging_31_60",
        header: "31-60 يوم",
        accessorFn: (r) => r.aging?.days_31_60 ?? 0,
        enableSorting: true,
        meta: { align: "end" },
        cell: ({ row }) => {
          const val = row.original.aging?.days_31_60 ?? 0;
          return <span className="font-mono text-[11px] text-app-status-warning">{val > 0 ? formatNumber(val) : "—"}</span>;
        },
      },
      {
        id: "aging_61_90",
        header: "61-90 يوم",
        accessorFn: (r) => r.aging?.days_61_90 ?? 0,
        enableSorting: true,
        meta: { align: "end" },
        cell: ({ row }) => {
          const val = row.original.aging?.days_61_90 ?? 0;
          return <span className="font-mono text-[11px] text-app-status-danger">{val > 0 ? formatNumber(val) : "—"}</span>;
        },
      },
      {
        id: "aging_over_90",
        header: "+90 يوم (متأخر)",
        accessorFn: (r) => r.aging?.over_90 ?? 0,
        enableSorting: true,
        meta: { align: "end" },
        cell: ({ row }) => {
          const val = row.original.aging?.over_90 ?? 0;
          return <span className="font-mono text-[11px] font-bold text-app-status-danger">{val > 0 ? formatNumber(val) : "—"}</span>;
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewStatement(row.original);
            }}
            className="flex items-center gap-1 rounded-lg border border-app-separator px-2.5 py-1 text-xs font-semibold text-app-label-primary hover:border-app-accent hover:text-app-accent hover:bg-app-accent-subtle transition-colors"
            title="عرض كشف الحساب التفصيلي"
          >
            <FileText className="w-3.5 h-3.5 text-app-accent" />
            <span>كشف حساب</span>
          </button>
        ),
      },
    ],
    [isClient, onViewStatement]
  );
}
