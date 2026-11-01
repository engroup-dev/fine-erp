import type { LucideIcon } from "lucide-react";
import { REFERENCE_LOOKUPS, WAREHOUSE_LOOKUPS } from "../config/referenceLookups";
import { INSTALLMENT_PERMISSION, INSTALLMENT_ROLES } from "../api/endpoints/installments";
import {
  BadgeDollarSign,
  Banknote,
  BarChart3,
  BookOpenText,
  Boxes,
  Building,
  Building2,
  CalendarCheck2,
  CalendarOff,
  Gift,
  Clock,
  HandCoins,
  Database,
  Warehouse,
  Droplets,
  FileSpreadsheet,
  Factory,
  Layers,
  LayoutGrid,
  ListTree,
  Package,
  Package2,
  PackageCheck,
  Receipt,
  Scale,
  Scissors,
  ShieldCheck,
  ShoppingCart,
  Tags,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
  Truck,
  Wallet,
  CalendarClock,
  ArrowLeftRight,
  ListChecks,
  FileCheck,
  Printer,
  ClipboardCheck,
  Gauge,
  Hourglass,
  Sofa,
} from "lucide-react";

export interface AppNavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  allowedRoles?: string[];
  /**
   * Backend view permission the screen needs (config/permissions.php). The
   * item shows only when the user's role is allowed AND they hold it —
   * the same two checks the API makes (require.role + require.module).
   */
  permission?: string;
}

export interface BreadcrumbEntry {
  path: string;
  label: string;
}

export const ALL_MANAGER_ROLES = [
  "owner",
  "admin",
  "accounting-manager",
  "treasury-officer",
  "procurement-manager",
  "hr-manager",
  "inventory-manager",
  "foam-manager",
  "cutter-manager",
  "furniture-manager",
  "store-manager",
  "unit_manager",
  "manager",
];

export const SETTINGS_ROLES = [
  "owner",
  "admin",
  "furniture-manager",
  "assembler",
  "unit_manager",
  "manager",
];

/** Receipt printer / cash drawer setup is per workstation, so the POS staff configure it too. */
export const PRINT_SETTINGS_ROLES = [
  ...SETTINGS_ROLES,
  "store-manager",
  "pos-cashier",
  "cutter-manager",
];

/**
 * W5-06: the client groups settings page. Everyone with client access reads
 * the groups; writing them is checked again on the page (company-wide only).
 */
export const CLIENT_GROUP_ROLES = [
  "owner",
  "admin",
  "store-manager",
  "accounting-manager",
  "unit_manager",
  "manager",
];

export const DEBTOR_STATEMENT_ROLES = [
  "owner",
  "accounting-manager",
  "manager",
  "unit_manager",
  "treasury-officer",
];

export const SALES_MARGIN_ROLES = [
  "owner",
  "accounting-manager",
  "unit_manager",
  "manager",
  "inventory-manager",
  "foam-manager",
  "foam-operator",
  "cutter-manager",
  "cutter-operator",
  "furniture-manager",
  "assembler",
  "store-manager",
  "pos-cashier",
  "procurement-manager",
  "treasury-officer",
];

export const STOCK_MOVEMENT_CARD_ROLES = [
  "owner",
  "admin",
  "foam-manager",
  "foam-operator",
  "cutter-manager",
  "cutter-operator",
  "furniture-manager",
  "assembler",
  "store-manager",
  "pos-cashier",
  "procurement-manager",
  "treasury-officer",
  "accounting-manager",
  "unit_manager",
  "manager",
  "inventory-manager",
];

/** Who works in the inventory section (ledger, transfers). */
export const INVENTORY_ROLES = [
  "owner",
  "admin",
  "inventory-manager",
  "foam-manager",
  "foam-operator",
  "cutter-manager",
  "cutter-operator",
  "furniture-manager",
  "assembler",
  "store-manager",
  "unit_manager",
  "manager",
];

/** Internal restock (/sales/restock): who raises and works restock requests. */
export const RESTOCK_ROLES = ["owner", "admin", "store-manager", "pos-cashier", "unit_manager", "manager"];

/** Stock counts (W4-01, decision #13): who opens and enters a count. */
export const STOCK_COUNT_COUNTER_ROLES = [
  "owner", "admin", "inventory-manager", "unit_manager", "manager",
  // A unit's own manager role counts its warehouses (decision #13 default).
  "foam-manager", "cutter-manager", "furniture-manager", "store-manager", "procurement-manager",
];

/** Stock counts: who approves one (with approve-stock-counts; never the counter). */
export const STOCK_COUNT_APPROVER_ROLES = ["owner", "admin", "accounting-manager"];

/** Stock counts: who sees them — the counters and the approvers. */
export const STOCK_COUNT_ROLES = [...STOCK_COUNT_COUNTER_ROLES, "accounting-manager"];

/**
 * Furniture assembly orders (W4-07, decision #12): the roles the API lets in
 * (owner and admin always pass). Reading needs view-furniture, opening an
 * order create-furniture, completing or cancelling it edit-furniture.
 */
export const FURNITURE_ROLES = ["owner", "admin", "furniture-manager", "assembler"];

export const navItems: AppNavItem[] = [
  { id: "dashboard", path: "/", label: "لوحة التحكم", icon: LayoutGrid },
  { id: "admin-entities", path: "/admin/entities", label: "إدارة الكيانات (مشرف)", icon: Building2, allowedRoles: ["owner", "admin"] },
  { id: "admin-units", path: "/admin/units", label: "إدارة الوحدات التشغيلية", icon: Building, allowedRoles: ["owner", "admin"] },
  { id: "admin-blueprints", path: "/admin/blueprints", label: "قوالب الوحدات", icon: Layers, allowedRoles: ["owner", "admin"] },
  { id: "suppliers", path: "/suppliers", label: "الموردون", icon: Truck, allowedRoles: ALL_MANAGER_ROLES, permission: "view-procurement" },
  { id: "import-orders", path: "/import-orders", label: "مشتريات", icon: Package, allowedRoles: ALL_MANAGER_ROLES, permission: "view-procurement" },
  { id: "treasury", path: "/treasury", label: "الخزينة وسعر الصرف", icon: Wallet, allowedRoles: ALL_MANAGER_ROLES, permission: "view-treasury" },
  { id: "treasury-vouchers", path: "/treasury/vouchers", label: "سندات القبض والصرف", icon: Receipt, allowedRoles: ALL_MANAGER_ROLES, permission: "view-treasury" },
  { id: "treasury-transfers", path: "/treasury/transfers", label: "التحويلات بين الخزائن", icon: ArrowLeftRight, allowedRoles: ALL_MANAGER_ROLES, permission: "view-treasury" },
  { id: "bank-reconciliation", path: "/treasury/reconciliation", label: "التسوية المصرفية", icon: ListChecks, allowedRoles: ALL_MANAGER_ROLES, permission: "view-treasury" },
  { id: "cheques", path: "/treasury/cheques", label: "الشيكات", icon: FileCheck, allowedRoles: ALL_MANAGER_ROLES, permission: "view-treasury" },
  { id: "employees", path: "/employees", label: "الموظفون والعمالة", icon: UserCheck, allowedRoles: ["owner", "admin", "hr-manager", "accounting-manager", "unit_manager", "manager", "foam-manager", "cutter-manager", "furniture-manager", "store-manager", "procurement-manager"], permission: "view-hr" },
  { id: "clients", path: "/clients", label: "العملاء", icon: Users, allowedRoles: ["owner", "admin", "store-manager", "pos-cashier", "accounting-manager", "unit_manager", "manager"], permission: "view-clients" },
  { id: "inventory", path: "/inventory/ledger", label: "المخزون والقطع", icon: Boxes, allowedRoles: INVENTORY_ROLES, permission: "view-inventory" },
  { id: "stock-counts", path: "/inventory/counts", label: "الجرد", icon: ClipboardCheck, allowedRoles: STOCK_COUNT_ROLES, permission: "view-inventory" },
  { id: "reorder-report", path: "/inventory/reorder", label: "تقرير إعادة الطلب", icon: Gauge, allowedRoles: INVENTORY_ROLES, permission: "view-inventory" },
  { id: "stagnant-stock", path: "/inventory/stagnant", label: "المخزون الراكد", icon: Hourglass, allowedRoles: INVENTORY_ROLES, permission: "view-inventory" },
  {
    id: "manufacturing",
    path: "/manufacturing/batches",
    label: "التصنيع",
    icon: Factory,
    allowedRoles: ["owner", "admin", "foam-manager", "foam-operator", "unit_manager", "manager"],
    permission: "view-foam",
  },
  { id: "assembly-orders", path: "/furniture/assembly", label: "أوامر التجميع", icon: Sofa, allowedRoles: FURNITURE_ROLES, permission: "view-furniture" },
  { id: "cutter", path: "/cutter/orders", label: "التقطيع", icon: Scissors, allowedRoles: ["owner", "admin", "cutter-manager", "cutter-operator", "unit_manager", "manager"], permission: "view-cutting" },
  { id: "material-requests", path: "/material-requests", label: "طلبات المواد (MRs)", icon: PackageCheck, allowedRoles: ["owner", "admin", "furniture-manager", "cutter-manager", "foam-manager", "unit_manager", "manager"], permission: "view-material-requests" },
  { id: "pos", path: "/sales/pos", label: "المبيعات ونقطة البيع", icon: ShoppingCart, allowedRoles: ["owner", "admin", "store-manager", "pos-cashier", "cutter-manager", "unit_manager", "manager"], permission: "view-sales" },
  { id: "installments", path: "/installments", label: "الأقساط", icon: CalendarClock, allowedRoles: INSTALLMENT_ROLES, permission: INSTALLMENT_PERMISSION },
  { id: "restock", path: "/sales/restock", label: "التزويد الداخلي", icon: Truck, allowedRoles: RESTOCK_ROLES, permission: "view-inventory" },
  { id: "attendance", path: "/hr/attendance", label: "الحضور والانصراف", icon: CalendarCheck2, allowedRoles: ["owner", "admin", "hr-manager", "accounting-manager", "unit_manager", "manager", "foam-manager", "cutter-manager", "furniture-manager", "store-manager", "procurement-manager"], permission: "view-hr" },
  { id: "labor-rates", path: "/hr/rates", label: "أجور الأدوار", icon: BadgeDollarSign, allowedRoles: ["owner", "admin", "hr-manager", "accounting-manager"], permission: "view-hr" },
  { id: "payroll", path: "/hr/payroll", label: "مسير الرواتب", icon: Banknote, allowedRoles: ["owner", "admin", "hr-manager", "accounting-manager"], permission: "view-hr" },
  { id: "leave", path: "/hr/leave", label: "طلبات الإجازة", icon: CalendarOff, allowedRoles: ["owner", "admin", "hr-manager", "accounting-manager", "unit_manager", "manager", "foam-manager", "cutter-manager", "furniture-manager", "store-manager", "procurement-manager"], permission: "view-hr" },
  { id: "employee-advances", path: "/hr/advances", label: "السلف والقروض", icon: HandCoins, allowedRoles: ["owner", "admin", "hr-manager", "accounting-manager", "unit_manager", "manager", "foam-manager", "cutter-manager", "furniture-manager", "store-manager", "procurement-manager"], permission: "view-hr" },
  { id: "employee-adjustments", path: "/hr/adjustments", label: "المكافآت والجزاءات", icon: Gift, allowedRoles: ["owner", "admin", "hr-manager", "accounting-manager", "unit_manager", "manager", "foam-manager", "cutter-manager", "furniture-manager", "store-manager", "procurement-manager"], permission: "view-hr" },
  { id: "work-shifts", path: "/hr/shifts", label: "الورديات والعمل الإضافي", icon: Clock, allowedRoles: ["owner", "admin", "hr-manager", "accounting-manager", "unit_manager", "manager", "foam-manager", "cutter-manager", "furniture-manager", "store-manager", "procurement-manager"], permission: "view-hr" },
  { id: "journal", path: "/accounting/journal", label: "دفتر اليومية", icon: BookOpenText, allowedRoles: ["owner", "admin", "accounting-manager"], permission: "view-accounting" },
  { id: "accounts", path: "/accounting/accounts", label: "شجرة الحسابات", icon: ListTree, allowedRoles: ["owner", "admin", "accounting-manager"], permission: "view-accounting" },
  { id: "trial-balance", path: "/accounting/trial-balance", label: "ميزان المراجعة", icon: Scale, allowedRoles: ["owner", "admin", "accounting-manager"], permission: "view-accounting" },
  { id: "fiscal-periods", path: "/accounting/periods", label: "الفترات المحاسبية", icon: CalendarClock, allowedRoles: ["owner", "admin", "accounting-manager"], permission: "view-accounting" },
  { id: "overhead", path: "/accounting/overhead", label: "المصاريف العمومية", icon: Droplets, allowedRoles: ["owner", "admin", "accounting-manager"], permission: "view-accounting" },
  { id: "fixed-assets", path: "/accounting/assets", label: "الأصول الثابتة", icon: Building, allowedRoles: ["owner", "admin", "accounting-manager"], permission: "view-accounting" },
  { id: "reports", path: "/reports", label: "التقارير المالية", icon: BarChart3, allowedRoles: ["owner", "admin", "accounting-manager", "treasury-officer", "unit_manager", "manager", "foam-manager", "cutter-manager", "furniture-manager", "store-manager", "procurement-manager"], permission: "view-accounting" },
  { id: "debtor-statements", path: "/reports/debtors", label: "كشف حساب المدينين", icon: FileSpreadsheet, allowedRoles: DEBTOR_STATEMENT_ROLES, permission: "view-debtor-statements" },
  { id: "sales-margin", path: "/reports/sales-margin", label: "هامش ربح المبيعات", icon: TrendingUp, allowedRoles: SALES_MARGIN_ROLES, permission: "view-accounting" },
  { id: "reports-bundles", path: "/reports/bundles", label: "تقرير مبيعات الحزم", icon: Package2, allowedRoles: ["owner", "admin", "store-manager", "pos-cashier", "unit_manager", "manager"], permission: "view-accounting" },
  { id: "users", path: "/users", label: "المستخدمون والصلاحيات", icon: ShieldCheck, allowedRoles: ["owner", "admin"] },
  { id: "settings-company", path: "/settings/company", label: "إعدادات الشركة", icon: Building2, allowedRoles: ["owner", "admin"] },
  { id: "settings-products", path: "/settings/products", label: "إعدادات المنتجات", icon: Tags, allowedRoles: SETTINGS_ROLES, permission: "view-inventory" },
  { id: "settings-data", path: "/settings/data", label: "إعدادات البيانات", icon: Database, allowedRoles: ["owner", "admin"] },
  { id: "settings-warehouses", path: "/settings/warehouses", label: "إعدادات المخازن", icon: Warehouse, allowedRoles: SETTINGS_ROLES, permission: "view-inventory" },
  { id: "settings-printing", path: "/settings/printing", label: "إعدادات الطباعة", icon: Printer, allowedRoles: PRINT_SETTINGS_ROLES },
  { id: "settings-client-groups", path: "/settings/client-groups", label: "مجموعات العملاء", icon: UsersRound, allowedRoles: CLIENT_GROUP_ROLES, permission: "view-clients" },
];

export const getBreadcrumbEntries = (
  pathname: string,
  dynamicLabel = "…",
): BreadcrumbEntry[] => {
  const normalizedPath =
    pathname === "/" ? "/" : pathname.replace(/\/+$/, "") || "/";
  const entries: BreadcrumbEntry[] = [{ path: "/", label: "لوحة التحكم" }];

  if (normalizedPath === "/") {
    return entries;
  }

  if (normalizedPath.startsWith("/hub/")) {
    const categoryId = normalizedPath.split("/")[2];
    const categoryLabels: Record<string, string> = {
      partners: "الكيانات والشركاء",
      procurement: "التوريد والاعتمادات",
      production: "الإنتاج والمخازن",
      furniture: "الأثاث",
      sales: "المبيعات والمعارض",
      hr: "الموارد البشرية",
      finance: "المالية والتقارير",
      admin: "إدارة النظام",
      settings: "الإعدادات",
    };
    if (categoryId && categoryLabels[categoryId]) {
      entries.push({ path: normalizedPath, label: categoryLabels[categoryId] });
      return entries;
    }
  }

  // Longest matching path wins so /reports/debtors beats its parent /reports.
  const matchingItem = navItems
    .filter(
      (item) =>
        item.path !== "/" &&
        (normalizedPath === item.path || normalizedPath.startsWith(`${item.path}/`)),
    )
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (matchingItem) {
    entries.push({ path: matchingItem.path, label: matchingItem.label });
  }

  // A sale, its bundle-definition or return page, and a return's own page
  // are not tabs of the POS hub but still belong under it in the breadcrumb:
  // /sales/{id}[/bundles/{id}|/return], /sales/returns/{id} — never
  // /sales/pos or /sales/restock (those already matched above).
  const isSaleDetailPath = /^\/sales\/(?!pos\b|restock\b)[^/]+/.test(normalizedPath);
  if (isSaleDetailPath && !matchingItem) {
    const posItem = navItems.find((item) => item.id === "pos");
    if (posItem) {
      entries.push({ path: posItem.path, label: posItem.label });
    }
  }

  if (
    normalizedPath.startsWith("/clients/") ||
    normalizedPath.startsWith("/employees/") ||
    normalizedPath.startsWith("/admin/entities/") ||
    normalizedPath.startsWith("/inventory/") ||
    normalizedPath.startsWith("/manufacturing/batches/") ||
    normalizedPath.startsWith("/cutter/orders/") ||
    normalizedPath.startsWith("/furniture/assembly/") ||
    isSaleDetailPath ||
    normalizedPath.startsWith("/accounting/accounts/")
  ) {
    entries.push({
      path: normalizedPath,
      label: normalizedPath === "/furniture/assembly/new" ? "أمر تجميع جديد" : dynamicLabel,
    });
  }

  if (normalizedPath.startsWith("/settings/")) {
    entries.push({ path: "/settings", label: "الإعدادات" });

    const settingsSections: Record<string, { label: string; pages: Record<string, string> }> = {
      company: {
        label: "إعدادات الشركة",
        pages: {
          roles: "الأدوار والصلاحيات",
          profile: "بيانات الشركة",
          units: "الوحدات التشغيلية",
          audit: "سجل التدقيق",
        },
      },
      products: {
        label: "إعدادات المنتجات",
        pages: {
          items: "الأصناف",
          categories: "الفئات والخصائص",
          bundles: "الحزم",
        },
      },
      data: {
        label: "إعدادات البيانات",
        pages: Object.fromEntries(
          REFERENCE_LOOKUPS.map((lookup) => [lookup.path, lookup.title]),
        ),
      },
      printing: {
        label: "إعدادات الطباعة",
        pages: {},
      },
      "client-groups": {
        label: "مجموعات العملاء",
        pages: {},
      },
      warehouses: {
        label: "إعدادات المخازن",
        pages: {
          list: "المخازن",
          ...Object.fromEntries(
            WAREHOUSE_LOOKUPS.map((lookup) => [lookup.path, lookup.title]),
          ),
        },
      },
    };

    const [, , sectionId, pageId] = normalizedPath.split("/");
    const section = sectionId ? settingsSections[sectionId] : undefined;

    if (section) {
      entries.push({ path: `/settings/${sectionId}`, label: section.label });
      const pageLabel = pageId ? section.pages[pageId] : undefined;
      if (pageLabel) {
        entries.push({ path: `/settings/${sectionId}/${pageId}`, label: pageLabel });
      }
    }
  }

  return entries;
};
