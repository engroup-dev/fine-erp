import { useMemo } from "react";
import { Building2, FileText, Landmark, ShoppingCart, Truck, UserRound, Wallet } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { StatusBadge } from "../ui/StatusBadge";
import {
  FULFILLMENT_LABEL,
  PAYMENT_METHOD_LABEL,
  Sale,
  SALE_STATUS_LABEL,
} from "../../api/endpoints/sales";
import { formatNumber, formatDateTime } from "../../lib/utils/format";

const PAYMENT_ICON = { cash: Wallet, bank: Landmark, receivable: FileText } as const;

export interface UseSalesColumnsArgs {
  onOpen: (sale: Sale) => void;
}

export function useSalesColumns({ onOpen }: UseSalesColumnsArgs): ColumnDef<Sale, unknown>[] {
  return useMemo<ColumnDef<Sale, unknown>[]>(
    () => [
      {
        accessorKey: "order_number",
        header: "البيع",
        meta: { className: "font-mono font-bold text-app-accent" },
        cell: ({ row }) => (
          <div>
            {row.original.order_number}
            <div className="text-[10px] font-normal text-app-label-tertiary">
              {formatDateTime(row.original.created_at)}
            </div>
          </div>
        ),
      },
      {
        id: "buyer",
        header: "المشتري",
        meta: { exportValue: (o) => (o.buyer_type === "internal_unit" ? o.buyer_unit?.name ?? "وحدة داخلية" : o.buyer_type === "walk_in" ? o.walk_in_name?.trim() || "زبون عام" : o.client?.entity?.name ?? "عميل") },
        enableSorting: false,
        cell: ({ row }) => {
          const o = row.original;
          if (o.buyer_type === "internal_unit") {
            return (
              <span className="inline-flex items-center gap-1 text-app-label-secondary">
                <Building2 className="w-3.5 h-3.5" /> {o.buyer_unit?.name ?? "وحدة داخلية"}
              </span>
            );
          }
          if (o.buyer_type === "walk_in") {
            return (
              <span className="inline-flex items-center gap-1 text-app-label-secondary">
                <UserRound className="w-3.5 h-3.5" /> {o.walk_in_name?.trim() || "زبون عام"}
              </span>
            );
          }
          return (
            <span className="inline-flex items-center gap-1">
              <UserRound className="w-3.5 h-3.5" /> {o.client?.entity?.name ?? "عميل"}
            </span>
          );
        },
      },
      {
        id: "payment",
        header: "الدفع",
        meta: { exportValue: (o) => (o.payment_method && o.payment_method in PAYMENT_ICON ? PAYMENT_METHOD_LABEL[o.payment_method as keyof typeof PAYMENT_METHOD_LABEL] ?? o.payment_method : "بالتكلفة") },
        enableSorting: false,
        cell: ({ row }) => {
          const method = row.original.payment_method;
          if (!method || !(method in PAYMENT_ICON)) {
            return <span className="text-app-label-tertiary">بالتكلفة</span>;
          }
          const Icon = PAYMENT_ICON[method as keyof typeof PAYMENT_ICON];
          return (
            <span className="inline-flex items-center gap-1 text-app-label-secondary">
              <Icon className="w-3.5 h-3.5" /> {PAYMENT_METHOD_LABEL[method as keyof typeof PAYMENT_METHOD_LABEL] ?? method}
            </span>
          );
        },
      },
      {
        accessorKey: "total_amount",
        header: "الإجمالي",
        meta: { className: "font-mono" },
        cell: ({ row }) => formatNumber(row.original.total_amount),
      },
      {
        id: "outstanding",
        header: "المتبقي",
        meta: { exportValue: (o) => { const v = Number(o.total_amount) - Number(o.returned_amount || 0) - Number(o.amount_paid); return v > 0.001 ? Math.round(v * 100) / 100 : null; }, className: "font-mono text-app-label-secondary" },
        cell: ({ row }) => {
          // Returns lower what is owed: total − returned − paid, as on the sale page and the backend.
          const outstanding =
            Number(row.original.total_amount) - Number(row.original.returned_amount || 0) - Number(row.original.amount_paid);
          return outstanding > 0.001 ? formatNumber(outstanding) : "—";
        },
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (o) => SALE_STATUS_LABEL[o.status] ?? o.status },
        enableSorting: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} label={SALE_STATUS_LABEL[row.original.status]} />,
      },
      {
        id: "fulfillment",
        header: "التجهيز",
        meta: { exportValue: (o) => (o.fulfillment_status ? FULFILLMENT_LABEL[o.fulfillment_status] : null) },
        enableSorting: false,
        cell: ({ row }) => {
          const status = row.original.fulfillment_status;
          if (!status) return <span className="text-app-label-tertiary">—</span>;
          return (
            <span className="inline-flex items-center gap-1 text-[11px] text-app-label-secondary">
              <Truck className="w-3.5 h-3.5" /> {FULFILLMENT_LABEL[status]}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => (
          <button
            onClick={() => onOpen(row.original)}
            className="inline-flex items-center gap-1 rounded-xl bg-app-accent px-2.5 py-1 text-xs font-bold text-white hover:opacity-90"
          >
            <ShoppingCart className="h-3 w-3" />
            فتح
          </button>
        ),
      },
    ],
    [onOpen],
  );
}
