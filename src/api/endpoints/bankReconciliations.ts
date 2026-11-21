import apiClient from "../client";

export type BankReconciliationStatus = "draft" | "finished";

export interface BankReconciliationAccountRef {
  id: string;
  name: string;
  currency: string;
}

export interface BankReconciliationUserRef {
  id: string;
  name: string;
}

export interface BankReconciliation {
  id: string;
  cash_account: BankReconciliationAccountRef;
  statement_date: string;
  statement_balance: number;
  status: BankReconciliationStatus;
  status_label?: string;
  notes: string | null;
  created_by: BankReconciliationUserRef;
  finished_by: BankReconciliationUserRef | null;
  finished_at: string | null;
  created_at?: string;
}

export interface BankReconciliationSummary {
  book_balance: number;
  opening_cleared_balance: number;
  cleared_debit: number;
  cleared_credit: number;
  cleared_balance: number;
  statement_balance: number;
  difference: number;
  uncleared_deposits: number;
  uncleared_payments: number;
}

export interface BankReconciliationLine {
  id: string;
  entry_date: string;
  reference: string;
  description: string;
  memo: string | null;
  debit: number;
  credit: number;
  currency: string | null;
  cleared: boolean;
}

export type BankReconciliationAdjustmentType =
  | "bank_charge"
  | "bank_interest"
  | "direct_deposit"
  | "direct_debit"
  | "other_in"
  | "other_out";

/** A statement item posted from the reconciliation through a voucher (TRS-04). */
export interface BankReconciliationAdjustment {
  id: string;
  type: BankReconciliationAdjustmentType;
  type_label: string;
  direction: "in" | "out";
  amount: number;
  date: string;
  description: string;
  voucher_id: string;
  voucher_number: string;
  counter_account_code: string | null;
  client_id: string | null;
}

export const ADJUSTMENT_TYPES: {
  value: BankReconciliationAdjustmentType;
  label: string;
  direction: "in" | "out";
  /** Account the backend uses when none is picked. */
  defaultAccountCode?: string;
}[] = [
  { value: "bank_charge", label: "عمولات ومصاريف بنكية", direction: "out", defaultAccountCode: "610" },
  { value: "bank_interest", label: "فوائد بنكية", direction: "in", defaultAccountCode: "46" },
  { value: "direct_deposit", label: "إيداع مباشر في الحساب", direction: "in" },
  { value: "direct_debit", label: "خصم مباشر من الحساب", direction: "out" },
  { value: "other_in", label: "تسوية أخرى (إضافة)", direction: "in" },
  { value: "other_out", label: "تسوية أخرى (خصم)", direction: "out" },
];

export interface AddReconciliationAdjustmentPayload {
  type: BankReconciliationAdjustmentType;
  amount: number;
  date?: string;
  description?: string;
  counter_account_code?: string;
  client_id?: string;
  fx_rate?: number;
}

export interface BankReconciliationItem extends BankReconciliation {
  summary?: BankReconciliationSummary;
}

export interface BankReconciliationDetail {
  reconciliation: BankReconciliation;
  summary: BankReconciliationSummary;
  lines: BankReconciliationLine[];
  adjustments: BankReconciliationAdjustment[];
}

export interface CreateBankReconciliationPayload {
  cash_account_id: string;
  statement_date: string;
  statement_balance: number;
  notes?: string;
}

export interface ToggleReconciliationLinesPayload {
  line_ids: string[];
  cleared: boolean;
}

export const bankReconciliationsApi = {
  getReconciliations: async (cashAccountId?: string): Promise<BankReconciliationItem[]> => {
    const res = await apiClient.get<{ data: BankReconciliationItem[] }>("/bank-reconciliations", {
      params: cashAccountId ? { cash_account_id: cashAccountId } : undefined,
    });
    return res.data.data;
  },

  getReconciliation: async (id: string): Promise<BankReconciliationDetail> => {
    const res = await apiClient.get<{ data: BankReconciliationDetail }>(`/bank-reconciliations/${id}`);
    return res.data.data;
  },

  createReconciliation: async (
    payload: CreateBankReconciliationPayload,
  ): Promise<BankReconciliationDetail> => {
    const res = await apiClient.post<{ data: BankReconciliationDetail }>("/bank-reconciliations", payload);
    return res.data.data;
  },

  toggleLines: async (
    id: string,
    payload: ToggleReconciliationLinesPayload,
  ): Promise<BankReconciliationDetail> => {
    const res = await apiClient.post<{ data: BankReconciliationDetail }>(
      `/bank-reconciliations/${id}/lines`,
      payload,
    );
    return res.data.data;
  },

  finishReconciliation: async (id: string): Promise<BankReconciliationDetail> => {
    const res = await apiClient.post<{ data: BankReconciliationDetail }>(
      `/bank-reconciliations/${id}/finish`,
    );
    return res.data.data;
  },

  discardReconciliation: async (id: string): Promise<void> => {
    await apiClient.delete(`/bank-reconciliations/${id}`);
  },

  addAdjustment: async (
    id: string,
    payload: AddReconciliationAdjustmentPayload,
  ): Promise<BankReconciliationDetail> => {
    const res = await apiClient.post<{ data: BankReconciliationDetail }>(
      `/bank-reconciliations/${id}/adjustments`,
      payload,
    );
    return res.data.data;
  },

  removeAdjustment: async (id: string, adjustmentId: string): Promise<BankReconciliationDetail> => {
    const res = await apiClient.delete<{ data: BankReconciliationDetail }>(
      `/bank-reconciliations/${id}/adjustments/${adjustmentId}`,
    );
    return res.data.data;
  },
};

export const getBankReconciliations = bankReconciliationsApi.getReconciliations;
export const getBankReconciliation = bankReconciliationsApi.getReconciliation;
export const createBankReconciliation = bankReconciliationsApi.createReconciliation;
export const toggleReconciliationLines = bankReconciliationsApi.toggleLines;
export const finishBankReconciliation = bankReconciliationsApi.finishReconciliation;
export const discardBankReconciliation = bankReconciliationsApi.discardReconciliation;
export const addReconciliationAdjustment = bankReconciliationsApi.addAdjustment;
export const removeReconciliationAdjustment = bankReconciliationsApi.removeAdjustment;
