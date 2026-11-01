import React, { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Boxes, Plus, AlertTriangle, Save, ChevronLeft, Info, Tag } from "lucide-react";
import {
  useProductionBatch,
  useBatchBlocks,
  useRegisterBlocks,
  useTransitionBatch,
} from "../../hooks/useProduction";
import { useInventoryItems, useUpdateStockLot } from "../../hooks/useInventory";
import { useWarehouses } from "../../hooks/useWarehouses";
import {
  BlockGroupInput,
  apiErrorMessage,
  apiErrorPayload,
  LEDGER_ERROR_MESSAGE,
  BLOCK_ENTRY_STATES,
  NEXT_STATUS,
} from "../../api/endpoints/production";
import { InventoryItem, StockLot } from "../../api/endpoints/inventory";
import { toast } from "../../stores/toastStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useBatchDraftRowsColumns } from "../../components/table-columns/batchDraftRowsColumns";
import { useRegisteredBlocksColumns } from "../../components/table-columns/registeredBlocksColumns";
import { LabelPrintDialog, lotLabelData } from "../../components/print/LabelPrint";
import { BatchMaterialsSection } from "../../components/manufacturing/BatchMaterialsSection";

/** A lot status this form may switch between (StockLotController::ensureStatusChangeAllowed). */
const LOT_EDITABLE_STATUSES: StockLot["status"][] = ["available", "quarantined"];

const STATUS_ORDER = [
  "planned", "configured", "running", "consumed",
  "curing", "ready_for_grading", "graded", "closed",
] as const;

const STATUS_LABEL: Record<string, string> = {
  planned: "مخطط",
  configured: "تم الإعداد",
  running: "قيد التشغيل",
  consumed: "مستهلك",
  curing: "قيد التصلب",
  ready_for_grading: "جاهز للفرز",
  graded: "تم الفرز",
  closed: "مغلق",
};

// What can actually be done at each step, and why — shown in the step-info card so
// the operator knows what belongs here without guessing from which sections appear.
const STATUS_INFO: Record<string, string> = {
  planned:
    "الدفعة مخطط لها فقط. اضبط تركيبة الخلطة (نطاق الكثافة، وقت التصلب، سرعة السير) من قائمة دفعات الإنتاج، ثم رقِّ الدفعة إلى «تم الإعداد» لبدء التشغيل.",
  configured:
    "تم إعداد الماكينة بالتركيبة والمعايير المطلوبة. عند بدء تشغيل الماكينة فعلياً، رقِّ الدفعة إلى «قيد التشغيل».",
  running:
    "الماكينة تعمل الآن. بعد انتهاء التشغيلة اصرف المواد الكيماوية الفعلية من قسم «المواد الكيماوية» أدناه (تُسحب من لوتات مخزون الوحدة)، ثم رقِّ الدفعة إلى «مستهلك».",
  consumed:
    "تم صرف المواد الكيماوية من اللوتات ويمكن تصحيحها من قسم «المواد الكيماوية» حتى الإغلاق. بعد تقطيع الكتلة المستمرة إلى بلوكات فردية، رقِّ الدفعة إلى «قيد التصلب».",
  curing:
    "البلوكات في طور التصلب. عند انتهاء المهلة المحددة، رقِّ الدفعة إلى «جاهز للفرز» لبدء تسجيل الإنتاج والفرز.",
  ready_for_grading:
    "الدفعة جاهزة للفرز. أدخل صفوف الإنتاج كما تظهر في التقرير الورقي (الأبعاد، العدد، الضغط، الدرجة) لتسجيل كل بلوك على حدة.",
  graded:
    "تم تسجيل وفرز البلوكات. يمكنك إضافة صفوف إضافية أو تعديل بيانات أي بلوك قبل الإغلاق — تأكد أن كل بلوك يحمل ضغطاً مقاساً، ثم رقِّ الدفعة إلى «مغلق» لإدخالها إلى المخزون النهائي وترحيل التكلفة.",
  closed:
    "الدفعة مغلقة. تم ترحيل تكلفة المواد إلى البلوكات وتسجيلها كمخزون نهائي، ولا يمكن تعديل الدفعة أو بلوكاتها بعد الآن.",
};

export interface DraftRow {
  key: string;
  kind: "block" | "separator" | "head" | "scrap";
  length_m: string;
  height_m: string;
  count: string;
  pressure: string;
  grade: BlockGroupInput["grade"];
  color: string;
  unit_cost: string;
}

const newRow = (kind: DraftRow["kind"] = "block"): DraftRow => ({
  key: Math.random().toString(36).slice(2),
  kind,
  length_m: "",
  height_m: "",
  count: "1",
  pressure: "",
  grade: "standard",
  color: "",
  unit_cost: "0",
});

const num = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const BatchBlocksPage: React.FC = () => {
  const { batchId } = useParams<{ batchId: string }>();
  const navigate = useNavigate();

  const { data: batch, isLoading: batchLoading } = useProductionBatch(batchId);
  const { data: blocks, isLoading: blocksLoading } = useBatchBlocks(batchId);
  const { data: itemData } = useInventoryItems({ item_type: "foam_block" });
  const { data: scrapItems } = useInventoryItems({ item_type: "byproduct_fill" });
  const { data: warehouses } = useWarehouses();
  const registerMutation = useRegisterBlocks();
  const transitionMutation = useTransitionBatch();
  const updateStockLotMutation = useUpdateStockLot();

  const [rows, setRows] = useState<DraftRow[]>([newRow()]);
  const [itemId, setItemId] = useState("");
  const [scrapItemId, setScrapItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [editingBlock, setEditingBlock] = useState<StockLot | null>(null);
  // W4-03: block labels — one block, the whole list, or the blocks just registered.
  const [labelBlocks, setLabelBlocks] = useState<{ title: string; lots: StockLot[] } | null>(null);
  const [blockForm, setBlockForm] = useState({
    block_type: "block",
    length_m: "",
    width_m: "",
    height_m: "",
    pressure: "",
    grade: "standard",
    color: "",
    status: "available",
    bin_location: "",
  });

  const bunWidth = batch ? Number(batch.bun_width_m) : 0;
  // Blocks are keyed in only after grading starts (backend: acceptsBlockRegistration).
  const acceptsBlocks = batch ? BLOCK_ENTRY_STATES.includes(batch.status) : false;
  const nextStatus = batch ? NEXT_STATUS[batch.status] : null;

  // Once blocks exist they stay visible through grading and after close.
  const showRegisteredBlocks = batch
    ? acceptsBlocks || batch.status === "closed"
    : false;

  const handleOpenEditBlock = (lot: StockLot) => {
    setEditingBlock(lot);
    setBlockForm({
      block_type: lot.block_type ?? "block",
      length_m: lot.length_m ? String(lot.length_m) : "",
      width_m: lot.width_m ? String(lot.width_m) : String(bunWidth),
      height_m: lot.height_m ? String(lot.height_m) : "",
      pressure: lot.pressure ? String(lot.pressure) : "",
      grade: lot.grade ?? "standard",
      color: (lot.attribute_values as Record<string, string> | undefined)?.color ?? "",
      status: lot.status ?? "available",
      bin_location: lot.bin_location ?? "",
    });
    setError(null);
  };

  const submitBlockEdit = () => {
    if (!editingBlock) return;
    setError(null);

    const length = num(blockForm.length_m);
    const width = num(blockForm.width_m);
    const height = num(blockForm.height_m);

    if (length <= 0 || width <= 0 || height <= 0) {
      setError("أبعاد البلوك (الطول، العرض، الارتفاع) يجب أن تكون أكبر من الصفر.");
      return;
    }

    const payload: Partial<StockLot> & { record_version: number } = {
      block_type: blockForm.block_type as StockLot["block_type"],
      length_m: length,
      width_m: width,
      height_m: height,
      grade: blockForm.grade as StockLot["grade"],
      status: blockForm.status as StockLot["status"],
      bin_location: blockForm.bin_location.trim() || null,
      record_version: editingBlock.record_version,
      ...(num(blockForm.pressure) > 0 ? { pressure: num(blockForm.pressure) } : {}),
      attribute_values: {
        ...(typeof editingBlock.attribute_values === "object" && editingBlock.attribute_values !== null
          ? editingBlock.attribute_values
          : {}),
        ...(blockForm.color ? { color: blockForm.color } : {}),
      },
    };

    updateStockLotMutation.mutate(
      { id: editingBlock.id, data: payload },
      {
        onSuccess: () => {
          setEditingBlock(null);
          toast.success("تم تحديث بيانات البلوك بنجاح");
        },
        onError: (err: unknown) => {
          setError(apiErrorMessage(err, "تعذر تحديث بيانات البلوك."));
        },
      }
    );
  };

  // Stable identities: these feed useBatchDraftRowsColumns' useMemo deps, and its `cell`
  // renderers are invoked as component types by TanStack Table's flexRender — a new function
  // reference each render remounts the row <input>s (and drops focus) on every keystroke.
  const rowVolume = useCallback(
    (row: DraftRow) => bunWidth * num(row.length_m) * num(row.height_m),
    [bunWidth],
  );
  const rowTotal = useCallback((row: DraftRow) => rowVolume(row) * num(row.count), [rowVolume]);

  const totals = useMemo(() => {
    const blockRows = rows.filter((r) => r.kind === "block");
    const separatorRows = rows.filter((r) => r.kind === "separator");
    const headRows = rows.filter((r) => r.kind === "head");
    const scrapRows = rows.filter((r) => r.kind === "scrap");
    return {
      blockCount: blockRows.reduce((sum, r) => sum + num(r.count), 0),
      blockVolume: blockRows.reduce((sum, r) => sum + rowTotal(r), 0),
      separatorCount: separatorRows.reduce((sum, r) => sum + num(r.count), 0),
      separatorVolume: separatorRows.reduce((sum, r) => sum + rowTotal(r), 0),
      headCount: headRows.reduce((sum, r) => sum + num(r.count), 0),
      headVolume: headRows.reduce((sum, r) => sum + rowTotal(r), 0),
      scrapVolume: scrapRows.reduce((sum, r) => sum + rowTotal(r), 0),
    };
  }, [rows, bunWidth]);

  const updateRow = useCallback(
    (key: string, patch: Partial<DraftRow>) =>
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r))),
    [],
  );

  const removeRow = useCallback(
    (key: string) => setRows((prev) => prev.filter((r) => r.key !== key)),
    [],
  );

  const hasScrapRow = rows.some((r) => r.kind === "scrap");

  const canSubmit =
    acceptsBlocks &&
    Boolean(itemId) &&
    Boolean(warehouseId) &&
    (!hasScrapRow || Boolean(scrapItemId)) &&
    rows.length > 0 &&
    rows.every(
      (r) =>
        num(r.length_m) > 0 &&
        num(r.height_m) > 0 &&
        num(r.count) > 0 &&
        (r.kind !== "block" || num(r.pressure) > 0),
    );

  const submit = () => {
    if (!batchId) return;
    setError(null);

    const groups: BlockGroupInput[] = rows.map((r) =>
      r.kind === "scrap"
        ? {
            kind: "scrap",
            block_type: "scrap",
            count: num(r.count),
            length_m: num(r.length_m),
            height_m: num(r.height_m),
            // Scrap enters stock as a zero-cost byproduct, so it needs a home too.
            inventory_item_id: scrapItemId,
            warehouse_id: warehouseId,
          }
        : {
            kind: r.kind,
            block_type: r.kind,
            count: num(r.count),
            length_m: num(r.length_m),
            height_m: num(r.height_m),
            ...(num(r.pressure) > 0 ? { pressure: num(r.pressure) } : {}),
            inventory_item_id: itemId,
            warehouse_id: warehouseId,
            unit_cost: num(r.unit_cost),
            grade: r.grade,
            ...(r.color ? { color: r.color } : {}),
          },
    );

    registerMutation.mutate(
      { id: batchId, groups },
      {
        onSuccess: (res) => {
          setRows([newRow()]);
          const created = res.data.blocks ?? [];
          if (created.length > 0) {
            setLabelBlocks({ title: `ملصقات البلوكات المسجلة (${created.length})`, lots: created });
          }
        },
        onError: (err: unknown) =>
          setError(apiErrorPayload(err)?.message ?? "تعذر تسجيل البلوكات."),
      },
    );
  };

  const advance = () => {
    if (!batchId || !nextStatus) return;
    setError(null);

    if (nextStatus === "closed" && (!batch?.material_cost || Number(batch.material_cost) <= 0)) {
      // W4-05: issued chemicals fix the cost; zero means they all came from uncosted lots.
      setError(
        (batch?.materials?.length ?? 0) > 0
          ? LEDGER_ERROR_MESSAGE.MATERIAL_COST_ZERO_FROM_ISSUES
          : "اصرف المواد الكيماوية للدفعة، أو أدخل تكلفة المواد من شاشة تعديل الدفعة، قبل الإغلاق — بدونها لن تُحمَّل البلوكات أي تكلفة.",
      );
      return;
    }

    transitionMutation.mutate(
      { id: batchId, status: nextStatus },
      {
        onError: (err: unknown) => setError(apiErrorMessage(err, "تعذر ترقية حالة الدفعة.")),
      },
    );
  };

  // Draft registration rows — a small, user-built list (typically 1-5 rows) edited inline
  // before submit, so no search/pagination/sorting here either.
  const draftColumns = useBatchDraftRowsColumns({
    rowsCount: rows.length,
    rowTotal,
    rowVolume,
    onUpdateRow: updateRow,
    onRemoveRow: removeRow,
  });
  const draftTable = useDataTable({
    // One CSV button per grid: draft rows are an entry form, not a list.
    enableExport: false,
    columns: draftColumns,
    data: rows,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (r) => r.key,
  });

  // Registered blocks — the page's main per-batch list; can grow large, so it gets
  // sorting/search/pagination like a top-level list would.
  const blocksColumns = useRegisteredBlocksColumns({
    onEdit: handleOpenEditBlock,
    onPrintLabel: (lot) => setLabelBlocks({ title: `ملصق البلوك: ${lot.lot_number}`, lots: [lot] }),
  });
  // Lots come back without their item; the label names it from the catalog lists this page loads.
  const itemNameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const i of [...(itemData?.data ?? []), ...(scrapItems?.data ?? [])]) names.set(i.id, i.name);
    return names;
  }, [itemData, scrapItems]);
  const blocksTableData = useMemo(() => blocks ?? [], [blocks]);
  const blocksTable = useDataTable({
    exportFileName: "batch-blocks",
    columns: blocksColumns,
    data: blocksTableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (lot) => lot.id,
  });

  if (batchLoading || !batch) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-app-label-secondary">
        جاري تحميل الدفعة…
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate("/manufacturing/batches")}
            className="flex items-center gap-1 text-xs text-app-label-secondary hover:text-app-accent mb-2 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" /> العودة إلى الدفعات
          </button>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Boxes className="w-7 h-7 text-app-accent" />
            العملية{" "}
            <span className="font-mono text-app-accent">{batch.operation_number}</span>
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            عرض الكتلة <span className="font-mono font-bold">{bunWidth} م</span> (إعداد الماكينة،
            يُطبق على كل بلوك) · نطاق الكثافة{" "}
            <span className="font-mono">{batch.formula_params?.density_band ?? "—"}</span> ·{" "}
            {batch.formula_params?.cure_time_minutes ?? "—"} دقيقة · سرعة السير الناقل{" "}
            {batch.formula_params?.conveyor_speed ?? "—"} · تكلفة المواد{" "}
            <span className="font-mono font-bold">
              {batch.material_cost && Number(batch.material_cost) > 0
                ? `${Number(batch.material_cost).toLocaleString()} د.ل`
                : "—"}
            </span>
            {(batch.materials?.length ?? 0) > 0 && (
              <span className="text-app-label-tertiary"> (محسوب من المواد)</span>
            )}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Lifecycle */}
      <div className="rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_ORDER.map((s) => {
            const reached = STATUS_ORDER.indexOf(s) <= STATUS_ORDER.indexOf(batch.status);
            const current = s === batch.status;
            return (
              <span
                key={s}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold ${
                  current
                    ? "bg-app-accent text-white"
                    : reached
                      ? "bg-app-accent-subtle text-app-accent"
                      : "bg-app-fill-f1 text-app-label-tertiary"
                }`}
              >
                {STATUS_LABEL[s]}
              </span>
            );
          })}

          {nextStatus && (
            <button
              onClick={advance}
              disabled={transitionMutation.isPending}
              className="ms-auto flex items-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
              {transitionMutation.isPending ? "جاري الترقية…" : `ترقية إلى ${STATUS_LABEL[nextStatus]}`}
            </button>
          )}
        </div>
      </div>

      {/* Step guide — what this status means and what to do next */}
      <div className="flex items-start gap-3 rounded-2xl border border-app-accent/30 bg-app-accent-subtle p-4 text-xs text-app-label-primary">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-app-accent" />
        <div>
          <p className="font-bold text-app-accent">{STATUS_LABEL[batch.status]}</p>
          <p className="mt-0.5 text-app-label-secondary">{STATUS_INFO[batch.status]}</p>
        </div>
      </div>

      {/* W4-05: chemicals issued to the run — their total is the batch's material cost */}
      <BatchMaterialsSection batch={batch} />

      {/* Registration form — mirrors the paper production report, only while grading is open */}
      {acceptsBlocks && (
      <div className="rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
        <div className="border-b border-app-separator px-4 py-3">
          <h2 className="text-sm font-bold text-app-label-primary">تسجيل الإنتاج</h2>
          <p className="text-xs text-app-label-secondary mt-0.5">
            أدخل الصفوف كما تظهر في تقرير الإنتاج. كل صف بلوك يتحول إلى ذلك العدد من البلوكات
            الموسومة فردياً؛ صفوف الهدر تسجل الحجم فقط.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-app-bg-secondary border-b border-app-separator">
          <div>
            <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
              صنف البلوك
            </label>
            <SearchableSelect<InventoryItem>
              options={itemData?.data ?? []}
              value={itemData?.data.find((i) => i.id === itemId) ?? null}
              onChange={(item) => setItemId(item ? item.id : "")}
              getOptionId={(i) => i.id}
              getOptionLabel={(i) => i.name}
              getOptionSubLabel={(i) => i.code}
              getOptionSearchText={(i) => `${i.name} ${i.code}`}
              placeholder="اختر صنف بلوك الإسفنج…"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
              صنف الهدر
            </label>
            <SearchableSelect<InventoryItem>
              options={scrapItems?.data ?? []}
              value={
                scrapItems?.data.find((i) => i.id === scrapItemId) ?? null
              }
              onChange={(item) => setScrapItemId(item ? item.id : "")}
              getOptionId={(i) => i.id}
              getOptionLabel={(i) => i.name}
              getOptionSubLabel={(i) => i.code}
              getOptionSearchText={(i) => `${i.name} ${i.code}`}
              placeholder={
                hasScrapRow ? "اختر صنف الهدر…" : "مطلوب فقط لصفوف الهدر"
              }
            />
            <p className="text-[10px] text-app-label-tertiary mt-1">
              الهدر يدخل المخزون بتكلفة صفرية
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
              المخزن
            </label>
            <SearchableSelect<{ id: string; name: string }>
              options={warehouses ?? []}
              value={warehouses?.find((w) => w.id === warehouseId) ?? null}
              onChange={(w) => setWarehouseId(w ? w.id : "")}
              getOptionId={(w) => w.id}
              getOptionLabel={(w) => w.name}
              placeholder="اختر المخزن…"
            />
          </div>
        </div>

        <DataTable table={draftTable} className="rounded-none border-0 shadow-none bg-transparent">
          <DataTable.Content />
        </DataTable>

        {/* DataTable.Content has no tfoot slot, so the running totals render as a matching summary bar. */}
        <div className="flex flex-wrap items-center gap-3 border-t-2 border-app-separator bg-app-bg-secondary px-3 py-3 text-xs font-bold text-app-label-primary">
          <span>إجمالي التشغيلة:</span>
          <span>
            {totals.blockCount} <span className="text-app-label-secondary font-normal">بلوك</span>
          </span>
          {totals.separatorCount > 0 && (
            <span>
              · {totals.separatorCount} <span className="text-app-label-secondary font-normal">فاصل</span>
            </span>
          )}
          {totals.headCount > 0 && (
            <span>
              · {totals.headCount} <span className="text-app-label-secondary font-normal">بداية</span>
            </span>
          )}
          {totals.scrapVolume > 0 && (
            <span className="text-app-label-secondary font-normal">
              · هدر{" "}
              <span className="font-mono">{totals.scrapVolume.toFixed(4)} م³</span>
            </span>
          )}
          <span className="ms-auto font-mono">
            {(totals.blockVolume + totals.separatorVolume + totals.headVolume + totals.scrapVolume).toFixed(4)} م³
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-app-separator px-4 py-3">
          <button
            onClick={() => setRows((prev) => [...prev, newRow()])}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
          >
            <Plus className="w-4 h-4" /> إضافة صف
          </button>

          <button
            onClick={submit}
            disabled={!canSubmit || registerMutation.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {registerMutation.isPending
              ? "جاري التسجيل…"
              : `تسجيل ${totals.blockCount} بلوك`}
          </button>
        </div>
      </div>
      )}

      {/* Registered blocks — stay visible through grading and after close for reference */}
      {showRegisteredBlocks && (
      <div className="overflow-hidden rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
        <div className="border-b border-app-separator px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-app-label-primary">
            البلوكات المسجلة ({blocks?.length ?? 0})
          </h2>
          <span className="text-xs text-app-label-secondary font-mono">
            الهدر المسجل: {Number(batch.scrap_volume_m3).toFixed(4)} م³
          </span>
        </div>

        <DataTable table={blocksTable} className="rounded-none border-0 shadow-none bg-transparent">
          <DataTable.Header>
            <DataTable.Toolbar>
              <DataTable.SearchInput placeholder="بحث في البلوكات..." />
            </DataTable.Toolbar>
            <DataTable.Actions>
              <button
                type="button"
                onClick={() => setLabelBlocks({ title: "ملصقات البلوكات", lots: blocksTableData })}
                disabled={blocksTableData.length === 0}
                className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors disabled:opacity-50"
              >
                <Tag className="w-3.5 h-3.5 text-app-accent" />
                طباعة الملصقات
              </button>
            </DataTable.Actions>
          </DataTable.Header>
          <DataTable.Content
            isLoading={blocksLoading}
            emptyMessage="لا توجد بلوكات مسجلة لهذه العملية بعد."
            emptyIcon={Boxes}
          />
          <DataTable.Pagination />
        </DataTable>
      </div>
      )}

      <LabelPrintDialog
        open={Boolean(labelBlocks)}
        onClose={() => setLabelBlocks(null)}
        title={labelBlocks?.title}
        labels={(labelBlocks?.lots ?? []).map((lot) => lotLabelData(lot, itemNameById.get(lot.inventory_item_id)))}
      />

      {/* Edit Registered Block Dialog */}
      <Dialog
        open={Boolean(editingBlock)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBlock(null);
            setError(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-app-accent-subtle text-app-accent">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>تعديل بيانات البلوك #{editingBlock?.lot_number}</DialogTitle>
                <DialogDescription>
                  تعديل الأبعاد، الضغط، ونوع وجودة البلوك
                </DialogDescription>
              </div>
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <form
              id="edit-block-form"
              onSubmit={(e) => {
                e.preventDefault();
                submitBlockEdit();
              }}
              className="space-y-4"
            >
              {error && (
                <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-app-status-danger/10 text-app-status-danger border border-app-status-danger/20">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                    نوع البلوك
                  </label>
                  <select
                    value={blockForm.block_type}
                    onChange={(e) => setBlockForm({ ...blockForm, block_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none"
                  >
                    <option value="block">بلوك (Block)</option>
                    <option value="separator">فاصل (Separator)</option>
                    <option value="head">بداية (Head)</option>
                    <option value="scrap">هدر (Scrap)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                    الدرجة (Grade)
                  </label>
                  <select
                    value={blockForm.grade}
                    onChange={(e) => setBlockForm({ ...blockForm, grade: e.target.value })}
                    className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none"
                  >
                    <option value="standard">قياسي (Standard)</option>
                    <option value="acceptable_variant">تباين مقبول (Acceptable Variant)</option>
                    <option value="defective_usable">عيب قابل للاستخدام (Defective Usable)</option>
                    <option value="reject">مرفوض (Reject)</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-app-bg-secondary rounded-xl border border-app-separator space-y-3">
                <p className="text-xs font-bold text-app-label-primary">أبعاد البلوك (متر)</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-app-label-secondary mb-1">الطول (م)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={blockForm.length_m}
                      onChange={(e) => setBlockForm({ ...blockForm, length_m: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl bg-app-bg-primary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-app-label-secondary mb-1">العرض (م)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={blockForm.width_m}
                      onChange={(e) => setBlockForm({ ...blockForm, width_m: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl bg-app-bg-primary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-app-label-secondary mb-1">الارتفاع (م)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={blockForm.height_m}
                      onChange={(e) => setBlockForm({ ...blockForm, height_m: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl bg-app-bg-primary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-mono pt-1 text-app-label-secondary border-t border-app-separator/50">
                  <span>الحجم المحسوب:</span>
                  <span className="font-bold text-app-accent">
                    {(num(blockForm.length_m) * num(blockForm.width_m) * num(blockForm.height_m)).toFixed(4)} م³
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {blockForm.block_type === "block" && (
                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                      الضغط (كجم/م³)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={blockForm.pressure}
                      onChange={(e) => setBlockForm({ ...blockForm, pressure: e.target.value })}
                      placeholder="30"
                      className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                    />
                  </div>
                )}
                <div className={blockForm.block_type === "block" ? "" : "col-span-2"}>
                  <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                    اللون
                  </label>
                  <input
                    type="text"
                    value={blockForm.color}
                    onChange={(e) => setBlockForm({ ...blockForm, color: e.target.value })}
                    placeholder="أبيض / رمادي / أزرق"
                    className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                    الحالة
                  </label>
                  {/* INV-06: only available <-> quarantined here; reserving and consuming go through their own flows. */}
                  {editingBlock && !LOT_EDITABLE_STATUSES.includes(editingBlock.status) ? (
                    <div className="w-full px-3 py-2 border rounded-xl bg-app-fill-f1 text-xs text-app-label-secondary border-app-separator">
                      {editingBlock.status === "reserved" ? "محجوز (Reserved)" : "مستهلك (Consumed)"}
                      <span className="block text-[10px] text-app-label-tertiary">تتغير هذه الحالة من أمر التقطيع أو البيع أو الجرد فقط.</span>
                    </div>
                  ) : (
                    <select
                      value={blockForm.status}
                      onChange={(e) => setBlockForm({ ...blockForm, status: e.target.value })}
                      className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none"
                    >
                      <option value="available">متاح (Available)</option>
                      <option value="quarantined">حجر صحي (Quarantined)</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                  موقع الرف
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={blockForm.bin_location}
                  onChange={(e) => setBlockForm({ ...blockForm, bin_location: e.target.value })}
                  placeholder="A-03"
                  className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                  dir="ltr"
                />
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setEditingBlock(null);
                setError(null);
              }}
              className="px-4 py-2 text-xs font-medium text-app-label-secondary hover:text-app-label-primary"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="edit-block-form"
              disabled={updateStockLotMutation.isPending}
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {updateStockLotMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
