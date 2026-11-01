import apiClient from "../client";
import { StockLot } from "./inventory";
import { ApiErrorPayload, apiErrorMessage, apiErrorPayload } from "./production";

export type CutterWorkOrderStatus =
  | "requested"
  | "confirmed"
  | "in_production"
  | "awaiting_byproduct_weigh_in"
  | "quality_check"
  | "completed"
  | "invoiced";

/** Phase 05 §5.4 — linear, one step at a time, no way back. */
export const CUTTER_STATUS_ORDER: CutterWorkOrderStatus[] = [
  "requested",
  "confirmed",
  "in_production",
  "awaiting_byproduct_weigh_in",
  "quality_check",
  "completed",
  "invoiced",
];

export const CUTTER_NEXT_STATUS: Record<CutterWorkOrderStatus, CutterWorkOrderStatus | null> = {
  requested: "confirmed",
  confirmed: "in_production",
  in_production: "awaiting_byproduct_weigh_in",
  awaiting_byproduct_weigh_in: "quality_check",
  quality_check: "completed",
  completed: "invoiced",
  invoiced: null,
};

export const CUTTER_STATUS_LABEL: Record<CutterWorkOrderStatus, string> = {
  requested: "مطلوب",
  confirmed: "مؤكد",
  in_production: "قيد الإنتاج",
  awaiting_byproduct_weigh_in: "بانتظار وزن الفائض",
  quality_check: "فحص الجودة",
  completed: "مكتمل",
  invoiced: "تم إصدار الفاتورة",
};

/** Blocks may only be picked while the order is confirmed or being cut. */
export const BLOCK_SELECTION_STATES: CutterWorkOrderStatus[] = ["confirmed", "in_production"];

export interface FoamBlockConsumption {
  id: string;
  stock_lot_id: string;
  block_volume_m3: number;
  volume_consumed_m3: number;
  consumption_type: "full" | "partial";
  consumed_cost: number;
  remainder_cost: number;
  stock_lot?: StockLot;
}

/**
 * A foam block available to be attached to a cutter work order at
 * creation time. Mirrors the backend's GET /cutter-work-orders/available-foam-blocks.
 */
export interface AvailableFoamBlock {
  id: string;
  lot_number: string;
  unit_cost: number;
  length_m?: number | null;
  width_m?: number | null;
  height_m?: number | null;
  volume_m3?: number | null;
  status: string;
  warehouse?: { id: string; name: string };
  inventory_item?: { id: string; name: string; code: string };
}

export interface CutterWorkOrderLine {
  id: string;
  cutter_work_order_id: string;
  /** The client's words. Never used for costing. */
  requested_spec: string;
  quantity: number;
  /** The bounding box actually cut — what costing and inventory use. */
  template_length_m?: number;
  template_width_m?: number;
  template_height_m?: number;
  template_volume_m3?: number;
  output_inventory_item_id?: string;
  output_item?: { id: string; name: string; code: string };
  consumptions?: FoamBlockConsumption[];
  /** Set when this line cuts a sold bundle's piece rather than one the cutter added itself. */
  sale_bundle_component_id?: string | null;
  sale_component?: {
    line?: {
      description?: string | null;
      sales_order?: { id: string; order_number: string; client_id?: string | null };
    };
  } | null;
}

/** One foam block attached to a cutter order — an order may cut several. */
export interface CutterWorkOrderBlock {
  id: string;
  stock_lot_id: string;
  unit_cost_snapshot: number;
  length_m_snapshot?: number | null;
  width_m_snapshot?: number | null;
  height_m_snapshot?: number | null;
  volume_m3_snapshot?: number | null;
  stock_lot?: AvailableFoamBlock | null;
}

export interface CutterJobSheet {
  order_number: string;
  status: CutterWorkOrderStatus;
  date?: string | null;
  cutter?: string | null;
  notes?: string | null;
  blocks: { lot_number?: string | null; length_m?: number | null; width_m?: number | null; height_m?: number | null }[];
  lines: {
    requested_spec: string;
    quantity: number;
    length_m?: number | null;
    width_m?: number | null;
    height_m?: number | null;
    output_item?: string | null;
    output_sku?: string | null;
    sale_number?: string | null;
    bundle?: string | null;
    client?: string | null;
  }[];
}

export interface ByproductYield {
  id: string;
  /** The fill lot the weigh-in stocked; null when nothing was salvaged. */
  stock_lot_id?: string | null;
  weight_kg: number;
  yield_cost: number;
  weighed_at: string;
  stock_lot?: StockLot;
  weighed_by?: { name: string };
}

export interface CutterWorkOrder {
  id: string;
  operating_unit_id: string;
  client_id?: string;
  client?: { id: string; name?: string };
  order_number: string;
  status: CutterWorkOrderStatus;
  /** Material held in the order between block consumption and completion. */
  wip_cost: number;
  notes?: string;
  lines?: CutterWorkOrderLine[];
  lines_count?: number;
  byproduct_yields?: ByproductYield[];
  record_version: number;
  created_at: string;
  /** The foam blocks reserved for this order — several may be attached. */
  blocks?: CutterWorkOrderBlock[];
}

/** W4-06: a usable remnant registered when the order completes. */
export interface CutterRemnantInput {
  length_m: number;
  width_m: number;
  height_m: number;
  /** The cut block it came from (one of the order's consumptions); omitted means the order's first block. */
  stock_lot_id?: string;
}

/** W4-06 cutter and cut-remnant refusals, in the user's language. */
export const CUTTER_ERROR_MESSAGE: Record<string, string> = {
  CUT_VOLUME_EXCEEDS_BLOCKS: "حجم القطع والبقايا المسجلة أكبر من حجم البلوكات المقطوعة — راجع أبعاد البقايا.",
  CUT_REMNANT_NO_SOURCE_BLOCK: "لا يوجد بلوك مقطوع في هذا الأمر تُسجّل منه البقايا.",
  CUT_REMNANT_TOO_SMALL: "البقية صغيرة جداً — يجب ألا يقل حجمها عن 0.0001 م³ لإعادتها للمخزون.",
  BLOCK_DIMENSIONS_REQUIRED: "البلوك ليس له أبعاد مسجلة (طول وعرض وارتفاع)، فلا يمكن تسعير بقايا منه.",
  BYPRODUCT_ITEM_REQUIRED: "اختر صنف الحشو (منتج ثانوي) الذي يُخزَّن فيه الوزن، أو أدخل 0 إذا لم يُسترجع شيء.",
  BYPRODUCT_ALREADY_MOVED: "تحرّك لوت حشو من وزن سابق بعد تسعيره، فلا يمكن إعادة تسعيره — أعد اللوت إلى كميته الموزونة أولاً.",
  OUTPUT_WAREHOUSE_OTHER_UNIT: "مخزن المخرجات يجب أن يتبع وحدة أمر العمل نفسها.",
  LOT_NOT_AVAILABLE: "لا يمكن تقطيع إلا بلوك متاح — هذا اللوت محجوز أو مستهلك.",
  LOT_NOT_FOAM_BLOCK: "هذا اللوت ليس بلوك إسفنج — لا يُقطَّع إلا بلوك الإسفنج.",
  LOT_NOT_SINGLE_BLOCK: "هذا اللوت يحمل أكثر من بلوك — لا يُقطَّع إلا لوت من بلوك واحد.",
};

/** A weigh-in that would re-share the fill cost with an earlier fill lot that has moved. */
export const CUTTER_WEIGH_IN_ERROR_MESSAGE: Record<string, string> = {
  BYPRODUCT_ALREADY_MOVED:
    "تحرّك لوت حشو من وزن سابق، فلا يمكن إعادة توزيع تكلفة الحشو عليه — لا تسجّل وزناً إضافياً، أو أعد اللوت إلى كميته الموزونة أولاً.",
};

/** The standalone cut of one block (inventory screen), which has no fill-item picker and no pieces. */
export const CUT_REMNANT_ERROR_MESSAGE: Record<string, string> = {
  BYPRODUCT_ITEM_REQUIRED: "لا يوجد صنف حشو (منتج ثانوي) معرّف — أنشئ صنفاً من نوع الحشو أولاً، أو اترك الوزن 0.",
  CUT_VOLUME_EXCEEDS_BLOCKS: "حجم البقية أكبر من حجم البلوك — راجع أبعاد البقية.",
};

/**
 * The Arabic message for a cutter refusal: the context's own text first, then
 * the cutter messages, then the shared ledger messages.
 */
export const cutterErrorMessage = (
  err: unknown,
  fallback: string,
  overrides?: Record<string, string>,
): string => {
  const code = apiErrorPayload(err)?.code;
  return (code && (overrides?.[code] ?? CUTTER_ERROR_MESSAGE[code])) || apiErrorMessage(err, fallback);
};

/**
 * A completion refusal. BYPRODUCT_ALREADY_MOVED is raised for the remnants
 * lowering a moved fill lot's price (completing without them helps) or for a
 * moved lot the pieces can no longer absorb (piece_cost; only bringing the lot
 * back helps). CUT_VOLUME_EXCEEDS_BLOCKS naming a stock_lot_id is one block's
 * remnants overflowing that block, not the order's total.
 */
export const cutterCompletionErrorMessage = (err: unknown, fallback: string, withRemnants: boolean): string => {
  const payload = apiErrorPayload(err) as (ApiErrorPayload & { piece_cost?: number; stock_lot_id?: string }) | undefined;
  const overrides: Record<string, string> = {};
  if (withRemnants && payload?.piece_cost === undefined) {
    overrides.BYPRODUCT_ALREADY_MOVED =
      "تحرّك لوت حشو منذ وزنه، فلا يمكن للبقايا المسجلة أن تخفّض سعره — أكمل بدون بقايا، أو أعد اللوت إلى كميته الموزونة أولاً.";
  }
  if (payload?.stock_lot_id) {
    overrides.CUT_VOLUME_EXCEEDS_BLOCKS =
      "بقايا أحد البلوكات أكبر من حجم ذلك البلوك — راجع أبعاد البقايا والبلوك الذي قُطعت منه كل بقية.";
  }
  return cutterErrorMessage(err, fallback, overrides);
};

/** A remnant's volume exactly as its lot will store it (sides to 3 decimals, volume to 4). */
export const remnantVolumeM3 = (r: CutterRemnantInput): number => {
  const side = (v: number) => Math.round(v * 1000) / 1000;
  return Math.round(side(r.length_m) * side(r.width_m) * side(r.height_m) * 10000) / 10000;
};

const round4 = (v: number) => Math.round(v * 10000) / 10000;
const round6 = (v: number) => Math.round(v * 1000000) / 1000000;

/** One block the order cut, with the remnants charged to it. */
export interface CutterSourceBlock {
  stockLotId: string;
  lotNumber: string;
  blockVolume: number;
  remnantVolume: number;
  remnantCount: number;
  /** Its remnants do not fit inside it (the server refuses CUT_VOLUME_EXCEEDS_BLOCKS). */
  exceeded: boolean;
  /** It carries remnants but has no recorded size (BLOCK_DIMENSIONS_REQUIRED). */
  unsized: boolean;
}

export interface CutterCostSplit {
  cost: number;
  blockVolume: number;
  pieceVolume: number;
  remnantVolume: number;
  byproductVolume: number;
  pieceCost: number;
  remnantCosts: number[];
  byproductCost: number;
  salvagedKg: number;
  /** P + R exceeds V while remnants are claimed (the server refuses CUT_VOLUME_EXCEEDS_BLOCKS). */
  exceedsBlocks: boolean;
  /** The blocks the order cut, in the server's order; a remnant names one or falls to defaultBlockId. */
  sourceBlocks: CutterSourceBlock[];
  /** The order's first attached block if it was cut, else the first cut block (resolveRemnants). */
  defaultBlockId: string | null;
  /** A remnant has no cut block to come from (CUT_REMNANT_NO_SOURCE_BLOCK). */
  noSourceBlock: boolean;
}

/**
 * W4-06 preview of the completion split (mirrors CutterWorkOrderService::splitCost):
 * the order's block cost C splits by volume — pieces C×P/V, each remnant C×r/V,
 * byproduct C×S/V with S = V − P − R, only when something was weighed in (a zero
 * weigh-in leaves the offcut's value on the pieces). Rounding lands on the pieces.
 */
export const previewCutterSplit = (order: CutterWorkOrder, remnants: CutterRemnantInput[]): CutterCostSplit => {
  const lines = order.lines ?? [];
  const consumptions = lines.flatMap((l) => l.consumptions ?? []);
  const cost = round4(Number(order.wip_cost ?? 0));
  const blockVolume = round6(consumptions.reduce((s, c) => s + Number(c.block_volume_m3 ?? 0), 0));
  const pieceVolume = round6(
    lines.reduce((s, l) => s + round6(Number(l.template_volume_m3 ?? 0) * Number(l.quantity ?? 0)), 0),
  );
  const remnantVolumes = remnants.map(remnantVolumeM3);
  const remnantVolume = round6(remnantVolumes.reduce((s, v) => s + v, 0));
  const byproductVolume = round6(Math.max(0, blockVolume - pieceVolume - remnantVolume));
  const salvaged = (order.byproduct_yields ?? []).filter((y) => Number(y.weight_kg) > 0);
  const salvagedKg = salvaged.reduce((s, y) => s + Number(y.weight_kg), 0);
  // A positive weigh-in with no fill lot (pre-W4-06) stocks nothing, so its share stays on the pieces.
  const stockedKg = salvaged.filter((y) => y.stock_lot_id).reduce((s, y) => s + Number(y.weight_kg), 0);

  let remnantCosts: number[] = remnantVolumes.map(() => 0);
  let byproductCost = 0;
  if (blockVolume > 0) {
    remnantCosts = remnantVolumes.map((v) => round4((cost * v) / blockVolume));
    if (salvaged.length > 0) {
      const full = round4((cost * byproductVolume) / blockVolume);
      byproductCost = salvagedKg > 0 ? round4((full * stockedKg) / salvagedKg) : 0;
    }
  }
  const pieceCost = round4(cost - remnantCosts.reduce((s, v) => s + v, 0) - byproductCost);

  const tolerance = 0.00005 * (consumptions.length + remnants.length + lines.length);
  const exceedsBlocks =
    remnants.length > 0 && remnantVolume - Math.max(0, blockVolume - pieceVolume) > tolerance;

  // Mirrors resolveRemnants: each remnant is charged to the block it names, else
  // the default one, and one block's remnants must fit inside that block.
  const byLot = new Map<string, FoamBlockConsumption>();
  for (const c of consumptions) {
    if (c.stock_lot) byLot.set(c.stock_lot_id, c);
  }
  const firstAttached = order.blocks?.[0]?.stock_lot_id;
  const defaultBlockId = firstAttached && byLot.has(firstAttached) ? firstAttached : ([...byLot.keys()][0] ?? null);
  const perLot = new Map<string, { volume: number; count: number }>();
  let noSourceBlock = false;
  remnants.forEach((r, i) => {
    const lotId = r.stock_lot_id || defaultBlockId;
    if (!lotId || !byLot.has(lotId)) {
      noSourceBlock = true;
      return;
    }
    const entry = perLot.get(lotId) ?? { volume: 0, count: 0 };
    perLot.set(lotId, { volume: round6(entry.volume + remnantVolumes[i]), count: entry.count + 1 });
  });
  const sourceBlocks: CutterSourceBlock[] = [...byLot.values()].map((c) => {
    const entry = perLot.get(c.stock_lot_id);
    const size = Number(c.block_volume_m3 ?? 0);
    return {
      stockLotId: c.stock_lot_id,
      lotNumber: c.stock_lot?.lot_number ?? c.stock_lot_id.slice(0, 8),
      blockVolume: size,
      remnantVolume: entry?.volume ?? 0,
      remnantCount: entry?.count ?? 0,
      exceeded: !!entry && size > 0 && 0.00005 * (entry.count + 1) < entry.volume - size,
      unsized: !!entry && size <= 0,
    };
  });

  return {
    cost,
    blockVolume,
    pieceVolume,
    remnantVolume,
    byproductVolume,
    pieceCost,
    remnantCosts,
    byproductCost,
    salvagedKg,
    exceedsBlocks,
    sourceBlocks,
    defaultBlockId,
    noSourceBlock,
  };
};

export const cutterApi = {
  getOrders: (params?: { status?: string; internal_only?: boolean; page?: number; per_page?: number }) =>
    apiClient.get<{ data: CutterWorkOrder[]; current_page: number; last_page: number; total: number }>(
      "/cutter-work-orders",
      { params },
    ),

  getOrder: (id: string) => apiClient.get<CutterWorkOrder>(`/cutter-work-orders/${id}`),

  /** order_number is optional — the server numbers the order (CWO-2026-00001) when omitted. */
  createOrder: (data: {
    order_number?: string;
    client_id?: string;
    notes?: string;
    stock_lot_id?: string;
  }) => apiClient.post<CutterWorkOrder>("/cutter-work-orders", data),

  getAvailableFoamBlocks: (params?: { page?: number }) =>
    apiClient.get<{
      data: AvailableFoamBlock[];
      current_page: number;
      last_page: number;
      total: number;
    }>("/cutter-work-orders/available-foam-blocks", { params }),

  /** W4-06: the completion may register usable remnants (each restocked as a smaller block). */
  transition: (id: string, status: CutterWorkOrderStatus, remnants?: CutterRemnantInput[]) =>
    apiClient.post<CutterWorkOrder>(`/cutter-work-orders/${id}/transition`, {
      status,
      ...(remnants && remnants.length > 0 ? { remnants } : {}),
    }),

  addLine: (
    id: string,
    data: { requested_spec: string; quantity: number; output_inventory_item_id?: string },
  ) => apiClient.post<CutterWorkOrderLine>(`/cutter-work-orders/${id}/lines`, data),

  assignTemplate: (
    lineId: string,
    data: {
      template_length_m: number;
      template_width_m: number;
      template_height_m: number;
      output_inventory_item_id?: string;
    },
  ) => apiClient.put<CutterWorkOrderLine>(`/cutter-work-order-lines/${lineId}/assign-template`, data),

  /** Filtered candidates only — the manager picks (CUT-02). */
  availableBlocks: (lineId: string) =>
    apiClient.get<{ data: StockLot[]; total: number }>(
      `/cutter-work-order-lines/${lineId}/available-blocks`,
    ),

  selectBlock: (lineId: string, stockLotId: string) =>
    apiClient.post<FoamBlockConsumption>(`/cutter-work-order-lines/${lineId}/select-block`, {
      stock_lot_id: stockLotId,
    }),

  attachBlock: (id: string, stockLotId: string) =>
    apiClient.post<CutterWorkOrder>(`/cutter-work-orders/${id}/attach-block`, {
      stock_lot_id: stockLotId,
    }),

  /** Releases the one attached block, or a named one when several are attached. */
  detachBlock: (id: string, stockLotId?: string) =>
    apiClient.delete<CutterWorkOrder>(`/cutter-work-orders/${id}/detach-block`, {
      data: stockLotId ? { stock_lot_id: stockLotId } : undefined,
    }),

  jobSheet: (id: string) => apiClient.get<CutterJobSheet>(`/cutter-work-orders/${id}/job-sheet`),

  recordWeighIn: (
    id: string,
    data: { weight_kg: number; byproduct_inventory_item_id?: string; warehouse_id?: string },
  ) => apiClient.post<ByproductYield>(`/cutter-work-orders/${id}/weigh-in`, data),

  byproductYields: (id: string) =>
    apiClient.get<ByproductYield[]>(`/cutter-work-orders/${id}/byproduct-yields`),
};
