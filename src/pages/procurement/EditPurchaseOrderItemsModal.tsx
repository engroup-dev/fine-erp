import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, ListChecks, Loader2 } from "lucide-react";
import { isAxiosError } from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../../components/ui/Dialog";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { formatNumber } from "../../lib/utils/format";
import { useInventoryItems } from "../../hooks/useInventory";
import { useUpdatePurchaseOrder } from "../../hooks/useProcurement";
import { apiErrorPayload } from "../../api/endpoints/production";
import { toast } from "../../stores/toastStore";
import { tokens } from "../../lib/tokens";
import { cn } from "../../lib/utils/utils";
import type { InventoryItem } from "../../api/endpoints/inventory";
import type {
  PurchaseOrder,
  PurchaseOrderItemInput,
} from "../../types/procurement";

export interface EditPurchaseOrderItemsModalProps {
  order: PurchaseOrder;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updated: PurchaseOrder) => void;
}

export const EditPurchaseOrderItemsModal: React.FC<EditPurchaseOrderItemsModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [itemTypeFilter, setItemTypeFilter] = useState<
    "raw_material" | "packaging" | "barrel" | "pallet"
  >("raw_material");

  const { data: inventoryItemsPage } = useInventoryItems({
    item_type: itemTypeFilter,
  });
  const inventoryItems: InventoryItem[] = inventoryItemsPage?.data ?? [];
  const updateMutation = useUpdatePurchaseOrder();

  const [lineItems, setLineItems] = useState<PurchaseOrderItemInput[]>([]);

  useEffect(() => {
    if (isOpen) {
      if (order.items?.data && order.items.data.length > 0) {
        setLineItems(
          order.items.data.map((item) => ({
            inventory_item_id: item.inventory_item_id,
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.unit_price) || 0,
          })),
        );
      } else {
        setLineItems([{ inventory_item_id: "", quantity: 1, unit_price: 0 }]);
      }
    }
  }, [isOpen, order]);

  const addLine = () => {
    setLineItems((prev) => [
      ...prev,
      { inventory_item_id: "", quantity: 1, unit_price: 0 },
    ]);
  };

  const removeLine = (idx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (
    idx: number,
    patch: Partial<PurchaseOrderItemInput>,
  ) => {
    setLineItems((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  };

  const totalCalculated = useMemo(
    () =>
      lineItems.reduce(
        (sum, line) =>
          sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0),
        0,
      ),
    [lineItems],
  );

  const findItem = (id: string): InventoryItem | undefined =>
    inventoryItems.find((it: InventoryItem) => it.id === id);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanLines = lineItems.filter(
      (l) =>
        l.inventory_item_id &&
        Number(l.quantity) > 0 &&
        Number(l.unit_price) > 0,
    );

    if (cleanLines.length === 0) {
      toast.error("أضف بندًا واحدًا على الأقل بصنف وكمية وسعر صحيحين");
      return;
    }

    updateMutation.mutate(
      {
        id: order.id,
        payload: { items: cleanLines },
      },
      {
        onSuccess: (updated) => {
          toast.success("تم تحديث بنود أمر الاستيراد بنجاح");
          onSuccess?.(updated);
          onClose();
        },
        onError: (err: unknown) => {
          const payloadErr = apiErrorPayload(err);
          const message =
            payloadErr?.message ||
            (isAxiosError(err) ? err.response?.data?.message : null);
          toast.error(message || "فشل تحديث بنود أمر الاستيراد");
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-app-accent" />
            <span>تعديل بنود أمر الاستيراد</span>
          </DialogTitle>
          <DialogDescription>
            تعديل أصناف وكميات وأسعار بنود الأمر (المسودة). المورد:{" "}
            <span className="font-semibold text-app-label-primary">
              {order.supplier?.name ?? "—"}
            </span>{" "}
            | العملة:{" "}
            <span className="font-semibold font-mono text-app-label-primary">
              {order.currency}
            </span>
          </DialogDescription>
          <DialogClose />
        </DialogHeader>

        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            {/* Filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { value: "raw_material", label: "مواد خام" },
                  { value: "packaging", label: "مواد تعبئة" },
                  { value: "barrel", label: "براميل" },
                  { value: "pallet", label: "بالتات" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setItemTypeFilter(opt.value)}
                  className={cn(
                    tokens.typography.webUI.c1Emphasized,
                    "rounded-full px-3 py-1 transition-colors",
                    itemTypeFilter === opt.value
                      ? "bg-app-accent text-white"
                      : "bg-app-bg-secondary text-app-label-secondary hover:bg-app-fill-f1",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Line items list */}
            <div className="space-y-3">
              {lineItems.map((line, idx) => {
                const selectedItem = findItem(line.inventory_item_id);
                const lineTotal =
                  (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);

                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-app-separator bg-app-bg-secondary p-3 space-y-2"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <label className="block text-xs font-semibold text-app-label-secondary mb-1">الصنف</label>
                        <SearchableSelect<InventoryItem>
                          options={inventoryItems}
                          value={
                            line.inventory_item_id
                              ? inventoryItems.find(
                                  (it: InventoryItem) => it.id === line.inventory_item_id,
                                ) ?? null
                              : null
                          }
                          onChange={(item) =>
                            updateLine(idx, {
                              inventory_item_id: item ? item.id : "",
                              unit_price:
                                item && item.purchase_price !== null && item.purchase_price !== undefined && (!line.unit_price || Number(line.unit_price) === 0)
                                  ? Number(item.purchase_price)
                                  : line.unit_price,
                            })
                          }
                          getOptionId={(it) => it.id}
                          getOptionLabel={(it) => it.name}
                          getOptionSubLabel={(it) =>
                            `${it.code} · ${it.unit_of_measure}${
                              it.purchase_price ? ` · سعر الشراء: ${it.purchase_price} د.ل` : ""
                            }`
                          }
                          getOptionSearchText={(it) => `${it.name} ${it.code}`}
                          placeholder="اختر صنفًا..."
                          size="sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lineItems.length <= 1}
                        className="rounded-lg p-1.5 text-app-status-danger hover:bg-app-status-danger/10 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        title="حذف البند"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {selectedItem && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded-full bg-app-bg-primary px-2 py-0.5 font-mono text-app-label-secondary border border-app-separator">
                          {selectedItem.code}
                        </span>
                        <span className="rounded-full bg-app-bg-primary px-2 py-0.5 text-app-label-secondary border border-app-separator">
                          {selectedItem.unit_of_measure}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                          الكمية
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          value={line.quantity || ""}
                          onChange={(e) =>
                            updateLine(idx, {
                              quantity: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-1.5 font-mono text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                          سعر الوحدة ({order.currency})
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          value={line.unit_price || ""}
                          onChange={(e) =>
                            updateLine(idx, {
                              unit_price: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-1.5 font-mono text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                          إجمالي البند
                        </label>
                        <div className="flex h-[32px] items-center rounded-xl bg-app-bg-primary px-3 font-mono text-xs font-bold text-app-accent border border-app-separator">
                          {formatNumber(lineTotal)} {order.currency}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add line button */}
            <div className="flex justify-between items-center border-t border-app-separator pt-3">
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1 rounded-lg border border-app-accent px-3 py-1.5 text-xs font-bold text-app-accent hover:bg-app-accent-subtle transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> إضافة بند جديد
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-app-label-secondary">
                  إجمالي الأمر المعدل:
                </span>
                <span className="font-mono text-sm font-bold text-emerald-700">
                  {formatNumber(totalCalculated)} {order.currency}
                </span>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {updateMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              <span>حفظ التعديلات</span>
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
