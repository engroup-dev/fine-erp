import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Boxes, DollarSign, History, Hourglass, Layers, PackageSearch } from "lucide-react";
import { useWarehouseStockSummary, useWarehouseLedger } from "../../hooks/useInventory";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useWarehouseStockSummaryColumns } from "../../components/table-columns/warehouseStockSummaryColumns";
import { useInventoryMovementColumns } from "../../components/table-columns/inventoryMovementColumns";
import { formatNumber } from "../../lib/utils/format";
import type { WarehouseStockSummaryRow } from "../../api/endpoints/inventory";

type Tab = "items" | "history";

const WarehouseLedgerDetailPage: React.FC = () => {
  const { warehouseId } = useParams<{ warehouseId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("items");

  const { data: summary, isLoading: isLoadingSummary } = useWarehouseStockSummary(warehouseId);
  const { data: ledger, isLoading: isLoadingLedger } = useWarehouseLedger(warehouseId, { per_page: 50 });

  const itemColumns = useWarehouseStockSummaryColumns();
  const itemRows = useMemo(() => summary?.rows ?? [], [summary]);
  const itemsTable = useDataTable({
    exportFileName: "warehouse-stock",
    columns: itemColumns,
    data: itemRows,
    enableSorting: true,
    pageSize: 10,
    getRowId: (r) => r.inventory_item_id,
  });

  const movementColumns = useInventoryMovementColumns();
  const movementRows = useMemo(() => ledger?.data ?? [], [ledger]);
  const historyTable = useDataTable({
    exportFileName: "warehouse-movements",
    columns: movementColumns,
    data: movementRows,
    enableSorting: true,
    pageSize: 10,
    getRowId: (m) => m.id,
  });

  const totalQuantity = useMemo(
    () => itemRows.reduce((sum, r) => sum + Number(r.total_quantity), 0),
    [itemRows],
  );
  const overallAvgCost = totalQuantity > 0 ? (summary?.total_value ?? 0) / totalQuantity : 0;

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate("/inventory/ledger")}
          className="rounded-xl border border-app-separator bg-app-bg-secondary p-2 hover:bg-app-fill-f1 transition-colors"
          aria-label="رجوع"
        >
          <ArrowRight className="w-4 h-4 text-app-label-secondary" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-app-label-primary">
            {summary?.warehouse.name ?? "المخزن"}
          </h1>
          <p className="text-xs text-app-label-secondary mt-0.5">أصناف المخزن ومتوسط أسعارها، وسجل حركاته.</p>
        </div>
        {/* W4-04: this warehouse's stagnant lots. */}
        {warehouseId && (
          <Link
            to={`/inventory/stagnant?warehouse_id=${encodeURIComponent(warehouseId)}`}
            className="ms-auto flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-2 text-xs font-bold text-app-label-primary shadow-sm hover:bg-app-fill-f1 transition-colors"
          >
            <Hourglass className="w-4 h-4 text-app-accent" /> المخزون الراكد
          </Link>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-app-bg-primary p-5 rounded-2xl border border-app-separator shadow-sm flex items-center gap-4">
          <div className="p-3 bg-app-accent-subtle text-app-accent rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-app-label-secondary">القيمة الإجمالية</div>
            <div className="text-xl font-bold text-app-label-primary">
              {formatNumber(summary?.total_value)} LYD
            </div>
          </div>
        </div>

        <div className="bg-app-bg-primary p-5 rounded-2xl border border-app-separator shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-app-label-secondary">عدد الأصناف</div>
            <div className="text-xl font-bold text-app-label-primary">{itemRows.length} صنف</div>
          </div>
        </div>

        <div className="bg-app-bg-primary p-5 rounded-2xl border border-app-separator shadow-sm flex items-center gap-4">
          <div className="p-3 bg-sky-100 text-sky-800 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs uppercase font-semibold text-app-label-secondary">متوسط سعر الوحدة (عام)</div>
            <div className="text-xl font-bold text-app-label-primary">{formatNumber(overallAvgCost)} LYD</div>
          </div>
        </div>
      </div>

      {/* Local tabs */}
      <div className="flex items-center gap-2 border-b border-app-separator">
        <button
          onClick={() => setActiveTab("items")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === "items"
              ? "border-app-accent text-app-accent"
              : "border-transparent text-app-label-secondary hover:text-app-label-primary"
          }`}
        >
          <PackageSearch className="w-4 h-4" /> المخزون
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
            activeTab === "history"
              ? "border-app-accent text-app-accent"
              : "border-transparent text-app-label-secondary hover:text-app-label-primary"
          }`}
        >
          <History className="w-4 h-4" /> السجل
        </button>
      </div>

      {activeTab === "items" ? (
        <DataTable table={itemsTable}>
          <DataTable.Content
            isLoading={isLoadingSummary}
            emptyMessage="لا توجد أصناف متاحة في هذا المخزن."
            emptyIcon={PackageSearch}
            onRowClick={(row: WarehouseStockSummaryRow) =>
              navigate(`/inventory/ledger/${warehouseId}/items/${row.inventory_item_id}`)
            }
          />
          <DataTable.Pagination />
        </DataTable>
      ) : (
        <DataTable table={historyTable}>
          <DataTable.Content
            isLoading={isLoadingLedger}
            emptyMessage="لا توجد حركات مسجلة لهذا المخزن."
            emptyIcon={History}
          />
          <DataTable.Pagination />
        </DataTable>
      )}
    </div>
  );
};

export default WarehouseLedgerDetailPage;
