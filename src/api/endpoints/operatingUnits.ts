import apiClient from "../client";
import {
  BlueprintEntry,
  Client,
  Employee,
  EntityType,
  OperatingUnit,
  OperatingUnitCreatePayload,
  OperatingUnitUpdatePayload,
  UnitBlueprintCreatePayload,
  UnitBlueprintUpdatePayload,
  Warehouse,
} from "../../types/entities";

export interface RoleEntry {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
}

export const getOperatingUnits = async (
  options: { withTrashed?: boolean } = {},
): Promise<OperatingUnit[]> => {
  const response = await apiClient.get<{ data: OperatingUnit[] } | OperatingUnit[]>(
    "/operating-units",
    { params: options.withTrashed ? { with_trashed: 1 } : {} },
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data?.data ?? [];
};

export const getOperatingUnit = async (id: string): Promise<OperatingUnit> => {
  const response = await apiClient.get<{ data: OperatingUnit }>(`/operating-units/${id}`);
  return response.data.data;
};

export const createOperatingUnit = async (
  payload: OperatingUnitCreatePayload,
): Promise<OperatingUnit> => {
  const response = await apiClient.post<{ data: OperatingUnit }>("/operating-units", payload);
  return response.data.data;
};

export const updateOperatingUnit = async (
  id: string,
  payload: OperatingUnitUpdatePayload,
): Promise<OperatingUnit> => {
  const response = await apiClient.put<{ data: OperatingUnit }>(`/operating-units/${id}`, payload);
  return response.data.data;
};

export const deleteOperatingUnit = async (id: string): Promise<{ message: string }> => {
  const response = await apiClient.delete<{ message: string }>(`/operating-units/${id}`);
  return response.data;
};

export const restoreOperatingUnit = async (id: string): Promise<OperatingUnit> => {
  const response = await apiClient.post<{ data: OperatingUnit }>(
    `/operating-units/${id}/restore`,
  );
  return response.data.data;
};

export const getUnitBlueprints = async (
  options: { withTrashed?: boolean } = {},
): Promise<BlueprintEntry[]> => {
  const response = await apiClient.get<{ data: BlueprintEntry[] } | BlueprintEntry[]>(
    "/unit-blueprints",
    { params: options.withTrashed ? { with_trashed: 1 } : {} },
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data?.data ?? [];
};

export const getUnitBlueprint = async (id: string): Promise<BlueprintEntry> => {
  const response = await apiClient.get<{ data: BlueprintEntry }>(`/unit-blueprints/${id}`);
  return response.data.data;
};

export const createUnitBlueprint = async (
  payload: UnitBlueprintCreatePayload,
): Promise<BlueprintEntry> => {
  const response = await apiClient.post<{ data: BlueprintEntry }>(
    "/unit-blueprints",
    payload,
  );
  return response.data.data;
};

export const updateUnitBlueprint = async (
  id: string,
  payload: UnitBlueprintUpdatePayload,
): Promise<BlueprintEntry> => {
  const response = await apiClient.put<{ data: BlueprintEntry }>(
    `/unit-blueprints/${id}`,
    payload,
  );
  return response.data.data;
};

export const deleteUnitBlueprint = async (id: string): Promise<{ message: string }> => {
  const response = await apiClient.delete<{ message: string }>(`/unit-blueprints/${id}`);
  return response.data;
};

export const restoreUnitBlueprint = async (id: string): Promise<BlueprintEntry> => {
  const response = await apiClient.post<{ data: BlueprintEntry }>(
    `/unit-blueprints/${id}/restore`,
  );
  return response.data.data;
};

export const getOperatingUnitWarehouses = async (unitId: string): Promise<Warehouse[]> => {
  const response = await apiClient.get<Warehouse[]>(`/operating-units/${unitId}/warehouses`);
  return response.data;
};

export const createOperatingUnitWarehouse = async (
  unitId: string,
  payload: { name: string; is_internal_unit?: boolean },
): Promise<Warehouse> => {
  const response = await apiClient.post<Warehouse>(
    `/operating-units/${unitId}/warehouses`,
    payload,
  );
  return response.data;
};

/** Create a warehouse in the caller's current operating unit context.
 * W6-06: the backend takes the unit from the X-Operating-Unit-ID header only
 * (an `operating_unit_id` in the body is refused), so a company-wide caller
 * with no unit pinned passes `operatingUnitId`, which is sent as that header
 * on this one request; the pinned unit is left unchanged.
 * Pass `parent_id` to create a sub-warehouse instead — it inherits the
 * parent's operating unit. */
export const createWarehouse = async (
  payload: {
    name: string;
    is_internal_unit?: boolean;
    parent_id?: string;
    location_type?: string;
  },
  operatingUnitId?: string,
): Promise<Warehouse> => {
  const response = await apiClient.post<Warehouse>(
    "/warehouses",
    payload,
    operatingUnitId ? { headers: { "X-Operating-Unit-ID": operatingUnitId } } : undefined,
  );
  return response.data;
};

export const updateWarehouse = async (
  id: string,
  payload: { name?: string; is_internal_unit?: boolean; location_type?: string | null },
): Promise<Warehouse> => {
  const response = await apiClient.put<Warehouse>(`/warehouses/${id}`, payload);
  return response.data;
};

export const deleteWarehouse = async (id: string): Promise<{ message: string }> => {
  const response = await apiClient.delete<{ message: string }>(`/warehouses/${id}`);
  return response.data;
};

// Re-export the role/entity/user/etc types that adjacent hooks/pages consume.
export type {
  BlueprintEntry,
  Client,
  Employee,
  EntityType,
  OperatingUnit,
  OperatingUnitCreatePayload,
  OperatingUnitUpdatePayload,
  UnitBlueprintCreatePayload,
  UnitBlueprintUpdatePayload,
  Warehouse,
};
