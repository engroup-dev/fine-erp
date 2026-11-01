import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInventoryItems } from "../../hooks/useInventory";
import { useItemCategories } from "../../hooks/useCategories";
import { Package, Plus, Search, Filter } from "lucide-react";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useInventoryItemsColumns } from "../../components/table-columns/inventoryItemsColumns";
import { inventoryApi, type InventoryItem } from "../../api/endpoints/inventory";
import { fetchAllPages } from "../../lib/utils/fetchAllPages";

export const InventoryItemsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  // Server paging: the endpoint returns 15 rows a page by default.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);

  const { data: itemData, isLoading } = useInventoryItems(
    {
      search: searchTerm || undefined,
      item_type: typeFilter || undefined,
      category_id: categoryFilter || undefined,
      page,
      per_page: perPage,
    },
    { keepPrevious: true },
  );

  const { data: categories } = useItemCategories();

  const openCreatePage = () => navigate("/settings/products/items/new");
  const openEditPage = (item: InventoryItem) => navigate(`/settings/products/items/${item.id}/edit`);

  const columns = useInventoryItemsColumns({ onEdit: openEditPage });

  const tableData = useMemo(() => itemData?.data ?? [], [itemData]);
  const itemsTable = useDataTable({
    exportFileName: "inventory-items",
    // Every page under the current filters, not just the one on screen.
    fetchAllRowsForExport: () =>
      fetchAllPages(async (p, size) =>
        (
          await inventoryApi.getItems({
            search: searchTerm || undefined,
            item_type: typeFilter || undefined,
            category_id: categoryFilter || undefined,
            page: p,
            per_page: size,
          })
        ).data,
      ),
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: false,
    getRowId: (item) => item.id,
    serverPagination: {
      page,
      perPage,
      total: itemData?.total ?? 0,
      lastPage: itemData?.last_page ?? 1,
      onChange: (p, size) => {
        setPage(p);
        setPerPage(size);
      },
    },
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Package className="w-7 h-7 text-app-accent" />
            سجل الأصناف الرئيسي
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            كتالوج المواد الخام وقوالب الإسفنج والقطع المشذبة والشرائح والأصناف
            القابلة للبيع، مع تعيينات الخصائص المخصصة.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreatePage}
            className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> إضافة صنف مخزون
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-app-bg-primary p-4 rounded-2xl border border-app-separator shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute start-3 top-3 text-app-label-tertiary" />
          <input
            type="text"
            aria-label="بحث في الأصناف"
            placeholder="بحث برمز الصنف أو الاسم…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full ps-9 pe-4 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs text-app-label-primary placeholder-app-label-tertiary focus:border-app-accent focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-app-label-secondary" />
          <span className="text-xs font-semibold text-app-label-secondary">
            الفئة:
          </span>
          <div className="min-w-[12rem]">
            <SearchableSelect<{ id: string; name: string }>
              options={categories ?? []}
              value={categories?.find((c) => c.id === categoryFilter) ?? null}
              onChange={(c) => {
                setCategoryFilter(c ? c.id : "");
                setPage(1);
              }}
              getOptionId={(c) => c.id}
              getOptionLabel={(c) => c.name}
              placeholder="كل الفئات"
              size="sm"
            />
          </div>

          <span className="text-xs font-semibold text-app-label-secondary">
            النوع:
          </span>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-app-separator rounded-xl bg-app-bg-secondary text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
          >
            <option value="">كل أنواع الأصناف</option>
            <option value="raw_material">مادة خام</option>
            <option value="foam_block">قالب إسفنج</option>
            <option value="cut_template_piece">قطعة قالب تشذيب</option>
            <option value="slice">شريحة</option>
            <option value="byproduct_fill">حشو ثانوي</option>
            <option value="furniture_finished_good">منتج أثاث تام</option>
            <option value="barrel">برميل</option>
            <option value="pallet">منصة نقالة</option>
          </select>
        </div>
      </div>

      {/* Items Table */}
      <DataTable table={itemsTable}>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد أصناف مخزون."
          emptyIcon={Package}
        />
        <DataTable.Pagination />
      </DataTable>
    </div>
  );
};
