import apiClient from "../client";
import type { CashAccount } from "../../types/procurement";
import { LEDGER_ERROR_MESSAGE, apiErrorMessage, apiErrorPayload } from "./production";
import type { ApiErrorPayload } from "./production";
import type { InventoryItem } from "./inventory";
import type { InstallmentPlan, InstallmentPlanInput } from "./installments";

/*
 * The POS is the one place every sale happens — to a registered client or to
 * another operating unit, of inventory items and of bundles. A bundle sells as
 * one line carrying its name; its pieces are defined after checkout, set aside
 * from stock or cut at the cutter, and handed over later.
 */

export type SaleStatus =
  | "pending_approval"
  | "open"
  | "completed"
  | "rejected"
  // legacy rows from the retired order flow
  | "draft"
  | "confirmed"
  | "fulfilled"
  | "partially_paid"
  | "paid";

export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  pending_approval: "بانتظار موافقة الائتمان",
  open: "مفتوح",
  completed: "مكتمل",
  rejected: "مرفوض",
  draft: "مسودة",
  confirmed: "مؤكد",
  fulfilled: "تم التنفيذ",
  partially_paid: "مدفوع جزئياً",
  paid: "مدفوع",
};

export type FulfillmentStatus = "awaiting_definition" | "in_progress" | "ready" | "delivered";

/** Arabic text for sales guard codes whose backend message is English. */
export const SALES_ERROR_MESSAGE: Record<string, string> = {
  ...LEDGER_ERROR_MESSAGE,
  CLIENT_REQUIRED: "البيع الآجل أو بالشيك يتطلب عميلاً مسجلاً.",
  POS_DAY_ALREADY_CLOSED: "تم إقفال يومية الصندوق لهذا اليوم — لا يمكن تسجيل مبيعات أو تحصيلات جديدة حتى الغد.",
  HELD_CART_LIMIT: "وصلت إلى الحد الأقصى للفواتير المعلقة (30).",
  HELD_CART_TOO_LARGE: "الفاتورة أكبر من أن تُعلّق.",
  DISCOUNT_INVALID: "قيمة الخصم غير صحيحة: لا يمكن أن يتجاوز الخصم قيمة البند أو مجموع الفاتورة.",
  UNIT_DISCOUNT_NOT_LINKED: "لم يُربط حساب الخصم المسموح به لهذه الوحدة. راجع الحسابات.",
  PRICE_BELOW_FLOOR: "سعر بعض البنود أقل من الحد الأدنى أو من التكلفة ويحتاج موافقة المدير.",
  PRICE_OVERRIDE_INVALID: "بيانات المدير غير صحيحة.",
  PRICE_OVERRIDE_NOT_ALLOWED: "هذا المستخدم لا يملك صلاحية الموافقة على البيع تحت الحد الأدنى، أو هو نفسه البائع.",
  PRICE_OVERRIDE_THROTTLED: "محاولات كثيرة خاطئة. حاول بعد قليل.",
  RETURN_SALE_NOT_COMPLETED: "لا يمكن إرجاع هذا البيع (تحويل داخلي أو بانتظار الموافقة).",
  RETURN_LINE_NOT_RETURNABLE: "هذا البند لا يمكن إرجاعه.",
  RETURN_QUANTITY_EXCEEDS_SOLD: "الكمية المرتجعة أكبر من المتبقي من الكمية المباعة.",
  RETURN_REFUND_METHOD_INVALID: "الرد كرصيد يتطلب عميلاً مسجلاً.",
  RETURN_EMPTY: "حدد كمية مرتجعة لبند واحد على الأقل.",
  UNIT_RETURNS_NOT_LINKED: "لم يُربط حساب مردودات المبيعات لهذه الوحدة. راجع الحسابات.",
  RETURN_CONDITION_INVALID: "حالة البند المرتجع غير صحيحة.",
  RETURN_STOCK_SOURCE_NOT_FOUND: "تعذّر العثور على اللوت الذي بيع منه هذا البند لإعادته للمخزون.",
  INVALID_QUANTITY: "الكمية المرتجعة يجب أن تكون أكبر من صفر.",
  NO_OPEN_SHIFT: "لا توجد وردية مفتوحة على هذه الخزينة — افتح وردية قبل قبض النقد أو رده.",
  SHIFT_ALREADY_OPEN: "هذه الخزينة عليها وردية مفتوحة بالفعل — أغلقها قبل فتح وردية جديدة.",
  SHIFT_DRAWER_NOT_CASH: "تُفتح الوردية على خزينة نقدية فقط، لا على حساب مصرفي.",
  SHIFT_ALREADY_CLOSED: "هذه الوردية مغلقة بالفعل.",
  SHIFT_CLOSE_NOT_ALLOWED: "لا يغلق الوردية إلا الكاشير الذي فتحها أو مدير الوحدة.",
  OPEN_SHIFTS_EXIST: "توجد ورديات مفتوحة — أغلق كل الورديات المفتوحة أولاً.",
  SHIFTS_NOT_ENABLED: "الورديات غير مفعّلة لهذه الوحدة — فعّلها من إعدادات نقطة البيع أولاً.",
  SHIFT_FLOAT_INVALID: "رصيد بداية الوردية لا يمكن أن يكون سالباً.",
  POS_DAY_IN_PROGRESS: "لا يمكن تغيير إعداد الورديات أثناء يوم صندوق جارٍ — أقفل يومية الصندوق أولاً ويسري التغيير من اليوم التالي.",
  TREASURY_KIND_MISMATCH: "نوع الحساب المختار لا يطابق طريقة الدفع أو الرد (خزينة/مصرف).",
  INVENTORY_ACCOUNT_NOT_LINKED: "لم يُربط حساب المخزون أو الهالك لهذه الوحدة. راجع الحسابات.",
  DELIVERY_ADDRESS_INVALID: "عنوان التوصيل يجب أن يكون أحد عناوين العميل المختار.",
  // Checkout guards (SaleCheckoutService); payment and split codes come from LEDGER_ERROR_MESSAGE.
  CLIENT_BLOCKED: "هذا العميل محظور، أو غير نشط فلا يشتري بالآجل.",
  CLIENT_NOT_FOUND: "العميل غير مسجل في هذه الوحدة.",
  BUYER_REQUIRED: "اختر مشترياً واحداً: عميلاً مسجلاً أو وحدة تشغيل أخرى.",
  SELF_TRANSFER: "لا يمكن للوحدة أن تبيع لنفسها.",
  PAYMENT_METHOD_REQUIRED: "اختر طريقة دفع صحيحة.",
  PAYMENT_EXCEEDS_OUTSTANDING: "المبلغ المدفوع أكبر من المتبقي على البيع.",
  CHEQUE_DETAILS_REQUIRED: "بيانات الشيك مطلوبة للدفع بالشيك.",
  EMPTY_SALE: "أضف صنفاً أو حزمة واحدة على الأقل للبيع.",
  ZERO_TOTAL: "البيع لعميل يجب أن يكون إجماليه أكبر من صفر.",
  INVALID_LINE: "كل بند يحتاج كمية أكبر من صفر وسعراً صفراً أو أكثر.",
  INVALID_PRICE_TIER: "فئة السعر يجب أن تكون تجزئة أو جملة.",
  ITEM_NOT_FOUND: "أحد الأصناف غير موجود في المخزون.",
  BUNDLE_NOT_FOUND: "الحزمة غير موجودة أو لا تباع في هذه الوحدة.",
  INTERNAL_BUNDLE_NOT_ALLOWED: "التحويل الداخلي يحمل أصناف المخزون فقط، لا الحزم.",
  // W5-08: installment schedules (InstallmentPlanService / SaleCheckoutService).
  INSTALLMENTS_NEED_RECEIVABLE: "التقسيط متاح فقط للبيع الآجل (ذمم) لعميل مسجل، بعد إتمام البيع.",
  INSTALLMENT_COUNT_INVALID: "عدد الأقساط غير صحيح: من 1 إلى 60 قسطاً، ولا يقل القسط عن درهم واحد.",
  INSTALLMENT_FIRST_DUE_DATE_REQUIRED: "اختر تاريخ استحقاق القسط الأول.",
  INSTALLMENT_FIRST_DUE_DATE_INVALID: "لا يمكن أن يستحق القسط الأول قبل تاريخ البيع.",
  INSTALLMENT_DOWN_PAYMENT_INVALID: "الدفعة المقدمة يجب أن تكون صفراً أو أكثر وأقل من المبلغ المستحق.",
  INSTALLMENT_CREDIT_PENDING:
    "هذا البيع يتجاوز سقف ائتمان العميل ويحتاج موافقة الائتمان أولاً — أتمّه دون تقسيط، ثم أضف جدول الأقساط من صفحة البيع بعد الموافقة.",
  INSTALLMENT_NOTHING_OUTSTANDING: "لا يوجد مبلغ متبقٍ على هذا البيع لتقسيطه.",
  INSTALLMENT_PLAN_EXISTS: "لهذا البيع جدول أقساط بالفعل.",
};

/**
 * A sales guard refusal in Arabic; shift refusals name the shifts involved
 * (OPEN_SHIFTS_EXIST, SHIFT_ALREADY_OPEN).
 */
export const salesErrorMessage = (err: unknown, fallback: string): string => {
  const payload = apiErrorPayload(err) as
    | (ApiErrorPayload & { shift_numbers?: string[]; shift_number?: string; cashier?: string | null })
    | undefined;
  const known = payload?.code ? SALES_ERROR_MESSAGE[payload.code] : undefined;
  if (!known) return apiErrorMessage(err, fallback);
  if (Array.isArray(payload?.shift_numbers) && payload.shift_numbers.length > 0) {
    return `${known} (${payload.shift_numbers.join("، ")})`;
  }
  if (payload?.shift_number) {
    return `${known} (${payload.shift_number}${payload.cashier ? ` — ${payload.cashier}` : ""})`;
  }
  return known;
};

export const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  awaiting_definition: "بانتظار تحديد محتوى الحزمة",
  in_progress: "قيد التجهيز",
  ready: "جاهز للتسليم",
  delivered: "تم التسليم",
};

export type PaymentMethod = "cash" | "bank" | "receivable" | "split";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "نقدي",
  bank: "مصرف",
  receivable: "ذمم (آجل)",
  split: "دفع مجزأ",
};

export type ComponentStatus = "pending" | "at_cutter" | "ready" | "delivered";

export const COMPONENT_STATUS_LABEL: Record<ComponentStatus, string> = {
  pending: "بانتظار التجهيز",
  at_cutter: "في المقص",
  ready: "جاهز",
  delivered: "تم التسليم",
};

type Money = number | string;

export interface SaleComponentAllocation {
  id: string;
  stock_lot_id: string;
  quantity: Money;
  delivered_at?: string | null;
  stock_lot?: { id: string; lot_number: string; status: string } | null;
}

export interface SaleComponent {
  id: string;
  sales_order_line_id: string;
  position: number;
  inventory_item_id: string;
  quantity: Money;
  length_m?: Money | null;
  width_m?: Money | null;
  height_m?: Money | null;
  volume_m3?: Money | null;
  reference_price?: Money | null;
  status: ComponentStatus;
  cutter_work_order_line_id?: string | null;
  unit_cost_actual?: Money;
  notes?: string | null;
  inventory_item?: { id: string; name: string; code: string; item_type?: string } | null;
  allocations?: SaleComponentAllocation[];
}

export interface BundleTemplateItem {
  id: string;
  inventory_item_id: string;
  suggested_quantity?: Money | null;
  length_m?: Money | null;
  width_m?: Money | null;
  height_m?: Money | null;
  inventory_item?: { id: string; name: string; code: string; item_type?: string; selling_price?: Money | null; price_basis?: "unit" | "m3"; volume_m3?: Money | null };
}

export interface SaleLine {
  id: string;
  line_type: "item" | "bundle";
  description?: string | null;
  position: number;
  inventory_item_id?: string | null;
  stock_lot_id?: string | null;
  bundle_id?: string | null;
  quantity: Money;
  length_m?: Money | null;
  width_m?: Money | null;
  height_m?: Money | null;
  list_price?: Money | null;
  unit_price: Money;
  discount_amount?: number;
  unit_cost_actual: Money;
  inventory_item?: { id: string; name: string; code: string } | null;
  stock_lot?: { id: string; lot_number: string } | null;
  bundle?: { id: string; name: string; items?: BundleTemplateItem[] } | null;
  components?: SaleComponent[];
}

export interface SalePayment {
  id?: string;
  amount: Money;
  method: "cash" | "bank" | "cheque";
  received_at?: string;
  cash_account?: { id: string; name: string } | null;
  received_by?: { id: string; name: string } | null;
  tendered_amount?: Money | null;
  change_given?: Money | null;
  cheque?: { id?: string; number?: string; cheque_no?: string } | null;
  /** Set on a cash/bank refund: a negative payment raised by that sales return. */
  sales_return_id?: string | null;
}

export interface CreditApproval {
  id: string;
  sales_order_id: string;
  amount_over_limit: Money;
  status: "pending" | "approved" | "rejected";
  decided_by?: { id: string; name: string } | null;
  decided_at?: string | null;
  notes?: string | null;
  created_at: string;
  sales_order?: Sale;
}

export interface Sale {
  id: string;
  order_number: string;
  quotation_id?: string | null;
  buyer_type: "client" | "internal_unit" | "walk_in";
  client_id?: string | null;
  buyer_unit_id?: string | null;
  walk_in_name?: string | null;
  walk_in_phone?: string | null;
  channel: "pos" | "standard";
  price_tier?: "retail" | "wholesale";
  status: SaleStatus;
  fulfillment_status?: FulfillmentStatus | null;
  payment_method?: PaymentMethod | "card" | null;
  cash_account_id?: string | null;
  price_override_by?: { id: string; name: string } | null;
  price_override_reason?: string | null;
  gross_amount?: Money;
  invoice_discount?: Money;
  total_amount: Money;
  total_cost: Money;
  amount_paid: Money;
  /** Sum of every sales return raised against this sale. */
  returned_amount?: Money;
  notes?: string | null;
  lines?: SaleLine[];
  lines_count?: number;
  client?: {
    id: string;
    credit_limit: Money;
    current_balance: Money;
    entity?: { name?: string; primary_contact?: { phone?: string | null } | null };
  } | null;
  buyer_unit?: { id: string; name: string } | null;
  cash_account?: { id: string; name: string; kind: "cash" | "bank" } | null;
  payments?: SalePayment[];
  sold_by?: { id: string; name: string } | null;
  credit_approval_request?: CreditApproval | null;
  returns?: SaleReturnSummary[];
  /** W5-08: the derived installment schedule, or null when the sale has none. */
  installment_plan?: InstallmentPlan | null;
  created_at: string;
}

// ── Sales returns (W3-07) ────────────────────────────────────────────────────

/**
 * Roles that may raise a return here (with `create-sales-returns`); a cashier can only see them.
 * The backend also grants accounting-manager, but every return screen sits under the POS `sales/*`
 * guard and the create flow needs `GET /sales/{id}` (view-sales), so that role is left out on purpose.
 */
export const SALES_RETURN_ROLES = ["owner", "admin", "store-manager", "unit_manager", "manager"];

export type RefundMethod = "cash" | "bank" | "credit";

export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  cash: "نقداً",
  bank: "مصرف",
  credit: "رصيد للعميل",
};

export type ReturnCondition = "restock" | "damaged";

export const RETURN_CONDITION_LABEL: Record<ReturnCondition, string> = {
  restock: "سليم — يعاد للمخزون",
  damaged: "تالف",
};

/** A return as listed on its sale's page. */
export interface SaleReturnSummary {
  id: string;
  number: string;
  return_date: string;
  amount: Money;
  refund_method: RefundMethod;
}

/** What one line of a sale can still be returned. */
export interface ReturnableLine {
  sales_order_line_id: string;
  line_type: "item" | "bundle";
  description?: string | null;
  inventory_item_id?: string | null;
  item_code?: string | null;
  sold_qty: number;
  returned_qty: number;
  remaining_qty: number;
  net_unit_amount: number;
  returnable: boolean;
}

export interface ReturnableResponse {
  sales_order_id: string;
  order_number: string;
  /** What the sale actually took in — the ceiling of a cash/bank refund. */
  refundable_amount: number;
  lines: ReturnableLine[];
}

export interface SalesReturnLine {
  id: string;
  sales_return_id: string;
  sales_order_line_id: string;
  quantity: Money;
  amount: Money;
  condition: ReturnCondition;
  unit_cost?: Money;
  order_line?: {
    id: string;
    line_type: "item" | "bundle";
    description?: string | null;
    inventory_item_id?: string | null;
    quantity?: Money;
    unit_price?: Money;
    discount_amount?: Money;
    inventory_item?: { id: string; name: string; code: string } | null;
  } | null;
}

export interface SalesReturn {
  id: string;
  number: string;
  sales_order_id: string;
  client_id?: string | null;
  return_date: string;
  refund_method: RefundMethod;
  cash_account_id?: string | null;
  amount: Money;
  total_cost?: Money;
  reason?: string | null;
  created_at?: string;
  lines?: SalesReturnLine[];
  order?: {
    id: string;
    order_number: string;
    walk_in_name?: string | null;
    walk_in_phone?: string | null;
    buyer_type?: Sale["buyer_type"];
    client_id?: string | null;
    total_amount?: Money;
    returned_amount?: Money;
    amount_paid?: Money;
  } | null;
  client?: { id: string; entity?: { id?: string; name?: string } | null } | null;
  cash_account?: { id: string; name: string; kind: "cash" | "bank" } | null;
  created_by?: { id: string; name: string } | null;
  journal_entry?: { id: string; reference?: string; entry_date?: string } | null;
}

export interface CreateSalesReturnInput {
  lines: { sales_order_line_id: string; quantity: number; condition: ReturnCondition }[];
  refund_method: RefundMethod;
  cash_account_id?: string | null;
  reason?: string | null;
}

export interface SalesReturnFilters {
  from?: string;
  to?: string;
  search?: string;
  client_id?: string;
  page?: number;
  per_page?: number;
}

/** Who took the goods back: the registered client, the walk-in's name, or "زبون عام". */
export function salesReturnBuyer(r: Pick<SalesReturn, "client" | "order">): string {
  return r.client?.entity?.name?.trim() || r.order?.walk_in_name?.trim() || "زبون عام";
}

export const salesReturnsApi = {
  returnable: (saleId: string) => apiClient.get<ReturnableResponse>(`/sales/${saleId}/returnable`),
  create: (saleId: string, data: CreateSalesReturnInput) =>
    apiClient.post<SalesReturn>(`/sales/${saleId}/returns`, data),
  list: (params?: SalesReturnFilters) => apiClient.get<Paginated<SalesReturn>>("/sales-returns", { params }),
  get: (id: string) => apiClient.get<SalesReturn>(`/sales-returns/${id}`),
};

export interface PriceOverrideInput {
  login: string;
  password: string;
  reason: string;
}

export interface PriceFloorViolationLine {
  position: number;
  item_id: string;
  item_name: string;
  net_price: number;
  floor: number;
  reason: "min_price" | "cost";
}

/** A sale refusal body: PRICE_BELOW_FLOOR carries the offending lines, PRICE_OVERRIDE_THROTTLED the wait in seconds. */
export interface SaleErrorPayload extends ApiErrorPayload {
  lines?: PriceFloorViolationLine[];
  retry_after?: number;
}

export interface CartLineInput {
  line_type: "item" | "bundle";
  inventory_item_id?: string | null;
  stock_lot_id?: string | null;
  bundle_id?: string | null;
  description?: string | null;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
  length_m?: number | null;
  width_m?: number | null;
  height_m?: number | null;
}

export interface SplitPaymentChequeInput {
  cheque_no: string;
  bank_name: string;
  drawer_name?: string;
  due_date: string;
  is_certified?: boolean;
}

export interface SplitPaymentPortionInput {
  method: "cash" | "bank" | "cheque";
  amount: number;
  cash_account_id?: string;
  tendered_amount?: number;
  cheque?: SplitPaymentChequeInput;
}

export interface CheckoutInput {
  client_request_id: string;
  client_id?: string | null;
  buyer_unit_id?: string | null;
  walk_in_name?: string | null;
  walk_in_phone?: string | null;
  /** W5-05: one of the buying client's addresses (client sales only); the sale keeps a snapshot of it. */
  delivery_address_id?: string | null;
  payment_method?: PaymentMethod | null;
  cash_account_id?: string | null;
  notes?: string | null;
  price_tier?: "retail" | "wholesale";
  price_override?: PriceOverrideInput;
  invoice_discount?: number;
  lines: CartLineInput[];
  tendered_amount?: number | null;
  payments?: SplitPaymentPortionInput[];
  /** W5-08: receivable sales to a registered client only; the down payment is collected in the same transaction. */
  installment_plan?: InstallmentPlanInput;
}

export interface InvoiceLine {
  line_type: "item" | "bundle";
  description: string;
  sku?: string | null;
  quantity: number;
  length_m?: number | null;
  width_m?: number | null;
  height_m?: number | null;
  unit_price: number;
  discount_amount?: number;
  line_total: number;
  lot_number?: string | null;
}

export interface Invoice {
  invoice_number: string;
  sale_number: string;
  date: string;
  seller?: string | null;
  sold_by?: string | null;
  buyer?: string | null;
  buyer_phone?: string | null;
  walk_in_name?: string | null;
  walk_in_phone?: string | null;
  buyer_type: string;
  payment_method?: PaymentMethod | null;
  cash_account?: string | null;
  lines: InvoiceLine[];
  gross_amount?: number;
  invoice_discount?: number;
  total_amount: number;
  amount_paid: number;
  outstanding: number;
  status: SaleStatus;
  fulfillment_status?: FulfillmentStatus | null;
}

export interface DeliveryNotePiece {
  id: string;
  item?: string | null;
  sku?: string | null;
  quantity: number;
  length_m?: number | null;
  width_m?: number | null;
  height_m?: number | null;
  status: ComponentStatus;
  notes?: string | null;
}

export interface DeliveryNote {
  document_number: string;
  sale_number: string;
  date: string;
  seller?: string | null;
  buyer?: string | null;
  buyer_phone?: string | null;
  /** W5-05: the delivery address snapshot taken at checkout, if one was chosen. */
  delivery_address?: string | null;
  fulfillment_status?: FulfillmentStatus | null;
  lines: {
    line_type: "item" | "bundle";
    description: string;
    sku?: string | null;
    quantity: number;
    length_m?: number | null;
    width_m?: number | null;
    height_m?: number | null;
    lot_number?: string | null;
    pieces: DeliveryNotePiece[];
  }[];
}

export interface MatchingLot {
  id: string;
  lot_number: string;
  quantity: number;
  length_m?: number | null;
  width_m?: number | null;
  height_m?: number | null;
  grade?: string | null;
  warehouse?: string | null;
  operating_unit?: string | null;
  operating_unit_id?: string | null;
}

export interface OpenCutterOrder {
  id: string;
  order_number: string;
  status: string;
  lines_count: number;
  created_at: string;
}

export interface PosDailyReport {
  date: string;
  timezone: string;
  sales_count: number;
  total: number;
  total_cost: number;
  by_method: Partial<Record<PaymentMethod, { count: number; total: number }>>;
  collected: Partial<Record<"cash" | "bank", { count: number; total: number }>>;
  by_cash_account: { cash_account_id: string | null; name?: string | null; kind?: "cash" | "bank" | null; total: number }[];
  expected_cash: number;
  expected_cash_by_account?: { cash_account_id: string; name: string; expected: number }[];
  /** Cash stamped with a cashier shift — counted at each shift close, not in expected_cash. */
  shift_cash?: number;
}

export interface PosDailyClose {
  id: string;
  close_date: string;
  expected_cash: Money;
  counted_cash: Money;
  difference: Money;
  sales_count: number;
  total_sales: Money;
  notes?: string | null;
  closed_by?: { id: string; name: string } | null;
  cash_account_id?: string | null;
  cash_account?: { id: string; name: string } | null;
  journal_entry_id?: string | null;
  journal_entry?: { id: string; reference?: string } | null;
  /** The day closed from its cashier shifts: nothing posted, differences were posted per shift. */
  shift_based?: boolean;
  created_at: string;
}

// ── Cashier shifts (FR-SLREP-008) ────────────────────────────────────────────

export interface PosShiftTotals {
  opening_float: number;
  cash_in: number;
  cash_refunds: number;
  net_cash: number;
  bank: number;
  cheque: number;
  sales_count: number;
  returns_count: number;
  expected_cash: number;
}

export type PosShiftStatus = "open" | "closed";

export const POS_SHIFT_STATUS_LABEL: Record<PosShiftStatus, string> = {
  open: "مفتوحة",
  closed: "مغلقة",
};

export interface PosShift {
  id: string;
  operating_unit_id: string;
  cash_account_id: string;
  cashier_user_id: string;
  number: string;
  status: PosShiftStatus;
  opened_at: string;
  opening_float: Money;
  closed_at?: string | null;
  closed_by_user_id?: string | null;
  expected_cash?: Money | null;
  counted_cash?: Money | null;
  difference?: Money | null;
  /** Live while open (show/current), stored at close; absent on list rows of open shifts. */
  totals?: PosShiftTotals | null;
  notes?: string | null;
  journal_entry_id?: string | null;
  cashier?: { id: string; name: string } | null;
  closed_by?: { id: string; name: string } | null;
  cash_account?: { id: string; name: string; kind: "cash" | "bank" } | null;
  created_at?: string;
}

export interface PosShiftXReport {
  shift: PosShift;
  totals: PosShiftTotals;
  generated_at: string;
}

export interface PosShiftFilters {
  status?: PosShiftStatus;
  cash_account_id?: string;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
}

export const posShiftsApi = {
  current: (cashAccountId: string) =>
    apiClient.get<{ data: PosShift | null }>("/pos/shifts/current", { params: { cash_account_id: cashAccountId } }),
  open: (data: { cash_account_id: string; opening_float: number }) => apiClient.post<PosShift>("/pos/shifts", data),
  get: (id: string) => apiClient.get<PosShift>(`/pos/shifts/${id}`),
  xReport: (id: string) => apiClient.get<PosShiftXReport>(`/pos/shifts/${id}/x-report`),
  close: (id: string, data: { counted_cash: number; notes?: string | null }) =>
    apiClient.post<PosShift>(`/pos/shifts/${id}/close`, data),
  list: (params?: PosShiftFilters) => apiClient.get<Paginated<PosShift>>("/pos/shifts", { params }),
  updateUnitSettings: (unitId: string, data: { pos_shifts_enabled: boolean }) =>
    apiClient.put<{ id: string; pos_shifts_enabled: boolean }>(`/operating-units/${unitId}/pos-settings`, data),
};

export type QuotationStatus = "open" | "converted" | "cancelled" | "expired";

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  open: "ساري",
  converted: "تم البيع",
  cancelled: "ملغى",
  expired: "منتهي الصلاحية",
};

export interface QuotationLine {
  id: string;
  position: number;
  line_type: "item" | "bundle";
  description?: string | null;
  inventory_item_id?: string | null;
  bundle_id?: string | null;
  quantity: Money;
  length_m?: Money | null;
  width_m?: Money | null;
  height_m?: Money | null;
  unit_price: Money;
  discount_amount?: number;
  inventory_item?: { id: string; name: string; code: string } | null;
  bundle?: { id: string; name: string } | null;
}

export interface Quotation {
  id: string;
  quotation_number: string;
  client_id: string;
  valid_until: string;
  price_tier?: "retail" | "wholesale";
  status: Exclude<QuotationStatus, "expired">;
  effective_status: QuotationStatus;
  gross_amount?: Money;
  invoice_discount?: Money;
  total_amount: Money;
  converted_sales_order_id?: string | null;
  converted_sale?: { id: string; order_number: string } | null;
  notes?: string | null;
  lines?: QuotationLine[];
  lines_count?: number;
  client?: Sale["client"];
  operating_unit?: { id: string; name: string } | null;
  created_by?: { id: string; name: string } | null;
  created_at: string;
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface SaleFilters {
  status?: string;
  fulfillment_status?: string;
  payment_method?: string;
  client_id?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  per_page?: number;
  /** W6-04: every row the filters match as one page (CSV export); 422 EXPORT_TOO_LARGE past the server cap. */
  all?: 1;
}

export interface CollectPaymentChequeInput {
  cheque_no: string;
  bank_name: string;
  drawer_name?: string;
  due_date: string;
  is_certified?: boolean;
}

export interface CollectPaymentInput {
  amount: number;
  method: "cash" | "bank" | "cheque";
  cash_account_id?: string | null;
  tendered_amount?: number | null;
  cheque?: CollectPaymentChequeInput;
}

export const salesApi = {
  list: (params?: SaleFilters) => apiClient.get<Paginated<Sale>>("/sales", { params }),
  get: (id: string) => apiClient.get<Sale>(`/sales/${id}`),
  checkout: (data: CheckoutInput) => apiClient.post<Sale>("/sales", data),
  collectPayment: (id: string, data: CollectPaymentInput) =>
    apiClient.post<Sale>(`/sales/${id}/payments`, data),
  invoice: (id: string) => apiClient.get<Invoice>(`/sales/${id}/invoice`),
  deliveryNote: (id: string) => apiClient.get<DeliveryNote>(`/sales/${id}/delivery-note`),
  paymentAccounts: (kind?: "cash" | "bank") =>
    apiClient.get<{ data: CashAccount[] }>("/sales/payment-accounts", { params: { kind } }),

  dailyReport: (date?: string) => apiClient.get<PosDailyReport>("/pos/daily-report", { params: { date } }),
  dailyClose: (date?: string) => apiClient.get<{ data: PosDailyClose | null }>("/pos/daily-close", { params: { date } }),
  /** counted_cash is omitted on a day run on cashier shifts (the response carries shift_based). */
  saveDailyClose: (data: { counted_cash?: number; date?: string; notes?: string; cash_account_id?: string | null }) =>
    apiClient.post<PosDailyClose>("/pos/daily-close", data),

  heldCarts: () => apiClient.get<{ data: HeldCart[] }>("/held-carts"),
  holdCart: (data: HoldCartInput) => apiClient.post<{ data: HeldCart }>("/held-carts", data),
  deleteHeldCart: (id: string) => apiClient.delete(`/held-carts/${id}`),
};

export const bundleFulfillmentApi = {
  define: (saleId: string, lineId: string, components: {
    inventory_item_id: string;
    quantity: number;
    length_m?: number | null;
    width_m?: number | null;
    height_m?: number | null;
    notes?: string | null;
  }[]) => apiClient.put<SaleLine>(`/sales/${saleId}/lines/${lineId}/components`, { components }),
  matchingStock: (componentId: string) =>
    apiClient.get<{ component_id: string; needed: number; lots: MatchingLot[] }>(`/sale-components/${componentId}/matching-stock`),
  reserve: (componentId: string, allocations: { stock_lot_id: string; quantity: number }[]) =>
    apiClient.post<SaleComponent>(`/sale-components/${componentId}/reserve`, { allocations }),
  release: (componentId: string) => apiClient.post<SaleComponent>(`/sale-components/${componentId}/release`),
  sendToCutter: (saleId: string, componentIds: string[], cutterWorkOrderId?: string | null) =>
    apiClient.post<{ id: string; order_number: string }>(`/sales/${saleId}/send-to-cutter`, {
      component_ids: componentIds,
      cutter_work_order_id: cutterWorkOrderId ?? null,
    }),
  openCutterOrders: () => apiClient.get<{ data: OpenCutterOrder[] }>("/sales/open-cutter-orders"),
  deliver: (saleId: string, componentIds?: string[]) =>
    apiClient.post<Sale>(`/sales/${saleId}/deliver`, { component_ids: componentIds ?? null }),
};

export const quotationsApi = {
  /** W6-04: `all: 1` returns every matching row as one page (CSV export); 422 EXPORT_TOO_LARGE past the server cap. */
  list: (params?: { status?: string; client_id?: string; search?: string; page?: number; per_page?: number; all?: 1 }) =>
    apiClient.get<Paginated<Quotation>>("/quotations", { params }),
  get: (id: string) => apiClient.get<Quotation>(`/quotations/${id}`),
  create: (data: {
    client_id: string;
    valid_until?: string | null;
    notes?: string | null;
    price_tier?: "retail" | "wholesale";
    invoice_discount?: number;
    lines: CartLineInput[];
  }) => apiClient.post<Quotation>("/quotations", data),
  cancel: (id: string) => apiClient.post<Quotation>(`/quotations/${id}/cancel`),
  convert: (id: string, data: Omit<CheckoutInput, "client_id" | "buyer_unit_id">) =>
    apiClient.post<Sale>(`/quotations/${id}/convert`, data),
};

export const creditApprovalsApi = {
  list: (params?: { status?: string; page?: number }) =>
    apiClient.get<Paginated<CreditApproval>>("/credit-approval-requests", { params }),
  approve: (id: string, notes?: string) => apiClient.put<CreditApproval>(`/credit-approval-requests/${id}/approve`, { notes }),
  reject: (id: string, notes?: string) => apiClient.put<CreditApproval>(`/credit-approval-requests/${id}/reject`, { notes }),
};

/** "200×70×10 سم" from metres — the size the counter and the cutter read. */
export function formatSizeCm(l?: Money | null, w?: Money | null, h?: Money | null): string | null {
  if (!l || !w || !h) return null;
  const cm = (m: Money) => {
    const value = Math.round(Number(m) * 1000) / 10;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  };
  return `${cm(l)}×${cm(w)}×${cm(h)} سم`;
}

export interface RestockRequest {
  id: string;
  request_number: string;
  requesting_unit_id: string;
  source_unit_id: string;
  status: "pending_approval" | "approved" | "rejected" | "fulfilled";
  requesting_unit?: { id: string; name: string };
  source_unit?: { id: string; name: string };
  lines?: { id: string; inventory_item_id: string; quantity: number; inventory_item?: { name: string; code: string } }[];
  created_at: string;
}

export const restockApi = {
  list: (params?: { status?: string }) =>
    apiClient.get<{ data: RestockRequest[] }>("/internal-restock-requests", { params }),

  create: (data: {
    request_number: string;
    source_unit_id: string;
    notes?: string;
    lines: { inventory_item_id: string; quantity: number }[];
  }) => apiClient.post<RestockRequest>("/internal-restock-requests", data),

  approve: (id: string) => apiClient.put<RestockRequest>(`/internal-restock-requests/${id}/approve`),
  reject: (id: string) => apiClient.put<RestockRequest>(`/internal-restock-requests/${id}/reject`),
  fulfill: (id: string) => apiClient.post<RestockRequest>(`/internal-restock-requests/${id}/fulfill`),
};

export interface CartLine {
  key: string;
  lineType: "item" | "bundle";
  itemId?: string;
  bundleId?: string;
  name: string;
  code?: string;
  qty: string;
  /** Unit price — editable; starts from the item's own price or the bundle's template. */
  price: string;
  /** Line discount amount (whole-line money discount, empty = 0). */
  discount: string;
  stockLotId?: string | null;
  stockLotLabel?: string | null;
  size?: { length_m: number; width_m: number; height_m: number } | null;
  priceEdited?: boolean;
  item?: InventoryItem | null;
}

export interface HeldCartPayload {
  version: 1;
  cart: CartLine[];
  priceTier?: "retail" | "wholesale";
  invoiceDiscount?: string | null;
  client_id?: string | null;
  buyer_mode?: "client" | "internal" | "walk_in";
  buyer_unit_id?: string | null;
  walkInName?: string | null;
  walkInPhone?: string | null;
  payment_method?: PaymentMethod | null;
  cash_account_id?: string | null;
  notes?: string | null;
}

export interface HeldCart {
  id: string;
  label?: string | null;
  client: { id: string; name: string } | null;
  total: Money;
  line_count: number;
  payload: HeldCartPayload;
  user: { id: string; name: string };
  created_at: string;
}

export interface HoldCartInput {
  label?: string | null;
  client_id?: string | null;
  payload: HeldCartPayload;
  total: number;
  line_count: number;
}

export const heldCartsApi = {
  list: () => apiClient.get<{ data: HeldCart[] }>("/held-carts"),
  create: (data: HoldCartInput) => apiClient.post<{ data: HeldCart }>("/held-carts", data),
  delete: (id: string) => apiClient.delete(`/held-carts/${id}`),
};

