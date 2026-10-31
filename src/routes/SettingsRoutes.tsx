import React, { useMemo } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { SectionTabsLayout } from "../components/ui/SectionTabs";
import { ReferenceLookupPage } from "../pages/settings/ReferenceLookupPage";
import { REFERENCE_LOOKUPS, WAREHOUSE_LOOKUPS } from "../config/referenceLookups";
import { RolesPage } from "../pages/settings/RolesPage";
import { OperatingUnitsPage } from "../pages/admin/OperatingUnitsPage";
import { InventoryItemsPage } from "../pages/inventory/InventoryItemsPage";
import InventoryItemFormPage from "../pages/inventory/InventoryItemFormPage";
import InventoryItemStockLevelsPage from "../pages/inventory/InventoryItemStockLevelsPage";
import { CategoryAttributeManagerPage } from "../pages/inventory/CategoryAttributeManagerPage";
import CategoryDetailPage from "../pages/inventory/CategoryDetailPage";
import { BundlesPage } from "../pages/inventory/BundlesPage";
import BundleFormPage from "../pages/inventory/BundleFormPage";
import { WarehousesSettingsPage } from "../pages/settings/WarehousesSettingsPage";
import { AuditLogPage } from "../pages/settings/AuditLogPage";
import { usePermissions } from "../hooks/usePermissions";

const PRODUCT_TABS = [
  { path: "/settings/products/items", label: "الأصناف" },
  { path: "/settings/products/categories", label: "الفئات والخصائص" },
  { path: "/settings/products/bundles", label: "الحزم" },
];

/** One tab per reference list — add a config entry to add a tab + route. */
const DATA_TABS = REFERENCE_LOOKUPS.map((lookup) => ({
  path: `/settings/data/${lookup.path}`,
  label: lookup.title,
}));

const WAREHOUSE_TABS = [
  { path: "/settings/warehouses/list", label: "المخازن" },
  ...WAREHOUSE_LOOKUPS.map((lookup) => ({
    path: `/settings/warehouses/${lookup.path}`,
    label: lookup.title,
  })),
];

export const SettingsRoutes: React.FC = () => {
  const { hasRole } = usePermissions();
  const canManageUnits = hasRole(["owner", "admin"]);

  const companyTabs = useMemo(() => {
    const list = [
      { path: "/settings/company/roles", label: "الأدوار والصلاحيات" },
    ];
    if (canManageUnits) {
      list.push({ path: "/settings/company/units", label: "الوحدات التشغيلية" });
      // W6-01: the audit log viewer is owner/admin only (require.role:owner,admin).
      list.push({ path: "/settings/company/audit", label: "سجل التدقيق" });
    }
    return list;
  }, [canManageUnits]);

  return (
    <Routes>
      <Route index element={<Navigate to="company" replace />} />

      {/* 1 — Company settings */}
      <Route path="company" element={<SectionTabsLayout tabs={companyTabs} />}>
        <Route index element={<Navigate to="roles" replace />} />
        <Route path="roles" element={<RolesPage />} />
        {canManageUnits && <Route path="units" element={<OperatingUnitsPage />} />}
        {canManageUnits && <Route path="audit" element={<AuditLogPage />} />}
      </Route>

      {/* 2 — Product settings */}
      <Route path="products" element={<SectionTabsLayout tabs={PRODUCT_TABS} />}>
        <Route index element={<Navigate to="items" replace />} />
        <Route path="items" element={<InventoryItemsPage />} />
        <Route path="items/new" element={<InventoryItemFormPage />} />
        <Route path="items/:id/edit" element={<InventoryItemFormPage />} />
        <Route path="items/:id/levels" element={<InventoryItemStockLevelsPage />} />
        <Route path="categories" element={<CategoryAttributeManagerPage />} />
        <Route path="categories/:id" element={<CategoryDetailPage />} />
        <Route path="bundles" element={<BundlesPage />} />
        <Route path="bundles/new" element={<BundleFormPage />} />
        <Route path="bundles/:id/edit" element={<BundleFormPage />} />
      </Route>

      {/* 3 — Reference data settings (dummy data until the API lands) */}
      <Route path="data" element={<SectionTabsLayout tabs={DATA_TABS} />}>
        <Route index element={<Navigate to={REFERENCE_LOOKUPS[0].path} replace />} />
        {REFERENCE_LOOKUPS.map((lookup) => (
          <Route
            key={lookup.key}
            path={lookup.path}
            element={<ReferenceLookupPage config={lookup} />}
          />
        ))}
      </Route>

      {/* 4 — Warehouse settings: real warehouse (+ sub-warehouse) CRUD, plus the location-type lookup */}
      <Route path="warehouses" element={<SectionTabsLayout tabs={WAREHOUSE_TABS} />}>
        <Route index element={<Navigate to="list" replace />} />
        <Route path="list" element={<WarehousesSettingsPage />} />
        {WAREHOUSE_LOOKUPS.map((lookup) => (
          <Route
            key={lookup.key}
            path={lookup.path}
            element={<ReferenceLookupPage config={lookup} />}
          />
        ))}
      </Route>

      {/* Legacy flat paths from the previous settings layout */}
      <Route path="items" element={<Navigate to="/settings/products/items" replace />} />
      <Route path="categories" element={<Navigate to="/settings/products/categories" replace />} />
      <Route path="roles" element={<Navigate to="/settings/company/roles" replace />} />
      <Route path="units" element={<Navigate to="/settings/company/units" replace />} />
      <Route path="server" element={<Navigate to="/settings/company/roles" replace />} />
      <Route path="*" element={<Navigate to="/settings/company/roles" replace />} />
    </Routes>
  );
};
