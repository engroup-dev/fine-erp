import React, { useMemo, useState } from "react";
import { Layers, Plus, RefreshCw, Trash2 } from "lucide-react";
import { isAxiosError } from "axios";
import {
  useCreateUnitBlueprint,
  useDeleteUnitBlueprint,
  useRestoreUnitBlueprint,
  useUnitBlueprints,
  useUpdateUnitBlueprint,
} from "../../hooks/useOperatingUnits";
import { BlueprintEntry } from "../../types/entities";
import { toast } from "../../stores/toastStore";
import { apiErrorPayload } from "../../api/endpoints/production";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../../components/ui/Dialog";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { cn } from "../../lib/utils/utils";

const formatDate = (iso?: string): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar-LY");
};

const stringifySafely = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const BlueprintsPage: React.FC = () => {
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [editing, setEditing] = useState<BlueprintEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BlueprintEntry | null>(null);
  const [restoring, setRestoring] = useState<BlueprintEntry | null>(null);

  const listQuery = useUnitBlueprints({ withTrashed: tab === "deleted" });
  const createMutation = useCreateUnitBlueprint();
  const deleteMutation = useDeleteUnitBlueprint();
  const restoreMutation = useRestoreUnitBlueprint();

  const blueprints = listQuery.data ?? [];

  const columns = useMemo(
    () => [
      {
        id: "name",
        header: "اسم القالب",
        accessorFn: (b: BlueprintEntry) => b.name,
        cell: ({ row }: { row: { original: BlueprintEntry } }) => (
          <div className="flex flex-col">
            <span className="font-bold text-app-label-primary">{row.original.name}</span>
            <span className="text-[10px] font-mono text-app-label-secondary">
              {row.original.id.slice(0, 8)}
            </span>
          </div>
        ),
      },
      {
        id: "roles",
        header: "الأدوار الافتراضية",
        meta: { exportValue: (b: BlueprintEntry) => Object.keys(b.default_role_template ?? {}).length },
        enableSorting: false,
        cell: ({ row }: { row: { original: BlueprintEntry } }) => (
          <span className="text-[11px] text-app-label-secondary">
            {stringifySafely(
              Object.keys(row.original.default_role_template ?? {}).length,
            )}{" "}
            دور
          </span>
        ),
      },
      {
        id: "warehouse",
        header: "المستودع",
        accessorFn: (b: BlueprintEntry) =>
          (b.default_inventory_config as { warehouse_name?: string } | undefined)
            ?.warehouse_name ?? "",
        cell: ({ row }: { row: { original: BlueprintEntry } }) => (
          <span className="text-[11px] text-app-label-secondary">
            {stringifySafely(
              (row.original.default_inventory_config as { warehouse_name?: string } | undefined)
                ?.warehouse_name,
            )}
          </span>
        ),
      },
      {
        id: "created",
        header: "تاريخ الإنشاء",
        accessorFn: (b: BlueprintEntry) => b.created_at ?? "",
        cell: ({ row }: { row: { original: BlueprintEntry } }) => (
          <span className="text-[11px] text-app-label-secondary">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { export: false },
        enableSorting: false,
        cell: ({ row }: { row: { original: BlueprintEntry } }) => {
          const isDeleted = Boolean(row.original.deleted_at);
          return isDeleted ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRestoring(row.original);
              }}
              className="rounded-lg border border-app-accent/40 bg-app-accent/10 px-2 py-1 text-[11px] font-bold text-app-accent hover:bg-app-accent/20"
            >
              استعادة
            </button>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(row.original);
                }}
                className="rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-[11px] font-semibold text-app-label-primary hover:bg-app-fill-f1"
              >
                تعديل
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(row.original);
                }}
                className="rounded-lg border border-app-status-danger/30 bg-app-status-danger/10 px-2 py-1 text-[11px] font-semibold text-app-status-danger hover:bg-app-status-danger/20"
              >
                حذف
              </button>
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useDataTable({
    exportFileName: "unit-blueprints",
    columns,
    data: blueprints,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (b) => b.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary">قوالب الوحدات</h1>
          <p className="text-xs text-app-label-secondary mt-1">
            قوالب قابلة لإعادة الاستخدام لإنشاء وحدات تشغيلية (workflow_set، أدوار افتراضية، إعدادات المستودع)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => listQuery.refetch()}
            className="flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1"
          >
            <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            إضافة قالب
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-app-separator">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={cn(
            "px-4 py-2 text-xs font-bold transition-colors",
            tab === "active"
              ? "border-b-2 border-app-accent text-app-accent"
              : "text-app-label-secondary hover:text-app-label-primary",
          )}
        >
          نشطة ({blueprints.filter((b) => !b.deleted_at).length})
        </button>
        <button
          type="button"
          onClick={() => setTab("deleted")}
          className={cn(
            "px-4 py-2 text-xs font-bold transition-colors",
            tab === "deleted"
              ? "border-b-2 border-app-accent text-app-accent"
              : "text-app-label-secondary hover:text-app-label-primary",
          )}
        >
          محذوفة ({blueprints.filter((b) => b.deleted_at).length})
        </button>
      </div>

      <DataTable table={table}>
        <DataTable.Header>
          <DataTable.Toolbar>
            <DataTable.SearchInput placeholder="بحث بالاسم..." />
          </DataTable.Toolbar>
        </DataTable.Header>
        <DataTable.Content
          isLoading={listQuery.isLoading}
          emptyMessage={tab === "deleted" ? "لا توجد قوالب محذوفة." : "لا توجد قوالب."}
          emptyIcon={Layers}
        />
        <DataTable.Pagination />
      </DataTable>

      {creating && (
        <BlueprintDialog
          mode="create"
          onClose={() => setCreating(false)}
          onSave={async (payload) => {
            try {
              await createMutation.mutateAsync(payload);
              toast.success("تم إنشاء القالب.");
              setCreating(false);
            } catch (err) {
              const msg = apiErrorPayload(err)?.message || (isAxiosError(err) ? err.response?.data?.message : null);
              toast.error(msg || "فشل إنشاء القالب.");
            }
          }}
        />
      )}

      {editing && (
        <BlueprintDialog
          mode="edit"
          blueprint={editing}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            try {
              const updateBlueprint = useUpdateUnitBlueprint();
              await updateBlueprint.mutateAsync({ id: editing.id, ...payload });
              toast.success("تم تحديث القالب.");
              setEditing(null);
            } catch (err) {
              const msg = apiErrorPayload(err)?.message || (isAxiosError(err) ? err.response?.data?.message : null);
              toast.error(msg || "فشل التحديث.");
            }
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="حذف قالب وحدة"
        message={
          deleting
            ? `سيتم حذف "${deleting.name}" ناعماً. لا يمكن الحذف إذا كانت هناك وحدات مرتبطة به.`
            : ""
        }
        confirmText="حذف"
        variant="danger"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteMutation.mutateAsync(deleting.id);
            toast.success("تم حذف القالب.");
            setDeleting(null);
          } catch (err) {
            const msg = apiErrorPayload(err)?.message || (isAxiosError(err) ? err.response?.data?.message : null);
            toast.error(msg || "فشل حذف القالب.");
          }
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(restoring)}
        onClose={() => setRestoring(null)}
        title="استعادة قالب"
        message={restoring ? `سيتم استعادة "${restoring.name}".` : ""}
        confirmText="استعادة"
        onConfirm={async () => {
          if (!restoring) return;
          try {
            await restoreMutation.mutateAsync(restoring.id);
            toast.success("تمت الاستعادة.");
            setRestoring(null);
          } catch (err) {
            const msg = apiErrorPayload(err)?.message || (isAxiosError(err) ? err.response?.data?.message : null);
            toast.error(msg || "فشل الاستعادة.");
          }
        }}
      />
    </div>
  );
};

// Lazy-import to avoid a circular import through the hook module.
// import { useUpdateUnitBlueprint } from "../../hooks/useOperatingUnits";

interface BlueprintDialogProps {
  mode: "create" | "edit";
  blueprint?: BlueprintEntry;
  onClose: () => void;
  onSave: (payload: {
    name: string;
    workflow_set: Record<string, unknown>;
    default_role_template: Record<string, unknown>;
    default_inventory_config: Record<string, unknown>;
  }) => Promise<void>;
}

const BlueprintDialog: React.FC<BlueprintDialogProps> = ({ mode, blueprint, onClose, onSave }) => {
  const [name, setName] = useState(blueprint?.name ?? "");
  const [workflowSet, setWorkflowSet] = useState(
    JSON.stringify(blueprint?.workflow_set ?? {}, null, 2),
  );
  const [roleTemplate, setRoleTemplate] = useState(
    JSON.stringify(blueprint?.default_role_template ?? {}, null, 2),
  );
  const [inventoryConfig, setInventoryConfig] = useState(
    JSON.stringify(blueprint?.default_inventory_config ?? {}, null, 2),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryParse = (label: string, value: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setError(`${label} يجب أن يكون JSON كائن.`);
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      setError(`${label} ليس JSON صالحاً.`);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("الاسم مطلوب.");
      return;
    }
    const ws = tryParse("workflow_set", workflowSet);
    const rt = tryParse("default_role_template", roleTemplate);
    const ic = tryParse("default_inventory_config", inventoryConfig);
    if (!ws || !rt || !ic) return;
    setSubmitting(true);
    try {
      await onSave({ name: name.trim(), workflow_set: ws, default_role_template: rt, default_inventory_config: ic });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "قالب جديد" : `تعديل: ${blueprint?.name ?? ""}`}</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-label-secondary">الاسم</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-label-secondary">workflow_set (JSON)</label>
              <textarea
                value={workflowSet}
                onChange={(e) => setWorkflowSet(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 font-mono text-[11px] text-app-label-primary focus:outline-none"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-label-secondary">default_role_template (JSON)</label>
              <textarea
                value={roleTemplate}
                onChange={(e) => setRoleTemplate(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 font-mono text-[11px] text-app-label-primary focus:outline-none"
                dir="ltr"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-label-secondary">default_inventory_config (JSON)</label>
              <textarea
                value={inventoryConfig}
                onChange={(e) => setInventoryConfig(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 font-mono text-[11px] text-app-label-primary focus:outline-none"
                dir="ltr"
              />
            </div>
            {error && (
              <div className="rounded-lg border border-app-status-danger/30 bg-app-status-danger/10 p-2 text-xs text-app-status-danger">
                {error}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "جاري الحفظ..." : mode === "create" ? "إنشاء" : "حفظ"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BlueprintsPage;
