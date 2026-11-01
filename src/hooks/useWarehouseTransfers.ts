import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { warehouseTransfersApi, WarehouseTransferPayload } from "../api/endpoints/warehouseTransfers";

export function useWarehouseTransfers(
  params?: { status?: string; search?: string; page?: number; per_page?: number },
  options?: { keepPrevious?: boolean },
) {
  return useQuery({
    queryKey: ["warehouseTransfers", params],
    queryFn: async () => {
      const res = await warehouseTransfersApi.list(params);
      return res.data;
    },
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
  });
}

export function useWarehouseTransfer(id?: string) {
  return useQuery({
    queryKey: ["warehouseTransfer", id],
    queryFn: async () => {
      const res = await warehouseTransfersApi.get(id as string);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateWarehouseTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: WarehouseTransferPayload) => warehouseTransfersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouseTransfers"] });
    },
  });
}

export function useUpdateWarehouseTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Omit<WarehouseTransferPayload, "transfer_number"> }) =>
      warehouseTransfersApi.update(id, data),
    onSuccess: (_res, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["warehouseTransfers"] });
      queryClient.invalidateQueries({ queryKey: ["warehouseTransfer", id] });
    },
  });
}

export function useCompleteWarehouseTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehouseTransfersApi.complete(id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ["warehouseTransfers"] });
      queryClient.invalidateQueries({ queryKey: ["warehouseTransfer", id] });
      queryClient.invalidateQueries({ queryKey: ["stockLots"] });
      queryClient.invalidateQueries({ queryKey: ["inventoryValuation"] });
      queryClient.invalidateQueries({ queryKey: ["warehouseStockSummary"] });
      queryClient.invalidateQueries({ queryKey: ["warehouseLedger"] });
      queryClient.invalidateQueries({ queryKey: ["movementsForDocument"] });
    },
  });
}

export function useCancelWarehouseTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => warehouseTransfersApi.cancel(id),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ["warehouseTransfers"] });
      queryClient.invalidateQueries({ queryKey: ["warehouseTransfer", id] });
    },
  });
}
