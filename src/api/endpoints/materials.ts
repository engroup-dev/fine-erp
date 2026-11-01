import apiClient from "../client";

export type MaterialRequestStatus =
  | "pending"
  | "in_progress"
  | "fulfilled"
  | "cancelled";

export type MaterialRequestModule = "cutter" | "foam" | "procurement";

export interface MaterialRequestDimensions {
  length_m?: number;
  width_m?: number;
  height_m?: number;
}

export interface MaterialRequest {
  id: string;
  fulfilling_module: MaterialRequestModule;
  inventory_item_id: string;
  inventory_item?: {
    id: string;
    name: string;
    code: string;
    item_type: string;
    unit_of_measure: string;
  };
  quantity: number;
  target_dimensions?: MaterialRequestDimensions | null;
  status: MaterialRequestStatus;
  parent_request_id?: string | null;
  requested_for_type?: "cutter_work_order" | null;
  requested_for_id?: string | null;
  fulfilled_by_type?: string | null;
  fulfilled_by_id?: string | null;
  fulfilled_at?: string | null;
  operating_unit_id: string;
  created_at?: string;
  updated_at?: string;
}

export type MaterialRequestFulfilledByType =
  | "cutter_work_order"
  | "production_batch"
  | "procurement_request";

export const materialsApi = {
  list: (params?: {
    status?: MaterialRequestStatus;
    fulfilling_module?: MaterialRequestModule;
    requested_for_type?: string;
    requested_for_id?: string;
    page?: number;
    per_page?: number;
  }) =>
    apiClient.get<{
      data: MaterialRequest[];
      current_page: number;
      last_page: number;
      total: number;
    }>("/material-requests", { params }),

  show: (id: string) =>
    apiClient.get<MaterialRequest>(`/material-requests/${id}`),

  start: (id: string) =>
    apiClient.post<MaterialRequest>(`/material-requests/${id}/start`),

  fulfill: (
    id: string,
    data: {
      fulfilled_by_type: MaterialRequestFulfilledByType;
      fulfilled_by_id: string;
      notes?: string;
    },
  ) =>
    apiClient.post<MaterialRequest>(`/material-requests/${id}/fulfill`, data),

  cancel: (id: string) =>
    apiClient.post<{ message: string }>(`/material-requests/${id}/cancel`),
};
