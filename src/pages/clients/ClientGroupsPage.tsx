import React, { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import {
  useCanWriteClientGroups,
  useClientGroups,
  useCreateClientGroup,
  useDeleteClientGroup,
  useUpdateClientGroup,
} from "../../hooks/useClientGroups";
import {
  PRICE_TIER_LABEL,
  clientGroupErrorMessage,
  type ClientGroup,
  type ClientPriceTier,
} from "../../api/endpoints/clientGroups";
import { apiErrorMessage } from "../../api/endpoints/production";
import { formatNumber } from "../../lib/utils/format";
import { toast } from "../../stores/toastStore";
import { DataTable, useDataTable, type ColumnDef } from "../../components/ui/DataTable";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";

const input =
  "w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none focus:border-app-accent";
const label = "block text-xs font-semibold text-app-label-secondary mb-1";

const GroupForm: React.FC<{ group: ClientGroup | null; onDone: () => void }> = ({ group, onDone }) => {
  const create = useCreateClientGroup();
  const update = useUpdateClientGroup();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState(group?.code ?? "");
  const [name, setName] = useState(group?.name ?? "");
  const [creditLimit, setCreditLimit] = useState(group ? String(group.default_credit_limit) : "0");
  const [termsDays, setTermsDays] = useState(group ? String(group.default_payment_terms_days) : "30");
  const [priceTier, setPriceTier] = useState<ClientPriceTier>(group?.default_price_tier ?? "retail");
  // The version the form was read from, so a concurrent edit conflicts instead of being overwritten.
  const [baseVersion] = useState(group?.record_version ?? 0);
  const pending = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const limit = Number(creditLimit);
    const days = Number(termsDays);
    if (!code.trim()) {
      setError("أدخل رمز المجموعة.");
      return;
    }
    if (!name.trim()) {
      setError("أدخل اسم المجموعة.");
      return;
    }
    if (creditLimit.trim() === "" || !Number.isFinite(limit) || limit < 0) {
      setError("الحد الائتماني الافتراضي رقم لا يقل عن صفر.");
      return;
    }
    if (termsDays.trim() === "" || !Number.isInteger(days) || days < 0 || days > 3650) {
      setError("فترة السداد الافتراضية عدد أيام صحيح بين 0 و3650.");
      return;
    }
    const payload = {
      code: code.trim(),
      name: name.trim(),
      default_credit_limit: limit,
      default_payment_terms_days: days,
      default_price_tier: priceTier,
    };
    const onError = (err: unknown) => setError(clientGroupErrorMessage(err, "تعذر حفظ المجموعة."));
    if (group) {
      update.mutate(
        { id: group.id, payload: { ...payload, record_version: baseVersion } },
        {
          onSuccess: () => {
            toast.success("تم حفظ المجموعة");
            onDone();
          },
          onError,
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success("تمت إضافة المجموعة");
          onDone();
        },
        onError,
      });
    }
  };

  return (
    <>
      <DialogBody>
        <form id="client-group-form" onSubmit={submit} className="space-y-4" dir="rtl">
          {error && (
            <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
              {error}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>
                الرمز <span className="text-app-status-danger">*</span>
              </label>
              <input
                className={`${input} font-mono`}
                value={code}
                maxLength={30}
                onChange={(e) => setCode(e.target.value)}
                placeholder="مثال: WHL"
                dir="ltr"
                required
              />
            </div>
            <div className="col-span-2">
              <label className={label}>
                اسم المجموعة <span className="text-app-status-danger">*</span>
              </label>
              <input
                className={input}
                value={name}
                maxLength={100}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: تجار الجملة"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>الحد الائتماني الافتراضي (LYD)</label>
              <input
                type="number"
                min="0"
                step="any"
                className={`${input} font-mono`}
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>فترة السداد الافتراضية (أيام)</label>
              <input
                type="number"
                min="0"
                max="3650"
                step="1"
                className={`${input} font-mono`}
                value={termsDays}
                onChange={(e) => setTermsDays(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>التسعير الافتراضي في نقطة البيع</label>
              <select className={input} value={priceTier} onChange={(e) => setPriceTier(e.target.value as ClientPriceTier)}>
                <option value="retail">{PRICE_TIER_LABEL.retail}</option>
                <option value="wholesale">{PRICE_TIER_LABEL.wholesale}</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-app-label-tertiary">
            يأخذ العميل الجديد في هذه المجموعة حدها الائتماني وفترة سدادها ما لم تُحدَّد له قيم أخرى. تعديل المجموعة لاحقاً أو نقل
            عميل إليها لا يغيّر حد العميل ولا فترة سداده. عند اختيار عميل من مجموعة تسعيرها جملة تبدأ نقطة البيع على الجملة، ويبقى
            التبديل متاحاً.
          </p>
        </form>
      </DialogBody>
      <DialogFooter>
        <button type="button" onClick={onDone} className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1">
          إلغاء
        </button>
        <button
          type="submit"
          form="client-group-form"
          disabled={pending}
          className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </DialogFooter>
    </>
  );
};

/** W5-06: company-wide client groups and the defaults their new clients take. */
export const ClientGroupsPage: React.FC = () => {
  const { data: groups = [], isLoading, error: loadError } = useClientGroups();
  const remove = useDeleteClientGroup();
  const canWrite = useCanWriteClientGroups();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientGroup | null>(null);
  const [toDelete, setToDelete] = useState<ClientGroup | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (!toDelete) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success("تم حذف المجموعة");
        setToDelete(null);
      },
      onError: (err) => {
        setToDelete(null);
        toast.error(clientGroupErrorMessage(err, "تعذر حذف المجموعة."));
      },
    });
  };

  const columns = useMemo<ColumnDef<ClientGroup, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        header: "الرمز",
        meta: { className: "font-mono font-semibold text-app-label-primary" },
        cell: ({ row }) => <span dir="ltr">{row.original.code}</span>,
      },
      {
        accessorKey: "name",
        header: "المجموعة",
        meta: { className: "font-bold text-app-label-primary" },
        cell: ({ row }) => row.original.name,
      },
      {
        accessorKey: "default_credit_limit",
        header: "الحد الائتماني الافتراضي",
        meta: { align: "end", className: "font-mono" },
        cell: ({ row }) => `${formatNumber(Number(row.original.default_credit_limit))} د.ل`,
      },
      {
        accessorKey: "default_payment_terms_days",
        header: "فترة السداد الافتراضية",
        meta: { align: "end", className: "font-mono" },
        cell: ({ row }) => `${row.original.default_payment_terms_days} يوم`,
      },
      {
        accessorKey: "default_price_tier",
        header: "التسعير الافتراضي",
        meta: { exportValue: (g) => PRICE_TIER_LABEL[g.default_price_tier] ?? g.default_price_tier },
        cell: ({ row }) => (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              row.original.default_price_tier === "wholesale"
                ? "bg-app-accent/15 text-app-accent"
                : "bg-app-fill-f1 text-app-label-secondary"
            }`}
          >
            {PRICE_TIER_LABEL[row.original.default_price_tier] ?? row.original.default_price_tier}
          </span>
        ),
      },
      ...(canWrite
        ? [
            {
              id: "actions",
              header: "",
              enableSorting: false,
              meta: { export: false, align: "end" as const },
              cell: ({ row }: { row: { original: ClientGroup } }) => (
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => {
                      setEditing(row.original);
                      setFormOpen(true);
                    }}
                    title="تعديل المجموعة"
                    className="p-1.5 rounded-lg border border-app-separator text-app-label-secondary hover:text-app-accent hover:border-app-accent"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setToDelete(row.original)}
                    title="حذف المجموعة"
                    className="p-1.5 rounded-lg border border-app-separator text-app-label-secondary hover:text-app-status-danger hover:border-app-status-danger"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ),
            } satisfies ColumnDef<ClientGroup, unknown>,
          ]
        : []),
    ],
    [canWrite],
  );

  const table = useDataTable({
    exportFileName: "client-groups",
    columns,
    data: groups,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 20,
    getRowId: (g) => g.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <UsersRound className="w-7 h-7 text-app-accent" />
            مجموعات العملاء
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            مجموعات على مستوى الشركة (مثل الجملة والتجزئة والمؤسسات) تحدد الحد الائتماني وفترة السداد الافتراضيين للعميل الجديد،
            والتسعير الذي تبدأ به نقطة البيع لعملائها. يضيفها ويعدّلها المالك أو مدير المعرض أو مدير الحسابات أو مدير الوحدة
            المعيَّن على مستوى الشركة.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> مجموعة جديدة
          </button>
        )}
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-center text-xs text-app-status-danger">
          {apiErrorMessage(loadError, "تعذر تحميل مجموعات العملاء.")}
        </div>
      ) : (
        <DataTable table={table}>
          <DataTable.Header>
            <DataTable.Toolbar>
              <DataTable.SearchInput placeholder="بحث بالرمز أو الاسم..." />
            </DataTable.Toolbar>
          </DataTable.Header>
          <DataTable.Content isLoading={isLoading} emptyMessage="لا توجد مجموعات عملاء بعد." emptyIcon={UsersRound} />
          <DataTable.Pagination />
        </DataTable>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل مجموعة العملاء" : "مجموعة عملاء جديدة"}</DialogTitle>
            <DialogClose />
          </DialogHeader>
          {/* Remounts on each open so the form starts from the selected group. */}
          {formOpen && <GroupForm key={editing?.id ?? "new"} group={editing} onDone={() => setFormOpen(false)} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        isLoading={remove.isPending}
        title="حذف مجموعة العملاء"
        message={
          toDelete
            ? `ستُحذف المجموعة «${toDelete.name}». لا تُحذف مجموعة عليها عملاء؛ انقلهم إلى مجموعة أخرى أولاً.`
            : ""
        }
        confirmText="حذف"
        variant="danger"
      />
    </div>
  );
};

export default ClientGroupsPage;
