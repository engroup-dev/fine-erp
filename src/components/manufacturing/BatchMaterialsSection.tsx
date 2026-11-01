import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FlaskConical, Plus, Save, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ProductionBatch,
  ProductionBatchMaterial,
  apiErrorMessage,
  apiErrorPayload,
} from "../../api/endpoints/production";
import { InventoryItem, UOM_LABELS } from "../../api/endpoints/inventory";
import { useIssueBatchMaterials, useRemoveBatchMaterial } from "../../hooks/useProduction";
import { useInventoryItems } from "../../hooks/useInventory";
import { toast } from "../../stores/toastStore";
import { formatNumber } from "../../lib/utils/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../ui/Dialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { SearchableSelect } from "../ui/SearchableSelect";
import { DataTable, useDataTable } from "../ui/DataTable";
import { useBatchMaterialsColumns } from "../table-columns/batchMaterialsColumns";

interface IssueRow {
  key: string;
  /** The picked chemical, kept on the row so it survives a new server search. */
  item: InventoryItem | null;
  quantity: string;
}

const newIssueRow = (): IssueRow => ({
  key: Math.random().toString(36).slice(2),
  item: null,
  quantity: "",
});

/** The backend caps a page of items at 100; past that the operator must search. */
const PICKER_PAGE_SIZE = 100;

/** The unit in Arabic (the backend stores codes such as "liter"). */
const uomLabel = (u?: string | null): string => (u ? UOM_LABELS[u] ?? u : "");

const num = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * The refusal in Arabic. A batch closed elsewhere (another tab or session) is
 * refused with the generic INVALID_STATE_TRANSITION code, whose server text is
 * English, so it is mapped here rather than in the shared ledger table.
 */
const materialsErrorMessage = (err: unknown, fallback: string): string =>
  apiErrorPayload(err)?.code === "INVALID_STATE_TRANSITION"
    ? "الدفعة مغلقة، فلا يمكن تعديل موادها. حدّث الصفحة لعرض حالتها الحالية."
    : apiErrorMessage(err, fallback);

/**
 * A line another session already removed: the route-model binding misses and
 * Laravel answers with its default 404 body (an English "No query results for
 * model ..." message and no code), not one of our coded refusals.
 */
const isLineAlreadyRemoved = (err: unknown): boolean => {
  const response = (err as { response?: { status?: number; data?: { code?: string } } } | undefined)?.response;
  return response?.status === 404 && !response.data?.code;
};

/** The refusal in Arabic; a stock shortfall also names each chemical and how far short it is. */
const issueErrorMessage = (err: unknown): string => {
  const base = materialsErrorMessage(err, "تعذر صرف المواد.");
  const shortfalls = apiErrorPayload(err)?.shortfalls;
  if (!shortfalls || shortfalls.length === 0) return base;
  const details = shortfalls
    .map(
      (s) =>
        `${s.code ?? s.inventory_item_id}: المطلوب ${formatNumber(s.required, { maximumFractionDigits: 4 })}، المتاح ${formatNumber(s.available, { maximumFractionDigits: 4 })}`,
    )
    .join(" · ");
  return `${base} (${details})`;
};

/**
 * W4-05 (decision #11): chemicals issued to a foam batch. Each issue draws the
 * chemical oldest lot first from the unit's stock and moves its actual cost into
 * the batch; the batch's material cost is the total of these lines. Lines can be
 * removed (back to their lot) until the batch is closed.
 */
export const BatchMaterialsSection: React.FC<{ batch: ProductionBatch }> = ({ batch }) => {
  const isClosed = batch.status === "closed";
  const materials = useMemo(() => batch.materials ?? [], [batch.materials]);
  const total = useMemo(
    () => materials.reduce((sum, m) => sum + Number(m.total_cost ?? 0), 0),
    [materials],
  );
  // A cost typed by hand on a batch that never had chemicals issued (legacy or
  // manually costed). The first issue replaces it with the issued total.
  const manualCost = materials.length === 0 ? Number(batch.material_cost ?? 0) : 0;
  const hasManualCost = manualCost > 0;

  const [issueOpen, setIssueOpen] = useState(false);
  const [rows, setRows] = useState<IssueRow[]>([newIssueRow()]);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProductionBatchMaterial | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // The picker's search goes to the server (debounced): the raw-material
  // catalogue is shared by every unit and can outgrow one page. Only one
  // picker is open at a time, and each clears its search on close.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Raw materials with what is available on the current unit's shelves,
  // fetched only while the issue dialog is open.
  const { data: rawItems, isFetching: rawLoading } = useInventoryItems(
    {
      item_type: "raw_material",
      with_stock: 1,
      per_page: PICKER_PAGE_SIZE,
      search: debouncedSearch || undefined,
    },
    { enabled: issueOpen && !isClosed, keepPrevious: true },
  );
  const options = useMemo(() => rawItems?.data ?? [], [rawItems]);
  const moreThanShown = (rawItems?.total ?? 0) > options.length;
  const available = (item?: InventoryItem | null): number => Number(item?.available_quantity ?? 0);

  const issueMutation = useIssueBatchMaterials();
  const removeMutation = useRemoveBatchMaterial();

  // Several rows may name the same chemical; the server checks their sum.
  const requestedByItem = useMemo(() => {
    const sums = new Map<string, number>();
    for (const r of rows) {
      if (r.item) sums.set(r.item.id, (sums.get(r.item.id) ?? 0) + num(r.quantity));
    }
    return sums;
  }, [rows]);

  const overdrawn = (item: InventoryItem | null): boolean =>
    item !== null && (requestedByItem.get(item.id) ?? 0) > available(item) + 1e-9;

  const canIssue =
    rows.length > 0 &&
    rows.every((r) => r.item !== null && num(r.quantity) > 0) &&
    !rows.some((r) => overdrawn(r.item));

  const openIssue = () => {
    setRows([newIssueRow()]);
    setIssueError(null);
    setSearch("");
    setIssueOpen(true);
  };

  // While the issue request runs the dialog stays open, so its outcome (the
  // refusal, or the success toast) is never lost behind a closed dialog.
  const closeIssue = () => {
    if (!issueMutation.isPending) setIssueOpen(false);
  };

  const updateRow = (key: string, patch: Partial<IssueRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submitIssue = () => {
    setIssueError(null);
    issueMutation.mutate(
      {
        id: batch.id,
        lines: rows.flatMap((r) => (r.item ? [{ inventory_item_id: r.item.id, quantity: num(r.quantity) }] : [])),
      },
      {
        onSuccess: () => {
          setIssueOpen(false);
          toast.success("تم صرف المواد للدفعة");
        },
        onError: (err: unknown) => setIssueError(issueErrorMessage(err)),
      },
    );
  };

  const confirmRemove = () => {
    if (!removing) return;
    setSectionError(null);
    removeMutation.mutate(
      { id: batch.id, lineId: removing.id },
      {
        onSuccess: () => {
          setRemoving(null);
          toast.success("تمت إزالة المادة وإرجاع كميتها إلى اللوت");
        },
        onError: (err: unknown) => {
          setRemoving(null);
          if (isLineAlreadyRemoved(err)) {
            // Stale row: refetch the batch so the list (and its total) catch up.
            setSectionError("هذه المادة أُزيلت بالفعل — تم تحديث القائمة.");
            queryClient.invalidateQueries({ queryKey: ["productionBatch", batch.id] });
            queryClient.invalidateQueries({ queryKey: ["productionBatches"] });
            return;
          }
          setSectionError(materialsErrorMessage(err, "تعذر إزالة المادة."));
        },
      },
    );
  };

  const onRemove = useCallback((line: ProductionBatchMaterial) => setRemoving(line), []);
  const columns = useBatchMaterialsColumns({ onRemove: isClosed ? undefined : onRemove });
  const table = useDataTable({
    exportFileName: "batch-materials",
    columns,
    data: materials,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (m) => m.id,
  });

  // A closed batch that never had chemicals issued has nothing to show here;
  // its (hand-entered) cost is in the page header.
  if (isClosed && materials.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-app-separator px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-app-accent" />
            المواد الكيماوية
          </h2>
          <p className="text-xs text-app-label-secondary mt-0.5">
            تُصرف من مخزون الوحدة، الأقدم أولاً، بتكلفتها الفعلية. عند صرف أي مادة يصبح مجموعها هو تكلفة مواد الدفعة.
          </p>
        </div>
        {!isClosed && (
          <button
            type="button"
            onClick={openIssue}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" /> صرف مواد
          </button>
        )}
      </div>

      {sectionError && (
        <div className="flex items-start gap-2 border-b border-app-status-danger/30 bg-app-status-danger/10 px-4 py-3 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{sectionError}</span>
        </div>
      )}

      {hasManualCost && (
        <div className="flex items-start gap-2 border-b border-app-separator bg-app-bg-secondary px-4 py-3 text-xs text-app-label-secondary">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-app-status-warning" />
          <span>
            تكلفة المواد لهذه الدفعة أُدخلت يدوياً ({formatNumber(manualCost)} د.ل). صرف أي مادة كيماوية سيستبدلها بتكلفة المواد المصروفة.
          </span>
        </div>
      )}

      <DataTable table={table} className="rounded-none border-0 shadow-none bg-transparent">
        <DataTable.Content emptyMessage="لم تُصرف مواد كيماوية لهذه العملية بعد." emptyIcon={FlaskConical} />
      </DataTable>

      {materials.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t-2 border-app-separator bg-app-bg-secondary px-3 py-3 text-xs font-bold text-app-label-primary">
          <span>إجمالي المواد المصروفة:</span>
          <span className="text-app-label-secondary font-normal">{materials.length} سطر</span>
          <span className="ms-auto font-mono">{formatNumber(total)} د.ل</span>
        </div>
      )}

      <Dialog open={issueOpen} onOpenChange={(open) => !open && closeIssue()}>
        <DialogContent size="lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-app-accent-subtle text-app-accent rounded-xl">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle>صرف مواد للعملية {batch.operation_number}</DialogTitle>
                <DialogDescription>
                  تُسحب كل مادة من أقدم لوتاتها في مخازن الوحدة. إن لم يكفِ المخزون لأي مادة لا يُصرف شيء.
                </DialogDescription>
              </div>
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <form
              id="issue-materials-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (canIssue) submitIssue();
              }}
              className="space-y-3"
            >
              {hasManualCost && (
                <div className="flex items-start gap-2 p-3 text-xs rounded-xl bg-app-status-warning/10 text-app-status-warning border border-app-status-warning/20">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    تكلفة المواد المُدخلة يدوياً ({formatNumber(manualCost)} د.ل) ستُستبدل بتكلفة المواد المصروفة، ولن تعود حتى لو أُزيلت المواد لاحقاً.
                  </span>
                </div>
              )}

              {issueError && (
                <div className="flex items-start gap-2 p-3 text-xs rounded-xl bg-app-status-danger/10 text-app-status-danger border border-app-status-danger/20">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{issueError}</span>
                </div>
              )}

              {moreThanShown && (
                <p className="text-[11px] text-app-label-tertiary">
                  تُعرض أول {PICKER_PAGE_SIZE} مادة من {rawItems?.total} — اكتب اسم المادة أو رمزها في البحث للوصول إلى البقية.
                </p>
              )}

              {rows.map((r) => {
                const item = r.item;
                const short = overdrawn(item);
                return (
                  <div key={r.key} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-7">
                      <SearchableSelect<InventoryItem>
                        options={options}
                        value={item}
                        onChange={(next) => updateRow(r.key, { item: next })}
                        searchValue={search}
                        onSearchChange={setSearch}
                        getOptionId={(i) => i.id}
                        getOptionLabel={(i) => i.name}
                        getOptionSubLabel={(i) =>
                          `${i.code} · المتاح ${formatNumber(available(i), { maximumFractionDigits: 4 })} ${uomLabel(i.unit_of_measure)}`
                        }
                        getOptionSearchText={(i) => `${i.name} ${i.code}`}
                        getOptionDisabled={(i) => available(i) <= 0}
                        loading={rawLoading}
                        placeholder="اختر المادة الخام…"
                        emptyMessage={search ? "لا توجد مادة خام تطابق البحث." : "لا توجد مواد خام."}
                      />
                    </div>
                    <div className="col-span-4">
                      <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        placeholder="الكمية"
                        value={r.quantity}
                        onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary focus:border-app-accent focus:outline-none font-mono ${
                          short ? "border-app-status-danger" : "border-app-separator"
                        }`}
                      />
                      {item && (
                        <p className={`text-[10px] mt-1 ${short ? "text-app-status-danger" : "text-app-label-tertiary"}`}>
                          المتاح {formatNumber(available(item), { maximumFractionDigits: 4 })} {uomLabel(item.unit_of_measure)}
                          {short && " — الكمية المطلوبة أكبر من المتاح"}
                        </p>
                      )}
                    </div>
                    <div className="col-span-1 flex justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                        disabled={rows.length === 1}
                        className="p-1.5 rounded-lg text-app-status-danger hover:bg-app-status-danger/10 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, newIssueRow()])}
                className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
              >
                <Plus className="w-4 h-4" /> إضافة مادة
              </button>
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={closeIssue}
              disabled={issueMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="issue-materials-form"
              disabled={!canIssue || issueMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {issueMutation.isPending ? "جاري الصرف…" : hasManualCost ? "صرف واستبدال التكلفة" : "صرف المواد"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title="إزالة مادة مصروفة"
        message={
          removing
            ? `ستعود ${formatNumber(removing.quantity, { maximumFractionDigits: 4 })} ${uomLabel(removing.inventory_item?.unit_of_measure)} من ${removing.inventory_item?.name ?? "المادة"} إلى اللوت ${removing.stock_lot?.lot_number ?? ""}، ويُعكس قيدها، وتنقص تكلفة مواد الدفعة بمقدار ${formatNumber(removing.total_cost)} د.ل. هل تريد المتابعة؟`
            : ""
        }
        confirmText="إزالة"
        cancelText="تراجع"
        variant="danger"
        isLoading={removeMutation.isPending}
      />
    </div>
  );
};
