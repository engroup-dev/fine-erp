import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, Hourglass, PackagePlus, Warehouse as WarehouseIcon } from "lucide-react";
import { useWarehouses } from "../../hooks/useWarehouses";
import { useInventoryItems } from "../../hooks/useInventory";
import { StockIntakeModal } from "./StockIntakeModal";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useWarehousesColumns } from "../../components/table-columns/warehousesColumns";
import type { Warehouse } from "../../types/entities";

export const WarehousesLedgerPage: React.FC = () => {
  const navigate = useNavigate();
  const { operatingUnitId } = useServerConfigStore();

  const { data: warehouses, isLoading } = useWarehouses();
  const [intakeOpen, setIntakeOpen] = useState(false);
  // Goods intake is the only manual way stock enters: it records the INV-06
  // movement and posts the value, unlike a bare lot insert.
  const { data: itemsPage } = useInventoryItems({ per_page: 100 });

  const columns = useWarehousesColumns();
  const tableData = useMemo(() => warehouses ?? [], [warehouses]);
  const table = useDataTable({
    exportFileName: "warehouses",
    columns,
    data: tableData,
    enableSorting: true,
    pageSize: 10,
    getRowId: (w) => w.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <WarehouseIcon className="w-7 h-7 text-app-accent" />
            سجل المخزون المسلسل والدفعات
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            اختر مخزناً لعرض أصنافه المتاحة ومتوسط أسعارها، وسجل حركاته.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* W4-04: lots that have not really moved for a while, across the warehouses. */}
          <Link
            to="/inventory/stagnant"
            className="flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-2 text-xs font-bold text-app-label-primary shadow-sm hover:bg-app-fill-f1 transition-all active:scale-95"
          >
            <Hourglass className="w-4 h-4 text-app-accent" /> المخزون الراكد
          </Link>
          {operatingUnitId && (
            <>
              <button
                onClick={() => setIntakeOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-2 text-xs font-bold text-app-label-primary shadow-sm hover:bg-app-fill-f1 transition-all active:scale-95"
              >
                <PackagePlus className="w-4 h-4 text-app-accent" /> استلام مخزون
              </button>
              <button
                onClick={() => navigate("/inventory/transfers")}
                className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
              >
                <ArrowLeftRight className="w-4 h-4" /> نقل بين المخازن
              </button>
            </>
          )}
        </div>
      </div>

      <DataTable table={table}>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد مخازن مسجلة."
          emptyIcon={WarehouseIcon}
          onRowClick={(w: Warehouse) => navigate(`/inventory/ledger/${w.id}`)}
        />
        <DataTable.Pagination />
      </DataTable>

      {intakeOpen && <StockIntakeModal items={itemsPage?.data ?? []} onClose={() => setIntakeOpen(false)} />}
    </div>
  );
};
