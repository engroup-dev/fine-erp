import apiClient from "../client";

export type ChequeStatus =
  | "in_portfolio"
  | "deposited"
  | "cleared"
  | "bounced"
  | "returned"
  | "issued"
  | "cancelled";

export interface ChequeEvent {
  id: string;
  from_status: ChequeStatus | null;
  to_status: ChequeStatus;
  to_status_label?: string;
  event_date: string;
  journal_entry: {
    id: string;
    reference: string;
  } | null;
  user: {
    id: string;
    name: string;
  } | null;
  note?: string | null;
}

export interface Cheque {
  id: string;
  number: string;
  direction: "incoming" | "outgoing";
  cheque_no: string;
  bank_name: string;
  drawer_name?: string | null;
  client: {
    id: string;
    name: string;
  } | null;
  supplier?: {
    id: string;
    name: string;
  } | null;
  payee_name?: string | null;
  counter_account?: {
    code: string;
    name: string;
  } | null;
  amount: number;
  currency: string;
  issue_date?: string | null;
  due_date: string;
  received_date?: string | null;
  is_certified: boolean;
  status: ChequeStatus;
  status_label: string;
  deposit_cash_account: {
    id: string;
    name: string;
  } | null;
  notes?: string | null;
  bounce_reason?: string | null;
  cancel_reason?: string | null;
  days_to_due: number;
  created_by: {
    id: string;
    name: string;
  } | null;
  created_at: string;
  events?: ChequeEvent[];
}

export interface ChequeSummaryBucket {
  count: number;
  total: number;
}

export interface ChequeSummary {
  by_status: Record<string, ChequeSummaryBucket>;
  due_within_7_days: ChequeSummaryBucket;
  overdue: ChequeSummaryBucket;
}

export interface PaginatedCheques {
  data: Cheque[];
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

export interface ChequeFilters {
  direction?: "incoming" | "outgoing";
  status?: ChequeStatus | "";
  client_id?: string;
  supplier_id?: string;
  due_from?: string;
  due_to?: string;
  search?: string;
  page?: number;
  per_page?: number;
  /** W6-04: every row the filters match as one page (CSV export); 422 EXPORT_TOO_LARGE past the server cap. */
  all?: 1;
}

export interface ReceiveChequePayload {
  client_id: string;
  cheque_no: string;
  bank_name: string;
  drawer_name?: string;
  amount: number;
  due_date: string;
  issue_date?: string;
  received_date?: string;
  is_certified?: boolean;
  notes?: string;
  operating_unit_id?: string;
}

export interface IssueChequePayload {
  cash_account_id: string;
  cheque_no: string;
  amount: number;
  due_date: string;
  issue_date?: string;
  supplier_id?: string;
  counter_account_code?: string;
  payee_name?: string;
  notes?: string;
  operating_unit_id?: string;
}

export interface DepositChequePayload {
  cash_account_id: string;
  date?: string;
}

export interface ClearChequePayload {
  date?: string;
  cash_account_id?: string;
}

export interface BounceChequePayload {
  date?: string;
  reason: string;
}

export interface ReturnChequePayload {
  date?: string;
  note?: string;
}

export interface CancelChequePayload {
  reason: string;
}

export const chequesApi = {
  getCheques: async (params?: ChequeFilters): Promise<PaginatedCheques> => {
    const res = await apiClient.get<PaginatedCheques>("/cheques", {
      params: { direction: "incoming", ...params },
    });
    return res.data;
  },
  getSummary: async (direction: "incoming" | "outgoing" = "incoming"): Promise<ChequeSummary> => {
    const res = await apiClient.get<{ data: ChequeSummary }>("/cheques/summary", {
      params: { direction },
    });
    return res.data.data;
  },
  getCheque: async (id: string): Promise<Cheque> => {
    const res = await apiClient.get<{ data: Cheque }>(`/cheques/${id}`);
    return res.data.data;
  },
  receiveCheque: async (payload: ReceiveChequePayload): Promise<Cheque> => {
    const res = await apiClient.post<{ data: Cheque }>("/cheques", payload);
    return res.data.data;
  },
  issueCheque: async (payload: IssueChequePayload): Promise<Cheque> => {
    const res = await apiClient.post<{ data: Cheque }>("/cheques/issue", payload);
    return res.data.data;
  },
  depositCheque: async (id: string, payload: DepositChequePayload): Promise<Cheque> => {
    const res = await apiClient.post<{ data: Cheque }>(`/cheques/${id}/deposit`, payload);
    return res.data.data;
  },
  clearCheque: async (id: string, payload?: ClearChequePayload): Promise<Cheque> => {
    const res = await apiClient.post<{ data: Cheque }>(`/cheques/${id}/clear`, payload ?? {});
    return res.data.data;
  },
  bounceCheque: async (id: string, payload: BounceChequePayload): Promise<Cheque> => {
    const res = await apiClient.post<{ data: Cheque }>(`/cheques/${id}/bounce`, payload);
    return res.data.data;
  },
  returnCheque: async (id: string, payload: ReturnChequePayload): Promise<Cheque> => {
    const res = await apiClient.post<{ data: Cheque }>(`/cheques/${id}/return`, payload);
    return res.data.data;
  },
  cancelCheque: async (id: string, payload: CancelChequePayload): Promise<Cheque> => {
    const res = await apiClient.post<{ data: Cheque }>(`/cheques/${id}/cancel`, payload);
    return res.data.data;
  },
};

export const getCheques = chequesApi.getCheques;
export const getChequeSummary = chequesApi.getSummary;
export const getCheque = chequesApi.getCheque;
export const receiveCheque = chequesApi.receiveCheque;
export const issueCheque = chequesApi.issueCheque;
export const depositCheque = chequesApi.depositCheque;
export const clearCheque = chequesApi.clearCheque;
export const bounceCheque = chequesApi.bounceCheque;
export const returnCheque = chequesApi.returnCheque;
export const cancelCheque = chequesApi.cancelCheque;
