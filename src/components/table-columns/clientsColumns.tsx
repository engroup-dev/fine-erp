import { useMemo } from "react";
import { Building2, FileText, MapPin, Pencil, Phone } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { Client } from "../../types/entities";
import { formatNumber } from "../../lib/utils/format";

export interface UseClientsColumnsArgs {
  onEdit?: (client: Client) => void;
  onViewStatement?: (client: Client) => void;
}

export function useClientsColumns({ onEdit, onViewStatement }: UseClientsColumnsArgs = {}): ColumnDef<Client, unknown>[] {
  return useMemo<ColumnDef<Client, unknown>[]>(
    () => [
      {
        id: "name",
        header: "اسم العميل / الكيان",
        accessorFn: (c) => c.entity?.name ?? "",
        meta: { className: "font-semibold" },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-app-label-primary font-bold">
              {row.original.entity?.name || "بدون اسم"}
            </span>
            <div className="flex items-center gap-2 text-[10px] text-app-label-secondary flex-wrap">
              {row.original.entity?.phone && (
                <span className="inline-flex items-center gap-0.5 text-app-label-primary font-mono font-medium" dir="ltr">
                  <Phone className="w-2.5 h-2.5 shrink-0 text-app-accent" />
                  {row.original.entity.phone}
                </span>
              )}
              {row.original.entity?.city && (
                <span className="inline-flex items-center gap-0.5 text-app-accent font-medium">
                  <MapPin className="w-2.5 h-2.5 shrink-0" />
                  {row.original.entity.city}
                </span>
              )}
              <span>
                {row.original.entity?.tax_number ? `ضريبي: ${row.original.entity.tax_number}` : "بدون رقم ضريبي"}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: "operating_unit",
        header: "الوحدة التشغيلية",
        accessorFn: (c) => c.operating_unit?.name ?? "",
        enableSorting: true,
        meta: { className: "text-app-label-secondary" },
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-[11px] text-app-label-secondary">
            <Building2 className="h-3 w-3 shrink-0" />
            <span>{row.original.operating_unit?.name ?? "—"}</span>
          </div>
        ),
      },
      {
        id: "client_group",
        header: "المجموعة",
        accessorFn: (c) => c.client_group?.name ?? "",
        enableSorting: true,
        cell: ({ row }) => {
          const group = row.original.client_group;
          if (!group) return <span className="text-[11px] text-app-label-secondary">—</span>;
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                group.default_price_tier === "wholesale"
                  ? "bg-app-accent/15 text-app-accent"
                  : "bg-app-fill-f1 text-app-label-secondary"
              }`}
              title={group.code}
            >
              {group.name}
            </span>
          );
        },
      },
      {
        id: "credit_limit",
        header: "الحد الائتماني (LYD)",
        accessorFn: (c) => Number(c.credit_limit || 0),
        meta: { className: "font-mono" },
        cell: ({ row }) => `${formatNumber(Number(row.original.credit_limit || 0))} د.ل`,
      },
      {
        id: "current_balance",
        header: "الرصيد المستحق (LYD)",
        accessorFn: (c) => Number(c.current_balance || 0),
        meta: { className: "font-mono font-bold" },
        cell: ({ row }) => {
          const creditLimit = Number(row.original.credit_limit || 0);
          const currentBalance = Number(row.original.current_balance || 0);
          const isOverLimit = currentBalance > creditLimit;
          return (
            <span className={currentBalance > 0 ? (isOverLimit ? "text-app-status-danger" : "text-app-label-primary") : "text-app-label-secondary"}>
              {formatNumber(currentBalance)} د.ل
            </span>
          );
        },
      },
      {
        id: "headroom",
        header: "المتبقي من الائتمان",
        enableSorting: false,
        meta: { exportValue: (c) => Number(c.credit_limit || 0) - Number(c.current_balance || 0), className: "font-mono" },
        cell: ({ row }) => {
          const creditLimit = Number(row.original.credit_limit || 0);
          const currentBalance = Number(row.original.current_balance || 0);
          const headroom = creditLimit - currentBalance;
          const isOverLimit = currentBalance > creditLimit;
          const isNearLimit = !isOverLimit && headroom <= creditLimit * 0.15;

          return isOverLimit ? (
            <span className="inline-flex items-center rounded-full bg-app-status-danger/15 px-2 py-0.5 text-[10px] font-bold text-app-status-danger">
              تجاوز {formatNumber(Math.abs(headroom))} د.ل
            </span>
          ) : isNearLimit ? (
            <span className="inline-flex items-center rounded-full bg-app-status-warning/15 px-2 py-0.5 text-[10px] font-bold text-app-status-warning">
              {formatNumber(headroom)} د.ل (متبقي)
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-app-status-positive/15 px-2 py-0.5 text-[10px] font-bold text-app-status-positive">
              {formatNumber(headroom)} د.ل (متبقي)
            </span>
          );
        },
      },
      {
        accessorKey: "payment_terms_days",
        header: "فترة السداد الآجل",
        meta: { className: "font-semibold text-app-label-secondary" },
        cell: ({ row }) => `${row.original.payment_terms_days} يوم`,
      },
      {
        id: "account",
        header: "حساب الأستاذ (COA)",
        meta: { exportValue: (c) => (c.account ? `${c.account.account_code} - ${c.account.name}` : null) },
        cell: ({ row }) => {
          const acc = row.original.account;
          if (acc) {
            return (
              <span className="inline-flex items-center gap-1 rounded-md bg-app-accent/10 px-2 py-0.5 text-[11px] font-mono font-medium text-app-accent">
                {acc.account_code} - {acc.name}
              </span>
            );
          }
          return <span className="text-[11px] text-app-label-secondary">—</span>;
        },
      },
      {
        accessorKey: "status",
        header: "الحالة",
        meta: { exportValue: (c) => (c.status === "active" ? "نشط" : c.status === "suspended" ? "موقوف" : c.status === "blacklisted" ? "محظور" : c.status) },
        cell: ({ row }) => (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              row.original.status === "active"
                ? "bg-app-status-positive/15 text-app-status-positive"
                : row.original.status === "suspended"
                ? "bg-app-status-warning/15 text-app-status-warning"
                : "bg-app-status-danger/15 text-app-status-danger"
            }`}
          >
            {row.original.status === "active"
              ? "نشط"
              : row.original.status === "suspended"
              ? "موقوف"
              : row.original.status === "blacklisted"
              ? "محظور"
              : row.original.status}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const client = row.original;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewStatement?.(client);
                }}
                className="flex items-center gap-1 rounded-lg border border-app-separator px-2.5 py-1 text-xs font-semibold text-app-label-primary hover:border-app-accent hover:text-app-accent hover:bg-app-accent-subtle transition-colors"
                title="عرض كشف حساب العميل"
              >
                <FileText className="w-3.5 h-3.5 text-app-accent" />
                <span>كشف حساب</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(client);
                }}
                className="flex items-center gap-1 rounded-lg border border-app-separator px-2.5 py-1 text-xs font-semibold text-app-label-secondary hover:border-app-accent hover:text-app-accent hover:bg-app-accent-subtle transition-colors"
                title="تعديل بيانات العميل"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>تعديل</span>
              </button>
            </div>
          );
        },
      },
    ],
    [onEdit, onViewStatement]
  );
}
