import React from "react";
import { Filter, X } from "lucide-react";
import { cn } from "../../lib/utils/utils";
import { AuditAction, AuditLogFilters } from "../../types/entities";

interface AuditLogFiltersProps<F extends AuditLogFilters> {
  filters: F;
  onChange: (filters: F) => void;
  /** W6-01: extra filter fields (table, unit, user, search…) shown before the dates. */
  children?: React.ReactNode;
  /** Text typed in a child field but not applied yet (debounce, partial id): still worth a clear. */
  hasPendingInput?: boolean;
}

const ACTION_OPTIONS: Array<{ value: "" | AuditAction; label: string }> = [
  { value: "", label: "كل الإجراءات" },
  { value: "created", label: "إنشاء" },
  { value: "updated", label: "تعديل" },
  { value: "deleted", label: "حذف" },
  { value: "restored", label: "استعادة" },
  { value: "merged", label: "دمج" },
];

export function AuditLogFiltersBar<F extends AuditLogFilters = AuditLogFilters>({
  filters,
  onChange,
  children,
  hasPendingInput = false,
}: AuditLogFiltersProps<F>) {
  const hasFilter = hasPendingInput || Object.values(filters).some((value) => Boolean(value));

  const clear = () => onChange({} as F);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-app-separator bg-app-bg-primary p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-app-label-secondary">
        <Filter className="h-3.5 w-3.5" />
        تصفية السجل
      </div>

      {children}

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-app-label-secondary">الإجراء</label>
        <select
          value={filters.action ?? ""}
          onChange={(e) =>
            onChange({
              ...filters,
              action: (e.target.value || undefined) as AuditAction | undefined,
            })
          }
          className={cn(
            "rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1.5 text-xs text-app-label-primary focus:outline-none",
          )}
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-app-label-secondary">من</label>
        <input
          type="date"
          value={filters.from ?? ""}
          max={filters.to}
          onChange={(e) => onChange({ ...filters, from: e.target.value || undefined })}
          className="rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1.5 text-xs text-app-label-primary focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-app-label-secondary">إلى</label>
        <input
          type="date"
          value={filters.to ?? ""}
          min={filters.from}
          onChange={(e) => onChange({ ...filters, to: e.target.value || undefined })}
          className="rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1.5 text-xs text-app-label-primary focus:outline-none"
        />
      </div>

      {hasFilter && (
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 self-end rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1.5 text-[11px] font-semibold text-app-label-secondary hover:bg-app-fill-f1"
        >
          <X className="h-3 w-3" />
          مسح التصفية
        </button>
      )}
    </div>
  );
}

export default AuditLogFiltersBar;
