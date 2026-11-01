import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/Dialog";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useReferenceLookupColumns } from "../../components/table-columns/referenceLookupColumns";
import {
  LookupConfig,
  LookupEntry,
  resolveLookupField,
} from "../../config/referenceLookups";
import {
  useReferenceLookups,
  useCreateReferenceLookup,
  useUpdateReferenceLookup,
  useDeleteReferenceLookup,
  useToggleReferenceLookupActive,
} from "../../hooks/useReferenceLookups";
import { toast } from "../../stores/toastStore";
import { LEDGER_ERROR_MESSAGE } from "../../api/endpoints/production";
import { isAxiosError } from "axios";

/** Arabic text for delete refusals whose backend message is English. */
const DELETE_REFUSAL_MESSAGE: Record<string, string> = {
  BASE_CURRENCY: "لا يمكن حذف العملة الأساسية للشركة.",
  CURRENCY_IN_USE: "العملة مستخدمة في حسابات أو مستندات ولا يمكن حذفها — يمكنك إيقاف تفعيلها بدلاً من ذلك.",
  // W5-03: an allowance or deduction type used by employee pay items or adjustments (delete or code change).
  PAY_CODE_IN_USE: LEDGER_ERROR_MESSAGE.PAY_CODE_IN_USE,
};

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (isAxiosError(err)) {
    const data = err.response?.data as { message?: string; code?: string } | undefined;
    return (data?.code && DELETE_REFUSAL_MESSAGE[data.code]) || data?.message || fallback;
  }
  return fallback;
};

interface LookupForm {
  name: string;
  code: string;
  notes: string;
  isActive: boolean;
  fields: Record<string, string>;
}

const emptyForm = (config: LookupConfig): LookupForm => ({
  name: "",
  code: "",
  notes: "",
  isActive: true,
  fields: Object.fromEntries(
    config.fields.map((field) => [
      field.key,
      field.type === "select" ? (field.options?.[0]?.value ?? "") : "",
    ]),
  ),
});

const toForm = (entry: LookupEntry): LookupForm => ({
  name: entry.name,
  code: entry.code,
  notes: entry.notes ?? "",
  isActive: entry.isActive,
  fields: { ...entry.fields },
});

const inputClasses = (mono?: boolean) =>
  `w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:border-app-accent focus:outline-none ${
    mono ? "font-mono" : ""
  }`;

/**
 * Screen for every reference list under Settings, driven by its `LookupConfig`
 * and backed by the server's reference_lookups API.
 */
export const ReferenceLookupPage: React.FC<{ config: LookupConfig }> = ({
  config,
}) => {
  const { data: serverEntries = [], isLoading } = useReferenceLookups(config.key);
  const isStorageLocations = config.key === "storage-locations";
  const { data: dynamicWarehouses } = useReferenceLookups("warehouses");
  const { data: dynamicLocationTypes } = useReferenceLookups("location-types");

  const resolvedConfig = useMemo(() => {
    if (!isStorageLocations) {
      return config;
    }

    const warehouseOptions =
      dynamicWarehouses && dynamicWarehouses.length > 0
        ? dynamicWarehouses.map((w) => ({
            value: w.code,
            label: `${w.name} (${w.code})`,
          }))
        : config.fields.find((f) => f.key === "warehouse")?.options;

    const locationTypeOptions =
      dynamicLocationTypes && dynamicLocationTypes.length > 0
        ? dynamicLocationTypes.map((t) => ({
            value: t.code,
            label: t.name,
          }))
        : config.fields.find((f) => f.key === "zoneType")?.options;

    return {
      ...config,
      fields: config.fields.map((field) => {
        if (field.key === "warehouse" && warehouseOptions) {
          return { ...field, options: warehouseOptions };
        }
        if (field.key === "zoneType" && locationTypeOptions) {
          return { ...field, options: locationTypeOptions };
        }
        return field;
      }),
    };
  }, [config, isStorageLocations, dynamicWarehouses, dynamicLocationTypes]);

  const createLookup = useCreateReferenceLookup(config.key);
  const updateLookup = useUpdateReferenceLookup(config.key);
  const deleteLookup = useDeleteReferenceLookup(config.key);
  const toggleActiveMutation = useToggleReferenceLookupActive(config.key);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LookupEntry | null>(null);
  const [entryPendingDelete, setEntryPendingDelete] =
    useState<LookupEntry | null>(null);
  const [form, setForm] = useState<LookupForm>(() => emptyForm(resolvedConfig));

  const data = serverEntries;
  const activeCount = useMemo(
    () => data.filter((entry) => entry.isActive).length,
    [data],
  );

  const setFieldValue = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }));
  };

  const openCreate = () => {
    setEditingEntry(null);
    setForm(emptyForm(resolvedConfig));
    setIsFormOpen(true);
  };

  const openEdit = (entry: LookupEntry) => {
    setEditingEntry(entry);
    setForm(toForm(entry));
    setIsFormOpen(true);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const code = form.code.trim().toUpperCase();
    const isDuplicateCode = data.some(
      (entry) =>
        entry.code.toUpperCase() === code && entry.id !== editingEntry?.id,
    );
    if (isDuplicateCode) {
      toast.error(`الرمز ${code} مستخدم بالفعل`);
      return;
    }

    const draft = {
      name: form.name.trim(),
      code,
      notes: form.notes.trim() || undefined,
      isActive: form.isActive,
      fields: form.fields,
    };

    if (editingEntry) {
      updateLookup.mutate(
        { id: editingEntry.id, ...draft },
        {
          onSuccess: () => {
            toast.success(`تم تحديث ${config.singular}`);
            setIsFormOpen(false);
            setEditingEntry(null);
            setForm(emptyForm(config));
          },
          onError: (err: unknown) => {
            toast.error(getErrorMessage(err, `فشل تحديث ${config.singular}`));
          },
        },
      );
    } else {
      createLookup.mutate(draft, {
        onSuccess: () => {
          toast.success(`تمت إضافة ${config.singular}`);
          setIsFormOpen(false);
          setEditingEntry(null);
          setForm(emptyForm(config));
        },
        onError: (err: unknown) => {
          toast.error(getErrorMessage(err, `فشل إضافة ${config.singular}`));
        },
      });
    }
  };

  const handleConfirmDelete = () => {
    if (!entryPendingDelete) return;
    deleteLookup.mutate(entryPendingDelete.id, {
      onSuccess: () => {
        toast.success(`تم حذف "${entryPendingDelete.name}"`);
        setEntryPendingDelete(null);
      },
      onError: (err: unknown) => {
        toast.error(
          getErrorMessage(err, `فشل حذف "${entryPendingDelete.name}"`),
        );
      },
    });
  };

  const columns = useReferenceLookupColumns({
    config: resolvedConfig,
    onEdit: openEdit,
    onDelete: setEntryPendingDelete,
    onToggleActive: (entry) => {
      toggleActiveMutation.mutate(entry.id, {
        onError: (err: unknown) => {
          toast.error(getErrorMessage(err, "فشل تغيير الحالة"));
        },
      });
    },
  });

  const table = useDataTable({
    exportFileName: config.key,
    columns,
    data,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (entry) => entry.id,
  });

  const Icon = config.icon;
  const isSaving = createLookup.isPending || updateLookup.isPending;

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-app-label-primary">
            <Icon className="h-7 w-7 text-app-accent" />
            {config.title}
          </h1>
          <p className="mt-1 text-xs text-app-label-secondary">
            {config.description} — {activeCount} مفعّل من أصل {data.length}.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
        >
          <Plus className="h-4 w-4" /> إضافة {config.singular}
        </button>
      </div>

      <DataTable table={table}>
        <DataTable.Header>
          <DataTable.Toolbar>
            <DataTable.SearchInput placeholder={config.searchPlaceholder} />
          </DataTable.Toolbar>
        </DataTable.Header>
        <DataTable.Content
          emptyMessage={
            isLoading
              ? "جاري تحميل البيانات..."
              : `لا توجد سجلات في "${config.title}" بعد.`
          }
          emptyIcon={config.icon}
        />
        <DataTable.Pagination />
      </DataTable>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {editingEntry
                ? `تعديل ${config.singular}: ${editingEntry.name}`
                : `إضافة ${config.singular}`}
            </DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <form
              id="reference-lookup-form"
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-app-label-secondary">
                    {config.nameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={config.namePlaceholder}
                    value={form.name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className={inputClasses()}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-app-label-secondary">
                    {config.codeLabel}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={config.codePlaceholder}
                    value={form.code}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, code: e.target.value }))
                    }
                    className={inputClasses(true)}
                  />
                </div>
              </div>

              {resolvedConfig.fields.map((field) => {
                const resolved = resolveLookupField(field, form.fields);
                const currentValue = form.fields[field.key] ?? "";

                return (
                  <div key={field.key}>
                    <label className="mb-1 block text-xs font-semibold uppercase text-app-label-secondary">
                      {resolved.label}
                    </label>

                    {resolved.type === "select" ? (
                      <select
                        value={currentValue}
                        onChange={(e) =>
                          setFieldValue(field.key, e.target.value)
                        }
                        className={inputClasses()}
                      >
                        {resolved.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative">
                        <input
                          type={resolved.type === "number" ? "number" : "text"}
                          placeholder={resolved.placeholder}
                          value={currentValue}
                          onChange={(e) =>
                            setFieldValue(field.key, e.target.value)
                          }
                          className={inputClasses(resolved.mono)}
                        />
                        {resolved.suffix ? (
                          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-app-label-tertiary">
                            {resolved.suffix}
                          </span>
                        ) : null}
                      </div>
                    )}

                    {resolved.hint ? (
                      <p className="mt-1 text-[11px] text-app-label-tertiary">
                        {resolved.hint}
                      </p>
                    ) : null}
                  </div>
                );
              })}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="lookupIsActive"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                  className="rounded border-app-separator text-app-accent focus:ring-app-accent"
                />
                <label
                  htmlFor="lookupIsActive"
                  className="text-xs font-medium text-app-label-primary"
                >
                  مفعّل ومتاح للاختيار في الشاشات
                </label>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-app-label-secondary">
                  ملاحظات (اختياري)
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className={inputClasses()}
                />
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              disabled={isSaving}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="reference-lookup-form"
              disabled={isSaving}
              className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {isSaving
                ? "جاري الحفظ..."
                : editingEntry
                  ? "حفظ التعديلات"
                  : "حفظ"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(entryPendingDelete)}
        onClose={() => setEntryPendingDelete(null)}
        onConfirm={handleConfirmDelete}
        title={`حذف ${config.singular}`}
        message={`سيتم حذف "${entryPendingDelete?.name ?? ""}" نهائياً من قاعدة البيانات.`}
        confirmText="حذف"
        variant="danger"
      />
    </div>
  );
};
