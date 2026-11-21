import apiClient from "../client";

export type TreasuryTransferStatus = "draft" | "approved" | "rejected" | "cancelled";

export interface CashAccountRef {
  id: string;
  name: string;
  currency: string;
  kind?: string;
}

export interface TreasuryTransfer {
  id: string;
  transfer_number: string;
  status: TreasuryTransferStatus;
  status_label: string;
  from_cash_account: CashAccountRef;
  to_cash_account: CashAccountRef;
  amount: number;
  currency: string;
  fx_rate: number | null;
  amount_lyd: number | null;
  transfer_date: string;
  notes: string | null;
  operating_unit_id?: string | null;
  created_by: {
    id: string;
    name: string;
  };
  decided_by: {
    id: string;
    name: string;
  } | null;
  decided_at: string | null;
  decision_note: string | null;
  journal_entry: {
    id: string;
    reference: string;
  } | null;
  created_at: string;
}

export interface PaginatedTransfers {
  data: TreasuryTransfer[];
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

export interface TreasuryTransferFilters {
  status?: string;
  cash_account_id?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  per_page?: number;
  /** Company-wide roles only: list every unit's transfers, not just the pinned one. */
  company_wide?: 1;
}

export interface CreateTreasuryTransferPayload {
  from_cash_account_id: string;
  to_cash_account_id: string;
  amount: number;
  fx_rate?: number;
  transfer_date?: string;
  notes?: string;
  operating_unit_id?: string;
}

export interface ApproveTreasuryTransferPayload {
  fx_rate?: number;
  note?: string;
}

export interface RejectTreasuryTransferPayload {
  note: string;
}

export const treasuryTransfersApi = {
  getTransfers: async (params?: TreasuryTransferFilters): Promise<PaginatedTransfers> => {
    const res = await apiClient.get<PaginatedTransfers>("/treasury-transfers", { params });
    return res.data;
  },
  getTransfer: async (id: string): Promise<TreasuryTransfer> => {
    const res = await apiClient.get<{ data: TreasuryTransfer }>(`/treasury-transfers/${id}`);
    return res.data.data;
  },
  createTransfer: async (payload: CreateTreasuryTransferPayload): Promise<TreasuryTransfer> => {
    const res = await apiClient.post<{ data: TreasuryTransfer }>("/treasury-transfers", payload);
    return res.data.data;
  },
  approveTransfer: async (id: string, payload?: ApproveTreasuryTransferPayload): Promise<TreasuryTransfer> => {
    const res = await apiClient.post<{ data: TreasuryTransfer }>(`/treasury-transfers/${id}/approve`, payload);
    return res.data.data;
  },
  rejectTransfer: async (id: string, payload: RejectTreasuryTransferPayload): Promise<TreasuryTransfer> => {
    const res = await apiClient.post<{ data: TreasuryTransfer }>(`/treasury-transfers/${id}/reject`, payload);
    return res.data.data;
  },
  cancelTransfer: async (id: string): Promise<TreasuryTransfer> => {
    const res = await apiClient.post<{ data: TreasuryTransfer }>(`/treasury-transfers/${id}/cancel`);
    return res.data.data;
  },
};

export const getTreasuryTransfers = treasuryTransfersApi.getTransfers;
export const getTreasuryTransfer = treasuryTransfersApi.getTransfer;
export const createTreasuryTransfer = treasuryTransfersApi.createTransfer;
export const approveTreasuryTransfer = treasuryTransfersApi.approveTransfer;
export const rejectTreasuryTransfer = treasuryTransfersApi.rejectTransfer;
export const cancelTreasuryTransfer = treasuryTransfersApi.cancelTransfer;
