import React, { useMemo, useState } from "react";
import { Clock, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useCreateWorkShift,
  useDeleteWorkShift,
  useHrSettings,
  useUpdateHrSettings,
  useUpdateWorkShift,
  useWorkShifts,
} from "../../hooks/useHr";
import { usePermissions } from "../../hooks/usePermissions";
import { PAY_ROLES, employeeErrorMessage } from "../../api/endpoints/employees";
import { apiErrorMessage, apiErrorPayload } from "../../api/endpoints/production";
import type { WorkShift } from "../../api/endpoints/hr";
import { formatNumber } from "../../lib/utils/format";
import { toast } from "../../stores/toastStore";
import { DataTable, useDataTable, type ColumnDef } from "../../components/ui/DataTable";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";

const input =
  "w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none focus:border-app-accent";
const label = "block text-xs font-semibold text-app-label-secondary mb-1";

/**
 * The company's overtime settings (HR-14): the monthly hours a salary is divided by
 * for the overtime hourly base, and the multiplier of an employee without a shift.
 * HrSettingsController::update lets only the owner or the HR manager change them.
 */
const OvertimeDefaults: React.FC = () => {
  const { data: settings } = useHrSettings();
  const update = useUpdateHrSettings();
  const { roleSlugs } = usePermissions();
  // The controller checks the exact slugs; hasRole would also pass admin roles it refuses.
  const canEdit = roleSlugs.some((s) => s === "owner" || s === "hr-manager");
  const [editing, setEditing] = useState(false);
  const [hoursDraft, setHoursDraft] = useState("");
  const [multiplierDraft, setMultiplierDraft] = useState("");

  const hours = settings?.monthly_standard_hours ?? 208;
  const multiplier = settings?.overtime_multiplier ?? 1.5;

  const startEdit = () => {
    setHoursDraft(String(hours));
    setMultiplierDraft(String(multiplier));
    setEditing(true);
  };

  const save = () => {
    const h = Number(hoursDraft);
    const m = Number(multiplierDraft);
    if (!Number.isFinite(h) || h <= 0 || h > 744) {
      toast.error("ساعات الشهر القياسية أكبر من 0 وحتى 744.");
      return;
    }
    if (!Number.isFinite(m) || m < 1 || m > 10) {
      toast.error("معامل الإضافي بين 1 و10.");
      return;
    }
    update.mutate(
      { monthly_standard_hours: h, overtime_multiplier: m },
      {
        onSuccess: () => {
          toast.success("تم تحديث إعدادات العمل الإضافي");
          setEditing(false);
        },
        onError: (err) => toast.error(employeeErrorMessage(err, "تعذر تحديث إعدادات العمل الإضافي.")),
      },
    );
  };

  const small =
    "w-20 rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 font-mono text-xs focus:border-app-accent focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-app-separator bg-app-bg-primary p-4 text-xs shadow-sm">
      <span className="font-bold text-app-label-primary">إعدادات الشركة:</span>
      {editing ? (
        <>
          <label className="flex items-center gap-1.5 text-app-label-secondary">
            ساعات الشهر القياسية
            <input type="number" min="1" max="744" step="0.5" value={hoursDraft} onChange={(e) => setHoursDraft(e.target.value)} className={small} />
          </label>
          <label className="flex items-center gap-1.5 text-app-label-secondary">
            معامل الإضافي الافتراضي
            <input type="number" min="1" max="10" step="0.05" value={multiplierDraft} onChange={(e) => setMultiplierDraft(e.target.value)} className={small} />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={update.isPending}
            className="rounded-lg bg-app-accent px-3 py-1 font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            حفظ
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-app-label-secondary hover:opacity-80">
            إلغاء
          </button>
        </>
      ) : (
        <>
          <span className="text-app-label-secondary">
            ساعات الشهر القياسية: <span className="font-mono font-bold text-app-label-primary">{formatNumber(hours)}</span>
            <span className="text-app-label-tertiary"> (أجر ساعة الإضافي للراتب الشهري = الراتب ÷ هذه الساعات)</span>
          </span>
          <span className="text-app-label-secondary">
            معامل الإضافي لمن لا وردية له: <span className="font-mono font-bold text-app-label-primary">{formatNumber(multiplier)} ×</span>
          </span>
          <span className="text-app-label-tertiary">
            اليوم القياسي لصاحب الأجر اليومي بلا وردية: 8 ساعات (أجر ساعة الإضافي = الأجر اليومي ÷ 8)
          </span>
          {canEdit && (
            <button type="button" onClick={startEdit} className="inline-flex items-center gap-1 text-app-accent font-bold hover:opacity-80">
              <Pencil className="h-3 w-3" /> تعديل
            </button>
          )}
        </>
      )}
    </div>
  );
};

const ShiftForm: React.FC<{ shift: WorkShift | null; onDone: () => void }> = ({ shift, onDone }) => {
  const create = useCreateWorkShift();
  const update = useUpdateWorkShift();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(shift?.name ?? "");
  const [standardHours, setStandardHours] = useState(shift ? String(shift.standard_hours) : "8");
  const [multiplier, setMultiplier] = useState(shift ? String(shift.overtime_multiplier) : "1.5");
  const [startTime, setStartTime] = useState(shift?.start_time ?? "");
  const [endTime, setEndTime] = useState(shift?.end_time ?? "");
  // The version the form was read from, so a concurrent edit conflicts instead of being overwritten.
  const [baseVersion] = useState(shift?.record_version ?? 0);
  const pending = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const h = Number(standardHours);
    const m = Number(multiplier);
    if (!name.trim()) {
      setError("أدخل اسم الوردية.");
      return;
    }
    if (!Number.isFinite(h) || h <= 0 || h > 24) {
      setError("ساعات اليوم القياسية أكبر من 0 وحتى 24.");
      return;
    }
    if (!Number.isFinite(m) || m < 1 || m > 10) {
      setError("معامل الإضافي بين 1 و10.");
      return;
    }
    const payload = {
      name: name.trim(),
      standard_hours: h,
      overtime_multiplier: m,
      start_time: startTime || null,
      end_time: endTime || null,
    };
    const onError = (err: unknown) => {
      const errorPayload = apiErrorPayload(err);
      // The list refetches on a conflict (useWorkShiftMutation), so a reopened form reads the new version.
      if (errorPayload?.code === "OPTIMISTIC_LOCK_CONFLICT") {
        setError("عدّل مستخدم آخر هذه الوردية للتو — أغلق النافذة وأعد فتحها ثم حاول مرة أخرى.");
        return;
      }
      const errors = errorPayload?.errors;
      if (errors?.start_time || errors?.end_time) {
        setError("وقت البداية والنهاية بصيغة ساعة:دقيقة.");
        return;
      }
      setError(employeeErrorMessage(err, "تعذر حفظ الوردية."));
    };
    if (shift) {
      update.mutate(
        { id: shift.id, payload: { ...payload, record_version: baseVersion } },
        {
          onSuccess: () => {
            toast.success("تم حفظ الوردية");
            onDone();
          },
          onError,
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("تمت إضافة الوردية");
          onDone();
        },
        onError,
      });
    }
  };

  return (
    <>
      <DialogBody>
        <form id="work-shift-form" onSubmit={submit} className="space-y-4" dir="rtl">
          {error && (
            <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
              {error}
            </div>
          )}
          <div>
            <label className={label}>
              اسم الوردية <span className="text-app-status-danger">*</span>
            </label>
            <input className={input} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="مثال: الوردية الصباحية" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>
                ساعات اليوم القياسية <span className="text-app-status-danger">*</span>
              </label>
              <input
                type="number"
                min="0.01"
                max="24"
                step="0.01"
                className={`${input} font-mono`}
                value={standardHours}
                onChange={(e) => setStandardHours(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={label}>معامل الإضافي</label>
              <input
                type="number"
                min="1"
                max="10"
                step="0.01"
                className={`${input} font-mono`}
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>وقت البداية</label>
              <input type="time" className={`${input} font-mono`} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className={label}>وقت النهاية</label>
              <input type="time" className={`${input} font-mono`} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-app-label-tertiary">
            ساعات اليوم القياسية أساس أجر ساعة الإضافي للأجر اليومي (الأجر اليومي ÷ هذه الساعات)، ومعامل الإضافي يُطبَّق على
            الساعات الإضافية لكل موظف على هذه الوردية. تغييرهما يستلزم إعادة احتساب أي مسير محسوب فيه أجر إضافي لموظفيها.
          </p>
        </form>
      </DialogBody>
      <DialogFooter>
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1">
          إلغاء
        </button>
        <button
          type="submit"
          form="work-shift-form"
          disabled={pending}
          className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </DialogFooter>
    </>
  );
};

/** W5-04 (HR-14): work shifts and the company overtime settings. */
export const WorkShiftsPage: React.FC = () => {
  const { data: shifts = [], isLoading } = useWorkShifts();
  const remove = useDeleteWorkShift();
  const { roleSlugs } = usePermissions();
  // WorkShiftController checks the exact pay-role slugs (HR-10).
  const canWrite = roleSlugs.some((s) => PAY_ROLES.includes(s));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkShift | null>(null);
  const [toDelete, setToDelete] = useState<WorkShift | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success("تم حذف الوردية");
        setToDelete(null);
      },
      onError: (err) => {
        setToDelete(null);
        const payload = apiErrorPayload(err);
        const message = apiErrorMessage(err, "تعذر حذف الوردية.");
        toast.error(
          payload?.code === "WORK_SHIFT_IN_USE" && payload.employee_ids?.length
            ? `${message} عدد الموظفين عليها: ${payload.employee_ids.length}.`
            : message,
        );
      },
    });
  };

  const columns = useMemo<ColumnDef<WorkShift, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "الوردية",
        meta: { className: "font-bold text-app-label-primary" },
        cell: ({ row }) => row.original.name,
      },
      {
        id: "times",
        header: "الوقت",
        enableSorting: false,
        meta: { exportValue: (s) => (s.start_time || s.end_time ? `${s.start_time ?? "—"} – ${s.end_time ?? "—"}` : null), className: "font-mono text-app-label-secondary" },
        cell: ({ row }) =>
          row.original.start_time || row.original.end_time ? (
            <span dir="ltr">
              {row.original.start_time ?? "—"} – {row.original.end_time ?? "—"}
            </span>
          ) : (
            "—"
          ),
      },
      {
        accessorKey: "standard_hours",
        header: "ساعات اليوم القياسية",
        meta: { align: "end", className: "font-mono" },
        cell: ({ row }) => formatNumber(row.original.standard_hours),
      },
      {
        accessorKey: "overtime_multiplier",
        header: "معامل الإضافي",
        meta: { align: "end", className: "font-mono" },
        cell: ({ row }) => `${formatNumber(row.original.overtime_multiplier)} ×`,
      },
      ...(canWrite
        ? [
            {
              id: "actions",
              header: "",
              enableSorting: false,
              meta: { export: false, align: "end" as const },
              cell: ({ row }: { row: { original: WorkShift } }) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => {
                      setEditing(row.original);
                      setFormOpen(true);
                    }}
                    title="تعديل الوردية"
                    className="p-1.5 rounded-lg border border-app-separator text-app-label-secondary hover:text-app-accent hover:border-app-accent"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setToDelete(row.original)}
                    title="حذف الوردية"
                    className="p-1.5 rounded-lg border border-app-separator text-app-label-secondary hover:text-app-status-danger hover:border-app-status-danger"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            } satisfies ColumnDef<WorkShift, unknown>,
          ]
        : []),
    ],
    [canWrite],
  );

  const table = useDataTable({
    exportFileName: "work-shifts",
    columns,
    data: shifts,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 20,
    getRowId: (s) => s.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Clock className="w-7 h-7 text-app-accent" />
            الورديات والعمل الإضافي
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            تُسجَّل الساعات الإضافية في كشف الحضور، ويحتسبها المسير بمعامل وردية الموظف (أو معامل الشركة الافتراضي إن لم تكن له
            وردية): بالساعة = الساعات × الأجر × المعامل، باليومي = الساعات × الأجر اليومي ÷ ساعات الوردية (8 ساعات لمن لا وردية له) × المعامل، وبالراتب
            الشهري = الساعات × الراتب ÷ ساعات الشهر القياسية × المعامل. يعيّن الورديات للموظفين ويعدّلها مدير الموارد البشرية أو
            مدير الحسابات أو المالك.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> وردية جديدة
          </button>
        )}
      </div>

      <OvertimeDefaults />

      <DataTable table={table}>
        <DataTable.Header>
          <DataTable.Toolbar>
            <DataTable.SearchInput placeholder="بحث باسم الوردية..." />
          </DataTable.Toolbar>
        </DataTable.Header>
        <DataTable.Content isLoading={isLoading} emptyMessage="لا توجد ورديات بعد." emptyIcon={Clock} />
        <DataTable.Pagination />
      </DataTable>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل الوردية" : "وردية جديدة"}</DialogTitle>
            <DialogClose />
          </DialogHeader>
          {/* Remounts on each open so the form starts from the selected shift. */}
          {formOpen && <ShiftForm key={editing?.id ?? "new"} shift={editing} onDone={() => setFormOpen(false)} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        isLoading={remove.isPending}
        title="حذف الوردية"
        message={
          toDelete
            ? `ستُحذف الوردية «${toDelete.name}». لا تُحذف وردية معيّنة لموظفين؛ انقلهم إلى وردية أخرى أولاً.`
            : ""
        }
        confirmText="حذف"
        variant="danger"
      />
    </div>
  );
};

export default WorkShiftsPage;
