import apiClient from "../client";

export type TreasuryVoucherKind = "receipt" | "payment";

export interface TreasuryVoucher {
  id: string;
  voucher_number: string;
  kind: TreasuryVoucherKind;
  kind_label: string;
  status: string;
  status_label: string;
  cash_account: {
    id: string;
    name: string;
    currency: string;
  };
  counter_account: {
    code: string;
    name: string;
  };
  client: {
    id: string;
    name: string;
  } | null;
  /** W5-02: the employee on an advances (1215) voucher. */
  employee_id?: string | null;
  employee?: {
    id: string;
    name: string | null;
    employee_number: string | null;
  } | null;
  amount: number;
  currency: string;
  fx_rate: number | null;
  amount_lyd: number;
  voucher_date: string;
  payee?: string | null;
  description: string;
  operating_unit_id?: string | null;
  journal_entry: {
    id: string;
    reference: string;
  } | null;
  cancel_entry: {
    id: string;
    reference: string;
  } | null;
  cancel_reason?: string | null;
  created_by: {
    id: string;
    name: string;
  } | null;
  cancelled_by: {
    id: string;
    name: string;
  } | null;
  cancelled_at?: string | null;
  created_at: string;
}

export interface PaginatedVouchers {
  data: TreasuryVoucher[];
  meta?: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  links?: Record<string, string | null>;
  current_page?: number;
  last_page?: number;
  per_page?: number;
  total?: number;
}

export interface TreasuryVoucherFilters {
  kind?: TreasuryVoucherKind;
  status?: string;
  cash_account_id?: string;
  client_id?: string;
  /** W5-02: vouchers naming this employee. */
  employee_id?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  per_page?: number;
  /** W6-04: every row the filters match as one page (CSV export); 422 EXPORT_TOO_LARGE past the server cap. */
  all?: 1;
}

export interface CreateTreasuryVoucherPayload {
  kind: TreasuryVoucherKind;
  cash_account_id: string;
  counter_account_code?: string;
  client_id?: string;
  /** W5-00: required when the counter account is in the employee advances subtree (1215). */
  employee_id?: string;
  amount: number;
  fx_rate?: number;
  voucher_date?: string;
  payee?: string;
  description: string;
  operating_unit_id?: string;
}

export interface CancelTreasuryVoucherPayload {
  reason: string;
}

export const treasuryVouchersApi = {
  getVouchers: async (params?: TreasuryVoucherFilters): Promise<PaginatedVouchers> => {
    const res = await apiClient.get<PaginatedVouchers>("/treasury-vouchers", { params });
    return res.data;
  },
  getVoucher: async (id: string): Promise<TreasuryVoucher> => {
    const res = await apiClient.get<{ data: TreasuryVoucher }>(`/treasury-vouchers/${id}`);
    return res.data.data;
  },
  createVoucher: async (payload: CreateTreasuryVoucherPayload): Promise<TreasuryVoucher> => {
    const res = await apiClient.post<{ data: TreasuryVoucher }>("/treasury-vouchers", payload);
    return res.data.data;
  },
  cancelVoucher: async (id: string, payload: CancelTreasuryVoucherPayload): Promise<TreasuryVoucher> => {
    const res = await apiClient.post<{ data: TreasuryVoucher }>(`/treasury-vouchers/${id}/cancel`, payload);
    return res.data.data;
  },
};

export const getTreasuryVouchers = treasuryVouchersApi.getVouchers;
export const getTreasuryVoucher = treasuryVouchersApi.getVoucher;
export const createTreasuryVoucher = treasuryVouchersApi.createVoucher;
export const cancelTreasuryVoucher = treasuryVouchersApi.cancelVoucher;
