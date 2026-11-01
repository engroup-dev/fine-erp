import React, { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowRight, ChevronDown, ChevronLeft, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import {
  useItemCategory,
  useItemCategories,
  useDeleteItemCategory,
} from "../../hooks/useCategories";
import { ITEM_TYPE_LABELS, InventoryItemType, ItemCategory } from "../../api/endpoints/categories";
import { CategoryFormDialog } from "../../components/inventory/CategoryFormDialog";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { apiErrorMessage } from "../../api/endpoints/production";
import { toast } from "../../stores/toastStore";

interface CategoryTreeNode {
  category: ItemCategory;
  children: CategoryTreeNode[];
}

/** Every descendant of `rootId`, nested by parent_id — not just direct children. */
const buildSubtree = (categories: ItemCategory[], rootId: string): CategoryTreeNode[] => {
  const byParent = new Map<string, ItemCategory[]>();
  for (const c of categories) {
    if (!c.parent_id) continue;
    byParent.set(c.parent_id, [...(byParent.get(c.parent_id) ?? []), c]);
  }
  const attach = (parentId: string): CategoryTreeNode[] =>
    (byParent.get(parentId) ?? []).map((c) => ({ category: c, children: attach(c.id) }));
  return attach(rootId);
};

const countNodes = (nodes: CategoryTreeNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);

const CategoryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: category, isLoading, isError } = useItemCategory(id);
  const { data: parent } = useItemCategory(category?.parent_id ?? undefined);
  const { data: allCategories, isLoading: isLoadingChildren } = useItemCategories();

  const deleteMutation = useDeleteItemCategory();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  // Collapsed-state tracking: a node is expanded unless its id is in this set.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const openChild = (child: ItemCategory) => {
    navigate(`/settings/products/categories/${child.id}`);
  };

  const toggleExpanded = (categoryId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const subtree = useMemo(
    () => (id && allCategories ? buildSubtree(allCategories, id) : []),
    [allCategories, id],
  );
  const descendantCount = useMemo(() => countNodes(subtree), [subtree]);

  const renderTreeNode = (node: CategoryTreeNode, depth: number): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = !collapsed.has(node.category.id);

    return (
      <React.Fragment key={node.category.id}>
        <div
          className="flex items-center gap-1 px-2 py-1"
          style={{ paddingInlineStart: `${8 + depth * 20}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpanded(node.category.id)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-app-label-tertiary hover:bg-app-fill-f1 hover:text-app-label-primary"
              title={isExpanded ? "طي" : "توسيع"}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="h-6 w-6 shrink-0" />
          )}
          <button
            type="button"
            onClick={() => openChild(node.category)}
            className="flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-app-fill-f1 transition-colors"
          >
            <span className="font-mono text-[11px] font-bold text-app-label-secondary shrink-0">
              {node.category.code}
            </span>
            <span className="text-xs font-bold text-app-label-primary truncate">
              {node.category.name}
            </span>
            {node.category.item_type && (
              <span className="shrink-0 rounded-full bg-app-accent-subtle px-2 py-0.5 text-[10px] font-semibold text-app-accent">
                {ITEM_TYPE_LABELS[node.category.item_type as InventoryItemType] ?? node.category.item_type}
              </span>
            )}
            {hasChildren && (
              <span className="ms-auto shrink-0 text-[10px] text-app-label-tertiary">
                {node.children.length} فرع
              </span>
            )}
          </button>
        </div>
        {hasChildren && isExpanded && node.children.map((child) => renderTreeNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-app-label-secondary">
        جارٍ تحميل بيانات الفئة…
      </div>
    );
  }

  if (isError || !category || !id) {
    return (
      <div className="space-y-4 p-6" dir="rtl">
        <button
          type="button"
          onClick={() => navigate("/settings/products/categories")}
          className="flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline"
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى الفئات
        </button>
        <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-6 text-center text-app-status-danger text-sm">
          تعذر العثور على بيانات الفئة.
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(category.id);
      toast.success("تم حذف الفئة بنجاح");
      setIsDeleteOpen(false);
      navigate(category.parent_id ? `/settings/products/categories/${category.parent_id}` : "/settings/products/categories");
    } catch (err: unknown) {
      // CATEGORY_HAS_CHILDREN / CATEGORY_HAS_ITEMS (W6-06) map to Arabic in apiErrorMessage.
      toast.error(apiErrorMessage(err, "فشل حذف الفئة"));
    }
  };

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex items-center gap-2 text-xs text-app-label-secondary">
        <Link
          to="/settings/products/categories"
          className="flex items-center gap-1 font-semibold text-app-accent hover:underline"
        >
          <ArrowRight className="h-4 w-4" />
          الفئات
        </Link>
        {category.parent_id && (
          <>
            <span>/</span>
            <Link
              to={`/settings/products/categories/${category.parent_id}`}
              className="font-semibold text-app-accent hover:underline"
            >
              {parent?.name ?? "…"}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="font-semibold text-app-label-primary">{category.name}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
            <Tags className="w-6 h-6 text-app-accent" />
            {category.name}
          </h1>
          <span className="rounded-md bg-app-fill-f1 px-2 py-0.5 font-mono text-xs font-semibold text-app-label-secondary">
            {category.code}
          </span>
          {category.item_type && (
            <span className="rounded-full bg-app-accent-subtle px-2.5 py-0.5 text-xs font-semibold text-app-accent">
              {ITEM_TYPE_LABELS[category.item_type as InventoryItemType] ?? category.item_type}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsAddChildOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-app-accent px-2.5 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" />
            إضافة فئة فرعية
          </button>
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2.5 py-1.5 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-accent"
          >
            <Pencil className="w-3.5 h-3.5" />
            تعديل الفئة
          </button>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2.5 py-1.5 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-status-danger"
          >
            <Trash2 className="w-3.5 h-3.5" />
            حذف الفئة
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4">
        <h2 className="mb-3 text-xs font-bold uppercase text-app-label-secondary">معلومات الفئة</h2>
        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-app-label-secondary">جزء الرمز (code_segment)</dt>
            <dd className="mt-0.5 font-mono font-semibold text-app-label-primary">
              {category.code_segment || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-app-label-secondary">الرمز الكامل (code)</dt>
            <dd className="mt-0.5 font-mono font-semibold text-app-label-primary">{category.code}</dd>
          </div>
          <div>
            <dt className="text-app-label-secondary">طول رمز الفروع</dt>
            <dd className="mt-0.5 font-mono font-semibold text-app-label-primary">
              {category.child_code_length ?? "—"}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <dt className="text-app-label-secondary">الوصف</dt>
            <dd className="mt-0.5 text-app-label-primary">{category.description || "—"}</dd>
          </div>
        </dl>
      </div>

      {!category.parent_id && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
            الفئات الفرعية
            <span className="text-[11px] font-normal text-app-label-tertiary">
              ({descendantCount})
            </span>
          </h2>

          <div className="overflow-hidden rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
            {isLoadingChildren ? (
              <div className="flex h-32 items-center justify-center text-xs text-app-label-secondary">
                جارٍ التحميل…
              </div>
            ) : subtree.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-app-label-tertiary">
                <Tags className="h-8 w-8 text-app-label-secondary/40" />
                <span className="text-xs font-semibold text-app-label-secondary">
                  لا توجد فئات فرعية بعد.
                </span>
              </div>
            ) : (
              <div className="divide-y divide-app-separator">
                {subtree.map((node) => renderTreeNode(node, 0))}
              </div>
            )}
          </div>
        </div>
      )}

      <CategoryFormDialog
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        category={category}
        parentCode={category.parent_id ? (parent?.code ?? "") : ""}
        parentChildCodeLength={category.parent_id ? (parent?.child_code_length ?? undefined) : undefined}
      />

      <CategoryFormDialog
        open={isAddChildOpen}
        onClose={() => setIsAddChildOpen(false)}
        parentId={category.id}
        parentLabel={category.name}
        parentCode={category.code}
        parentChildCodeLength={category.child_code_length ?? undefined}
      />

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="تأكيد حذف الفئة"
        message={`هل أنت متأكد من حذف الفئة "${category.name}"؟ لا يمكن التراجع عن هذه العملية.`}
        confirmText="حذف"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default CategoryDetailPage;
