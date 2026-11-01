import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  DollarSign,
  History,
  Layers,
  Scissors,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import {
  useInventoryItem,
  useInventoryLookup,
  useStockLot,
  useStockLots,
  useProcessCutRemnant,
  useUpdateStockLot,
  useWarehouseLedger,
} from "../../hooks/useInventory";
import { usePermissions } from "../../hooks/usePermissions";
import { stockLevelErrorMessage } from "../../api/endpoints/stockLevels";
import type { StockLevelsBackState } from "./InventoryItemStockLevelsPage";
import { toast } from "../../stores/toastStore";
import { StockLot, codeNotFoundMessage, inventoryApi, isCodeNotFound } from "../../api/endpoints/inventory";
import { apiErrorMessage } from "../../api/endpoints/production";
import { CUT_REMNANT_ERROR_MESSAGE, cutterErrorMessage } from "../../api/endpoints/cutter";
import { LabelPrintDialog, lotLabelData } from "../../components/print/LabelPrint";
import {
  INVENTORY_EVENT_LABELS,
  REQUIRED_INVENTORY_EVENTS,
  type InventoryEventType,
} from "../../api/endpoints/operatingUnitAccounts";
import { formatNumber } from "../../lib/utils/format";
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
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useStockLedgerColumns } from "../../components/table-columns/stockLedgerColumns";
import { useInventoryMovementColumns } from "../../components/table-columns/inventoryMovementColumns";
import { useOperatingUnit } from "../../hooks/useOperatingUnits";
import { useServerConfigStore } from "../../stores/serverConfigStore";

/** Navigation state: a lot label scanned on another item's page opens here filtered to that lot (W4-03). */
interface WarehouseItemScanState {
  scannedLot?: StockLot;
}

const WarehouseItemDetailPage: React.FC = () => {
  const { warehouseId, itemId } = useParams<{ warehouseId: string; itemId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [selectedLotForCut, setSelectedLotForCut] = useState<StockLot | null>(null);
  const [remnantAction, setRemnantAction] = useState<"restock_remnant" | "convert_to_byproduct">("restock_remnant");
  const [lengthM, setLengthM] = useState<number>(1.0);
  const [widthM, setWidthM] = useState<number>(2.0);
  const [heightM, setHeightM] = useState<number>(1.0);
  const [byproductKg, setByproductKg] = useState<number>(0);

  // W4-02: a lot's shelf, editable by whoever may edit inventory.
  const { hasPermission } = usePermissions();
  const canEditBin = hasPermission("edit-inventory");
  const [binLot, setBinLot] = useState<StockLot | null>(null);
  const [binValue, setBinValue] = useState("");
  const [binError, setBinError] = useState<string | null>(null);
  const updateLotMutation = useUpdateStockLot();

  const { data: item } = useInventoryItem(itemId);
  const pinnedUnitId = useServerConfigStore((s) => s.operatingUnitId);
  const { data: lotData } = useStockLots({
    warehouse_id: warehouseId,
    inventory_item_id: itemId,
  });
  // W4-02: find lots by shelf (server-side partial match). The totals above keep
  // using the unfiltered lots; only the table follows the search. With no search
  // the params match the query above, so it is the same cached request.
  const [binSearch, setBinSearch] = useState("");
  const [debouncedBin, setDebouncedBin] = useState("");
  /** A scanned code is being looked up (W4-03): its text is not a shelf search unless the lookup misses. */
  const [isLookingUp, setIsLookingUp] = useState(false);
  useEffect(() => {
    if (isLookingUp) return;
    const t = setTimeout(() => setDebouncedBin(binSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [binSearch, isLookingUp]);
  const { data: tableLotData, isLoading: isLoadingTableLots } = useStockLots({
    warehouse_id: warehouseId,
    inventory_item_id: itemId,
    bin_location: debouncedBin || undefined,
  });

  // W4-03: the lot search also takes a scan. Enter looks the code up: a lot
  // label shows that lot (on its own item's page when it is another item's),
  // an item barcode or code opens that item here. A code that matches nothing
  // stays what it was typed as, a shelf search.
  const lookup = useInventoryLookup();
  const lotSearchRef = useRef<HTMLInputElement | null>(null);
  // The lookup's copy of the scanned lot only says which lot it is; the row
  // shows the live lot, refreshed after a shelf edit or a cut like the list.
  const [scannedLot, setScannedLot] = useState<StockLot | null>(
    () => (location.state as WarehouseItemScanState | null)?.scannedLot ?? null,
  );
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const [labelLots, setLabelLots] = useState<StockLot[] | null>(null);
  const [isPreparingLabels, setIsPreparingLabels] = useState(false);
  const scannedLotHere =
    scannedLot && scannedLot.inventory_item_id === itemId && scannedLot.warehouse_id === warehouseId ? scannedLot : null;
  const { data: liveScannedLot } = useStockLot(scannedLotHere?.id);
  const activeScannedLot = scannedLotHere
    ? liveScannedLot?.id === scannedLotHere.id
      ? liveScannedLot
      : scannedLotHere
    : null;
  // The hand-over state is read once: drop it from history, so going back to
  // this entry later does not bring the old scan filter back.
  useEffect(() => {
    if ((location.state as WarehouseItemScanState | null)?.scannedLot) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location.state, location.pathname, location.search, navigate]);

  /** Bumped per lookup: only the latest scan's answer is applied. */
  const lookupSeq = useRef(0);
  /** The search box still holds `code` (no newer scan or typing replaced it). */
  const boxHolds = (code: string) => (lotSearchRef.current?.value ?? "").trim() === code;

  const handleLotScan = () => {
    const code = binSearch.trim();
    if (!code) return;
    // A shelf name typed by hand that already filters the table to that very
    // shelf is a shelf search, not a scan: nothing to look up.
    if (
      !activeScannedLot &&
      debouncedBin === code &&
      (tableLotData?.data ?? []).some((l) => (l.bin_location ?? "").trim().toLowerCase() === code.toLowerCase())
    ) {
      return;
    }
    // Selected, so a scan that follows replaces this text instead of being
    // glued onto it; the newest scan's answer wins.
    lotSearchRef.current?.select();
    setScanMiss(null);
    const seq = ++lookupSeq.current;
    setIsLookingUp(true);
    lookup.mutateAsync(code).then(
      (res) => {
        if (seq !== lookupSeq.current) return;
        setIsLookingUp(false);
        if (boxHolds(code)) {
          setBinSearch("");
          setDebouncedBin("");
        }
        if (res.type === "lot") {
          const lot: StockLot = { ...res.lot, inventory_item: res.item };
          setScannedLot(lot);
          if (lot.warehouse_id !== warehouseId || lot.inventory_item_id !== itemId) {
            navigate(`/inventory/ledger/${lot.warehouse_id}/items/${lot.inventory_item_id}`, {
              state: { scannedLot: lot } satisfies WarehouseItemScanState,
            });
          }
          return;
        }
        setScannedLot(null);
        if (res.item.id !== itemId) navigate(`/inventory/ledger/${warehouseId}/items/${res.item.id}`);
      },
      async (err: unknown) => {
        if (seq !== lookupSeq.current) return;
        setIsLookingUp(false);
        const refocus = () => {
          if (!boxHolds(code)) return;
          lotSearchRef.current?.focus();
          lotSearchRef.current?.select();
        };
        if (!isCodeNotFound(err)) {
          toast.error(apiErrorMessage(err, "تعذّر البحث عن الرمز."));
          refocus();
          return;
        }
        // No item or lot has this code: it is what it was typed as, a shelf
        // search. Only when that finds nothing either is it reported.
        setScanMiss(code);
        setScannedLot(null);
        if (boxHolds(code)) setDebouncedBin(code);
        refocus();
        const params = { warehouse_id: warehouseId, inventory_item_id: itemId, bin_location: code };
        try {
          // The table's own query (same key), so the filter below reuses it.
          const shelf = await queryClient.fetchQuery({
            queryKey: ["stockLots", params],
            queryFn: async () => (await inventoryApi.getLots(params)).data,
          });
          if (seq === lookupSeq.current && shelf.data.length === 0) {
            toast.error(`${codeNotFoundMessage(code)}، ولا دفعات على رف بهذا الاسم لهذا الصنف.`);
          }
        } catch {
          if (seq === lookupSeq.current) toast.error(codeNotFoundMessage(code));
        }
      },
    );
  };

  /**
   * Labels for the lots on hand: the scanned lot alone, else every lot of this
   * item in this warehouse (all pages, after the shelf search) that is still
   * in stock — consumed or emptied lots have no block to stick a label on.
   */
  const printLotLabels = async () => {
    if (activeScannedLot) {
      setLabelLots([activeScannedLot]);
      return;
    }
    if (!warehouseId || !itemId) return;
    setIsPreparingLabels(true);
    try {
      const all: StockLot[] = [];
      let page = 1;
      let lastPage = 1;
      do {
        const res = await inventoryApi.getLots({
          warehouse_id: warehouseId,
          inventory_item_id: itemId,
          bin_location: debouncedBin || undefined,
          page,
          per_page: 100,
        });
        all.push(...res.data.data);
        lastPage = res.data.last_page;
        page += 1;
      } while (page <= lastPage);
      const onHand = all.filter((l) => l.status !== "consumed" && Number(l.quantity) > 0);
      if (onHand.length === 0) {
        toast.info("لا توجد دفعات في المخزون لطباعة ملصقاتها.");
        return;
      }
      setLabelLots(onHand);
    } catch (err) {
      toast.error(apiErrorMessage(err, "تعذّر تحميل الدفعات للطباعة."));
    } finally {
      setIsPreparingLabels(false);
    }
  };
  const { data: ledger, isLoading: isLoadingLedger } = useWarehouseLedger(warehouseId, {
    sku: item?.code,
    per_page: 50,
  });
  const processCutMutation = useProcessCutRemnant();

  const lots = useMemo(() => lotData?.data ?? [], [lotData]);
  const tableLots = useMemo(
    () => (activeScannedLot ? [activeScannedLot] : (tableLotData?.data ?? [])),
    [activeScannedLot, tableLotData],
  );
  const availableLots = useMemo(() => lots.filter((l) => l.status === "available"), [lots]);
  const totalQuantity = useMemo(
    () => availableLots.reduce((sum, l) => sum + Number(l.quantity), 0),
    [availableLots],
  );
  const totalValue = useMemo(
    () => availableLots.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_cost), 0),
    [availableLots],
  );
  const avgUnitCost = totalQuantity > 0 ? totalValue / totalQuantity : 0;

  const openCutModal = (lot: StockLot) => {
    setSelectedLotForCut(lot);
    setLengthM(lot.length_m ? Number((lot.length_m / 2).toFixed(2)) : 1.0);
    setWidthM(lot.width_m || 2.0);
    setHeightM(lot.height_m || 1.0);
  };

  const handleCutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLotForCut) return;

    processCutMutation.mutate(
      {
        id: selectedLotForCut.id,
        data: {
          remnant_action: remnantAction,
          remnant_dimensions:
            remnantAction === "restock_remnant"
              ? { length_m: lengthM, width_m: widthM, height_m: heightM }
              : undefined,
          byproduct_weight_kg: byproductKg > 0 ? byproductKg : undefined,
        },
      },
      {
        onSuccess: () => setSelectedLotForCut(null),
        // W4-06 refusals (LOT_NOT_SINGLE_BLOCK, CUT_VOLUME_EXCEEDS_BLOCKS…) in Arabic, worded for one block.
        onError: (err) =>
          toast.error(cutterErrorMessage(err, "تعذر تنفيذ التصرف في البقايا.", CUT_REMNANT_ERROR_MESSAGE)),
      },
    );
  };

  const openBinEdit = useCallback((lot: StockLot) => {
    setBinLot(lot);
    setBinValue(lot.bin_location ?? "");
    setBinError(null);
  }, []);

  const handleBinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!binLot) return;
    setBinError(null);
    updateLotMutation.mutate(
      { id: binLot.id, data: { bin_location: binValue.trim() || null, record_version: binLot.record_version } },
      {
        onSuccess: () => {
          toast.success("تم حفظ موقع الرف");
          setBinLot(null);
        },
        onError: (err) => setBinError(stockLevelErrorMessage(err, "تعذّر حفظ موقع الرف.")),
      },
    );
  };

  const openLotLabel = useCallback((lot: StockLot) => setLabelLots([lot]), []);

  const lotColumns = useStockLedgerColumns({
    onOpenCutModal: openCutModal,
    onEditBin: canEditBin ? openBinEdit : undefined,
    onPrintLabel: openLotLabel,
  });
  const lotsTable = useDataTable({
    exportFileName: "item-lots",
    columns: lotColumns,
    data: tableLots,
    enableSorting: true,
    pageSize: 10,
    getRowId: (lot) => lot.id,
  });

  const movementColumns = useInventoryMovementColumns();
  const movementRows = useMemo(() => ledger?.data ?? [], [ledger]);
  const historyTable = useDataTable({
    exportFileName: "item-movements",
    columns: movementColumns,
    data: movementRows,
    enableSorting: true,
    pageSize: 10,
    getRowId: (m) => m.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/inventory/ledger/${warehouseId}`)}
            className="rounded-xl border border-app-separator bg-app-bg-secondary p-2 hover:bg-app-fill-f1 transition-colors"
            aria-label="رجوع"
          >
            <ArrowRight className="w-4 h-4 text-app-label-secondary" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-app-label-primary">{item?.name ?? "الصنف"}</h1>
            <p className="text-xs text-app-label-tertiary font-mono mt-0.5">{item?.code}</p>
          </div>
        </div>

        {itemId && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                navigate(`/inventory/items/${itemId}/levels`, {
                  state: {
                    backTo: `/inventory/ledger/${warehouseId}/items/${itemId}`,
                    backLabel: item?.name ?? "الصنف",
                  } satisfies StockLevelsBackState,
                })
              }
              className="inline-flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-medium text-app-label-primary hover:bg-app-fill-f1 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4 text-app-accent" />
              حدود المخزون
            </button>
            <button
              onClick={() => navigate(`/inventory/items/${itemId}/movement-card`)}
              className="inline-flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-medium text-app-label-primary hover:bg-app-fill-f1 transition-colors"
            >
              <History className="w-4 h-4 text-app-accent" />
              كرت الصنف
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-app-bg-primary p-5 rounded-2xl border border-app-separator shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-app-label-secondary">الكمية المتاحة</div>
            <div className="text-xl font-bold text-app-label-primary">
              {formatNumber(totalQuantity)} {item?.unit_of_measure}
            </div>
          </div>
        </div>

        <div className="bg-app-bg-primary p-5 rounded-2xl border border-app-separator shadow-sm flex items-center gap-4">
          <div className="p-3 bg-app-accent-subtle text-app-accent rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-app-label-secondary">متوسط سعر الوحدة</div>
            <div className="text-xl font-bold text-app-label-primary">{formatNumber(avgUnitCost)} LYD</div>
          </div>
        </div>

        <div className="bg-app-bg-primary p-5 rounded-2xl border border-app-separator shadow-sm flex items-center gap-4">
          <div className="p-3 bg-sky-100 text-sky-800 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-app-label-secondary">القيمة الإجمالية</div>
            <div className="text-xl font-bold text-app-label-primary">{formatNumber(totalValue)} LYD</div>
          </div>
        </div>
      </div>

      {/* Accounts map */}
      <UnitAccountsPanel unitId={pinnedUnitId} />

      {/* Lots */}
      <div>
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-bold text-app-label-primary">الدفعات في هذا المخزن</h2>
          <div className="flex flex-wrap items-center gap-2">
            {activeScannedLot && (
              <span className="inline-flex items-center gap-1 rounded-full bg-app-accent/10 px-2.5 py-1 text-[11px] font-semibold text-app-accent">
                الدفعة الممسوحة: <span className="font-mono">{activeScannedLot.lot_number}</span>
                <button
                  type="button"
                  onClick={() => setScannedLot(null)}
                  aria-label="عرض كل الدفعات"
                  title="عرض كل الدفعات"
                  className="rounded-full p-0.5 hover:bg-app-accent/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            <button
              type="button"
              onClick={() => void printLotLabels()}
              disabled={tableLots.length === 0 || isPreparingLabels}
              title={
                activeScannedLot
                  ? "ملصق الدفعة الممسوحة"
                  : "ملصقات كل الدفعات الموجودة من هذا الصنف في هذا المخزن (حسب بحث الرف)"
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-medium text-app-label-primary hover:bg-app-fill-f1 transition-colors disabled:opacity-50"
            >
              <Tag className="h-3.5 w-3.5 text-app-accent" />
              {isPreparingLabels ? "جارٍ التحضير…" : "طباعة الملصقات"}
            </button>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-label-tertiary" />
              <input
                ref={lotSearchRef}
                type="search"
                value={binSearch}
                onChange={(e) => {
                  setBinSearch(e.target.value);
                  setScanMiss(null);
                  // Typing something other than the scanned lot's number is a
                  // shelf search: drop the scan filter so the table follows it.
                  if (scannedLot && e.target.value.trim() !== scannedLot.lot_number) setScannedLot(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleLotScan();
                  }
                }}
                placeholder="بحث بموقع الرف أو امسح ملصق الدفعة"
                aria-label="بحث بموقع الرف أو مسح ملصق الدفعة"
                maxLength={255}
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary py-2 pe-3 ps-8 text-xs focus:border-app-accent focus:outline-none"
              />
            </div>
          </div>
        </div>
        <DataTable table={lotsTable}>
          <DataTable.Content
            isLoading={isLoadingTableLots}
            emptyMessage={
              debouncedBin
                ? scanMiss === debouncedBin
                  ? `${codeNotFoundMessage(debouncedBin)}، ولا دفعات على رف بهذا الاسم لهذا الصنف.`
                  : "لا توجد دفعات على هذا الرف لهذا الصنف."
                : "لا توجد دفعات لهذا الصنف في هذا المخزن."
            }
            emptyIcon={Layers}
          />
          <DataTable.Pagination />
        </DataTable>
      </div>

      {/* Price / movement history */}
      <div>
        <h2 className="text-sm font-bold text-app-label-primary mb-2">سجل الحركة والأسعار</h2>
        <DataTable table={historyTable}>
          <DataTable.Content
            isLoading={isLoadingLedger}
            emptyMessage="لا توجد حركات مسجلة لهذا الصنف في هذا المخزن."
            emptyIcon={History}
          />
          <DataTable.Pagination />
        </DataTable>
      </div>

      {/* Lot barcode labels — W4-03 */}
      <LabelPrintDialog
        open={Boolean(labelLots)}
        onClose={() => setLabelLots(null)}
        title={labelLots?.length === 1 ? `ملصق الدفعة: ${labelLots[0].lot_number}` : "ملصقات الدفعات"}
        labels={(labelLots ?? []).map((lot) => lotLabelData(lot, item?.name))}
      />

      {/* Lot shelf (bin) edit — W4-02 */}
      <Dialog open={Boolean(binLot)} onOpenChange={(next) => !next && setBinLot(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <div>
              <DialogTitle>موقع الرف</DialogTitle>
              {binLot && (
                <DialogDescription>
                  الدفعة: <span className="font-mono font-bold">{binLot.lot_number}</span>
                </DialogDescription>
              )}
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <form id="lot-bin-form" onSubmit={handleBinSubmit} className="space-y-3">
              {binError && (
                <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{binError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">موقع الرف</label>
                <input
                  type="text"
                  maxLength={50}
                  autoFocus
                  placeholder="A-03"
                  value={binValue}
                  onChange={(e) => setBinValue(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                  dir="ltr"
                />
                <p className="mt-1 text-[11px] text-app-label-tertiary">اتركه فارغاً لإزالة موقع الرف من هذه الدفعة.</p>
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setBinLot(null)}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="lot-bin-form"
              disabled={updateLotMutation.isPending}
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl shadow-sm disabled:opacity-50"
            >
              {updateLotMutation.isPending ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cutter Completion Modal */}
      <Dialog open={Boolean(selectedLotForCut)} onOpenChange={(next) => !next && setSelectedLotForCut(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-app-accent-subtle text-app-accent rounded-xl">
                <Scissors className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle>قرار تشذيب البقايا</DialogTitle>
                {selectedLotForCut && (
                  <DialogDescription>
                    الدفعة الأصلية: <span className="font-mono font-bold">{selectedLotForCut.lot_number}</span>
                  </DialogDescription>
                )}
              </div>
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            {selectedLotForCut && (
              <form id="cut-remnant-form" onSubmit={handleCutSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-2">
                    إجراء التصرف في البقايا
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRemnantAction("restock_remnant")}
                      className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${
                        remnantAction === "restock_remnant"
                          ? "border-app-accent bg-app-accent-subtle text-app-accent shadow-sm"
                          : "border-app-separator bg-app-bg-secondary text-app-label-secondary hover:bg-app-fill-f1"
                      }`}
                    >
                      إعادة تخزين قالب البقايا
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemnantAction("convert_to_byproduct")}
                      className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${
                        remnantAction === "convert_to_byproduct"
                          ? "border-app-accent bg-app-accent-subtle text-app-accent shadow-sm"
                          : "border-app-separator bg-app-bg-secondary text-app-label-secondary hover:bg-app-fill-f1"
                      }`}
                    >
                      تحويل إلى حشو ثانوي
                    </button>
                  </div>
                </div>

                {remnantAction === "restock_remnant" && (
                  <div className="space-y-3 p-4 bg-app-bg-secondary rounded-xl border border-app-separator">
                    <div className="text-xs font-bold text-app-label-primary">
                      إدخال المشغل: أبعاد قالب البقايا (الطول × العرض × الارتفاع)
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-app-label-secondary mb-1">الطول (م)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={lengthM}
                          onChange={(e) => setLengthM(parseFloat(e.target.value))}
                          className="w-full px-3 py-2 border rounded-xl bg-app-bg-primary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-app-label-secondary mb-1">العرض (م)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={widthM}
                          onChange={(e) => setWidthM(parseFloat(e.target.value))}
                          className="w-full px-3 py-2 border rounded-xl bg-app-bg-primary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-app-label-secondary mb-1">الارتفاع (م)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          value={heightM}
                          onChange={(e) => setHeightM(parseFloat(e.target.value))}
                          className="w-full px-3 py-2 border rounded-xl bg-app-bg-primary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-app-label-tertiary">
                      الحجم المحسوب للبقايا:{" "}
                      <span className="font-bold text-app-accent font-mono">
                        {(lengthM * widthM * heightM).toFixed(4)} m³
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                    وزن نشارة التشذيب / الحشو الثانوي (كجم، اختياري)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={byproductKg}
                    onChange={(e) => setByproductKg(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                  />
                </div>

                <div className="p-3 bg-sky-50 rounded-xl text-xs text-sky-800 flex items-start gap-2 border border-sky-200">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    إتمام هذا الإجراء سيضع الدفعة{" "}
                    <span className="font-mono font-bold">{selectedLotForCut.lot_number}</span> في حالة مستهلك.
                  </span>
                </div>
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setSelectedLotForCut(null)}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="cut-remnant-form"
              disabled={processCutMutation.isPending}
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl shadow-sm disabled:opacity-50"
            >
              {processCutMutation.isPending ? "جاري تنفيذ التشذيب…" : "تأكيد التصرف في البقايا"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarehouseItemDetailPage;

interface UnitAccountsPanelProps {
  unitId: string | null;
}

const UnitAccountsPanel: React.FC<UnitAccountsPanelProps> = ({ unitId }) => {
  const unitQuery = useOperatingUnit(unitId ?? undefined);
  const accounts = unitQuery.data?.accounts ?? [];
  const byType = new Map<InventoryEventType, { id: string; account_code: string; name: string; type: string }>();
  for (const row of accounts) {
    if (row.account) byType.set(row.event_type as InventoryEventType, row.account);
  }
  const linkedCount = byType.size;
  const missingRequired = REQUIRED_INVENTORY_EVENTS.filter((e) => !byType.has(e));
  const allRequired = missingRequired.length === 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
      <div className="flex items-center justify-between border-b border-app-separator bg-app-bg-secondary/40 p-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-app-accent" />
          <h2 className="text-sm font-bold text-app-label-primary">ربط الحسابات (دليل الحسابات)</h2>
          <span className="rounded-full bg-app-fill-f1 px-2 py-0.5 text-[10px] font-bold text-app-label-secondary">
            {linkedCount} / 12
          </span>
        </div>
        <span
          className={`flex items-center gap-1 text-[11px] font-semibold ${
            allRequired ? "text-app-status-positive" : "text-app-status-danger"
          }`}
        >
          {allRequired ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> مكتمل — جاهز للحركة
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5" /> ينقص الوحدة {missingRequired.length} حدث للحركة
            </>
          )}
        </span>
      </div>
      <p className="px-4 pt-3 text-[10px] text-app-label-secondary">
        هذه الحسابات موروثة من الوحدة التشغيلية — عدّلها في صفحة إعدادات الوحدة.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
        {Object.entries(INVENTORY_EVENT_LABELS).map(([event, label]) => {
          const ev = event as InventoryEventType;
          const acc = byType.get(ev);
          const isRequired = REQUIRED_INVENTORY_EVENTS.includes(ev);
          return (
            <div
              key={ev}
              className="flex items-center justify-between gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-app-label-primary">{label}</span>
                {isRequired && (
                  <span className="rounded-full bg-app-status-danger/15 px-1.5 py-0.5 text-[9px] font-bold text-app-status-danger">
                    مطلوب
                  </span>
                )}
              </div>
              {acc ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-app-bg-primary border border-app-separator px-2 py-0.5 text-[10px] font-mono font-semibold text-app-label-primary"
                  title={acc.name}
                >
                  <span className="text-app-accent">{acc.account_code}</span>
                  <span className="text-app-label-tertiary">·</span>
                  <span>{acc.name}</span>
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-app-label-tertiary">
                  غير مربوط
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
