import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { cutterApi, CutterRemnantInput, CutterWorkOrderStatus } from "../api/endpoints/cutter";

export function useCutterOrders(
  params?: { status?: string; internal_only?: boolean; page?: number; per_page?: number },
  options?: { keepPrevious?: boolean },
) {
  return useQuery({
    queryKey: ["cutterOrders", params],
    queryFn: async () => (await cutterApi.getOrders(params)).data,
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
  });
}

export function useCutterOrder(id?: string) {
  return useQuery({
    queryKey: ["cutterOrder", id],
    queryFn: async () => (await cutterApi.getOrder(id as string)).data,
    enabled: Boolean(id),
  });
}

export function useAvailableFoamBlocks(params?: { page?: number }) {
  return useQuery({
    queryKey: ["availableFoamBlocks", params],
    queryFn: async () => (await cutterApi.getAvailableFoamBlocks(params)).data,
  });
}

export function useCreateCutterOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      order_number?: string;
      client_id?: string;
      notes?: string;
      stock_lot_id?: string;
    }) => cutterApi.createOrder(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cutterOrders"] }),
  });
}

export function useTransitionCutterOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      remnants,
    }: {
      id: string;
      status: CutterWorkOrderStatus;
      remnants?: CutterRemnantInput[];
    }) => cutterApi.transition(id, status, remnants),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["cutterOrder", v.id] });
      qc.invalidateQueries({ queryKey: ["cutterOrders"] });
      // Completing produces cut pieces, remnants and fill, so stock and valuation move.
      qc.invalidateQueries({ queryKey: ["stockLots"] });
      qc.invalidateQueries({ queryKey: ["inventoryValuation"] });
      if (v.status === "completed") {
        // Remnants go back into stock as new foam-block lots, so the block pickers
        // and the warehouse screens need fresh data too.
        qc.invalidateQueries({ queryKey: ["availableFoamBlocks"] });
        qc.invalidateQueries({ queryKey: ["availableBlocks"] });
        qc.invalidateQueries({ queryKey: ["availableForCutting"] });
        qc.invalidateQueries({ queryKey: ["warehouseStockSummary"] });
        qc.invalidateQueries({ queryKey: ["warehouseLedger"] });
      }
    },
  });
}

export function useAddCutterLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { requested_spec: string; quantity: number; output_inventory_item_id?: string };
    }) => cutterApi.addLine(id, data),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["cutterOrder", v.id] }),
  });
}

export function useAssignTemplate(orderId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      lineId,
      data,
    }: {
      lineId: string;
      data: {
        template_length_m: number;
        template_width_m: number;
        template_height_m: number;
        output_inventory_item_id?: string;
      };
    }) => cutterApi.assignTemplate(lineId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cutterOrder", orderId] });
      // The candidate block list is filtered by template volume, so it changes.
      qc.invalidateQueries({ queryKey: ["availableBlocks"] });
    },
  });
}

export function useAvailableBlocks(lineId?: string, enabled = true) {
  return useQuery({
    queryKey: ["availableBlocks", lineId],
    queryFn: async () => (await cutterApi.availableBlocks(lineId as string)).data.data,
    enabled: Boolean(lineId) && enabled,
    retry: false,
  });
}

export function useSelectBlock(orderId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, stockLotId }: { lineId: string; stockLotId: string }) =>
      cutterApi.selectBlock(lineId, stockLotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cutterOrder", orderId] });
      qc.invalidateQueries({ queryKey: ["availableBlocks"] });
      qc.invalidateQueries({ queryKey: ["stockLots"] });
    },
  });
}

export function useRecordWeighIn(orderId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      weight_kg: number;
      byproduct_inventory_item_id?: string;
      warehouse_id?: string;
    }) => cutterApi.recordWeighIn(orderId as string, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cutterOrder", orderId] });
      qc.invalidateQueries({ queryKey: ["stockLots"] });
    },
  });
}

export function useAttachBlock(orderId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stockLotId: string) =>
      cutterApi.attachBlock(orderId as string, stockLotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cutterOrder", orderId] });
      qc.invalidateQueries({ queryKey: ["cutterOrders"] });
      qc.invalidateQueries({ queryKey: ["availableFoamBlocks"] });
      qc.invalidateQueries({ queryKey: ["stockLots"] });
    },
  });
}

export function useDetachBlock(orderId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stockLotId?: string) =>
      cutterApi.detachBlock(orderId as string, stockLotId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cutterOrder", orderId] });
      qc.invalidateQueries({ queryKey: ["cutterOrders"] });
      qc.invalidateQueries({ queryKey: ["availableFoamBlocks"] });
      qc.invalidateQueries({ queryKey: ["stockLots"] });
    },
  });
}

export function useJobSheet(orderId?: string, enabled = true) {
  return useQuery({
    queryKey: ["cutterJobSheet", orderId],
    queryFn: async () => (await cutterApi.jobSheet(orderId as string)).data,
    enabled: Boolean(orderId) && enabled,
    retry: false,
  });
}

