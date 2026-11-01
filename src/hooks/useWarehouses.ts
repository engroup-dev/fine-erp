import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "../api/client";
import {
  createOperatingUnitWarehouse,
  createWarehouse,
  deleteWarehouse,
  getOperatingUnitWarehouses,
  updateWarehouse,
} from "../api/endpoints/operatingUnits";
import { Warehouse } from "../types/entities";

export type { Warehouse };

/** Warehouses for the current operating unit — scoped server-side. */
export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await apiClient.get<Warehouse[]>("/warehouses");
      return res.data;
    },
  });
}

/** Warehouses explicitly belonging to a specific operating unit. */
export function useOperatingUnitWarehouses(unitId?: string) {
  return useQuery({
    queryKey: ["operating-unit-warehouses", unitId],
    queryFn: () => (unitId ? getOperatingUnitWarehouses(unitId) : Promise.resolve([])),
    enabled: Boolean(unitId),
  });
}

/** Create a warehouse in the current operating unit context (Settings > المخازن).
 * `operatingUnitId` names the unit for this one request (sent as the
 * X-Operating-Unit-ID header, W6-06) when none is pinned. */
export function useCreateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      operatingUnitId,
      ...payload
    }: Parameters<typeof createWarehouse>[0] & { operatingUnitId?: string }) =>
      createWarehouse(payload, operatingUnitId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["operatingUnits"] });
    },
  });
}

/** Create a warehouse assigned to a specific operating unit. */
export function useCreateOperatingUnitWarehouse(unitId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { name: string; is_internal_unit?: boolean }) => {
      if (!unitId) throw new Error("Operating unit ID is required");
      return createOperatingUnitWarehouse(unitId, payload);
    },
    onSuccess: () => {
      if (unitId) {
        queryClient.invalidateQueries({ queryKey: ["operating-unit-warehouses", unitId] });
        queryClient.invalidateQueries({ queryKey: ["operatingUnit", unitId] });
      }
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["operatingUnits"] });
    },
  });
}

/** Update an existing warehouse. */
export function useUpdateWarehouse(unitId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Parameters<typeof updateWarehouse>[1]) =>
      updateWarehouse(id, payload),
    onSuccess: () => {
      if (unitId) {
        queryClient.invalidateQueries({ queryKey: ["operating-unit-warehouses", unitId] });
        queryClient.invalidateQueries({ queryKey: ["operatingUnit", unitId] });
      }
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["operatingUnits"] });
    },
  });
}

/** Delete a warehouse (if empty and not the last warehouse). */
export function useDeleteWarehouse(unitId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWarehouse(id),
    onSuccess: () => {
      if (unitId) {
        queryClient.invalidateQueries({ queryKey: ["operating-unit-warehouses", unitId] });
        queryClient.invalidateQueries({ queryKey: ["operatingUnit", unitId] });
      }
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      queryClient.invalidateQueries({ queryKey: ["operatingUnits"] });
    },
  });
}
