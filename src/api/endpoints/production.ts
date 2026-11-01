import apiClient from "../client";
import { StockLot } from "./inventory";
import { formatNumber } from "../../lib/utils/format";

export type ProductionBatchStatus =
  | "planned"
  | "configured"
  | "running"
  | "consumed"
  | "curing"
  | "ready_for_grading"
  | "graded"
  | "closed";

export interface ProductionFormulaParams {
  density_band?: string;
  cure_time_minutes?: number;
  conveyor_speed?: number;
  chemical_formula?: string;
}

export interface ProductionBatch {
  id: string;
  operating_unit_id: string;
  requested_by_client_id?: string;
  /** Operator-entered, incremental, never reused. Part of every block code. */
  operation_number: number;
  /** Machine setting, constant for the run — copied onto every block. */
  bun_width_m: number;
  formula_params?: ProductionFormulaParams;
  status: ProductionBatchStatus;
  material_cost: number;
  /** Non-serialized output (فاصل / بداية), tracked so yield reconciles. */
  scrap_volume_m3: number;
  next_sequence: number;
  record_version: number;
  /** Serialized blocks only — scrap is counted separately, not folded in. */
  blocks_count?: number;
  scrap_lots_count?: number;
  operating_unit?: { id: string; name: string };
  /**
   * W4-05: chemicals issued to the run, one row per lot drawn. Loaded by the
   * detail read and the materials endpoints only. Once any exist, material_cost
   * is their summed total_cost and cannot be typed over.
   */
  materials?: ProductionBatchMaterial[];
  created_at: string;
  updated_at: string;
}

/** W4-05: one chemical drawn from one lot into a batch, at that lot's actual cost. */
export interface ProductionBatchMaterial {
  id: string;
  production_batch_id: string;
  inventory_item_id: string;
  stock_lot_id: string;
  quantity: number | string;
  unit_cost: number | string;
  total_cost: number | string;
  /**
   * The issuing user. Laravel serializes the loaded `issuedBy` relation under
   * the same snake_case key as the column, so this is the user object (or null).
   */
  issued_by?: { id: string; name: string } | string | null;
  inventory_movement_id?: string | null;
  inventory_item?: {
    id: string;
    code: string;
    name: string;
    unit_of_measure?: string;
    primary_uom?: string | null;
    container_capacity?: number | string | null;
  } | null;
  stock_lot?: { id: string; lot_number: string; warehouse_id: string } | null;
  created_at: string;
}

/** W4-05: one requested chemical; the server draws it FIFO across the unit's lots. */
export interface IssueMaterialLine {
  inventory_item_id: string;
  quantity: number;
}

/**
 * One row of the paper production report: a dimension group with a count.
 * Block groups expand server-side into `count` individually labelled lots;
 * scrap groups contribute volume only and consume no sequence numbers.
 */
export interface BlockGroupInput {
  kind: "block" | "separator" | "head" | "scrap";
  block_type?: "block" | "separator" | "head" | "scrap";
  count: number;
  length_m: number;
  height_m: number;
  pressure?: number;
  inventory_item_id?: string;
  warehouse_id?: string;
  unit_cost?: number;
  grade?: "standard" | "acceptable_variant" | "defective_usable" | "reject";
  color?: string;
}

export interface RegisterBlocksResponse {
  batch: ProductionBatch;
  blocks: StockLot[];
  blocks_created: number;
  scrap_volume_m3: number;
}

export interface CreateBatchInput {
  operation_number: number;
  bun_width_m: number;
  formula_params?: ProductionFormulaParams;
  status?: ProductionBatchStatus;
  requested_by_client_id?: string;
  material_cost?: number;
  confirm_non_sequential?: boolean;
}

/**
 * Returned as a 422 when the entered operation number is not `previous + 1`.
 * This is a soft warning, not a rejection — resubmitting with
 * `confirm_non_sequential: true` succeeds. See NonSequentialWarning in the UI.
 */
export interface NonSequentialOperationError {
  message: string;
  code: "NON_SEQUENTIAL_OPERATION_NUMBER";
  expected_operation_number: number;
  entered_operation_number: number;
}

export const isNonSequentialError = (
  payload: unknown,
): payload is NonSequentialOperationError =>
  typeof payload === "object" &&
  payload !== null &&
  (payload as { code?: string }).code === "NON_SEQUENTIAL_OPERATION_NUMBER";

export interface ApiErrorPayload {
  message?: string;
  code?: string;
  errors?: Record<string, string[]>;
  /** W4-05 INSUFFICIENT_STOCK: each chemical the stock could not cover. */
  shortfalls?: { inventory_item_id: string; code?: string | null; required: number; available: number }[];
  /** W5-00 PARTY_EMPLOYEE_REQUIRED on a manual entry: the untagged advance balance an untagged credit may still clear. */
  untagged_balance?: number;
  /** W5-02 ADVANCE_LIMIT_EXCEEDED: the largest advance allowed and the monthly salary it is measured on. */
  max_amount?: number;
  monthly_salary?: number;
  /** W5-02 ADVANCE_DEDUCTION_LIMIT: the monthly recovery cap and what the employee's other open advances already take. */
  max_monthly?: number;
  open_monthly?: number;
  /** W5-02 ADVANCE_REPAYMENT_EXCEEDS: what is still left to recover in cash. */
  available?: number;
  /** W5-02 ADVANCE_USE_REPAY: the employee's 1215 balance outside the advance schedule. */
  unscheduled_balance?: number;
  /** W5-03 PAY_ITEM_PERIOD_CLOSED / PAY_PERIOD_CLOSED / PAY_ITEM_FROZEN: the last day of payroll that left review. */
  frozen_until?: string;
  /** W5-03 PAY_ITEM_FROZEN: the earliest end date the frozen item may take. */
  earliest_end?: string;
  /** W5-03 PAYROLL_DEDUCTIONS_EXCEED_GROSS: every employee whose standing and one-off deductions exceed gross. */
  employees?: { employee_id: string; gross_pay: number; deductions: number }[];
  /** W5-03 PAYROLL_ADJUSTMENT_UNPAID: the approved adjustments no payslip would carry. */
  adjustment_ids?: string[];
  /** W5-03 PAYROLL_ADJUSTMENT_UNPAID: the first employee those adjustments belong to. */
  employee_id?: string;
  /** W5-04 WORK_SHIFT_IN_USE: the employees still on the shift. */
  employee_ids?: string[];
  /** W5-06 CLIENT_GROUP_IN_USE: how many clients are still in the group. */
  clients_count?: number;
  /** W5-07 SUPPLIER_DUPLICATE: the live suppliers of the unit that look like the same party. */
  duplicates?: { id: string; name: string; tax_number: string | null; match: "entity" | "tax_number" | "name" }[];
  /** W5-07 SUPPLIER_MERGE_ACCOUNTS: the two ledger accounts that both carry postings. */
  source_account_code?: string;
  target_account_code?: string;
  /** W5-07 SUPPLIER_MERGE_OPEN_ORDERS: the purchase orders still part-way through. */
  purchase_order_ids?: string[];
  /** W5-07 SUPPLIER_TAX_NUMBER_CONFLICT: the tax number the shared entity keeps. */
  entity_id?: string;
  entity_tax_number?: string | null;
  /** W6-04 EXPORT_TOO_LARGE: the most rows one export may take, and how many the filters match. */
  limit?: number;
  total?: number;
}

/** Pull the JSON body out of a rejected axios request without reaching for `any`. */
export const apiErrorPayload = (err: unknown): ApiErrorPayload | undefined =>
  (err as { response?: { data?: ApiErrorPayload } } | undefined)?.response?.data;

/** Ledger refusals any posting screen can hit, in the user's language. */
export const LEDGER_ERROR_MESSAGE: Record<string, string> = {
  FX_AMOUNT_MISMATCH: "المبلغ بالدينار لا يساوي المبلغ الأصلي × سعر الصرف.",
  TREASURY_REQUIRED: "اختر الخزينة أو الحساب المصرفي الذي تخرج منه الأموال أو تدخل إليه.",
  TREASURY_NOT_LINKED: "هذه الخزينة غير مربوطة بحساب في دليل الحسابات — اربطها من صفحة الخزينة أولاً.",
  UNIT_REVENUE_NOT_LINKED: "هذه الوحدة ليس لها حساب إيرادات مبيعات — حدّده من صفحة الوحدة التشغيلية قبل البيع.",
  HEADER_ACCOUNT_POSTING: "لا يمكن الترحيل إلى حساب رئيسي له حسابات فرعية — اختر الحساب الفرعي المناسب.",
  CLIENT_REQUIRED: "البيع الآجل يتطلب عميلاً.",
  LEDGER_IMMUTABLE: "القيود المرحّلة لا تُعدّل ولا تُحذف — استخدم عكس القيد.",
  ALREADY_REVERSED: "تم عكس هذا القيد مسبقاً.",
  REVERSAL_NOT_REVERSIBLE: "القيد العكسي لا يُعكس — رحّل قيداً جديداً بدلاً من ذلك.",
  CLOSING_NOT_REVERSIBLE: "قيد الإقفال لا يُعكس مباشرة — أعد فتح السنة المالية.",
  REVERSAL_DATE_BEFORE_ORIGINAL: "لا يمكن أن يسبق تاريخ القيد العكسي تاريخ القيد الأصلي.",
  ACCOUNT_IN_USE: "الحساب مرتبط بسجلات أخرى (خزينة أو عميل أو مورد…) ولا يمكن حذفه.",
  ACCOUNT_CODE_LOCKED: "لا يمكن تغيير رمز حساب عليه حركات.",
  ACCOUNT_HAS_TRANSACTIONS: "الحساب عليه حركات مرحّلة ولا يمكن حذفه.",
  ACCOUNT_FROZEN: "هذا الحساب مجمّد ولا يقبل قيوداً جديدة.",
  PERIOD_LOCKED: "الشهر المحاسبي لهذا التاريخ مقفل — لا يمكن الترحيل إليه. اختر تاريخاً في فترة مفتوحة أو اطلب من المالك إعادة فتح الشهر.",
  YEAR_CLOSED: "السنة المالية لهذا التاريخ مقفلة.",
  PERIOD_NOT_ENDED: "لا يمكن إقفال شهر لم ينتهِ بعد.",
  PERIOD_ALREADY_LOCKED: "هذا الشهر مقفل بالفعل.",
  PERIOD_NOT_LOCKED: "هذا الشهر غير مقفل.",
  PERIOD_LOCK_OUT_OF_ORDER: "يجب إقفال الأشهر السابقة أولاً.",
  FISCAL_CALENDAR_IN_USE: "لا يمكن تغيير بداية السنة المالية بعد إقفال أي شهر.",
  ENTRY_DATE_OUT_OF_RANGE: "التاريخ بعيد جداً في المستقبل — تحقق منه.",
  ACCOUNT_NAME_DUPLICATE: "يوجد حساب آخر بنفس الاسم تحت الحساب الأب نفسه.",
  YEAR_ALREADY_CLOSED: "السنة المالية مقفلة بالفعل.",
  YEAR_NOT_ENDED: "لا يمكن إقفال السنة قبل انتهائها.",
  PREVIOUS_YEAR_OPEN: "يجب إقفال السنة المالية السابقة أولاً.",
  YEAR_PERIODS_NOT_LOCKED: "يجب إقفال جميع أشهر السنة أولاً.",
  RETAINED_EARNINGS_NOT_POSTABLE: "حساب الأرباح والخسائر المرحلة (33) غير متاح للترحيل.",
  YEAR_NOT_CLOSED: "السنة المالية مفتوحة.",
  LATER_YEAR_CLOSED: "لا يمكن إعادة فتح السنة لأن سنة لاحقة مقفلة.",
  VOUCHER_COUNTER_IS_TREASURY: "لا يمكن استخدام حساب خزينة كطرف مقابل — استخدم التحويل بين الخزائن.",
  PARTY_EMPLOYEE_REQUIRED: "حساب سلف الموظفين يتطلب تحديد الموظف.",
  PARTY_ON_NON_EMPLOYEE_ACCOUNT: "لا يمكن ربط موظف إلا بحساب سلف الموظفين.",
  PARTY_EMPLOYEE_UNIT_MISMATCH: "الموظف يتبع وحدة تشغيلية أخرى غير وحدة القيد.",
  PARTY_EMPLOYEE_DELETED: "الموظف محذوف — لا تُسجَّل له سلفة جديدة، ويُقبل السداد فقط.",
  EMPLOYEE_NOT_FOUND: "الموظف غير موجود أو يتبع وحدة تشغيلية أخرى — بدّل الوحدة من الشريط العلوي.",
  VOUCHER_ALREADY_CANCELLED: "السند ملغى بالفعل.",
  INVALID_AMOUNT: "المبلغ يجب أن يكون أكبر من صفر.",
  TRANSFER_SAME_TREASURY: "لا يمكن التحويل إلى نفس الخزينة.",
  TRANSFER_CURRENCY_MISMATCH: "عملة الخزينتين مختلفة — تحويل العملات يتم عبر المشتريات.",
  TRANSFER_INSUFFICIENT_BALANCE: "رصيد الخزينة المحوَّل منها لا يكفي.",
  TRANSFER_SELF_APPROVAL: "لا يمكنك اعتماد تحويل أنشأته بنفسك.",
  TRANSFER_NOT_PENDING: "التحويل ليس بانتظار الاعتماد.",
  TRANSFER_APPROVAL_FORBIDDEN: "ليست لديك صلاحية اعتماد التحويلات.",
  FX_RATE_REQUIRED: "سعر الصرف مطلوب للعملات الأجنبية.",
  RECONCILIATION_NOT_BANK: "التسوية المصرفية متاحة لحسابات المصارف فقط.",
  RECONCILIATION_DRAFT_EXISTS: "توجد تسوية مفتوحة لهذا الحساب — أكملها أو احذفها أولاً.",
  RECONCILIATION_DATE_BEFORE_LAST: "تاريخ الكشف يجب أن يكون بعد آخر تسوية منتهية.",
  RECONCILIATION_FINISHED: "التسوية منتهية ولا يمكن تعديلها.",
  RECONCILIATION_NOT_BALANCED: "لا يمكن إنهاء التسوية قبل أن يصبح الفرق صفراً.",
  LINE_NOT_RECONCILABLE: "هذا القيد لا يخص حساب المصرف أو تاريخه بعد تاريخ الكشف.",
  LINE_ALREADY_RECONCILED: "هذا القيد مُسوّى في تسوية أخرى.",
  RECONCILIATION_FORBIDDEN: "ليست لديك صلاحية التسوية المصرفية.",
  CHEQUE_CURRENCY_UNSUPPORTED: "الشيكات بالدينار الليبي فقط حالياً.",
  CHEQUE_DEPOSIT_NOT_BANK: "يجب إيداع الشيك في حساب مصرفي.",
  CHEQUE_BANK_REQUIRED: "يجب اختيار الحساب المصرفي المسحوب عليه الشيك.",
  SUPPLIER_NOT_FOUND: "المورد غير موجود أو يتبع وحدة تشغيلية أخرى.",
  SUPPLIER_NOT_LINKED: "المورد غير مربوط بحساب في دليل الحسابات.",
  CHEQUE_COUNTER_IS_TREASURY: "لا يمكن استخدام حساب خزينة كطرف مقابل.",
  TREASURY_INSUFFICIENT_BALANCE: "رصيد الحساب المصرفي لا يكفي لصرف الشيك.",
  CHEQUE_NOT_CERTIFIED: "التحصيل المباشر من الحافظة للشيكات المصدقة فقط.",
  INVALID_CHEQUE_TRANSITION: "هذا الإجراء غير متاح لحالة الشيك الحالية.",
  CHEQUE_DATE_BEFORE_LAST_EVENT: "تاريخ الإجراء يسبق آخر حركة على الشيك.",
  CHEQUE_FORBIDDEN: "ليست لديك صلاحية إدارة الشيكات.",
  TENDER_BELOW_TOTAL: "المبلغ المستلم أقل من إجمالي الفاتورة.",
  SPLIT_TOTAL_MISMATCH: "مجموع الدفعات لا يساوي إجمالي الفاتورة.",
  SPLIT_PORTIONS_INVALID: "الدفع المجزأ يتطلب من دفعتين إلى أربع دفعات.",
  SPLIT_MULTIPLE_CASH: "يُسمح بدفعة نقدية واحدة فقط.",
  SPLIT_NOT_ALLOWED: "لا يمكن تجزئة الدفع في التحويل الداخلي.",
  CASH_ACCOUNT_REQUIRED: "اختر خزينة الدرج التي تُغلق يومها.",
  OPERATING_UNIT_REQUIRED: "يرجى اختيار الوحدة التشغيلية.",
  MATERIAL_COST_FROM_ISSUES: "تكلفة المواد محسوبة من المواد الكيماوية المصروفة لهذه الدفعة ولا تُدخل يدوياً — اصرف المواد أو أزلها بدلاً من ذلك.",
  MATERIAL_COST_ZERO_FROM_ISSUES: "لا يمكن إغلاق الدفعة: كل المواد الكيماوية المصروفة لها جاءت من لوتات بلا تكلفة مسجلة، فلا توجد تكلفة تُحمَّل على البلوكات. أزل المواد المصروفة وأدخل تكلفة المواد يدوياً من شاشة تعديل الدفعة، ثم أغلقها.",
  INSUFFICIENT_STOCK: "المخزون المتاح في مخازن الوحدة لا يغطي الكمية المطلوبة — لم يُصرف شيء.",
  MATERIAL_NOT_RAW: "لا تُصرف لعملية الإسفنج إلا المواد الخام (الكيماويات).",
  EMPTY_CONTAINERS_MISSING: "إرجاع هذه الكمية يعيد تعبئة براميل فارغة لم تعد موجودة في مخزن اللوت، لذا لا يمكن إرجاعها.",
  BATCH_HAS_MATERIALS: "لا يمكن حذف دفعة صُرفت لها مواد كيماوية — أزل المواد المصروفة أولاً لتعود إلى لوتاتها.",
  // W5-02 (HR-12): salary advances and loans. The receipt, manual-entry, reversal,
  // payroll and employee-edit screens hit some of these too, so they live here.
  ADVANCE_LIMIT_EXCEEDED: "مبلغ السلفة يتجاوز الحد المسموح (مضاعف الراتب الشهري الأساسي المحدد في إعدادات السلف).",
  ADVANCE_DEDUCTION_LIMIT: "القسط الشهري مع أقساط سلف الموظف المفتوحة الأخرى يتجاوز نسبة الاستقطاع المسموحة من راتبه — زد عدد الأقساط أو خفّض المبلغ.",
  ADVANCE_NO_MONTHLY_SALARY: "السلف والقروض للموظفين على راتب شهري فقط — ليس لهذا الموظف راتب شهري أساسي ساري.",
  ADVANCE_EMPLOYEE_INACTIVE: "الموظف منتهي الخدمة أو محذوف — لا تُطلب له سلفة ولا تُعتمد ولا تُصرف.",
  ADVANCE_START_PERIOD_PAST: "لا يبدأ الاسترداد في شهر مضى — اختر الشهر الحالي أو شهراً لاحقاً.",
  ADVANCE_START_PERIOD_CLOSED: "مسير رواتب شهر بداية الاسترداد تجاوز المراجعة — ابدأ الاسترداد في شهر لاحق.",
  ADVANCE_TREASURY_NOT_LYD: "تُصرف السلف وتُسدَّد بالدينار الليبي فقط — اختر خزينة بالدينار.",
  ADVANCE_REPAYMENT_EXCEEDS: "مبلغ السداد يتجاوز المتبقي للاسترداد على هذه السلفة.",
  ADVANCE_CANCEL_FORBIDDEN: "إلغاء سلفة معتمدة من صلاحية من يعتمد السلف فقط (المالك أو مدير الحسابات أو مدير الموارد البشرية).",
  ADVANCE_RECALCULATE_REQUIRED: "تغيّر قسط سلفة في هذا المسير بعد احتسابه (سداد نقدي) — أعد احتساب المسير قبل ترحيله.",
  ADVANCE_DEDUCTION_MANUAL: "استرداد السلف والقروض يُستقطع آلياً من جدول أقساطها (أو يُسدَّد نقداً على السلفة)، ولا يُدخل كاستقطاع يدوي.",
  ADVANCE_USE_REPAY: "لدى الموظف سلفة قيد الاسترداد، فلا يُقبل هنا إلا رصيده خارج جدول الأقساط — سجّل النقد المُعاد كسداد على السلفة من صفحة السلف والقروض.",
  ADVANCE_USE_ADVANCE_FLOW: "هذا القيد يخص سلفة موظف أو مسير رواتب استرد أقساط سلف، فلا يُعكس ولا يُلغى — ألغِ السلفة قبل صرفها، أو سجّل النقد المُعاد كسداد عليها.",
  // W5-03 (HR-13): rewards and deductions. The payroll, adjustments and reference-lookup
  // screens hit these.
  PAY_PERIOD_CLOSED:
    "مسير رواتب هذا الشهر أو شهر لاحق تجاوز المراجعة — لا تُدخل له مكافآت أو جزاءات ولا تُعتمد، ولا يُحذف المعتمد منها.",
  PAY_CODE_IN_USE:
    "هذا النوع مستخدم في بدلات أو استقطاعات ثابتة أو مكافآت وجزاءات لموظفين، فلا يُحذف ولا يُغيَّر رمزه — أوقف تفعيله بدلاً من ذلك.",
  PAYROLL_DEDUCTIONS_EXCEED_GROSS:
    "الاستقطاعات الثابتة والجزاءات لبعض الموظفين تتجاوز إجمالي رواتبهم في هذا الشهر — خفّض الجزاء أو احذفه، أو أنهِ البند الثابت في آخر يوم من الشهر السابق وأعد إضافته من الشهر التالي (أو أوقفه لهذا الاحتساب)، ثم أعد الاحتساب.",
  PAYROLL_ADJUSTMENT_UNPAID:
    "توجد مكافآت أو جزاءات معتمدة لهذا الشهر لموظفين لا قسيمة لهم فيه (منتهي الخدمة أو بالقطعة أو بلا أجر) — احذفها أو أدخلها لشهر يُصرف لهم فيه، ثم أعد الاحتساب.",
  // W5-04 (HR-14): work shifts. The shifts page and the employee forms hit these.
  WORK_SHIFT_FORBIDDEN:
    "الورديات وتعيينها للموظفين من صلاحية مدير الموارد البشرية أو مدير الحسابات أو المالك فقط، لأنها تحدد أجر الساعات الإضافية.",
  WORK_SHIFT_IN_USE: "هذه الوردية معيّنة لموظفين — انقلهم إلى وردية أخرى أولاً ثم احذفها.",
  EMPLOYEE_HAS_OPEN_ADVANCE: "على الموظف سلفة أو قرض مفتوح — سدّده أو ألغه قبل نقله إلى وحدة تشغيلية أخرى.",
  LOT_STATUS_CHANGE_NOT_ALLOWED: "تتغير حالة اللوت هنا بين «متاح» و«حجر صحي» فقط — الحجز والاستهلاك يتمان من خلال أوامر التقطيع والمبيعات والجرد.",
  // W6-02: the company profile prints on every unit's documents.
  COMPANY_PROFILE_FORBIDDEN:
    "بيانات الشركة تُطبع على مستندات كل الوحدات، فتعديلها من صلاحية المالك أو المدير على مستوى الشركة فقط (لا مدير وحدة واحدة).",
  // W6-03: database backups (company-wide owner only).
  BACKUP_FORBIDDEN:
    "النسخ الاحتياطية تضم سجلات كل الوحدات، فإدارتها من صلاحية المالك على مستوى الشركة فقط.",
  BACKUP_FAILED: "فشل أخذ النسخة الاحتياطية، وسُجّلت في القائمة كنسخة فاشلة مع سبب الفشل.",
  BACKUP_IN_PROGRESS: "توجد نسخة احتياطية قيد التنفيذ الآن — انتظر حتى تنتهي ثم أعد المحاولة.",
  BACKUP_DRIVER_UNSUPPORTED:
    "نوع قاعدة البيانات على الخادم غير مدعوم للنسخ الاحتياطي (المدعوم: SQLite و PostgreSQL).",
  BACKUP_FILE_INVALID: "اسم ملف النسخة الاحتياطية غير صالح.",
  BACKUP_FILE_MISSING: "ملف هذه النسخة الاحتياطية غير موجود على الخادم.",
  BACKUP_NOT_COMPLETED: "لا تُنزَّل ولا تُختبر إلا نسخة احتياطية مكتملة.",
  BACKUP_VERIFY_FAILED:
    "فشل اختبار الاستعادة لهذه النسخة (لا يطابق الملف بصمته، أو تعذّرت استعادته أو فحصه).",
  BACKUP_VERIFY_IN_PROGRESS: "يجري اختبار استعادة الآن — انتظر حتى ينتهي ثم أعد المحاولة.",
  BACKUP_VERIFY_NOT_CONFIGURED:
    "اختبار الاستعادة على PostgreSQL يحتاج قاعدة بيانات تجريبية مخصصة على الخادم (BACKUP_VERIFY_DATABASE) ولم تُضبط بعد.",
  BACKUP_VERIFY_SCRATCH_IS_SOURCE:
    "قاعدة بيانات اختبار الاستعادة المضبوطة هي قاعدة البيانات الفعلية نفسها — يجب أن تكون قاعدة تجريبية منفصلة.",
};

/** The Arabic message for a known refusal code, else the server's message, else the fallback. */
export const apiErrorMessage = (err: unknown, fallback: string): string => {
  const payload = apiErrorPayload(err);
  const message = (payload?.code && LEDGER_ERROR_MESSAGE[payload.code]) || payload?.message || fallback;
  // W5-02: say how much of the employee's balance a receipt or reversal may still clear.
  if (payload?.code === "ADVANCE_USE_REPAY" && payload.unscheduled_balance != null) {
    return `${message} الرصيد خارج الجدول: ${formatNumber(Number(payload.unscheduled_balance), { maximumFractionDigits: 4 })} د.ل`;
  }
  return message;
};

/** Blocks are keyed in from the completed sheet, so only these states accept them. */
export const BLOCK_ENTRY_STATES: ProductionBatchStatus[] = ["ready_for_grading", "graded"];

/** The lifecycle is strictly linear (Phase 04 §4.4) — one step, no branching. */
export const NEXT_STATUS: Record<ProductionBatchStatus, ProductionBatchStatus | null> = {
  planned: "configured",
  configured: "running",
  running: "consumed",
  consumed: "curing",
  curing: "ready_for_grading",
  ready_for_grading: "graded",
  graded: "closed",
  closed: null,
};

/** The machine's physical pour width (FOAM-01). */
export const MAX_BUN_WIDTH_M = 2.4;

export const productionApi = {
  transition: (id: string, status: ProductionBatchStatus) =>
    apiClient.post<ProductionBatch>(`/production-batches/${id}/transition`, { status }),

  getBatches: (params?: { status?: string; page?: number; per_page?: number }) =>
    apiClient.get<{ data: ProductionBatch[]; current_page: number; last_page: number; total: number }>(
      "/production-batches",
      { params },
    ),

  getBatch: (id: string) => apiClient.get<ProductionBatch>(`/production-batches/${id}`),

  createBatch: (data: CreateBatchInput) =>
    apiClient.post<ProductionBatch>("/production-batches", data),

  updateBatch: (id: string, data: Partial<CreateBatchInput> & { record_version: number }) =>
    apiClient.put<ProductionBatch>(`/production-batches/${id}`, data),

  deleteBatch: (id: string) => apiClient.delete(`/production-batches/${id}`),

  registerBlocks: (id: string, groups: BlockGroupInput[]) =>
    apiClient.post<RegisterBlocksResponse>(`/production-batches/${id}/blocks`, { groups }),

  /** W4-05: issue chemicals to an open batch; returns the batch with its materials. */
  issueMaterials: (id: string, lines: IssueMaterialLine[]) =>
    apiClient.post<ProductionBatch>(`/production-batches/${id}/materials`, { lines }),

  /** W4-05: remove an issued row; its quantity returns to the lot and its entry is reversed. */
  removeMaterial: (id: string, lineId: string) =>
    apiClient.delete<ProductionBatch>(`/production-batches/${id}/materials/${lineId}`),

  getBatchBlocks: (batchId: string) =>
    apiClient.get<{ data: StockLot[] }>("/stock-lots", {
      params: { production_batch_id: batchId, per_page: 200 },
    }),
};
