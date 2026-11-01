import apiClient from "../client";
import { apiErrorMessage, apiErrorPayload } from "./production";
import { Client, CreateClientPayload } from "../../types/entities";

export interface GetClientsParams {
  operating_unit_id?: string;
  status?: string;
  /** W5-06: only the clients of this group. */
  client_group_id?: string;
  /** W6-04: every row the filters match as one page (CSV export); 422 EXPORT_TOO_LARGE past the server cap. */
  all?: 1;
}

export const getClients = async (params?: GetClientsParams): Promise<Client[]> => {
  const response = await apiClient.get<{ data: Client[] }>("/clients", { params });
  return response.data.data;
};

export const getClient = async (id: string): Promise<Client> => {
  const response = await apiClient.get<{ data: Client }>(`/clients/${id}`);
  return response.data.data;
};

export const createClient = async (payload: CreateClientPayload): Promise<Client> => {
  const response = await apiClient.post<{ data: Client }>("/clients", payload);
  return response.data.data;
};

/** A client edit; a credit-limit change is logged with its reason (W5-05). */
export type UpdateClientInput = Partial<CreateClientPayload> & {
  record_version?: number;
  credit_limit_reason?: string | null;
};

export const updateClient = async (id: string, payload: UpdateClientInput): Promise<Client> => {
  const response = await apiClient.put<{ data: Client }>(`/clients/${id}`, payload);
  return response.data.data;
};

export const deleteClient = async (id: string): Promise<{ message: string }> => {
  const response = await apiClient.delete<{ message: string }>(`/clients/${id}`);
  return response.data;
};

// ── Client card (W5-05) ──────────────────────────────────────────────────────

export interface ClientAging {
  current: number;
  days_31_60: number;
  days_61_90: number;
  over_90: number;
}

export interface ClientLastPayment {
  date: string;
  amount: number;
  /** cash | bank | cheque for a sale payment; "voucher" for a receipt voucher. */
  method: string | null;
  source: "sale_payment" | "receipt_voucher";
  /** The sale number or the receipt voucher number. */
  reference: string | null;
}

export interface ClientOpenSale {
  id: string;
  order_number: string;
  date: string;
  payment_method: string | null;
  total_amount: number;
  returned_amount: number;
  amount_paid: number;
  outstanding: number;
  due_date: string;
  days_overdue: number;
}

/** GET /clients/{id}/summary — ledger balance and aging, the last collection and the open sales, across units. */
export interface ClientSummary {
  client_id: string;
  as_of: string;
  balance: number;
  aging: ClientAging;
  overdue_amount: number;
  last_payment: ClientLastPayment | null;
  open_sales: ClientOpenSale[];
  open_sales_count: number;
  open_sales_outstanding: number;
}

export interface ClientCreditLimitChange {
  id: string;
  old_limit: number;
  new_limit: number;
  reason: string | null;
  changed_by: { id: string | number; name: string } | null;
  created_at: string | null;
}

export interface ClientAddress {
  id: string;
  client_id: string;
  label: string;
  city: string | null;
  address: string;
  phone: string | null;
  is_default: boolean;
  /** The text a sale keeps and the delivery note prints. */
  snapshot: string;
  record_version: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ClientAddressPayload {
  label: string;
  city?: string | null;
  address: string;
  phone?: string | null;
  is_default?: boolean;
}

export const getClientSummary = async (id: string): Promise<ClientSummary> => {
  const response = await apiClient.get<{ data: ClientSummary }>(`/clients/${id}/summary`);
  return response.data.data;
};

export const getClientCreditLimitChanges = async (id: string): Promise<ClientCreditLimitChange[]> => {
  const response = await apiClient.get<{ data: ClientCreditLimitChange[] }>(`/clients/${id}/credit-limit-changes`);
  return response.data.data;
};

export const getClientAddresses = async (clientId: string): Promise<ClientAddress[]> => {
  const response = await apiClient.get<{ data: ClientAddress[] }>(`/clients/${clientId}/addresses`);
  return response.data.data;
};

export const createClientAddress = async (clientId: string, payload: ClientAddressPayload): Promise<ClientAddress> => {
  const response = await apiClient.post<{ data: ClientAddress }>(`/clients/${clientId}/addresses`, payload);
  return response.data.data;
};

export const updateClientAddress = async (
  clientId: string,
  addressId: string,
  payload: Partial<ClientAddressPayload> & { record_version: number },
): Promise<ClientAddress> => {
  const response = await apiClient.put<{ data: ClientAddress }>(`/clients/${clientId}/addresses/${addressId}`, payload);
  return response.data.data;
};

export const deleteClientAddress = async (clientId: string, addressId: string): Promise<{ message: string }> => {
  const response = await apiClient.delete<{ message: string }>(`/clients/${clientId}/addresses/${addressId}`);
  return response.data;
};

/** Arabic text for the client-card refusal codes whose backend message is English. */
export const CLIENT_ERROR_MESSAGE: Record<string, string> = {
  ADDRESS_DEFAULT_REQUIRED: "هذا هو العنوان الافتراضي؛ اختر عنواناً آخر ليكون الافتراضي بدلاً من إلغائه.",
  DELIVERY_ADDRESS_INVALID: "عنوان التوصيل يجب أن يكون أحد عناوين العميل المختار.",
  OPTIMISTIC_LOCK_CONFLICT: "عدّل مستخدم آخر هذا السجل للتو — أعد فتحه وحاول مرة أخرى.",
};

/** A client-card refusal in Arabic: a known code, else the first field error, else the server message. */
export const clientErrorMessage = (err: unknown, fallback: string): string => {
  const payload = apiErrorPayload(err);
  const known = payload?.code ? CLIENT_ERROR_MESSAGE[payload.code] : undefined;
  if (known) return known;
  const fieldError = payload?.errors ? Object.values(payload.errors)[0]?.[0] : undefined;
  return fieldError || apiErrorMessage(err, fallback);
};
