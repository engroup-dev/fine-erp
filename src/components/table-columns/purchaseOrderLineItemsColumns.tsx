import { useMemo } from "react";
import { ColumnDef } from "../ui/DataTable";
import { formatNumber } from "../../lib/utils/format";
import { PurchaseOrderItem } from "../../types/procurement";

export function usePurchaseOrderLineItemsColumns(): ColumnDef<PurchaseOrderItem, unknown>[] {
  return useMemo<ColumnDef<PurchaseOrderItem, unknown>[]>(
    () => [
      {
        id: "item",
        header: "الصنف",
        cell: ({ row }) => row.original.inventory_item?.name ?? "—",
        meta: { exportValue: (r) => r.inventory_item?.name, className: "font-semibold" },
      },
      {
        id: "code",
        header: "كود الصنف",
        cell: ({ row }) => row.original.inventory_item?.code ?? "—",
        meta: { exportValue: (r) => r.inventory_item?.code, className: "font-mono text-app-label-secondary" },
      },
      {
        id: "quantity",
        header: "الكمية",
        cell: ({ row }) => {
          const qty = Number(row.original.quantity);
          const received =
            row.original.received_quantity !== null && row.original.received_quantity !== undefined
              ? Number(row.original.received_quantity)
              : null;
          const uom = row.original.inventory_item?.unit_of_measure ?? "";
          return (
            <div className="flex flex-col items-end">
              <span>
                {formatNumber(qty)} <span className="text-[10px] text-app-label-tertiary">{uom}</span>
              </span>
              {received !== null && (
                <span className="text-[10px] text-app-label-secondary">
                  مستلم: {formatNumber(received)}
                </span>
              )}
            </div>
          );
        },
        meta: { exportValue: (r) => r.quantity, align: "end", className: "font-mono" },
      },
      {
        id: "unit_price",
        header: "سعر الوحدة",
        cell: ({ row }) => `${formatNumber(Number(row.original.unit_price))} ${row.original.currency}`,
        meta: { exportValue: (r) => Number(r.unit_price), align: "end", className: "font-mono" },
      },
      {
        id: "line_total",
        header: "الإجمالي",
        cell: ({ row }) => `${formatNumber(Number(row.original.line_total))} ${row.original.currency}`,
        meta: { exportAs: [{ header: "الإجمالي", value: (r) => Number(r.line_total) }, { header: "العملة", value: (r) => r.currency }], align: "end", className: "font-mono font-bold text-app-accent" },
      },
    ],
    []
  );
}
