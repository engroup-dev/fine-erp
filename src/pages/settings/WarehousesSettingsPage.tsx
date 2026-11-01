import React, { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import {
  useWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  useDeleteWarehouse,
} from "../../hooks/useWarehouses";
import { useOperatingUnits } from "../../hooks/usePartners";
import { useReferenceLookups } from "../../hooks/useReferenceLookups";
import { useIsCompanyWide } from "../../hooks/useAccounting";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import type { Warehouse } from "../../types/entities";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/Dialog";
import { apiErrorMessage, apiErrorPayload } from "../../api/endpoints/production";
import { toast } from "../../stores/toastStore";

/** W6-06: warehouse names are unique among siblings (top-level per unit, sub-warehouses per parent). */
const TOP_NAME_TAKEN = "يوجد مخزن بهذا الاسم في هذه الوحدة التشغيلية — اختر اسماً آخر.";
const SUB_NAME_TAKEN = "يوجد موقع فرعي بهذا الاسم تحت هذا المخزن — اختر اسماً آخر.";

const nameTakenAmong = (siblings: Warehouse[] | undefined, name: string, ignoreId?: string) =>
  (siblings ?? []).some((s) => s.id !== ignoreId && s.name.trim() === name);

/** The Arabic refusal for a warehouse write; WAREHOUSE_NAME_TAKEN says which level clashed. */
const warehouseErrorMessage = (err: unknown, isSub: boolean, fallback: string): string =>
  apiErrorPayload(err)?.code === "WAREHOUSE_NAME_TAKEN"
    ? isSub
      ? SUB_NAME_TAKEN
      : TOP_NAME_TAKEN
    : apiErrorMessage(err, fallback);

/**
 * The real warehouse (+ sub-warehouse) CRUD, unified with what سجل المخزون
 * المسلسل والدفعات reads — this used to be split across two disconnected
 * "reference lookup" seed lists (fake warehouses, fake storage-locations);
 * a sub-warehouse is now just another `warehouses` row with a parent_id.
 */
export const WarehousesSettingsPage: React.FC = () => {
  const isCompanyWide = useIsCompanyWide();
  const { operatingUnitId } = useServerConfigStore();
  // Company-wide caller viewing "كل الوحدات" (no unit pinned) — the backend
  // can't infer a unit for a new top-level warehouse, so we need to ask for one.
  const needsUnitPicker = isCompanyWide && !operatingUnitId;

  const { data: warehouses, isLoading } = useWarehouses();
  const { data: operatingUnits } = useOperatingUnits();
  const { data: locationTypes } = useReferenceLookups("location-types");
  const createMutation = useCreateWarehouse();
  const updateMutation = useUpdateWarehouse();
  const deleteMutation = useDeleteWarehouse();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIsInternal, setNewIsInternal] = useState(true);
  const [newUnitId, setNewUnitId] = useState("");

  const [addingSubTo, setAddingSubTo] = useState<Warehouse | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [newSubType, setNewSubType] = useState("");

  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [editName, setEditName] = useState("");
  const [editIsInternal, setEditIsInternal] = useState(true);
  const [editType, setEditType] = useState("");

  const [deleting, setDeleting] = useState<Warehouse | null>(null);

  const warehouseList = useMemo(() => warehouses ?? [], [warehouses]);

  const openAdd = () => {
    setNewName("");
    setNewIsInternal(true);
    setNewUnitId("");
    setIsAddOpen(true);
  };

  const openAddSub = (parent: Warehouse) => {
    setNewSubName("");
    setNewSubType("");
    setAddingSubTo(parent);
  };

  const openEdit = (w: Warehouse) => {
    setEditing(w);
    setEditName(w.name);
    setEditIsInternal(Boolean(w.is_internal_unit));
    setEditType(w.location_type ?? "");
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("يرجى إدخال اسم المخزن.");
      return;
    }
    if (needsUnitPicker && !newUnitId) {
      toast.error("يرجى اختيار الوحدة التشغيلية التابع لها هذا المخزن.");
      return;
    }
    // Without a picker the list is already the target unit's (scoped server-side).
    const unitSiblings = needsUnitPicker
      ? warehouseList.filter((w) => w.operating_unit_id === newUnitId)
      : warehouseList;
    if (nameTakenAmong(unitSiblings, newName.trim())) {
      toast.error(TOP_NAME_TAKEN);
      return;
    }
    try {
      // W6-06: the unit travels as the X-Operating-Unit-ID header of this one
      // request (the backend refuses operating_unit_id in the body).
      await createMutation.mutateAsync({
        name: newName.trim(),
        is_internal_unit: newIsInternal,
        operatingUnitId: needsUnitPicker ? newUnitId : undefined,
      });
      toast.success("تمت إضافة المخزن بنجاح.");
      setIsAddOpen(false);
    } catch (err) {
      toast.error(warehouseErrorMessage(err, false, "تعذر إضافة المخزن."));
    }
  };

  const submitAddSub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingSubTo) return;
    if (!newSubName.trim()) {
      toast.error("يرجى إدخال اسم الموقع الفرعي.");
      return;
    }
    if (nameTakenAmong(addingSubTo.children, newSubName.trim())) {
      toast.error(SUB_NAME_TAKEN);
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: newSubName.trim(),
        parent_id: addingSubTo.id,
        location_type: newSubType || undefined,
      });
      toast.success("تمت إضافة الموقع الفرعي بنجاح.");
      setAddingSubTo(null);
    } catch (err) {
      toast.error(warehouseErrorMessage(err, true, "تعذر إضافة الموقع الفرعي."));
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editName.trim()) {
      toast.error("يرجى إدخال الاسم.");
      return;
    }
    const isChild = Boolean(editing.parent_id);
    const siblings = isChild
      ? warehouseList.find((w) => w.id === editing.parent_id)?.children
      : warehouseList.filter((w) => w.operating_unit_id === editing.operating_unit_id);
    if (nameTakenAmong(siblings, editName.trim(), editing.id)) {
      toast.error(isChild ? SUB_NAME_TAKEN : TOP_NAME_TAKEN);
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: editing.id,
        name: editName.trim(),
        ...(isChild ? { location_type: editType || null } : { is_internal_unit: editIsInternal }),
      });
      toast.success("تم التحديث بنجاح.");
      setEditing(null);
    } catch (err) {
      toast.error(warehouseErrorMessage(err, isChild, "تعذر التحديث."));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success("تم الحذف بنجاح.");
      setDeleting(null);
    } catch (err) {
      const payload = apiErrorPayload(err);
      if (payload?.code === "WAREHOUSE_NOT_EMPTY") {
        toast.error("لا يمكن حذف المخزن لوجود مخزون وأرصدة حالية مسجلة به.");
      } else if (payload?.code === "CANNOT_DELETE_LAST_WAREHOUSE") {
        toast.error("لا يمكن حذف المخزن الوحيد للوحدة التشغيلية.");
      } else if (payload?.code === "WAREHOUSE_HAS_CHILDREN") {
        toast.error("احذف المواقع الفرعية أولاً.");
      } else {
        toast.error(payload?.message || "تعذر الحذف.");
      }
    }
  };

  const locationTypeLabel = (code?: string | null) =>
    (locationTypes ?? []).find((t) => t.code === code)?.name ?? code ?? "—";

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <WarehouseIcon className="w-7 h-7 text-app-accent" />
            المخازن
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            المخازن الفعلية ومواقعها الفرعية (أرفف، مناطق، حاويات) — نفس المخازن التي تظهر في سجل المخزون المسلسل والدفعات.
          </p>
        </div>

        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> إضافة مخزن
        </button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-xs text-app-label-secondary">جاري التحميل...</div>
      ) : warehouseList.length === 0 ? (
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary py-14 text-center text-xs text-app-label-secondary">
          لا توجد مخازن مسجلة بعد.
        </div>
      ) : (
        <div className="space-y-3">
          {warehouseList.map((w) => (
            <div key={w.id} className="rounded-2xl border border-app-separator bg-app-bg-primary p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-app-accent/10 text-app-accent">
                    <WarehouseIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-app-label-primary">{w.name}</div>
                    <span className="mt-0.5 inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full bg-app-fill-f1 text-app-label-secondary">
                      {w.is_internal_unit ? "مخزن داخلي" : "مخزن خارجي"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openAddSub(w)}
                    className="flex items-center gap-1 rounded-lg bg-app-accent/10 px-2.5 py-1 text-xs font-semibold text-app-accent hover:bg-app-accent/20 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> موقع فرعي
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(w)}
                    className="rounded-lg p-1.5 text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary transition-colors"
                    title="تعديل المخزن"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(w)}
                    className="rounded-lg p-1.5 text-app-status-danger/70 hover:bg-app-status-danger/10 hover:text-app-status-danger transition-colors"
                    title="حذف المخزن"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {(w.children?.length ?? 0) > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-app-separator/60 pt-3">
                  {(w.children ?? []).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded-xl border border-app-separator/50 bg-app-bg-secondary p-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-app-label-primary">{c.name}</span>
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-app-fill-f1 text-app-label-secondary">
                          {locationTypeLabel(c.location_type)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="rounded-lg p-1 text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-label-primary transition-colors"
                          title="تعديل الموقع الفرعي"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(c)}
                          className="rounded-lg p-1 text-app-status-danger/70 hover:bg-app-status-danger/10 hover:text-app-status-danger transition-colors"
                          title="حذف الموقع الفرعي"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add warehouse */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>إضافة مخزن جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAdd}>
            <DialogBody className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-app-label-secondary">
                  اسم المخزن <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: مخزن المواد الخام"
                  required
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary placeholder:text-app-label-tertiary focus:border-app-accent focus:outline-none"
                />
              </div>

              {needsUnitPicker && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-app-label-secondary">
                    الوحدة التشغيلية التابع لها <span className="text-app-status-danger">*</span>
                  </label>
                  <SearchableSelect<{ id: string; name: string }>
                    options={operatingUnits ?? []}
                    value={operatingUnits?.find((u) => u.id === newUnitId) ?? null}
                    onChange={(u) => setNewUnitId(u ? u.id : "")}
                    getOptionId={(u) => u.id}
                    getOptionLabel={(u) => u.name}
                    placeholder="اختر الوحدة التشغيلية…"
                  />
                  <p className="text-[10px] text-app-label-tertiary">
                    أنت تعرض "كل الوحدات" حالياً، لذا يجب تحديد الوحدة التابع لها هذا المخزن.
                  </p>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newIsInternal}
                  onChange={(e) => setNewIsInternal(e.target.checked)}
                  className="h-4 w-4 rounded border-app-separator text-app-accent focus:ring-app-accent"
                />
                <span className="text-xs text-app-label-primary">مخزن داخلي تابع للمنشأة</span>
              </label>
            </DialogBody>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {createMutation.isPending ? "جاري الحفظ..." : "حفظ المخزن"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add sub-warehouse */}
      <Dialog open={Boolean(addingSubTo)} onOpenChange={(open) => !open && setAddingSubTo(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>إضافة موقع فرعي{addingSubTo ? ` — ${addingSubTo.name}` : ""}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitAddSub}>
            <DialogBody className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-app-label-secondary">
                  اسم الموقع <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="مثال: الرف A1"
                  required
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary placeholder:text-app-label-tertiary focus:border-app-accent focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-app-label-secondary">نوع الموقع</label>
                <SearchableSelect<{ id: string; name: string }>
                  options={(locationTypes ?? []).map((t) => ({ id: t.code, name: t.name }))}
                  value={
                    newSubType
                      ? { id: newSubType, name: locationTypeLabel(newSubType) }
                      : null
                  }
                  onChange={(t) => setNewSubType(t ? t.id : "")}
                  getOptionId={(t) => t.id}
                  getOptionLabel={(t) => t.name}
                  placeholder="اختر نوع الموقع… (اختياري)"
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setAddingSubTo(null)}
                className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {createMutation.isPending ? "جاري الحفظ..." : "حفظ الموقع الفرعي"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit warehouse or sub-warehouse */}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{editing?.parent_id ? "تعديل الموقع الفرعي" : "تعديل بيانات المخزن"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit}>
            <DialogBody className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-app-label-secondary">
                  الاسم <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                />
              </div>

              {editing?.parent_id ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-app-label-secondary">نوع الموقع</label>
                  <SearchableSelect<{ id: string; name: string }>
                    options={(locationTypes ?? []).map((t) => ({ id: t.code, name: t.name }))}
                    value={editType ? { id: editType, name: locationTypeLabel(editType) } : null}
                    onChange={(t) => setEditType(t ? t.id : "")}
                    getOptionId={(t) => t.id}
                    getOptionLabel={(t) => t.name}
                    placeholder="اختر نوع الموقع… (اختياري)"
                  />
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editIsInternal}
                    onChange={(e) => setEditIsInternal(e.target.checked)}
                    className="h-4 w-4 rounded border-app-separator text-app-accent focus:ring-app-accent"
                  />
                  <span className="text-xs text-app-label-primary">مخزن داخلي تابع للمنشأة</span>
                </label>
              )}
            </DialogBody>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
              >
                {updateMutation.isPending ? "جاري التحديث..." : "حفظ التعديلات"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        message={`هل أنت متأكد من رغبتك في حذف "${deleting?.name ?? ""}"؟ لا يمكن حذف مخزن يحتوي على مخزون، أو مواقع فرعية، أو كان المخزن الوحيد للوحدة.`}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};
