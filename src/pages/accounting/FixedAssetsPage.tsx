import React, { useMemo, useState } from "react";
import { Building, Plus, AlertTriangle, CalendarClock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  useFixedAssets,
  useFixedAssetSchedule,
  useCreateFixedAsset,
  useDepreciateAsset,
  useDisposeAsset,
  useTransitionAsset,
} from "../../hooks/useFixedAssets";
import { getOperatingUnits } from "../../api/endpoints/operatingUnits";
import { apiErrorMessage } from "../../api/endpoints/production";
import { TreasurySelect } from "../../components/treasury/TreasurySelect";
import { formatNumber } from "../../lib/utils/format";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { CoaAccountSelector } from "../../components/accounting/CoaAccountSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useFixedAssetsColumns } from "../../components/table-columns/fixedAssetsColumns";
import { useFixedAssetsScheduleColumns } from "../../components/table-columns/fixedAssetsScheduleColumns";
import {
  type DepreciationMethod,
  type FixedAsset,
} from "../../api/endpoints/fixedAssets";
import { type CoaAction, type NewCoaAccountPayload } from "../../types/entities";

const num = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const FixedAssetsPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<FixedAsset | null>(null);
  const [disposing, setDisposing] = useState<FixedAsset | null>(null);
  const [proceeds, setProceeds] = useState("");
  const [assetTreasuryId, setAssetTreasuryId] = useState("");
  const [disposeTreasuryId, setDisposeTreasuryId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  const [form, setForm] = useState({
    name: "",
    asset_code: "",
    acquisition_cost: "",
    acquisition_date: new Date().toISOString().slice(0, 10),
    depreciation_method: "straight_line" as DepreciationMethod,
    useful_life_years: "5",
    salvage_value: "0",
    payment_source: "cash" as "cash" | "payable",
    scope: "unit" as "company" | "unit",
    operating_unit_id: "",
  });

  // COA link (mirrors client/supplier). Default "none" preserves the legacy
  // behaviour of posting to the universal "14" Fixed Assets account.
  const [coaAction, setCoaAction] = useState<CoaAction>("none");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<NewCoaAccountPayload>({
    parent_account_id: "",
    account_code: "",
    name: "",
    currency: "LYD",
  });

  const resetCoaForm = () => {
    setCoaAction("none");
    setSelectedAccountId(null);
    setNewAccount({
      parent_account_id: "",
      account_code: "",
      name: "",
      currency: "LYD",
    });
  };

  const { data: assets, isLoading } = useFixedAssets();
  const { data: units } = useQuery({ queryKey: ["operatingUnits"], queryFn: () => getOperatingUnits() });
  const { data: schedule } = useFixedAssetSchedule(scheduleFor?.id);
  const createMutation = useCreateFixedAsset();
  const depreciateMutation = useDepreciateAsset();
  const disposeMutation = useDisposeAsset();
  const transitionMutation = useTransitionAsset();

  const fail = (err: unknown, fallback: string) => setError(apiErrorMessage(err, fallback));

  const submitAsset = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (coaAction === "link_existing" && !selectedAccountId) {
      setError("يرجى اختيار الحساب المراد ربطه من دليل الحسابات");
      return;
    }
    if (coaAction === "create_new") {
      if (!newAccount.parent_account_id) {
        setError("يرجى اختيار الحساب الأب لإنشاء حساب في دليل الحسابات");
        return;
      }
      if (!newAccount.account_code.trim()) {
        setError("يرجى إدخال رمز الحساب الفرعي");
        return;
      }
      if (!newAccount.name.trim()) {
        setError("يرجى إدخال اسم الحساب المالي");
        return;
      }
    }

    createMutation.mutate(
      {
        name: form.name,
        asset_code: form.asset_code,
        acquisition_cost: num(form.acquisition_cost),
        acquisition_date: form.acquisition_date,
        depreciation_method: form.depreciation_method,
        useful_life_years: num(form.useful_life_years),
        salvage_value: num(form.salvage_value),
        payment_source: form.payment_source,
        cash_account_id: form.payment_source === "cash" ? assetTreasuryId : undefined,
        is_company_wide: form.scope === "company",
        operating_unit_id: form.scope === "unit" ? form.operating_unit_id : undefined,
        coa_action: coaAction,
        account_id: coaAction === "link_existing" ? selectedAccountId : undefined,
        new_account: coaAction === "create_new" ? newAccount : undefined,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          resetCoaForm();
        },
        onError: (err) => fail(err, "تعذر تسجيل الأصل."),
      },
    );
  };

  const runDepreciation = (asset: FixedAsset) => {
    setError(null);
    depreciateMutation.mutate(
      { id: asset.id, period },
      { onError: (err) => fail(err, "تعذر تسجيل الإهلاك.") },
    );
  };

  const submitDisposal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disposing) return;
    setError(null);
    disposeMutation.mutate(
      {
        id: disposing.id,
        proceeds: num(proceeds),
        cashAccountId: num(proceeds) > 0 ? disposeTreasuryId : undefined,
      },
      {
        onSuccess: () => { setDisposing(null); setProceeds(""); setDisposeTreasuryId(""); },
        onError: (err) => fail(err, "تعذر استبعاد الأصل."),
      },
    );
  };

  const bookValue = (a: FixedAsset) =>
    Number(a.acquisition_cost) - Number(a.accumulated_depreciation);

  const openDispose = (asset: FixedAsset) => {
    setDisposing(asset);
    setError(null);
  };

  const toggleSchedule = (asset: FixedAsset) =>
    setScheduleFor(scheduleFor?.id === asset.id ? null : asset);

  const transitionAsset = (id: string, status: "active" | "under_maintenance") =>
    transitionMutation.mutate({ id, status });

  const columns = useFixedAssetsColumns({
    period,
    isDepreciating: depreciateMutation.isPending,
    bookValue,
    onDepreciate: runDepreciation,
    onTransition: transitionAsset,
    onOpenDispose: openDispose,
    onToggleSchedule: toggleSchedule,
  });

  const tableData = useMemo(() => assets?.data ?? [], [assets]);
  const assetsTable = useDataTable({
    exportFileName: "fixed-assets",
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (a) => a.id,
  });

  const scheduleColumns = useFixedAssetsScheduleColumns();
  const scheduleData = useMemo(() => schedule?.rows ?? [], [schedule]);
  const scheduleTable = useDataTable({
    exportFileName: "depreciation-schedule",
    columns: scheduleColumns,
    data: scheduleData,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (row) => row.period,
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Building className="w-7 h-7 text-app-accent" />
            الأصول الثابتة (Fixed Assets)
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            الشراء يُرسمل الأصل، والإهلاك الشهري يُقيد تلقائيًا أول كل شهر (ويمكن تشغيله يدويًا هنا).
            الاستبعاد يسوّي القيمة الدفترية مقابل المتحصلات ويقيد الفرق ربحًا أو خسارة.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-app-label-secondary">
            فترة الإهلاك:
            <input
              type="month" value={period} max={new Date().toISOString().slice(0, 7)}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-xl border border-app-separator bg-app-bg-secondary px-2 py-1.5 text-xs font-mono text-app-label-primary focus:outline-none"
            />
          </label>
          <button
            onClick={() => { setShowForm(true); setError(null); }}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> تسجيل أصل
          </button>
        </div>
      </div>

      {error && !showForm && !disposing && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <DataTable table={assetsTable}>
        <DataTable.Header>
          <DataTable.Toolbar>
            <DataTable.SearchInput placeholder="بحث بالاسم أو الرمز أو الوحدة..." />
          </DataTable.Toolbar>
        </DataTable.Header>
        <DataTable.Content isLoading={isLoading} emptyMessage="لا توجد أصول مسجلة." emptyIcon={Building} />
        <DataTable.Pagination />
      </DataTable>

      {scheduleFor && schedule && (
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
          <div className="flex items-center gap-2 border-b border-app-separator p-4">
            <CalendarClock className="w-4 h-4 text-app-accent" />
            <span className="text-sm font-bold text-app-label-primary">
              جدول إهلاك {scheduleFor.name}
            </span>
            <span className="ms-auto font-mono text-xs text-app-label-secondary">
              القيمة الدفترية الحالية: {formatNumber(schedule.book_value)}
            </span>
          </div>
          <DataTable table={scheduleTable} className="rounded-none border-0 shadow-none">
            <DataTable.Content
              className="max-h-64 overflow-y-auto"
              emptyMessage="لا توجد بيانات جدول إهلاك."
              emptyIcon={CalendarClock}
            />
          </DataTable>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>تسجيل أصل ثابت</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody className="space-y-3">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form id="fixed-asset-form" onSubmit={submitAsset} className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">اسم الأصل</label>
                  <input
                    type="text" required placeholder="مثال: سيارة نقل"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">الرمز (Code)</label>
                  <input
                    type="text" required placeholder="FA-1001"
                    value={form.asset_code}
                    onChange={(e) => setForm({ ...form, asset_code: e.target.value })}
                    className="w-32 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">تكلفة الشراء (LYD)</label>
                  <input
                    type="number" step="0.01" min="0.01" required placeholder="0.00"
                    value={form.acquisition_cost}
                    onChange={(e) => setForm({ ...form, acquisition_cost: e.target.value })}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">قيمة الخردة (LYD)</label>
                  <input
                    type="number" step="0.01" min="0" placeholder="0.00"
                    value={form.salvage_value}
                    onChange={(e) => setForm({ ...form, salvage_value: e.target.value })}
                    className="w-28 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">تاريخ الشراء</label>
                  <input
                    type="date" required value={form.acquisition_date} max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })}
                    className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">طريقة الإهلاك</label>
                  <select
                    value={form.depreciation_method}
                    onChange={(e) => setForm({ ...form, depreciation_method: e.target.value as DepreciationMethod })}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                  >
                    <option value="straight_line">قسط ثابت</option>
                    <option value="declining_balance">قسط متناقص (مضاعف)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">العمر الافتراضي (سنوات)</label>
                  <input
                    type="number" min="1" max="100" required placeholder="5"
                    value={form.useful_life_years}
                    onChange={(e) => setForm({ ...form, useful_life_years: e.target.value })}
                    className="w-28 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">طريقة السداد</label>
                  <select
                    value={form.payment_source}
                    onChange={(e) => setForm({ ...form, payment_source: e.target.value as "cash" | "payable" })}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                  >
                    <option value="cash">دفع نقدي</option>
                    <option value="payable">آجل</option>
                  </select>
                </div>
              </div>

              {form.payment_source === "cash" && (
                <TreasurySelect value={assetTreasuryId} onChange={setAssetTreasuryId} label="الخزينة التي دُفع منها" />
              )}

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">النطاق</label>
                  <select
                    value={form.scope}
                    onChange={(e) => setForm({ ...form, scope: e.target.value as "company" | "unit" })}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                  >
                    <option value="unit">تابع لوحدة</option>
                    <option value="company">على مستوى الشركة</option>
                  </select>
                </div>
                {form.scope === "unit" && (
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">الوحدة التشغيلية</label>
                    <SearchableSelect<{ id: string; name: string }>
                      options={units ?? []}
                      value={
                        units?.find((u) => u.id === form.operating_unit_id) ??
                        null
                      }
                      onChange={(u) =>
                        setForm({ ...form, operating_unit_id: u ? u.id : "" })
                      }
                      getOptionId={(u) => u.id}
                      getOptionLabel={(u) => u.name}
                      placeholder="اختر الوحدة…"
                      required
                    />
                  </div>
                )}
              </div>

              <CoaAccountSelector
                entityTypeLabel="الأصل الثابت"
                defaultEntityName={form.name}
                currency="LYD"
                action={coaAction}
                onActionChange={setCoaAction}
                selectedAccountId={selectedAccountId}
                onSelectedAccountIdChange={setSelectedAccountId}
                newAccount={newAccount}
                onNewAccountChange={setNewAccount}
                preferredParentCode="14"
              />

            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="fixed-asset-form"
              disabled={
                createMutation.isPending ||
                num(form.acquisition_cost) <= 0 ||
                (form.scope === "unit" && !form.operating_unit_id) ||
                (form.payment_source === "cash" && !assetTreasuryId)
              }
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {createMutation.isPending ? "جارٍ التسجيل…" : "تسجيل ورسملة"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(disposing)} onOpenChange={(next) => !next && setDisposing(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <div>
              {disposing && (
                <>
                  <DialogTitle>استبعاد {disposing.name}</DialogTitle>
                  <DialogDescription>
                    القيمة الدفترية الحالية {formatNumber(bookValue(disposing))}. الفرق بين المتحصلات والقيمة الدفترية
                    يُقيد ربحًا أو خسارة استبعاد.
                  </DialogDescription>
                </>
              )}
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody className="space-y-3">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form id="dispose-asset-form" onSubmit={submitDisposal} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">متحصلات البيع (LYD)</label>
                <input
                  type="number" step="0.01" min="0" required placeholder="0.00"
                  value={proceeds}
                  onChange={(e) => setProceeds(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>
              {num(proceeds) > 0 && (
                <TreasurySelect value={disposeTreasuryId} onChange={setDisposeTreasuryId} label="الخزينة التي استلمت المتحصلات" />
              )}
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button" onClick={() => setDisposing(null)}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="dispose-asset-form"
              disabled={disposeMutation.isPending || (num(proceeds) > 0 && !disposeTreasuryId)}
              className="px-4 py-2 text-xs font-bold text-white bg-app-status-danger hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {disposeMutation.isPending ? "جارٍ الاستبعاد…" : "استبعاد وقيد"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
