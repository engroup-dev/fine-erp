import { useMemo } from "react";
import { Building, Building2, FileText, GitMerge, MapPin, Pencil } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { Supplier } from "../../types/procurement";

export interface UseSuppliersColumnsArgs {
  onEdit?: (supplier: Supplier) => void;
  onViewStatement?: (supplier: Supplier) => void;
  /** W5-07: merge this supplier into another of its unit. */
  onMerge?: (supplier: Supplier) => void;
}

export function useSuppliersColumns({ onEdit, onViewStatement, onMerge }: UseSuppliersColumnsArgs = {}): ColumnDef<Supplier, unknown>[] {
  return useMemo<ColumnDef<Supplier, unknown>[]>(
    () => [
      {
        id: "name",
        header: "اسم المورد",
        accessorKey: "name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Building className="h-4 w-4 text-app-accent" />
            <span>{row.original.name}</span>
          </div>
        ),
        meta: { className: "font-bold" },
      },
      {
        id: "operating_unit",
        header: "الوحدة التشغيلية",
        accessorFn: (sup) => sup.operating_unit?.name ?? "",
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
        id: "tax_number",
        header: "الرقم الضريبي",
        accessorFn: (sup) => sup.tax_number ?? "",
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-app-label-secondary">{row.original.tax_number || "—"}</span>
        ),
      },
      {
        id: "default_currency",
        header: "العملة الافتراضية",
        accessorKey: "default_currency",
        cell: ({ row }) => (
          <span className="rounded-md bg-app-bg-secondary px-2 py-1 font-bold text-app-label-primary">
            {row.original.default_currency}
          </span>
        ),
        meta: { className: "font-mono" },
      },
      {
        id: "contact",
        header: "معلومات الاتصال",
        accessorFn: (sup) => sup.contact || "—",
        meta: { className: "font-semibold text-app-label-secondary" },
      },
      {
        id: "address",
        header: "العنوان / المرفأ",
        accessorFn: (sup) => sup.address || "غير محدد",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-app-label-secondary" />
            <span>{row.original.address || "غير محدد"}</span>
          </div>
        ),
        meta: { className: "text-app-label-secondary" },
      },
      {
        id: "account",
        header: "حساب الأستاذ (COA)",
        meta: { exportValue: (s) => (s.account ? `${s.account.account_code} - ${s.account.name}` : null) },
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
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const supplier = row.original;
          return (
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewStatement?.(supplier);
                }}
                className="flex items-center gap-1 rounded-lg border border-app-separator px-2.5 py-1 text-xs font-semibold text-app-label-primary hover:border-app-accent hover:text-app-accent hover:bg-app-accent-subtle transition-colors"
                title="عرض كشف حساب المورد"
              >
                <FileText className="w-3.5 h-3.5 text-app-accent" />
                <span>كشف حساب</span>
              </button>
              {onMerge && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMerge(supplier);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-app-separator px-2.5 py-1 text-xs font-semibold text-app-label-secondary hover:border-app-accent hover:text-app-accent hover:bg-app-accent-subtle transition-colors"
                  title="دمج هذا المورد المكرر في مورد آخر"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>دمج</span>
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.(supplier);
                }}
                className="flex items-center gap-1 rounded-lg border border-app-separator px-2.5 py-1 text-xs font-semibold text-app-label-secondary hover:border-app-accent hover:text-app-accent hover:bg-app-accent-subtle transition-colors"
                title="تعديل بيانات المورد"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>تعديل</span>
              </button>
            </div>
          );
        },
      },
    ],
    [onEdit, onViewStatement, onMerge]
  );
}
