import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Building2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { isAxiosError } from "axios";
import {
  useOperatingUnit,
  useAuditLog,
  useRestoreOperatingUnit,
  useUpdateOperatingUnit,
} from "../../hooks/useOperatingUnits";
import { useAccounts } from "../../hooks/useAccounting";
import type { Account } from "../../api/endpoints/accounting";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { OperatingUnitAccountsEditor } from "../../components/admin/OperatingUnitAccountsEditor";
import {
  useOperatingUnitWarehouses,
  useCreateOperatingUnitWarehouse,
  useUpdateWarehouse,
  useDeleteWarehouse,
  Warehouse,
} from "../../hooks/useWarehouses";
import { useUsers } from "../../hooks/useUsers";
import { toast } from "../../stores/toastStore";
import { LEDGER_ERROR_MESSAGE, apiErrorMessage, apiErrorPayload } from "../../api/endpoints/production";
import { AuditLogFiltersBar } from "../../components/audit-log/AuditLogFilters";
import { AuditLogTimeline } from "../../components/audit-log/AuditLogTimeline";
import { AuditLogFilters } from "../../types/entities";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/Dialog";
import { leafAccounts } from "../../lib/utils/coa";

const formatDateTime = (iso?: string): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const STATUS_LABEL: Record<string, string> = {
  active: "نشطة",
  provisioning: "قيد الإعداد",
  inactive: "معطلة",
};

export const OperatingUnitDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const unitQuery = useOperatingUnit(id);
  const warehousesQuery = useOperatingUnitWarehouses(id);
  const usersQuery = useUsers();
  const restoreMutation = useRestoreOperatingUnit();
  const updateUnitMutation = useUpdateOperatingUnit();
  const { data: accounts = [] } = useAccounts();
  const revenueAccounts = useMemo(
    () =>
      leafAccounts(accounts, [], [unitQuery.data?.revenue_account_id]).filter(
        (a) => a.type === "revenue" && a.account_code.startsWith("4"),
      ),
    [accounts, unitQuery.data?.revenue_account_id],
  );
  const createWarehouseMutation = useCreateOperatingUnitWarehouse(id);
  const updateWarehouseMutation = useUpdateWarehouse(id);
  const deleteWarehouseMutation = useDeleteWarehouse(id);

  const [addWarehouseOpen, setAddWarehouseOpen] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [newWarehouseInternal, setNewWarehouseInternal] = useState(true);

  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [editWarehouseName, setEditWarehouseName] = useState("");
  const [editWarehouseInternal, setEditWarehouseInternal] = useState(true);

  const [deletingWarehouse, setDeletingWarehouse] = useState<Warehouse | null>(null);

  const [filters, setFilters] = useState<AuditLogFilters>({});
  const auditQuery = useAuditLog({
    table: "operating_units",
    recordId: id,
    action: filters.action,
    from: filters.from,
    to: filters.to,
  });

  const unit = unitQuery.data;
  const isDeleted = Boolean(unit?.deleted_at);
  const warehouses = useMemo(() => {
    if (warehousesQuery.data) return warehousesQuery.data;
    if (unit?.warehouses) return unit.warehouses;
    return [];
  }, [warehousesQuery.data, unit?.warehouses]);

  const userLookup = useMemo(() => {
    const map: Record<string, string> = {};
    (usersQuery.data ?? []).forEach((u) => { map[u.id] = u.name; });
    return map;
  }, [usersQuery.data]);

  if (unitQuery.isLoading) {
    return <div className="p-6 text-center text-xs text-app-label-secondary">جاري التحميل...</div>;
  }

  if (unitQuery.isError || !unit) {
    const msg = apiErrorPayload(unitQuery.error)?.message || (isAxiosError(unitQuery.error) ? unitQuery.error.response?.data?.message : null);
    return (
      <div className="space-y-4 p-6" dir="rtl">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline"
        >
          <ArrowRight className="h-3 w-3" />
          رجوع
        </button>
        <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-center text-xs text-app-status-danger">
          {msg ?? "تعذر تحميل بيانات الوحدة."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline"
        >
          <ArrowRight className="h-3 w-3" />
          رجوع للقائمة
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              unitQuery.refetch();
              warehousesQuery.refetch();
              auditQuery.refetch();
            }}
            className="flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1"
          >
            <RefreshCw className={`h-4 w-4 ${unitQuery.isFetching ? "animate-spin" : ""}`} />
            تحديث
          </button>
          {isDeleted && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await restoreMutation.mutateAsync(unit.id);
                  toast.success("تمت الاستعادة.");
                } catch (err) {
                  toast.error(apiErrorPayload(err)?.message || "فشل الاستعادة.");
                }
              }}
              className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
            >
              استعادة الوحدة
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-bold text-app-label-primary">{unit.name}</h1>
        <span
          className={
            isDeleted
              ? "inline-flex items-center rounded-full bg-app-status-danger/15 px-2 py-0.5 text-[10px] font-bold text-app-status-danger"
              : "inline-flex items-center rounded-full bg-app-status-positive/15 px-2 py-0.5 text-[10px] font-bold text-app-status-positive"
          }
        >
          {isDeleted ? "محذوفة" : STATUS_LABEL[unit.status ?? "active"] ?? unit.status}
        </span>
        <span className="text-[11px] font-mono text-app-label-secondary">{unit.unit_type}</span>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4">
          <h2 className="mb-3 text-xs font-bold uppercase text-app-label-secondary">معلومات الوحدة</h2>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-app-label-secondary">القالب</dt>
              <dd className="mt-0.5 flex items-center gap-1 font-semibold text-app-label-primary">
                <Building2 className="h-3 w-3 text-app-label-secondary" />
                {unit.blueprint?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-app-label-secondary">المسؤول</dt>
              <dd className="mt-0.5 flex items-center gap-1 font-semibold text-app-label-primary">
                <UserIcon className="h-3 w-3 text-app-label-secondary" />
                {unit.manager?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-app-label-secondary">العملة</dt>
              <dd className="mt-0.5 font-mono font-semibold text-app-label-primary">
                {unit.currency ?? "LYD"}
              </dd>
            </div>
            <div>
              <dt className="text-app-label-secondary">تاريخ الإنشاء</dt>
              <dd className="mt-0.5 font-mono text-app-label-primary">
                {formatDateTime(unit.created_at)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-app-label-secondary mb-1">حساب إيرادات المبيعات</dt>
              <dd>
                <SearchableSelect<Account>
                  options={revenueAccounts}
                  value={revenueAccounts.find((a) => a.id === unit.revenue_account_id) ?? null}
                  onChange={(a) =>
                    updateUnitMutation.mutate(
                      { id: unit.id, revenue_account_id: a ? a.id : null },
                      {
                        onSuccess: () => toast.success("تم تحديث حساب الإيرادات"),
                        onError: (err) =>
                          toast.error(apiErrorPayload(err)?.message ?? "تعذّر تحديث حساب الإيرادات"),
                      },
                    )
                  }
                  getOptionId={(a) => a.id}
                  getOptionLabel={(a) => `${a.account_code} — ${a.name}`}
                  getOptionSearchText={(a) => `${a.account_code} ${a.name}`}
                  placeholder="غير محدد — لا تستطيع الوحدة البيع قبل تحديده"
                  disabled={isDeleted || updateUnitMutation.isPending}
                  size="sm"
                />
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <WarehouseIcon className="h-4 w-4 text-app-accent" />
              <h2 className="text-xs font-bold uppercase text-app-label-secondary">
                المستودعات ({warehouses.length})
              </h2>
            </div>
            {!isDeleted && (
              <button
                type="button"
                onClick={() => {
                  setNewWarehouseName("");
                  setNewWarehouseInternal(true);
                  setAddWarehouseOpen(true);
                }}
                className="flex items-center gap-1 rounded-lg bg-app-accent/10 px-2.5 py-1 text-xs font-semibold text-app-accent hover:bg-app-accent/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                إضافة مستودع
              </button>
            )}
          </div>
          {warehouses.length === 0 ? (
            <div className="py-6 text-center text-xs text-app-label-secondary">
              لا توجد مستودعات تابعة لهذه الوحدة التشغيلية.
            </div>
          ) : (
            <ul className="space-y-2">
              {warehouses.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded-xl border border-app-separator/50 bg-app-bg-secondary p-2.5 text-xs transition-colors hover:border-app-separator"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-app-accent/10 text-app-accent">
                      <MapPin className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="font-semibold text-app-label-primary">{w.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-app-label-secondary">
                        <span
                          className={`inline-block h-1.5 w-1.5 rounded-full ${
                            w.is_internal_unit ? "bg-app-status-positive" : "bg-app-accent"
                          }`}
                        />
                        <span>{w.is_internal_unit ? "مستودع داخلي" : "مستودع خارجي"}</span>
                      </div>
                    </div>
                  </div>
                  {!isDeleted && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingWarehouse(w);
                          setEditWarehouseName(w.name);
                          setEditWarehouseInternal(Boolean(w.is_internal_unit));
                        }}
                        className="rounded-lg p-1.5 text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary transition-colors"
                        title="تعديل المستودع"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingWarehouse(w)}
                        className="rounded-lg p-1.5 text-app-status-danger/70 hover:bg-app-status-danger/10 hover:text-app-status-danger transition-colors"
                        title="حذف المستودع"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-app-accent" />
          <h2 className="text-sm font-bold text-app-label-primary">ربط الحسابات بدليل الحسابات</h2>
        </div>
        {!isDeleted && <OperatingUnitAccountsEditor unitId={unit.id} />}
        {isDeleted && (
          <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-4 text-xs text-app-label-secondary">
            لا يمكن تعديل الحسابات على وحدة محذوفة.
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-app-accent" />
          <h2 className="text-sm font-bold text-app-label-primary">سجل النشاط</h2>
          <span className="text-[10px] text-app-label-tertiary">
            ({auditQuery.data?.length ?? 0} حدث)
          </span>
        </div>
        <AuditLogFiltersBar filters={filters} onChange={setFilters} />
        {auditQuery.isLoading ? (
          <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-6 text-center text-xs text-app-label-secondary">
            جاري التحميل...
          </div>
        ) : (
          <AuditLogTimeline
            entries={auditQuery.data ?? []}
            userLookup={userLookup}
            emptyMessage="لا توجد سجلات نشاط (ربما لم تتطابق المرشحات)."
          />
        )}
      </section>

      {/* Add Warehouse Dialog */}
      <Dialog open={addWarehouseOpen} onOpenChange={setAddWarehouseOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>إضافة مستودع جديد</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newWarehouseName.trim()) {
                toast.error("يرجى إدخال اسم المستودع.");
                return;
              }
              // W6-06: a top-level name is unique within the unit.
              if (warehouses.some((w) => !w.parent_id && w.name.trim() === newWarehouseName.trim())) {
                toast.error(LEDGER_ERROR_MESSAGE.WAREHOUSE_NAME_TAKEN);
                return;
              }
              try {
                await createWarehouseMutation.mutateAsync({
                  name: newWarehouseName.trim(),
                  is_internal_unit: newWarehouseInternal,
                });
                toast.success("تمت إضافة المستودع بنجاح.");
                setAddWarehouseOpen(false);
              } catch (err) {
                toast.error(apiErrorMessage(err, "تعذر إضافة المستودع."));
              }
            }}
          >
            <DialogBody className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-app-label-secondary">
                  اسم المستودع <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  value={newWarehouseName}
                  onChange={(e) => setNewWarehouseName(e.target.value)}
                  placeholder="مثال: مستودع المواد الخام، مستودع المعرض"
                  required
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary placeholder:text-app-label-tertiary focus:border-app-accent focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newWarehouseInternal}
                  onChange={(e) => setNewWarehouseInternal(e.target.checked)}
                  className="h-4 w-4 rounded border-app-separator text-app-accent focus:ring-app-accent"
                />
                <span className="text-xs text-app-label-primary">مستودع داخلي تابع للمنشأة</span>
              </label>
            </DialogBody>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setAddWarehouseOpen(false)}
                className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={createWarehouseMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {createWarehouseMutation.isPending ? "جاري الحفظ..." : "حفظ المستودع"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Warehouse Dialog */}
      <Dialog
        open={Boolean(editingWarehouse)}
        onOpenChange={(open) => !open && setEditingWarehouse(null)}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تعديل بيانات المستودع</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editingWarehouse || !editWarehouseName.trim()) {
                toast.error("يرجى إدخال اسم المستودع.");
                return;
              }
              // W6-06: unique among the warehouses that share its parent (or the unit's top level).
              if (
                warehouses.some(
                  (w) =>
                    w.id !== editingWarehouse.id &&
                    (w.parent_id ?? null) === (editingWarehouse.parent_id ?? null) &&
                    w.name.trim() === editWarehouseName.trim(),
                )
              ) {
                toast.error(LEDGER_ERROR_MESSAGE.WAREHOUSE_NAME_TAKEN);
                return;
              }
              try {
                await updateWarehouseMutation.mutateAsync({
                  id: editingWarehouse.id,
                  name: editWarehouseName.trim(),
                  is_internal_unit: editWarehouseInternal,
                });
                toast.success("تم تحديث المستودع بنجاح.");
                setEditingWarehouse(null);
              } catch (err) {
                toast.error(apiErrorMessage(err, "تعذر تحديث المستودع."));
              }
            }}
          >
            <DialogBody className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-app-label-secondary">
                  اسم المستودع <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  value={editWarehouseName}
                  onChange={(e) => setEditWarehouseName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editWarehouseInternal}
                  onChange={(e) => setEditWarehouseInternal(e.target.checked)}
                  className="h-4 w-4 rounded border-app-separator text-app-accent focus:ring-app-accent"
                />
                <span className="text-xs text-app-label-primary">مستودع داخلي تابع للمنشأة</span>
              </label>
            </DialogBody>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setEditingWarehouse(null)}
                className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={updateWarehouseMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {updateWarehouseMutation.isPending ? "جاري التحديث..." : "حفظ التعديلات"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Warehouse Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingWarehouse)}
        onClose={() => setDeletingWarehouse(null)}
        title="تأكيد حذف المستودع"
        message={`هل أنت متأكد من رغبتك في حذف مستودع "${deletingWarehouse?.name}"؟ لا يمكن حذف المستودع إذا كان يحتوي على مخزون أو إذا كان المستودع الوحيد للوحدة.`}
        confirmText="حذف المستودع"
        cancelText="إلغاء"
        variant="danger"
        isLoading={deleteWarehouseMutation.isPending}
        onConfirm={async () => {
          if (!deletingWarehouse) return;
          try {
            await deleteWarehouseMutation.mutateAsync(deletingWarehouse.id);
            toast.success("تم حذف المستودع بنجاح.");
            setDeletingWarehouse(null);
          } catch (err) {
            const errPayload = apiErrorPayload(err);
            if (errPayload?.code === "WAREHOUSE_NOT_EMPTY") {
              toast.error("لا يمكن حذف المستودع لوجود مخزون وأرصدة حالية مسجلة به.");
            } else if (errPayload?.code === "CANNOT_DELETE_LAST_WAREHOUSE") {
              toast.error("لا يمكن حذف المستودع الوحيد للوحدة التشغيلية.");
            } else {
              toast.error(errPayload?.message || "تعذر حذف المستودع.");
            }
          }
        }}
      />
    </div>
  );
};

export default OperatingUnitDetailPage;
