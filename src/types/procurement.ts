import type { CoaAction, NewCoaAccountPayload } from './entities';

export type PurchaseOrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'awaiting_bank_approval'
  | 'awaiting_transfer'
  | 'paid'
  | 'in_transit'
  | 'at_port'
  | 'in_transit_to_warehouse'
  | 'at_warehouse'
  | 'awaiting_receipt'
  | 'received'
  | 'complete'
  | 'approved'
  | 'closed';

export type PurchaseOrderKind = 'foreign' | 'local';

export type PaymentRoute = 'bank' | 'market';
export type PaymentRequestStatus = 'pending' | 'paid' | 'rejected';
export type LandedCostStatus = 'pending' | 'approved' | 'paid';
export type LandedCostType =
  | 'supplier_price'
  | 'fx_spread'
  | 'customs'
  | 'freight'
  | 'local_transport'
  | 'other';

export const LANDED_COST_STATUS_LABEL: Record<LandedCostStatus, string> = {
  pending: 'بانتظار الموافقة',
  approved: 'معتمد بانتظار التأكيد',
  paid: 'مدفوع ومؤكد',
};

export interface Supplier {
  id: string;
  operating_unit_id: string;
  operating_unit?: { id: string; name: string };
  account_id?: string | null;
  account?: { id: string; account_code: string; name: string } | null;
  name: string;
  contact?: string | null;
  default_currency: string;
  address?: string | null;
  /** W5-07: the supplier's party on the shared entities table (vendor role). */
  entity_id?: string | null;
  /** W5-07: read from the entity; a shared entity keeps its own tax number. */
  tax_number?: string | null;
  record_version?: number;
  created_at?: string;
  updated_at?: string;
}

/** W5-07: why SUPPLIER_DUPLICATE thinks two suppliers are the same party. */
export type SupplierDuplicateMatch = "entity" | "tax_number" | "name";

/** W5-07: one live supplier of the unit returned with SUPPLIER_DUPLICATE. */
export interface SupplierDuplicate {
  id: string;
  name: string;
  tax_number: string | null;
  match: SupplierDuplicateMatch;
}

/** W5-07: POST /suppliers/{id}/merge — the surviving supplier and what moved to it. */
export interface MergeSupplierResult {
  data: Supplier;
  moved: {
    purchase_orders: number;
    cheques: number;
    payment_requests: number;
    payable_settlements: number;
  };
  merged_supplier_id: string;
}

export interface BankHold {
  id: string;
  payment_request_id: string;
  held_amount_lyd: number;
  exact_amount_used: number;
  released_amount: number;
  bank_reference?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentRequest {
  id: string;
  operating_unit_id: string;
  purchase_order_id?: string;
  import_order_id?: string;
  route: PaymentRoute;
  invoice_ref?: string | null;
  amount_requested: number;
  status: PaymentRequestStatus;
  fx_rate_used?: number | null;
  extra_allocation_note?: string | null;
  booked_fx_rate?: number | null;
  effective_settled_lyd?: number | null;
  effective_rate?: number | null;
  variance_vs_booked_lyd?: number | null;
  variance_within_tolerance?: boolean;
  variance_exceeds_hard_cap?: boolean;
  fx_tolerance_lyd?: number;
  fx_hard_cap_percent?: number;
  bank_hold?: BankHold | null;
  purchase_order?: {
    id: string;
    order_number: string;
    status?: string;
    supplier_id?: string;
    supplier?: {
      id: string;
      name: string;
      code?: string | null;
      contact_person?: string | null;
      phone?: string | null;
    } | null;
  } | null;
  import_order?: {
    id: string;
    order_number: string;
    status?: string;
    supplier_id?: string;
    supplier?: {
      id: string;
      name: string;
      code?: string | null;
      contact_person?: string | null;
      phone?: string | null;
    } | null;
  } | null;
  created_at?: string;
  updated_at?: string;
}

export interface LandedCostParty {
  id: string;
  name: string;
}

export interface LandedCostLine {
  id: string;
  purchase_order_id?: string;
  import_order_id?: string;
  type: LandedCostType;
  amount: number;
  currency: string;
  is_confirmed: boolean;
  status: LandedCostStatus;
  note?: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  paid_by_user_id: string | null;
  paid_at: string | null;
  confirmation_note: string | null;
  approver?: LandedCostParty | null;
  payer?: LandedCostParty | null;
  created_at?: string;
  updated_at?: string;
}

export interface GoodsReceipt {
  id: string;
  purchase_order_id?: string;
  import_order_id?: string;
  warehouse_id: string;
  received_qty: number;
  condition_notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseOrderItemInventoryItem {
  id: string;
  name: string;
  code: string;
  item_type: string;
  unit_of_measure: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  inventory_item_id: string;
  inventory_item?: PurchaseOrderItemInventoryItem;
  quantity: number;
  received_quantity: number | null;
  unit_price: number;
  currency: string;
  line_total: number;
  record_version: number;
}

export interface PurchaseOrderItemInput {
  inventory_item_id: string;
  quantity: number;
  unit_price: number;
}

export interface PurchaseOrderItemsPayload {
  data: PurchaseOrderItem[];
  items_total: number;
}

export interface PurchaseOrder {
  id: string;
  operating_unit_id: string;
  supplier_id: string;
  payment_source_account_id: string | null;
  supplier?: Supplier;
  currency: string;
  kind: PurchaseOrderKind;
  negotiated_price: number;
  quantity: number;
  total_amount?: number;
  booked_fx_rate?: number | null;
  status: PurchaseOrderStatus;
  record_version: number;
  arrived_warehouse_id?: string | null;
  arrived_warehouse?: { id: string; name: string };
  destination_warehouse_id?: string | null;
  destination_warehouse?: {
    id: string;
    code: string;
    name: string;
    operating_unit_id: string;
  } | null;
  /** arrived_warehouse_id ?? destination_warehouse_id — the warehouse where the lots will land. */
  resolved_warehouse_id?: string | null;
  items?: PurchaseOrderItemsPayload;
  payment_requests?: PaymentRequest[];
  landed_cost_lines?: LandedCostLine[];
  goods_receipt?: GoodsReceipt | null;
  payment_source_account?: { id: string; account_code: string; name: string } | null;
  created_at?: string;
  updated_at?: string;
}

export function getPurchaseOrderTotal(order: PurchaseOrder): number {
  if (order.total_amount !== undefined && order.total_amount !== null) {
    return Number(order.total_amount);
  }
  if (order.items?.items_total !== undefined && order.items.items_total !== null && order.items.items_total > 0) {
    return Number(order.items.items_total);
  }
  if (Array.isArray(order.items?.data) && order.items.data.length > 0) {
    return order.items.data.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
  }
  return Number(order.negotiated_price || 0) * Number(order.quantity || 0);
}

export interface FxRate {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  captured_at: string;
  created_at?: string;
}

export type CashAccountKind = "cash" | "bank";

/** A treasury the pickers offer: linked to a ledger leaf. */
export interface TreasuryOption {
  id: string;
  name: string;
  kind: CashAccountKind;
  currency: string;
  operating_unit_id: string;
  account_code: string;
  ledger_balance: number;
}

export interface CashAccount {
  id: string;
  operating_unit_id: string;
  name: string;
  /** cash = a treasury/drawer, bank = a bank account. */
  kind: CashAccountKind;
  /** The ledger account money received here is debited to; null = not usable for sales yet. */
  account_id: string | null;
  account?: { id: string; account_code: string; name: string } | null;
  currency: string;
  /** opening figure; the live balance is ledger_balance */
  balance: number;
  /** Whether the opening balance has been posted to the ledger (it can be set once until then). */
  has_opening_entry?: boolean;
  ledger_balance: number;
  currency_balances?: Array<{ currency: string; original_balance: number; lyd_balance: number }>;
  created_at?: string;
}

export interface CreateSupplierPayload {
  operating_unit_id: string;
  name: string;
  contact?: string;
  default_currency?: string;
  address?: string;
  account_id?: string | null;
  coa_action?: CoaAction;
  new_account?: NewCoaAccountPayload | null;
  /** W5-07: link an existing entity (a client's) instead of creating one. */
  entity_id?: string | null;
  tax_number?: string | null;
  /** W5-07: save despite SUPPLIER_DUPLICATE. */
  force?: boolean;
}

export interface UpdateSupplierPayload {
  operating_unit_id?: string;
  name?: string;
  contact?: string;
  default_currency?: string;
  address?: string;
  account_id?: string | null;
  coa_action?: CoaAction;
  new_account?: NewCoaAccountPayload | null;
  /** W5-07: relink the supplier to another entity. */
  entity_id?: string;
  tax_number?: string | null;
  force?: boolean;
  record_version?: number;
}

export interface CreatePurchaseOrderPayload {
  operating_unit_id: string;
  supplier_id: string;
  currency?: string;
  /** Defaults to 'foreign' when omitted. Setting 'local' locks currency to LYD. */
  kind?: PurchaseOrderKind;
  negotiated_price?: number;
  quantity?: number;
  items?: PurchaseOrderItemInput[];
  /** Where the goods will land as StockLots once the order reaches its final accounting step. */
  destination_warehouse_id?: string;
}

export interface UpdatePurchaseOrderPayload {
  supplier_id?: string;
  destination_warehouse_id?: string;
  items: PurchaseOrderItemInput[];
}

/**
 * Wave 5 (local flow): atomic per-line batch receive payload.
 * Sent to POST /api/v1/purchase-orders/{id}/receive.
 */
export interface ReceiveOrderItemPayload {
  id: string;
  received_quantity: number;
}

export interface ReceiveOrderPayload {
  items: ReceiveOrderItemPayload[];
}

export interface TransitionPurchaseOrderPayload {
  action:
    | 'pending_payment'
    | 'select_route'
    | 'execute_payment'
    | 'shipment'
    | 'arrive_port'
    | 'arrived_at_warehouse'
    | 'transport_warehouse'
    | 'receive_goods'
    | 'complete';
  route?: PaymentRoute;
  amount_requested?: number;
  held_amount_lyd?: number;
  invoice_ref?: string;
  fx_rate_used?: number | null;
  exact_amount_used_lyd?: number | null;
  bank_reference?: string;
  extra_allocation_note?: string;
  payment_source_account_id?: string;
  warehouse_id?: string;
  received_qty?: number;
  condition_notes?: string;
}

export interface ExecutePaymentPayload {
  fx_rate_used?: number | null;
  exact_amount_used_lyd?: number | null;
  bank_reference?: string;
  extra_allocation_note?: string;
  /** The 121xx cash/bank leaf the money leaves from — required by the API. */
  payment_source_account_id: string;
}

export interface CreateLandedCostLinePayload {
  type: LandedCostType;
  amount: number;
  currency?: string;
  note?: string;
}

export interface GetPaymentRequestsParams {
  status?: PaymentRequestStatus;
  route?: PaymentRoute;
  from?: string;
  to?: string;
  operating_unit_id?: string;
}

export interface CreateFxRatePayload {
  from_currency: string;
  to_currency: string;
  rate: number;
  captured_at?: string;
}

export interface CreateCashAccountPayload {
  operating_unit_id: string;
  name: string;
  kind?: CashAccountKind;
  account_id?: string | null;
  currency?: string;
  /** Opening balance, posted against equity 34 when the treasury is linked. */
  balance?: number;
  opening_date?: string;
}

export interface UpdateCashAccountPayload {
  name?: string;
  kind?: CashAccountKind;
  account_id?: string | null;
  /** Accepted once, until the opening entry is posted (OPENING_ALREADY_POSTED after). */
  opening_balance?: number;
  opening_date?: string;
}
