import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  productionApi,
  BlockGroupInput,
  CreateBatchInput,
  IssueMaterialLine,
  ProductionBatch,
  ProductionBatchStatus,
} from "../api/endpoints/production";

export function useProductionBatches(
  params?: { status?: string; page?: number; per_page?: number },
  options?: { keepPrevious?: boolean },
) {
  return useQuery({
    queryKey: ["productionBatches", params],
    queryFn: async () => {
      const res = await productionApi.getBatches(params);
      return res.data;
    },
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
  });
}

export function useProductionBatch(id?: string) {
  return useQuery({
    queryKey: ["productionBatch", id],
    queryFn: async () => {
      const res = await productionApi.getBatch(id as string);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useBatchBlocks(batchId?: string) {
  return useQuery({
    queryKey: ["batchBlocks", batchId],
    queryFn: async () => {
      const res = await productionApi.getBatchBlocks(batchId as string);
      return res.data.data;
    },
    enabled: Boolean(batchId),
  });
}

export function useCreateProductionBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBatchInput) => productionApi.createBatch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productionBatches"] });
    },
  });
}

export function useUpdateProductionBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateBatchInput> & { record_version: number };
    }) => productionApi.updateBatch(id, data),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["productionBatches"] });
      queryClient.invalidateQueries({ queryKey: ["productionBatch", variables.id] });
    },
  });
}

export function useDeleteProductionBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productionApi.deleteBatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productionBatches"] });
    },
  });
}

export function useRegisterBlocks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, groups }: { id: string; groups: BlockGroupInput[] }) =>
      productionApi.registerBlocks(id, groups),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["batchBlocks", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["productionBatch", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["productionBatches"] });
      // Blocks are stock — the ledger and valuation both move.
      queryClient.invalidateQueries({ queryKey: ["stockLots"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryValuation"] });
    },
  });
}

export function useTransitionBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProductionBatchStatus }) =>
      productionApi.transition(id, status),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["productionBatch", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["productionBatches"] });
      // Closing a batch apportions cost onto its blocks.
      queryClient.invalidateQueries({ queryKey: ["batchBlocks", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["inventoryValuation"] });
    },
  });
}

/** W4-05: what issuing or removing a chemical moves — the batch, its cost, and stock. */
function invalidateAfterMaterialChange(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: ["productionBatch", id] });
  queryClient.invalidateQueries({ queryKey: ["productionBatches"] });
  queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
  queryClient.invalidateQueries({ queryKey: ["stockLots"] });
  queryClient.invalidateQueries({ queryKey: ["inventoryValuation"] });
  // Consumption movements and the DR 1121 / CR 111 entry (or its reversal).
  queryClient.invalidateQueries({ queryKey: ["warehouseStockSummary"] });
  queryClient.invalidateQueries({ queryKey: ["warehouseLedger"] });
  queryClient.invalidateQueries({ queryKey: ["movementsForDocument"] });
  queryClient.invalidateQueries({ queryKey: ["stockMovementCard"] });
  queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
  queryClient.invalidateQueries({ queryKey: ["trialBalance"] });
  queryClient.invalidateQueries({ queryKey: ["accounts"] });
}

export function useIssueBatchMaterials() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lines }: { id: string; lines: IssueMaterialLine[] }) =>
      productionApi.issueMaterials(id, lines),
    onSuccess: (_res, variables) => invalidateAfterMaterialChange(queryClient, variables.id),
  });
}

export function useRemoveBatchMaterial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lineId }: { id: string; lineId: string }) =>
      productionApi.removeMaterial(id, lineId),
    onSuccess: (_res, variables) => invalidateAfterMaterialChange(queryClient, variables.id),
  });
}

/** The next operation number the operator is expected to enter. */
export function expectedOperationNumber(batches?: ProductionBatch[]): number {
  if (!batches || batches.length === 0) return 1;
  return Math.max(...batches.map((b) => b.operation_number)) + 1;
}
