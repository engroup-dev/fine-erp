import apiClient from "../client";
import { apiErrorMessage, apiErrorPayload } from "./production";
import type { AccountLedgerParams, AccountStatement } from "./accounting";
import {
  Supplier,
  TreasuryOption,
  CashAccountKind,
  CreateSupplierPayload,
  UpdateSupplierPayload,
  MergeSupplierResult,
  PurchaseOrder,
  CreatePurchaseOrderPayload,
  UpdatePurchaseOrderPayload,
  TransitionPurchaseOrderPayload,
  ReceiveOrderPayload,
  PurchaseOrderKind,
  PaymentRequest,
  ExecutePaymentPayload,
  BankHold,
  LandedCostLine,
  CreateLandedCostLinePayload,
  FxRate,
  CreateFxRatePayload,
  CashAccount,
  CreateCashAccountPayload,
  UpdateCashAccountPayload,
  GetPaymentRequestsParams,
} from "../../types/procurement";

// Suppliers API
/** W6-04: `all` asks for the CSV export's capped mode (422 EXPORT_TOO_LARGE past the server cap). */
export const getSuppliers = async (operating_unit_id?: string, all?: boolean): Promise<Supplier[]> => {
  const response = await apiClient.get<{ data: Supplier[] }>("/suppliers", {
    params: { operating_unit_id, all: all ? 1 : undefined },
  });
  return response.data.data;
};

export const createSupplier = async (payload: CreateSupplierPayload): Promise<Supplier> => {
  const response = await apiClient.post<{ data: Supplier }>("/suppliers", payload);
  return response.data.data;
};

export const updateSupplier = async (id: string, payload: UpdateSupplierPayload): Promise<Supplier> => {
  const response = await apiClient.put<{ data: Supplier }>(`/suppliers/${id}`, payload);
  return response.data.data;
};

/** W5-07: merges supplier {id} into targetId; the source is soft-deleted. */
export const mergeSupplier = async (id: string, targetId: string): Promise<MergeSupplierResult> => {
  const response = await apiClient.post<MergeSupplierResult>(`/suppliers/${id}/merge`, { target_id: targetId });
  return response.data;
};

/** W5-07: the supplier refusals, in Arabic. */
export const SUPPLIER_ERROR_MESSAGE: Record<string, string> = {
  SUPPLIER_DUPLICATE: "يوجد مورد مشابه في هذه الوحدة (بالاسم أو الرقم الضريبي أو الجهة نفسها).",
  SUPPLIER_MERGE_SAME: "لا يُدمج المورد في نفسه — اختر مورداً آخر.",
  SUPPLIER_MERGE_UNIT_MISMATCH: "لا يُدمج إلا موردان من الوحدة التشغيلية نفسها.",
  SUPPLIER_MERGE_ACCOUNTS:
    "لكل من الموردين حساب أستاذ خاص عليه حركات مرحّلة، ولا يُدمج دفتران دون تعديل قيود مرحّلة — لا يمكن دمج هذين الموردين؛ أبقِ المكرر وأوقف التعامل معه.",
  SUPPLIER_MERGE_OPEN_ORDERS:
    "بعض أوامر الشراء في منتصف الطريق (مدفوعة ولم تُستلم، أو مستلمة ولم تُدفع) وستُسوّى على حساب مختلف بعد الدمج — أكملها أولاً.",
  SUPPLIER_NOT_FOUND: "المورد غير موجود أو يتبع وحدة تشغيلية أخرى.",
  SUPPLIER_NOT_LINKED: "المورد غير مربوط بحساب في دليل الحسابات.",
  SUPPLIER_TAX_NUMBER_CONFLICT:
    "هذه الجهة مشتركة (عميل أو موظف أو مورد لوحدة أخرى) ولها رقم ضريبي مختلف — يُعدَّل رقمها من بطاقة الجهة نفسها لا من المورد.",
  SUPPLIER_UNIT_FORBIDDEN: "ليس لديك دور في هذه الوحدة التشغيلية — اختر وحدة تعمل فيها.",
  OPTIMISTIC_LOCK_CONFLICT: "عدّل مستخدم آخر هذا المورد للتو — أعد فتحه وحاول مرة أخرى.",
  ACCESS_DENIED: "لا تملك صلاحية تعديل المشتريات.",
};

/** A supplier refusal in Arabic: a known code (with its details), else a missing record, else the first field error, else the server message. */
export const supplierErrorMessage = (err: unknown, fallback: string): string => {
  const payload = apiErrorPayload(err);
  const status = (err as { response?: { status?: number } } | undefined)?.response?.status;
  const known = payload?.code ? SUPPLIER_ERROR_MESSAGE[payload.code] : undefined;
  if (known) {
    if (payload?.code === "SUPPLIER_MERGE_ACCOUNTS" && payload.source_account_code && payload.target_account_code) {
      return `${known} (الحسابان: ${payload.source_account_code} و ${payload.target_account_code})`;
    }
    if (payload?.code === "SUPPLIER_MERGE_OPEN_ORDERS" && payload.purchase_order_ids?.length) {
      return `${known} (عدد الأوامر: ${payload.purchase_order_ids.length})`;
    }
    if (payload?.code === "SUPPLIER_TAX_NUMBER_CONFLICT" && payload.entity_tax_number) {
      return `${known} (رقم الجهة: ${payload.entity_tax_number})`;
    }
    return known;
  }
  if (status === 404) return SUPPLIER_ERROR_MESSAGE.SUPPLIER_NOT_FOUND;
  // The merge refuses the supplier itself as a target with a field error, before the service's code.
  if (payload?.errors?.target_id) return SUPPLIER_ERROR_MESSAGE.SUPPLIER_MERGE_SAME;
  const fieldError = payload?.errors ? Object.values(payload.errors)[0]?.[0] : undefined;
  return fieldError || apiErrorMessage(err, fallback);
};

// Import Orders API
export const getPurchaseOrders = async (params?: {
  operating_unit_id?: string;
  status?: string;
  /** Wave 5: 'foreign' or 'local'. Omit to fetch both. */
  kind?: PurchaseOrderKind;
  /** Cap response size to keep the renderer responsive. Defaults to 100 on the server. */
  per_page?: number;
  /** W6-04: every row the filters match, past per_page (CSV export); 422 EXPORT_TOO_LARGE past the server cap. */
  all?: 1;
}): Promise<PurchaseOrder[]> => {
  const response = await apiClient.get<{ data: PurchaseOrder[] }>("/purchase-orders", { params });
  return response.data.data;
};

export const getPurchaseOrder = async (id: string): Promise<PurchaseOrder> => {
  const response = await apiClient.get<{ data: PurchaseOrder }>(`/purchase-orders/${id}`);
  return response.data.data;
};

export const createPurchaseOrder = async (payload: CreatePurchaseOrderPayload): Promise<PurchaseOrder> => {
  const response = await apiClient.post<{ data: PurchaseOrder }>("/purchase-orders", payload);
  return response.data.data;
};

export const updatePurchaseOrder = async (
  id: string,
  payload: UpdatePurchaseOrderPayload
): Promise<PurchaseOrder> => {
  const response = await apiClient.put<{ data: PurchaseOrder }>(`/purchase-orders/${id}`, payload);
  return response.data.data;
};

export const transitionPurchaseOrder = async (
  id: string,
  payload: TransitionPurchaseOrderPayload
): Promise<{ message: string; data: PurchaseOrder }> => {
  const response = await apiClient.post<{ message: string; data: PurchaseOrder }>(
    `/purchase-orders/${id}/transition`,
    payload
  );
  return response.data;
};

/**
 * Wave 5 (local flow): approve a draft local purchase order.
 * Manager sign-off before goods can be received.
 */
export const approvePurchaseOrder = async (id: string): Promise<PurchaseOrder> => {
  const response = await apiClient.post<{ message: string; data: PurchaseOrder }>(
    `/purchase-orders/${id}/approve`,
  );
  return response.data.data;
};

/**
 * Wave 5 (local flow): atomic per-line batch receive.
 * Updates each PurchaseOrderItem.received_quantity atomically.
 * If all lines are fully received, transitions the order to 'received'.
 */
export const receivePurchaseOrder = async (
  id: string,
  payload: ReceiveOrderPayload,
): Promise<PurchaseOrder> => {
  const response = await apiClient.post<{ message: string; data: PurchaseOrder }>(
    `/purchase-orders/${id}/receive`,
    payload,
  );
  return response.data.data;
};

/**
 * Wave 5 (local flow): record payment on a received local PO.
  * Transitions received -> paid -> closed (auto-close on full receipt).
   */
export const payLocalPurchaseOrder = async (
  id: string,
  payload: { payment_source_account_id: string },
): Promise<PurchaseOrder> => {
  const response = await apiClient.post<{ message: string; data: PurchaseOrder }>(
    `/purchase-orders/${id}/pay-local`,
    payload,
  );
  return response.data.data;
};

// Payment Requests & Bank Holds API
export const getPaymentRequests = async (
  params?: GetPaymentRequestsParams
): Promise<PaymentRequest[]> => {
  const response = await apiClient.get<{ data: PaymentRequest[] }>("/payment-requests", { params });
  return response.data.data;
};

export const executePaymentRequest = async (
  id: string,
  payload: ExecutePaymentPayload
): Promise<{ message: string; data: PaymentRequest }> => {
  const response = await apiClient.post<{ message: string; data: PaymentRequest }>(
    `/payment-requests/${id}/execute`,
    payload
  );
  return response.data;
};

export const getBankHolds = async (): Promise<BankHold[]> => {
  const response = await apiClient.get<{ data: BankHold[] }>("/bank-holds");
  return response.data.data;
};

// Landed Costs API
export const getLandedCostLines = async (orderId: string): Promise<LandedCostLine[]> => {
  const response = await apiClient.get<{ data: LandedCostLine[] }>(
    `/purchase-orders/${orderId}/landed-cost-lines`
  );
  return response.data.data;
};

export const createLandedCostLine = async (
  orderId: string,
  payload: CreateLandedCostLinePayload
): Promise<LandedCostLine> => {
  const response = await apiClient.post<{ data: LandedCostLine }>(
    `/purchase-orders/${orderId}/landed-cost-lines`,
    payload
  );
  return response.data.data;
};

export const confirmLandedCostLine = async (
  orderId: string,
  lineId: string
): Promise<{ message: string; data: LandedCostLine }> => {
  const response = await apiClient.post<{ message: string; data: LandedCostLine }>(
    `/purchase-orders/${orderId}/landed-cost-lines/${lineId}/approve`
  );
  return response.data;
};

export const approveLandedCostLine = async (
  orderId: string,
  lineId: string,
  note?: string
): Promise<{ message: string; data: LandedCostLine }> => {
  const response = await apiClient.post<{ message: string; data: LandedCostLine }>(
    `/purchase-orders/${orderId}/landed-cost-lines/${lineId}/approve`,
    { note }
  );
  return response.data;
};

export const markLandedCostLinePaid = async (
  orderId: string,
  lineId: string,
  note?: string
): Promise<{ message: string; data: LandedCostLine }> => {
  const response = await apiClient.post<{ message: string; data: LandedCostLine }>(
    `/purchase-orders/${orderId}/landed-cost-lines/${lineId}/mark-paid`,
    { note }
  );
  return response.data;
};

// Treasury & FX API
export const getFxRates = async (): Promise<FxRate[]> => {
  const response = await apiClient.get<{ data: FxRate[] }>("/fx-rates");
  return response.data.data;
};

export const createFxRate = async (payload: CreateFxRatePayload): Promise<FxRate> => {
  const response = await apiClient.post<{ data: FxRate }>("/fx-rates", payload);
  return response.data.data;
};

// Payable settlements (2100 AP / 2210 payroll deductions / 2300 landed cost clearing)
export interface PayableOutstanding {
  account_code: "21" | "221" | "23";
  outstanding: number;
}

export interface PayableSettlementCheque {
  id: string;
  number?: string;
  cheque_no: string;
  status: string;
  status_label?: string;
}

export interface PayableSettlement {
  id: string;
  account_code: string;
  amount: string;
  method?: "cash" | "cheque";
  reference: string | null;
  settled_at: string;
  settled_by?: { id: string; name: string } | null;
  operating_unit?: { id: string; name: string } | null;
  cheque?: PayableSettlementCheque | null;
}

export interface SettlePayableChequeInput {
  cash_account_id: string;
  cheque_no: string;
  due_date: string;
  issue_date?: string;
  payee_name?: string;
}

export interface SettlePayablePayload {
  account_code: string;
  amount: number;
  method?: "cash" | "cheque";
  cash_account_id?: string;
  reference?: string;
  operating_unit_id?: string;
  cheque?: SettlePayableChequeInput;
}

export const getPayableOutstanding = async (): Promise<PayableOutstanding[]> => {
  const response = await apiClient.get<{ data: PayableOutstanding[] }>("/payable-settlements/outstanding");
  return response.data.data;
};

export const getPayableSettlements = async (): Promise<PayableSettlement[]> => {
  const response = await apiClient.get<{ data: PayableSettlement[] }>("/payable-settlements");
  return response.data.data;
};

export const settlePayable = async (payload: SettlePayablePayload): Promise<PayableSettlement> => {
  const response = await apiClient.post<PayableSettlement>("/payable-settlements", payload);
  return response.data;
};

/** Treasuries money can move through, readable by every signed-in role. */
export const getTreasuryOptions = async (kind?: CashAccountKind): Promise<TreasuryOption[]> => {
  const response = await apiClient.get<{ data: TreasuryOption[] }>("/cash-accounts/options", {
    params: { kind },
  });
  return response.data.data;
};

export const getCashAccounts = async (operating_unit_id?: string): Promise<CashAccount[]> => {
  const response = await apiClient.get<{ data: CashAccount[] }>("/cash-accounts", {
    params: { operating_unit_id },
  });
  return response.data.data;
};

export const updateCashAccount = async (id: string, payload: UpdateCashAccountPayload): Promise<CashAccount> => {
  const response = await apiClient.put<{ data: CashAccount }>(`/cash-accounts/${id}`, payload);
  return response.data.data;
};

export const createCashAccount = async (payload: CreateCashAccountPayload): Promise<CashAccount> => {
  const response = await apiClient.post<{ data: CashAccount }>("/cash-accounts", payload);
  return response.data.data;
};

export const getCashAccountStatement = async (
  id: string,
  params?: AccountLedgerParams,
): Promise<AccountStatement> => {
  const response = await apiClient.get<AccountStatement>(`/cash-accounts/${id}/statement`, {
    params: {
      page: params?.page ?? 1,
      per_page: params?.per_page,
      order: params?.order,
      all: params?.all ? 1 : undefined,
      from: params?.from || undefined,
      to: params?.to || undefined,
      search: params?.search || undefined,
      currency: params?.currency || undefined,
    },
  });
  return response.data;
};
