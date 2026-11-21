import { useEffect, useState } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { X } from "lucide-react";
import Layout from "../components/layout/Layout";
import LoginPage from "./auth/LoginPage";
import ChangePasswordPage from "./auth/ChangePasswordPage";
import ProtectedRoute from "../components/ProtectedRoute";
import { ServerConfigDialog } from "../components/settings/ServerConfigDialog";
import { ForceUpdateDialog } from "../components/layout/ForceUpdateDialog";
import { recordSystemVersion } from "../api/endpoints/system";
import { OwnerDashboardPage } from "./OwnerDashboardPage";
import { FinancialReportsPage } from "./accounting/FinancialReportsPage";
import { DebtorStatementsPage } from "./accounting/DebtorStatementsPage";
import { BundleSalesReportPage } from "./reports/BundleSalesReportPage";
import { SalesMarginReportPage } from "./reports/SalesMarginReportPage";
import { InstallmentsPage } from "./sales/InstallmentsPage";
import { INSTALLMENT_ROLES } from "../api/endpoints/installments";
import { StockMovementCardPage } from "./inventory/StockMovementCardPage";
import { useIsCompanyWide } from "../hooks/useAccounting";
import UsersRoutes from "../routes/UsersRoutes";
import ClientsRoutes from "../routes/ClientsRoutes";
import AdminEntitiesRoutes from "../routes/AdminEntitiesRoutes";
import EmployeesRoutes from "../routes/EmployeesRoutes";
import OperatingUnitsRoutes from "../routes/OperatingUnitsRoutes";
import BlueprintsRoutes from "../routes/BlueprintsRoutes";
import { InventoryRoutes } from "../routes/InventoryRoutes";
import { StockCountRoutes } from "../routes/StockCountRoutes";
import { ManufacturingRoutes } from "../routes/ManufacturingRoutes";
import { CutterRoutes } from "../routes/CutterRoutes";
import { FurnitureRoutes } from "../routes/FurnitureRoutes";
import { SalesRoutes } from "../routes/SalesRoutes";
import { AccountingRoutes } from "../routes/AccountingRoutes";
import { HrRoutes } from "../routes/HrRoutes";
import { SettingsRoutes } from "../routes/SettingsRoutes";
import { PrintSettingsPage } from "./settings/PrintSettingsPage";
import { ClientGroupsPage } from "./clients/ClientGroupsPage";
import { MaterialRequestsRoutes } from "../routes/MaterialRequestsRoutes";

import { CategoryHubPage } from "./hub/CategoryHubPage";

import { AuthorizedRoute } from "../components/AuthorizedRoute";
import {
  ALL_MANAGER_ROLES,
  CLIENT_GROUP_ROLES,
  DEBTOR_STATEMENT_ROLES,
  FURNITURE_ROLES,
  PRINT_SETTINGS_ROLES,
  SALES_MARGIN_ROLES,
  STOCK_COUNT_ROLES,
  STOCK_MOVEMENT_CARD_ROLES,
} from "../routes/routes.config";
import { SuppliersPage } from "./procurement/SuppliersPage";
import { PurchaseOrdersPage } from "./procurement/PurchaseOrdersPage";
import { TreasuryPage } from "./treasury/TreasuryPage";
import { TreasuryAccountsPage } from "./treasury/TreasuryAccountsPage";
import { TreasuryVouchersPage } from "./treasury/TreasuryVouchersPage";
import { TreasuryTransfersPage } from "./treasury/TreasuryTransfersPage";
import { BankReconciliationPage } from "./treasury/BankReconciliationPage";
import { ChequesPage } from "./treasury/ChequesPage";
import { Dashboard } from "./Dashboard";

/**
 * The landing screen depends on who is looking: a company-wide role gets the
 * owner oversight dashboard, unit staff keep their operational one.
 */
const HomeDashboard = () => {
  const isCompanyWide = useIsCompanyWide();

  return isCompanyWide ? <OwnerDashboardPage /> : <Dashboard />;
};

const getDesktopAppVersion = async (): Promise<string> => {
  if (typeof window !== "undefined" && window.electronAPI?.getAppVersion) {
    try {
      const v = await window.electronAPI.getAppVersion();
      if (v) return v;
    } catch {
      // fallback
    }
  }
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.24";
};

const App = () => {
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [versionHud, setVersionHud] = useState<{
    show: boolean;
    desktop: string;
    backend: string | null;
  } | null>(null);

  useEffect(() => {
    if (versionHud?.show) {
      const timer = setTimeout(() => {
        setVersionHud((prev) => (prev ? { ...prev, show: false } : null));
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [versionHud?.show]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.code === "KeyS" || e.key.toLowerCase() === "s")
      ) {
        e.preventDefault();
        setIsServerModalOpen((prev) => !prev);

        getDesktopAppVersion().then((dVer) => {
          setVersionHud({ show: true, desktop: dVer, backend: null });
          recordSystemVersion(dVer)
            .then((res) => {
              setVersionHud({
                show: true,
                desktop: dVer,
                backend: res.backend_version,
              });
            })
            .catch(() => {
              setVersionHud({ show: true, desktop: dVer, backend: "offline" });
            });
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />

          <Route path="/" element={<Layout />}>
            <Route index element={<HomeDashboard />} />
            <Route path="hub/:categoryId" element={<CategoryHubPage />} />
            <Route
              path="admin/entities/*"
              element={
                <AuthorizedRoute allowedRoles={["owner", "admin"]}>
                  <AdminEntitiesRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="admin/units/*"
              element={
                <AuthorizedRoute allowedRoles={["owner", "admin"]}>
                  <OperatingUnitsRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="admin/blueprints/*"
              element={
                <AuthorizedRoute allowedRoles={["owner", "admin"]}>
                  <BlueprintsRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="suppliers"
              element={
                <AuthorizedRoute allowedRoles={ALL_MANAGER_ROLES}>
                  <SuppliersPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="import-orders"
              element={
                <AuthorizedRoute allowedRoles={ALL_MANAGER_ROLES}>
                  <PurchaseOrdersPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="treasury"
              element={
                <AuthorizedRoute allowedRoles={ALL_MANAGER_ROLES}>
                  <TreasuryPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="treasury/cash"
              element={
                <AuthorizedRoute allowedRoles={ALL_MANAGER_ROLES}>
                  <TreasuryAccountsPage kind="cash" />
                </AuthorizedRoute>
              }
            />
            <Route
              path="treasury/banks"
              element={
                <AuthorizedRoute allowedRoles={ALL_MANAGER_ROLES}>
                  <TreasuryAccountsPage kind="bank" />
                </AuthorizedRoute>
              }
            />
            <Route
              path="treasury/vouchers"
              element={
                <AuthorizedRoute allowedRoles={ALL_MANAGER_ROLES}>
                  <TreasuryVouchersPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="treasury/transfers"
              element={
                <AuthorizedRoute allowedRoles={ALL_MANAGER_ROLES}>
                  <TreasuryTransfersPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="treasury/reconciliation"
              element={
                <AuthorizedRoute allowedRoles={ALL_MANAGER_ROLES}>
                  <BankReconciliationPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="treasury/cheques"
              element={
                <AuthorizedRoute allowedRoles={ALL_MANAGER_ROLES}>
                  <ChequesPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="employees/*"
              element={
                <AuthorizedRoute
                  allowedRoles={[
                    "owner",
                    "admin",
                    "hr-manager",
                    "accounting-manager",
                    "unit_manager",
                    "manager",
                    "foam-manager",
                    "cutter-manager",
                    "furniture-manager",
                    "store-manager",
                    "procurement-manager",
                  ]}
                >
                  <EmployeesRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="clients/*"
              element={
                <AuthorizedRoute
                  allowedRoles={[
                    "owner",
                    "admin",
                    "store-manager",
                    "pos-cashier",
                    "accounting-manager",
                    "unit_manager",
                    "manager",
                  ]}
                >
                  <ClientsRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="users/*"
              element={
                <AuthorizedRoute allowedRoles={["owner", "admin"]}>
                  <UsersRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="inventory/items/:id/movement-card"
              element={
                <AuthorizedRoute allowedRoles={STOCK_MOVEMENT_CARD_ROLES}>
                  <StockMovementCardPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="inventory/counts/*"
              element={
                <AuthorizedRoute allowedRoles={STOCK_COUNT_ROLES}>
                  <StockCountRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="inventory/*"
              element={
                <AuthorizedRoute
                  allowedRoles={[
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
                  ]}
                >
                  <InventoryRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="manufacturing/*"
              element={
                <AuthorizedRoute
                  allowedRoles={[
                    "owner",
                    "admin",
                    "foam-manager",
                    "foam-operator",
                    "unit_manager",
                    "manager",
                  ]}
                >
                  <ManufacturingRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="cutter/*"
              element={
                <AuthorizedRoute
                  allowedRoles={[
                    "owner",
                    "admin",
                    "cutter-manager",
                    "cutter-operator",
                    "unit_manager",
                    "manager",
                  ]}
                >
                  <CutterRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="furniture/*"
              element={
                <AuthorizedRoute allowedRoles={FURNITURE_ROLES} permission="view-furniture">
                  <FurnitureRoutes />
                </AuthorizedRoute>
              }
            />
            {/* Per-workstation printer setup: outranks settings/* so the POS staff reach it too. */}
            <Route
              path="settings/printing"
              element={
                <AuthorizedRoute allowedRoles={PRINT_SETTINGS_ROLES}>
                  <PrintSettingsPage />
                </AuthorizedRoute>
              }
            />
            {/* W5-06: client groups — the client managers reach it, so it outranks settings/* too. */}
            <Route
              path="settings/client-groups"
              element={
                <AuthorizedRoute allowedRoles={CLIENT_GROUP_ROLES} permission="view-clients">
                  <ClientGroupsPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="settings/*"
              element={
                <AuthorizedRoute
                  allowedRoles={[
                    "owner",
                    "admin",
                    "furniture-manager",
                    "assembler",
                    "unit_manager",
                    "manager",
                  ]}
                >
                  <SettingsRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="material-requests"
              element={
                <AuthorizedRoute
                  allowedRoles={[
                    "owner",
                    "admin",
                    "furniture-manager",
                    "cutter-manager",
                    "foam-manager",
                    "unit_manager",
                    "manager",
                  ]}
                >
                  <MaterialRequestsRoutes />
                </AuthorizedRoute>
              }
            />
            <Route
              path="sales/*"
              element={
                <AuthorizedRoute
                  allowedRoles={[
                    "owner",
                    "admin",
                    "store-manager",
                    "pos-cashier",
                    "cutter-manager",
                    "unit_manager",
                    "manager",
                  ]}
                >
                  <SalesRoutes />
                </AuthorizedRoute>
              }
            />
            {/* W5-08: outside sales/* — accounting and treasury follow installments too. */}
            <Route
              path="installments"
              element={
                <AuthorizedRoute allowedRoles={INSTALLMENT_ROLES}>
                  <InstallmentsPage />
                </AuthorizedRoute>
              }
            />
            <Route path="accounting/*" element={<AccountingRoutes />} />
            <Route path="hr/*" element={<HrRoutes />} />
            <Route
              path="reports"
              element={
                <AuthorizedRoute
                  allowedRoles={[
                    "owner",
                    "admin",
                    "accounting-manager",
                    "treasury-officer",
                    "unit_manager",
                    "manager",
                    "foam-manager",
                    "cutter-manager",
                    "furniture-manager",
                    "store-manager",
                    "procurement-manager",
                  ]}
                >
                  <FinancialReportsPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="reports/debtors"
              element={
                <AuthorizedRoute allowedRoles={DEBTOR_STATEMENT_ROLES}>
                  <DebtorStatementsPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="reports/sales-margin"
              element={
                <AuthorizedRoute allowedRoles={SALES_MARGIN_ROLES}>
                  <SalesMarginReportPage />
                </AuthorizedRoute>
              }
            />
            <Route
              path="reports/bundles"
              element={
                <AuthorizedRoute
                  allowedRoles={[
                    "owner",
                    "admin",
                    "store-manager",
                    "pos-cashier",
                    "unit_manager",
                    "manager",
                  ]}
                >
                  <BundleSalesReportPage />
                </AuthorizedRoute>
              }
            />
          </Route>
        </Route>
      </Routes>
      <ServerConfigDialog
        open={isServerModalOpen}
        onOpenChange={setIsServerModalOpen}
      />
      <ForceUpdateDialog />
      {versionHud?.show && (
        <div
          dir="ltr"
          className="fixed bottom-6 right-6 z-[999999] flex items-center gap-3 bg-neutral-900/95 text-white border border-neutral-700/80 shadow-2xl px-4 py-2.5 rounded-xl text-xs backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 duration-200 pointer-events-auto"
        >
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-neutral-300">
              Fine ERP Build
            </span>
          </div>
          <span className="text-neutral-600">|</span>
          <div className="font-mono flex items-center gap-2">
            <span>
              Desktop:{" "}
              <strong className="text-white">v{versionHud.desktop}</strong>
            </span>
            <span className="text-neutral-600">•</span>
            <span>
              Backend:{" "}
              <strong
                className={
                  versionHud.backend === "offline"
                    ? "text-rose-400"
                    : "text-emerald-400"
                }
              >
                {versionHud.backend ? `v${versionHud.backend}` : "..."}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setVersionHud(null)}
            className="ml-2 text-neutral-400 hover:text-white transition-colors p-0.5"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </Router>
  );
};

export default App;
