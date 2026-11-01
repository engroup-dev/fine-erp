import apiClient from "../client";
import type { InventoryItem } from "./inventory";

export type WarehouseTransferStatus = "draft" | "completed" | "cancelled";

export interface WarehouseTransferLine {
  id: string;
  warehouse_transfer_id: string;
  inventory_item_id: string;
  quantity: number;
  inventory_item?: InventoryItem;
}

export interface WarehouseTransfer {
  id: string;
  operating_unit_id: string;
  transfer_number: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: WarehouseTransferStatus;
  reason?: string | null;
  completed_at?: string | null;
  record_version: number;
  lines: WarehouseTransferLine[];
  from_warehouse?: { id: string; name: string };
  to_warehouse?: { id: string; name: string };
  created_at: string;
}

export interface WarehouseTransferLineInput {
  inventory_item_id: string;
  quantity: number;
}

export interface WarehouseTransferPayload {
  transfer_number: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  reason?: string | null;
  lines: WarehouseTransferLineInput[];
}

export const warehouseTransfersApi = {
  list: (params?: { status?: string; search?: string; page?: number; per_page?: number }) =>
    apiClient.get<{ data: WarehouseTransfer[]; current_page: number; last_page: number; total: number }>(
      "/warehouse-transfers",
      { params },
    ),

  get: (id: string) => apiClient.get<WarehouseTransfer>(`/warehouse-transfers/${id}`),

  create: (data: WarehouseTransferPayload) =>
    apiClient.post<WarehouseTransfer>("/warehouse-transfers", data),

  update: (id: string, data: Omit<WarehouseTransferPayload, "transfer_number">) =>
    apiClient.put<WarehouseTransfer>(`/warehouse-transfers/${id}`, data),

  complete: (id: string) => apiClient.post<WarehouseTransfer>(`/warehouse-transfers/${id}/complete`),

  cancel: (id: string) => apiClient.post<WarehouseTransfer>(`/warehouse-transfers/${id}/cancel`),
};
