import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tags, Plus } from "lucide-react";
import { useRootItemCategories } from "../../hooks/useCategories";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useItemCategoriesColumns } from "../../components/table-columns/itemCategoriesColumns";
import { CategoryFormDialog } from "../../components/inventory/CategoryFormDialog";
import { ItemCategory } from "../../api/endpoints/categories";

export const CategoryAttributeManagerPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: categories, isLoading } = useRootItemCategories();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const openCategory = (category: ItemCategory) => {
    navigate(`/settings/products/categories/${category.id}`);
  };

  const columns = useItemCategoriesColumns({ onOpen: openCategory });

  const tableData = useMemo(() => categories ?? [], [categories]);
  const table = useDataTable({
    exportFileName: "item-categories",
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 20,
    getRowId: (c) => c.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Tags className="w-7 h-7 text-app-accent" />
            الفئات
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            الفئات الرئيسية للأصناف. افتح فئة لإدارة فروعها الفرعية وتعديل بياناتها.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" /> إضافة فئة رئيسية
        </button>
      </div>

      <DataTable table={table}>
        <DataTable.Header>
          <DataTable.Toolbar>
            <DataTable.SearchInput placeholder="بحث بالاسم أو الرمز…" />
          </DataTable.Toolbar>
        </DataTable.Header>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد فئات بعد."
          emptyIcon={Tags}
          onRowClick={openCategory}
        />
        <DataTable.Pagination />
      </DataTable>

      <CategoryFormDialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
};
