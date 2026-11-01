import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { isAxiosError } from "axios";
import { OperatingUnit } from "../../types/entities";
import {
  useCreateOperatingUnit,
  useDeleteOperatingUnit,
  useOperatingUnits,
  useRestoreOperatingUnit,
  useUnitBlueprints,
  useUpdateOperatingUnit,
} from "../../hooks/useOperatingUnits";
import { useUsers } from "../../hooks/useUsers";
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
import { useOperatingUnitsColumns } from "../../components/table-columns/operatingUnitsColumns";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { cn } from "../../lib/utils/utils";

const STATUS_OPTIONS = [
  { value: "active", label: "نشطة" },
  { value: "provisioning", label: "قيد الإعداد" },
  { value: "inactive", label: "معطلة" },
];

export const OperatingUnitsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [editing, setEditing] = useState<OperatingUnit | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<OperatingUnit | null>(null);
  const [restoring, setRestoring] = useState<OperatingUnit | null>(null);

  const listQuery = useOperatingUnits({ withTrashed: tab === "deleted" });
  const blueprintsQuery = useUnitBlueprints();
  const usersQuery = useUsers();
  const updateMutation = useUpdateOperatingUnit();
  const deleteMutation = useDeleteOperatingUnit();
  const restoreMutation = useRestoreOperatingUnit();

  const blueprints = blueprintsQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const units = listQuery.data ?? [];

  const userLookup = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach((u) => { map[u.id] = u.name; });
    return map;
  }, [users]);

  const bulkActivate = async () => {
    const active = unitsTable.table.getSelectedRowModel().rows
      .map((r) => r.original)
      .filter((u) => !u.deleted_at && u.status !== "active");
    if (active.length === 0) {
      toast.info("لا توجد وحدات بحاجة للتفعيل.");
      return;
    }
    for (const unit of active) {
      try {
        await updateMutation.mutateAsync({ id: unit.id, status: "active" });
      } catch (err) {
        toast.error(`فشل تفعيل ${unit.name}: ${apiErrorPayload(err)?.message ?? "خطأ"}`);
        return;
      }
    }
    toast.success(`تم تفعيل ${active.length} وحدة.`);
  };

  const bulkDeactivate = async () => {
    const inactive = unitsTable.table.getSelectedRowModel().rows
      .map((r) => r.original)
      .filter((u) => !u.deleted_at && u.status !== "inactive");
    if (inactive.length === 0) {
      toast.info("لا توجد وحدات بحاجة للإيقاف.");
      return;
    }
    for (const unit of inactive) {
      try {
        await updateMutation.mutateAsync({ id: unit.id, status: "inactive" });
      } catch (err) {
        toast.error(`فشل إيقاف ${unit.name}: ${apiErrorPayload(err)?.message ?? "خطأ"}`);
        return;
      }
    }
    toast.success(`تم إيقاف ${inactive.length} وحدة.`);
  };

  const bulkDelete = async () => {
    const rows = unitsTable.table.getSelectedRowModel().rows
      .map((r) => r.original)
      .filter((u) => !u.deleted_at);
    if (rows.length === 0) return;
    if (!window.confirm(`هل تريد حذف ${rows.length} وحدة؟`)) return;
    for (const unit of rows) {
      try {
        await deleteMutation.mutateAsync(unit.id);
      } catch (err) {
        toast.error(`فشل حذف ${unit.name}: ${apiErrorPayload(err)?.message ?? "خطأ"}`);
        return;
      }
    }
    toast.success(`تم حذف ${rows.length} وحدة.`);
  };

  const columns = useOperatingUnitsColumns({
    onEdit: (u) => setEditing(u),
    onDelete: (u) => setDeleting(u),
    onRestore: (u) => setRestoring(u),
  });

  const unitsTable = useDataTable({
    exportFileName: "operating-units",
    columns,
    data: units,
    enableSorting: true,
    enableGlobalFilter: true,
    enableRowSelection: true,
    pageSize: 10,
    getRowId: (u) => u.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary">إدارة الوحدات التشغيلية</h1>
          <p className="text-xs text-app-label-secondary mt-1">
            إنشاء وحدات جديدة من قالب، تعديل البيانات، تفعيل/إيقاف، واستعادة المحذوف
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
            إضافة وحدة
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
          نشطة ({units.filter((u) => !u.deleted_at).length})
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
          محذوفة ({units.filter((u) => u.deleted_at).length})
        </button>
      </div>

      <DataTable table={unitsTable}>
        <DataTable.Header>
          <DataTable.Toolbar>
            <DataTable.SearchInput placeholder="بحث بالاسم..." />
          </DataTable.Toolbar>
          <DataTable.BulkActions>
            {tab === "active" && (
              <>
                <button
                  type="button"
                  onClick={bulkActivate}
                  className="flex items-center gap-1 rounded-lg bg-app-status-positive/15 px-2 py-1 text-[11px] font-bold text-app-status-positive hover:bg-app-status-positive/20"
                >
                  <Power className="h-3 w-3" />
                  تفعيل
                </button>
                <button
                  type="button"
                  onClick={bulkDeactivate}
                  className="flex items-center gap-1 rounded-lg bg-app-status-warning/15 px-2 py-1 text-[11px] font-bold text-app-status-warning hover:bg-app-status-warning/20"
                >
                  <PowerOff className="h-3 w-3" />
                  إيقاف
                </button>
                <button
                  type="button"
                  onClick={bulkDelete}
                  className="flex items-center gap-1 rounded-lg bg-app-status-danger/15 px-2 py-1 text-[11px] font-bold text-app-status-danger hover:bg-app-status-danger/20"
                >
                  <Trash2 className="h-3 w-3" />
                  حذف
                </button>
              </>
            )}
          </DataTable.BulkActions>
        </DataTable.Header>
        <DataTable.Content
          isLoading={listQuery.isLoading}
          emptyMessage={tab === "deleted" ? "لا توجد وحدات محذوفة." : "لا توجد وحدات."}
          emptyIcon={Building2}
          onRowClick={(u: OperatingUnit) => navigate(`/admin/units/${u.id}`)}
        />
        <DataTable.Pagination />
      </DataTable>

      {creating && (
        <CreateUnitDialog
          blueprints={blueprints}
          onClose={() => setCreating(false)}
        />
      )}

      {editing && (
        <EditUnitDialog
          unit={editing}
          users={users}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="حذف وحدة تشغيلية"
        message={
          deleting
            ? `سيتم حذف "${deleting.name}" ناعماً. يمكن استعادتها لاحقاً من تبويب "محذوفة".`
            : ""
        }
        confirmText="حذف"
        variant="danger"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteMutation.mutateAsync(deleting.id);
            toast.success("تم حذف الوحدة.");
            setDeleting(null);
          } catch (err) {
            const msg = apiErrorPayload(err)?.message || (isAxiosError(err) ? err.response?.data?.message : null);
            toast.error(msg || "فشل حذف الوحدة.");
          }
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(restoring)}
        onClose={() => setRestoring(null)}
        title="استعادة وحدة تشغيلية"
        message={
          restoring
            ? `سيتم استعادة "${restoring.name}" وستظهر مرة أخرى ضمن الوحدات النشطة.`
            : ""
        }
        confirmText="استعادة"
        onConfirm={async () => {
          if (!restoring) return;
          try {
            await restoreMutation.mutateAsync(restoring.id);
            toast.success("تمت الاستعادة.");
            setRestoring(null);
          } catch (err) {
            const msg = apiErrorPayload(err)?.message || (isAxiosError(err) ? err.response?.data?.message : null);
            toast.error(msg || "فشل استعادة الوحدة.");
          }
        }}
      />
    </div>
  );
};

const CreateUnitDialog: React.FC<{
  blueprints: { id: string; name: string }[];
  onClose: () => void;
}> = ({ blueprints, onClose }) => {
  const createMutation = useCreateOperatingUnit();
  const [name, setName] = useState("");
  const [blueprintId, setBlueprintId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !blueprintId) {
      setError("الاسم والقالب مطلوبان.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createMutation.mutateAsync({ name: name.trim(), blueprint_id: blueprintId });
      toast.success("تم إنشاء الوحدة.");
      onClose();
    } catch (err) {
      setError(apiErrorPayload(err)?.message || "فشل إنشاء الوحدة.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>إضافة وحدة تشغيلية جديدة</DialogTitle>
          <DialogClose />
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-3">
            <p className="text-xs text-app-label-secondary">
              ستقوم الخدمة بنسخ القالب المختار (قواعد سير العمل، أدوار افتراضية، إعدادات المستودع).
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-label-secondary">الاسم</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: مصنع الإسفنج الجديد"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-label-secondary">القالب</label>
              <SearchableSelect<{ id: string; name: string }>
                options={blueprints}
                value={blueprints.find((b) => b.id === blueprintId) ?? null}
                onChange={(b) => setBlueprintId(b?.id ?? "")}
                getOptionId={(b) => b.id}
                getOptionLabel={(b) => b.name}
                placeholder="اختر قالباً..."
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
              className="flex items-center gap-2 rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {submitting ? "جاري الإنشاء..." : "إنشاء"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const EditUnitDialog: React.FC<{
  unit: OperatingUnit;
  users: { id: string; name: string }[];
  onClose: () => void;
}> = ({ unit, users, onClose }) => {
  const updateMutation = useUpdateOperatingUnit();
  const [name, setName] = useState(unit.name);
  const [status, setStatus] = useState(unit.status ?? "active");
  const [managerId, setManagerId] = useState<string | null>(unit.manager_user_id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: unit.id,
        name: name.trim(),
        status: status as "provisioning" | "active" | "inactive",
        manager_user_id: managerId,
      });
      toast.success("تم تحديث الوحدة.");
      onClose();
    } catch (err) {
      setError(apiErrorPayload(err)?.message || "فشل التحديث.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>تعديل: {unit.name}</DialogTitle>
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
              <label className="mb-1 block text-xs font-semibold text-app-label-secondary">الحالة</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-label-secondary">المسؤول</label>
              <SearchableSelect<{ id: string; name: string }>
                options={users}
                value={users.find((u) => u.id === managerId) ?? null}
                onChange={(u) => setManagerId(u?.id ?? null)}
                getOptionId={(u) => u.id}
                getOptionLabel={(u) => u.name}
                placeholder="— بدون مسؤول —"
                clearable
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
              {submitting ? "جاري الحفظ..." : "حفظ"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OperatingUnitsPage;
