import React, { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Edit, Gauge, Plus, Trash2 } from "lucide-react";
import { useInventoryItem } from "../../hooks/useInventory";
import {
  useCreateItemStockLevel,
  useDeleteItemStockLevel,
  useItemStockLevels,
  useUpdateItemStockLevel,
} from "../../hooks/useStockLevels";
import { usePermissions } from "../../hooks/usePermissions";
import { useCountableWarehouses } from "../../components/inventory/StockCountDialogs";
import { ItemPageTabs } from "../../components/inventory/ItemPageTabs";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import type { ColumnDef } from "../../components/ui/DataTable";
import { RowActionsMenu, RowActionItem } from "../../components/ui/RowActionsMenu";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/Dialog";
import { Field, formInputClass as inputClass } from "../../components/ui/GuidedForm";
import {
  ItemStockLevel,
  STOCK_LEVEL_ERROR_MESSAGE,
  stockLevelErrorMessage,
  toQty,
} from "../../api/endpoints/stockLevels";
import { UOM_LABELS } from "../../api/endpoints/inventory";
import { toast } from "../../stores/toastStore";
import { formatNumber } from "../../lib/utils/format";
import { cn } from "../../lib/utils/utils";
import { tokens } from "../../lib/tokens";

const type = tokens.typography.webUI;

const qty = (v: number | string | null | undefined): string =>
  v === null || v === undefined || v === "" ? "—" : formatNumber(v, { maximumFractionDigits: 4 });

/** An empty box sends null; anything else a number. */
const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

interface LevelForm {
  warehouse_id: string;
  min_qty: string;
  max_qty: string;
  reorder_qty: string;
  bin_location: string;
}

const EMPTY_FORM: LevelForm = { warehouse_id: "", min_qty: "", max_qty: "", reorder_qty: "", bin_location: "" };

const formFrom = (level: ItemStockLevel): LevelForm => {
  const show = (v: number | string | null) => {
    const n = toQty(v);
    return n === null ? "" : String(n);
  };
  return {
    warehouse_id: level.warehouse_id,
    min_qty: show(level.min_qty),
    max_qty: Number(level.max_qty) > 0 ? show(level.max_qty) : "",
    reorder_qty: show(level.reorder_qty),
    bin_location: level.bin_location ?? "",
  };
};

/** Router state a screen passes when it links here, so the back link returns to it. */
export interface StockLevelsBackState {
  backTo: string;
  backLabel: string;
}

/**
 * The item page's "حدود المخزون" tab (W4-02): per warehouse of the current
 * unit, the min/max limits, the usual reorder quantity and the shelf (bin)
 * new lots of this item land on. Max 0 records only the bin.
 *
 * Mounted twice: /settings/products/items/:id/levels (a tab beside the item's
 * catalog data) and /inventory/items/:id/levels for the inventory roles, who
 * write levels but cannot open /settings/* — there it has no catalog tab.
 */
const InventoryItemStockLevelsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const fromInventory = location.pathname.startsWith("/inventory/");
  const backState = location.state as Partial<StockLevelsBackState> | null;
  const back =
    backState?.backTo && backState.backLabel
      ? { to: backState.backTo, label: backState.backLabel }
      : fromInventory
        ? { to: "/inventory/reorder", label: "تقرير إعادة الطلب" }
        : { to: "/settings/products/items", label: "الأصناف" };
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("edit-inventory");

  const { data: item } = useInventoryItem(id);
  const { data: levels, isLoading } = useItemStockLevels({ inventory_item_id: id }, Boolean(id));
  const warehouses = useCountableWarehouses();
  const createMutation = useCreateItemStockLevel();
  const updateMutation = useUpdateItemStockLevel();
  const deleteMutation = useDeleteItemStockLevel();

  const [editing, setEditing] = useState<ItemStockLevel | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<LevelForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ItemStockLevel | null>(null);

  const unitLabel = item ? UOM_LABELS[item.unit_of_measure] ?? item.unit_of_measure : "";
  const warehouseLabel = useMemo(() => new Map(warehouses.map((w) => [w.id, w.label])), [warehouses]);
  const usedWarehouseIds = useMemo(() => new Set((levels ?? []).map((l) => l.warehouse_id)), [levels]);
  const freeWarehouses = warehouses.filter((w) => !usedWarehouseIds.has(w.id));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, warehouse_id: freeWarehouses[0]?.id ?? "" });
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = useCallback((level: ItemStockLevel) => {
    setEditing(level);
    setForm(formFrom(level));
    setFormError(null);
    setIsFormOpen(true);
  }, []);

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setFormError(null);

    const fields = {
      min_qty: numOrNull(form.min_qty),
      max_qty: numOrNull(form.max_qty),
      reorder_qty: numOrNull(form.reorder_qty),
      bin_location: form.bin_location.trim() || null,
    };

    // BR-STK-004, checked here too so the answer is immediate; the server has the final word.
    if ((fields.max_qty ?? 0) < (fields.min_qty ?? 0)) {
      setFormError(STOCK_LEVEL_ERROR_MESSAGE.STOCK_LEVEL_INVALID);
      return;
    }

    const onError = (err: unknown) => setFormError(stockLevelErrorMessage(err, "تعذّر حفظ حدود المخزون."));

    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: { ...fields, record_version: editing.record_version } },
        {
          onSuccess: () => {
            toast.success("تم حفظ حدود المخزون");
            closeForm();
          },
          onError,
        },
      );
    } else {
      createMutation.mutate(
        { inventory_item_id: id, warehouse_id: form.warehouse_id, ...fields },
        {
          onSuccess: () => {
            toast.success("تمت إضافة حدود المخزون");
            closeForm();
          },
          onError,
        },
      );
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success("تم حذف حدود المخزون");
        setPendingDelete(null);
      },
      onError: (err) => {
        toast.error(stockLevelErrorMessage(err, "تعذّر حذف حدود المخزون."));
        setPendingDelete(null);
      },
    });
  };

  const columns = useMemo<ColumnDef<ItemStockLevel, unknown>[]>(() => {
    const cols: ColumnDef<ItemStockLevel, unknown>[] = [
      {
        id: "warehouse",
        header: "المخزن",
        meta: { exportValue: (l) => warehouseLabel.get(l.warehouse_id) ?? l.warehouse?.name },
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs font-semibold text-app-label-primary">
            {warehouseLabel.get(row.original.warehouse_id) ?? row.original.warehouse?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "min_qty",
        header: "الحد الأدنى",
        enableSorting: false,
        meta: { exportValue: (l) => (Number(l.max_qty) > 0 ? l.min_qty : null), className: "font-mono" },
        cell: ({ row }) => (Number(row.original.max_qty) > 0 ? qty(row.original.min_qty) : "—"),
      },
      {
        id: "max_qty",
        header: "الحد الأقصى",
        enableSorting: false,
        meta: { exportValue: (l) => (Number(l.max_qty) > 0 ? l.max_qty : null), className: "font-mono" },
        cell: ({ row }) =>
          Number(row.original.max_qty) > 0 ? (
            qty(row.original.max_qty)
          ) : (
            <span className="font-sans text-[11px] text-app-label-tertiary">بدون حدود — موقع الرف فقط</span>
          ),
      },
      {
        id: "reorder_qty",
        header: "كمية إعادة الطلب",
        enableSorting: false,
        meta: { exportValue: (l) => l.reorder_qty, className: "font-mono" },
        cell: ({ row }) => qty(row.original.reorder_qty),
      },
      {
        id: "bin_location",
        header: "موقع الرف",
        enableSorting: false,
        meta: { exportValue: (l) => l.bin_location, className: "font-mono" },
        cell: ({ row }) => row.original.bin_location ?? "—",
      },
    ];

    if (canEdit) {
      cols.push({
        id: "actions",
        header: "الإجراءات",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const items: RowActionItem[] = [
            { label: "تعديل", icon: Edit, onClick: () => openEdit(row.original) },
            { label: "حذف", icon: Trash2, danger: true, onClick: () => setPendingDelete(row.original) },
          ];
          return <RowActionsMenu items={items} />;
        },
      });
    }

    return cols;
  }, [canEdit, warehouseLabel, openEdit]);

  const tableData = useMemo(() => levels ?? [], [levels]);
  const table = useDataTable({
    exportFileName: "item-stock-levels",
    columns,
    data: tableData,
    enableSorting: false,
    enablePagination: false,
    getRowId: (l) => l.id,
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="space-y-2">
        <Link
          to={back.to}
          className={cn(type.c1Emphasized, "flex w-fit items-center gap-1 text-app-accent hover:underline")}
        >
          <ArrowRight className="h-4 w-4" />
          {back.label}
        </Link>
        <h1 className={cn(type.largeTitleEmphasized, "text-app-label-primary")}>
          {item ? (fromInventory ? `حدود المخزون: ${item.name}` : `تعديل: ${item.name}`) : "الصنف"}
        </h1>
        {id && !fromInventory && <ItemPageTabs itemId={id} />}
      </div>

      <div className="max-w-5xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-app-label-primary">
              <Gauge className="h-4 w-4 text-app-accent" />
              حدود المخزون لكل مخزن
            </h2>
            <p className="text-xs text-app-label-secondary mt-1">
              عندما ينزل الرصيد المتاح في المخزن إلى الحد الأدنى يظهر الصنف في تقرير إعادة الطلب بكمية مقترحة = الحد
              الأقصى − الرصيد. موقع الرف يُسجَّل تلقائياً على الدفعات الجديدة الواردة إلى هذا المخزن.
              {unitLabel && <> الكميات بوحدة الصنف ({unitLabel}).</>}
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openCreate}
              disabled={freeWarehouses.length === 0}
              title={freeWarehouses.length === 0 ? "لكل مخازن الوحدة حدود مسجّلة لهذا الصنف" : undefined}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> إضافة حدود لمخزن
            </button>
          )}
        </div>

        <DataTable table={table}>
          <DataTable.Content
            isLoading={isLoading}
            emptyMessage="لم تُحدَّد حدود مخزون لهذا الصنف في مخازن الوحدة الحالية."
            emptyIcon={Gauge}
          />
        </DataTable>
      </div>

      <Dialog open={isFormOpen} onOpenChange={(next) => !next && closeForm()}>
        <DialogContent size="md">
          <DialogHeader>
            <div>
              <DialogTitle>{editing ? "تعديل حدود المخزون" : "إضافة حدود مخزون"}</DialogTitle>
              <DialogDescription>{item ? `${item.name} (${item.code})` : ""}</DialogDescription>
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <form id="stock-level-form" onSubmit={submit} className="space-y-4">
              {formError && (
                <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <Field label="المخزن">
                {editing ? (
                  <div className={cn(inputClass, "bg-app-fill-f1 text-app-label-secondary")}>
                    {warehouseLabel.get(editing.warehouse_id) ?? editing.warehouse?.name ?? "—"}
                  </div>
                ) : (
                  <select
                    required
                    value={form.warehouse_id}
                    onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      اختر المخزن
                    </option>
                    {freeWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="الحد الأدنى">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="0"
                    value={form.min_qty}
                    onChange={(e) => setForm({ ...form, min_qty: e.target.value })}
                    className={cn(inputClass, "font-mono")}
                    dir="ltr"
                  />
                </Field>
                <Field label="الحد الأقصى">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="0"
                    value={form.max_qty}
                    onChange={(e) => setForm({ ...form, max_qty: e.target.value })}
                    className={cn(inputClass, "font-mono")}
                    dir="ltr"
                  />
                </Field>
                <Field label="كمية إعادة الطلب">
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="—"
                    value={form.reorder_qty}
                    onChange={(e) => setForm({ ...form, reorder_qty: e.target.value })}
                    className={cn(inputClass, "font-mono")}
                    dir="ltr"
                  />
                </Field>
              </div>
              <p className={cn(type.c1Regular, "text-app-label-tertiary")}>
                اترك الحدين فارغين لتسجيل موقع الرف فقط دون حدود (لا يظهر الصنف في تقرير إعادة الطلب).
              </p>

              <Field label="موقع الرف" hint="مثال: A-03 — يُقترح على الدفعات الجديدة من هذا الصنف في هذا المخزن">
                <input
                  type="text"
                  maxLength={50}
                  placeholder="A-03"
                  value={form.bin_location}
                  onChange={(e) => setForm({ ...form, bin_location: e.target.value })}
                  className={cn(inputClass, "font-mono")}
                  dir="ltr"
                />
              </Field>
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="stock-level-form"
              disabled={isSaving || (!editing && !form.warehouse_id)}
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {isSaving ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="حذف حدود المخزون"
        message={`حذف حدود هذا الصنف وموقع رفه في مخزن "${
          pendingDelete ? warehouseLabel.get(pendingDelete.warehouse_id) ?? pendingDelete.warehouse?.name ?? "" : ""
        }"؟ لا يغيّر ذلك مواقع الدفعات الموجودة.`}
        confirmText="حذف"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default InventoryItemStockLevelsPage;
