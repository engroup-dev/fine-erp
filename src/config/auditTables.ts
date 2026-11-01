/**
 * W6-01: Arabic names for the audited tables (AppServiceProvider's AuditObserver
 * registrations plus the supplier merge row), and the desktop page each record
 * opens on. A table missing here shows its raw name and has no link.
 */
export const AUDIT_TABLE_LABELS: Record<string, string> = {
  users: "المستخدمون",
  operating_units: "الوحدات التشغيلية",
  companies: "الشركة",
  warehouses: "المخازن",
  roles: "الأدوار",
  inventory_items: "الأصناف",
  item_categories: "فئات الأصناف",
  bundles: "الحزم",
  bundle_items: "مكونات الحزم",
  stock_lots: "اللوطات",
  item_stock_levels: "حدود المخزون",
  warehouse_transfers: "التحويلات المخزنية",
  warehouse_transfer_lines: "بنود التحويلات المخزنية",
  production_batches: "دفعات الإنتاج",
  production_batch_materials: "مواد دفعات الإنتاج",
  overhead_expenses: "المصاريف العمومية",
  fixed_assets: "الأصول الثابتة",
  payroll_runs: "مسيرات الرواتب",
  treasury_vouchers: "سندات الخزينة",
  treasury_transfers: "تحويلات الخزينة",
  bank_reconciliations: "التسويات البنكية",
  cheques: "الشيكات",
  quotations: "عروض الأسعار",
  accounts: "الحسابات",
  employees: "الموظفون",
  employee_compensations: "تعويضات الموظفين",
  employee_advances: "السلف والقروض",
  advance_installments: "أقساط السلف",
  employee_pay_items: "بنود الرواتب",
  employee_adjustments: "المكافآت والجزاءات",
  work_shifts: "الورديات",
  clients: "العملاء",
  client_addresses: "عناوين العملاء",
  client_groups: "مجموعات العملاء",
  client_credit_limit_changes: "تغييرات حد الائتمان",
  entities: "الكيانات",
  suppliers: "الموردون",
  sales_orders: "أوامر البيع",
  sales_returns: "مرتجعات المبيعات",
  sales_return_lines: "بنود المرتجعات",
  installment_plans: "خطط التقسيط",
  installment_lines: "الأقساط",
  pos_shifts: "ورديات نقاط البيع",
  stock_counts: "الجرد",
  stock_count_lines: "بنود الجرد",
  journal_entries: "قيود اليومية",
  cutter_work_orders: "أوامر التقطيع",
  assembly_orders: "أوامر التجميع",
  assembly_order_lines: "بنود أوامر التجميع",
  internal_restock_requests: "طلبات التزويد الداخلي",
  material_requests: "طلبات المواد",
  purchase_order_items: "بنود أوامر الشراء",
  fiscal_years: "السنوات المالية",
  fiscal_periods: "الفترات المحاسبية",
  backups: "النسخ الاحتياطية",
};

export const auditTableLabel = (table: string): string => AUDIT_TABLE_LABELS[table] ?? table;

/** Tables whose records have a detail page in the desktop app. */
const RECORD_PATHS: Record<string, (id: string) => string> = {
  users: (id) => `/users/${id}`,
  operating_units: (id) => `/admin/units/${id}`,
  warehouses: (id) => `/inventory/ledger/${id}`,
  inventory_items: (id) => `/settings/products/items/${id}/edit`,
  item_categories: (id) => `/settings/products/categories/${id}`,
  bundles: (id) => `/settings/products/bundles/${id}/edit`,
  warehouse_transfers: (id) => `/inventory/transfers/${id}`,
  production_batches: (id) => `/manufacturing/batches/${id}`,
  accounts: (id) => `/accounting/accounts/${id}`,
  employees: (id) => `/employees/${id}`,
  clients: (id) => `/clients/${id}`,
  sales_orders: (id) => `/sales/${id}`,
  sales_returns: (id) => `/sales/returns/${id}`,
  stock_counts: (id) => `/inventory/counts/${id}`,
  cutter_work_orders: (id) => `/cutter/orders/${id}`,
  assembly_orders: (id) => `/furniture/assembly/${id}`,
};

/** The page a logged record opens on, or null when its table has none. */
export const auditRecordPath = (table: string, recordId: string): string | null =>
  RECORD_PATHS[table]?.(recordId) ?? null;
