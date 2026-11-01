import React, { useEffect, useMemo, useState } from "react";
import { FileText, Printer, ShoppingCart, X } from "lucide-react";
import { useCancelQuotation, useQuotations } from "../../hooks/useSales";
import { QUOTATION_STATUS_LABEL, Quotation, quotationsApi } from "../../api/endpoints/sales";
import { DataTable, useDataTable, type ColumnDef } from "../../components/ui/DataTable";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { QuotationPrintDialog } from "../../components/print/SalesDocuments";
import { formatDate, formatNumber } from "../../lib/utils/format";
import { toast } from "../../stores/toastStore";

const STATUS_TABS = ["", "open", "converted", "expired", "cancelled"] as const;

interface QuotationsPageProps {
  onOpenInPos: (quotation: Quotation) => void;
}

/** Saved priced previews — print, reopen in the POS to sell, or cancel. */
export const QuotationsPage: React.FC<QuotationsPageProps> = ({ onOpenInPos }) => {
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const [printId, setPrintId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Quotation | null>(null);

  const { data, isLoading } = useQuotations({ status: status || undefined, page });
  // A cancel can empty the last page; step back so the user is not stranded on it.
  useEffect(() => {
    if (data && page > Math.max(1, data.last_page)) setPage(Math.max(1, data.last_page));
  }, [data, page]);
  const cancelQuotation = useCancelQuotation();
  const quotations = useMemo(() => data?.data ?? [], [data]);

  const columns = useMemo<ColumnDef<Quotation>[]>(
    () => [
      {
        accessorKey: "quotation_number",
        header: "الرقم",
        meta: { className: "font-mono font-bold text-app-accent" },
      },
      {
        id: "client",
        header: "العميل",
        meta: { exportValue: (q) => q.client?.entity?.name ?? null },
        cell: ({ row }) => row.original.client?.entity?.name ?? "—",
      },
      {
        accessorKey: "valid_until",
        header: "صالح حتى",
        meta: { align: "center", className: "font-mono" },
        cell: ({ row }) => formatDate(row.original.valid_until),
      },
      {
        accessorKey: "total_amount",
        header: "الإجمالي",
        meta: { align: "end", className: "font-mono font-bold", exportValue: (q) => Number(q.total_amount) },
        cell: ({ row }) => formatNumber(row.original.total_amount),
      },
      {
        id: "status",
        header: "الحالة",
        meta: { align: "center", exportValue: (q) => QUOTATION_STATUS_LABEL[q.effective_status] },
        cell: ({ row }) => (
          <StatusBadge status={row.original.effective_status} label={QUOTATION_STATUS_LABEL[row.original.effective_status]} />
        ),
      },
      {
        id: "actions",
        header: "",
        size: 160,
        meta: { export: false },
        cell: ({ row }) => {
          const q = row.original;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <button
                onClick={() => setPrintId(q.id)}
                title="طباعة"
                className="rounded-lg p-1.5 text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary"
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
              {q.effective_status === "open" && (
                <>
                  <button
                    onClick={() => onOpenInPos(q)}
                    className="flex items-center gap-1 rounded-lg bg-app-accent px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-90"
                  >
                    <ShoppingCart className="h-3 w-3" /> بيع الآن
                  </button>
                  <button
                    onClick={() => setCancelTarget(q)}
                    title="إلغاء"
                    className="rounded-lg p-1.5 text-app-label-tertiary hover:bg-app-status-danger/10 hover:text-app-status-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {q.converted_sale && (
                <span className="text-[10px] font-mono text-app-label-tertiary">→ {q.converted_sale.order_number}</span>
              )}
            </div>
          );
        },
      },
    ],
    [onOpenInPos],
  );

  const table = useDataTable({
    exportFileName: "quotations",
    columns,
    data: quotations,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (q) => q.id,
    // W6-04: every quotation the status tab matches, not just the loaded page.
    fetchAllRowsForExport: async () =>
      (await quotationsApi.list({ status: status || undefined, all: 1 })).data.data,
  });

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s || "all"}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              status === s ? "bg-app-accent text-white" : "bg-app-fill-f1 text-app-label-secondary hover:bg-app-fill-f2"
            }`}
          >
            {s ? QUOTATION_STATUS_LABEL[s as keyof typeof QUOTATION_STATUS_LABEL] : "الكل"}
          </button>
        ))}
      </div>

      <DataTable table={table}>
        <DataTable.Content isLoading={isLoading} emptyMessage="لا توجد عروض أسعار." emptyIcon={FileText} />
      </DataTable>

      {data && data.last_page > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-app-separator px-3 py-1.5 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-app-label-secondary">{page} / {data.last_page}</span>
          <button
            onClick={() => setPage((p) => Math.min(data.last_page, p + 1))}
            disabled={page >= data.last_page}
            className="rounded-lg border border-app-separator px-3 py-1.5 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}

      <QuotationPrintDialog quotationId={printId} onClose={() => setPrintId(null)} />
      <ConfirmDialog
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (!cancelTarget) return;
          cancelQuotation.mutate(cancelTarget.id, { onSuccess: () => toast.success("تم إلغاء عرض السعر") });
          setCancelTarget(null);
        }}
        title="إلغاء عرض السعر"
        message={`هل تريد إلغاء عرض السعر ${cancelTarget?.quotation_number ?? ""}؟`}
        variant="danger"
      />
    </div>
  );
};
