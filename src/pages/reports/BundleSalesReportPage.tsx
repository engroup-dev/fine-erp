import React, { useMemo, useState } from "react";
import { Package2 } from "lucide-react";
import { useBundleSalesReport } from "../../hooks/useBundles";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useBundleSalesColumns } from "../../components/table-columns/bundleSalesColumns";
import { formatNumber } from "../../lib/utils/format";

export const BundleSalesReportPage: React.FC = () => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const report = useBundleSalesReport({ from: from || undefined, to: to || undefined });
  const columns = useBundleSalesColumns();

  const rows = useMemo(() => report.data?.rows ?? [], [report.data]);
  const table = useDataTable({
    exportFileName: "bundle-sales",
    columns,
    data: rows,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 20,
    getRowId: (r) => r.bundle_id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
          <Package2 className="w-7 h-7 text-app-accent" />
          تقرير مبيعات الحزم
        </h1>
        <p className="text-xs text-app-label-secondary mt-1">
          عدد الطلبات والكمية والإيرادات لكل حزمة، خلال الفترة المحددة.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-app-label-secondary">
          من
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-app-label-secondary">
          إلى
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
          />
        </label>
      </div>

      {report.isLoading ? (
        <div className="flex h-48 items-center justify-center text-xs text-app-label-secondary">جارٍ التحميل…</div>
      ) : (
        <DataTable table={table}>
          <DataTable.Header>
            <DataTable.Toolbar>
              <DataTable.SearchInput placeholder="بحث باسم الحزمة…" />
            </DataTable.Toolbar>
          </DataTable.Header>
          <DataTable.Content emptyMessage="لا توجد مبيعات حزم في هذه الفترة." emptyIcon={Package2} />
          {rows.length > 0 && (
            <div className="flex items-center justify-between gap-4 border-t-2 border-app-separator bg-app-bg-secondary px-4 py-2.5 text-xs font-bold">
              <span className="text-app-label-primary">إجمالي الإيرادات</span>
              <span className="font-mono text-app-status-positive">{formatNumber(report.data?.total_revenue ?? 0)}</span>
            </div>
          )}
          <DataTable.Pagination />
        </DataTable>
      )}
    </div>
  );
};
