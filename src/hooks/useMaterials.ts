import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MaterialRequest,
  MaterialRequestFulfilledByType,
  materialsApi,
} from "../api/endpoints/materials";

export function useMaterialRequests(params?: {
  status?: MaterialRequest["status"];
  fulfilling_module?: MaterialRequest["fulfilling_module"];
  requested_for_type?: string;
  requested_for_id?: string;
  page?: number;
  per_page?: number;
}, options?: { keepPrevious?: boolean }) {
  return useQuery({
    queryKey: ["materialRequests", params],
    queryFn: async () => (await materialsApi.list(params)).data,
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
  });
}

export function useMaterialRequest(id?: string) {
  return useQuery({
    queryKey: ["materialRequest", id],
    queryFn: async () => (await materialsApi.show(id as string)).data,
    enabled: Boolean(id),
  });
}

export function useStartMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => materialsApi.start(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materialRequests"] }),
  });
}

export function useFulfillMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      fulfilled_by_type: MaterialRequestFulfilledByType;
      fulfilled_by_id: string;
      notes?: string;
    }) =>
      materialsApi.fulfill(args.id, {
        fulfilled_by_type: args.fulfilled_by_type,
        fulfilled_by_id: args.fulfilled_by_id,
        notes: args.notes,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materialRequests"] }),
  });
}

export function useCancelMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => materialsApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["materialRequests"] }),
  });
}
