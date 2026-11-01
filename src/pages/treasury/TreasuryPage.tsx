import React, { useMemo, useState } from "react";
import {
  Wallet,
  Plus,
  RefreshCw,
  TrendingUp,
  ShieldAlert,
  Send,
  AlertTriangle,
  Landmark,
  Pencil,
  FileText,
} from "lucide-react";
import { isAxiosError } from "axios";
import {
  CashAccount,
  PaymentRequest,
  PaymentRoute,
  CreateFxRatePayload,
  ExecutePaymentPayload,
} from "../../types/procurement";
import {
  usePaymentRequests,
  useBankHolds,
  useExecutePaymentRequest,
} from "../../hooks/useProcurement";
import {
  useCashAccounts,
  useFxRates,
  useCreateFxRate,
} from "../../hooks/useTreasury";
import { PayablesPanel } from "./PayablesPanel";
import { toast } from "../../stores/toastStore";
import { apiErrorPayload } from "../../api/endpoints/production";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useReferenceLookups } from "../../hooks/useReferenceLookups";
import type { LookupEntry } from "../../config/referenceLookups";
import { formatNumber } from "../../lib/utils/format";
import { useTreasuryFxRatesColumns } from "../../components/table-columns/treasuryFxRatesColumns";
import { useTreasuryBankHoldsColumns } from "../../components/table-columns/treasuryBankHoldsColumns";
import { useBlackMarketColumns } from "../../components/table-columns/blackMarketColumns";
import { FxPreviewCard } from "../../components/treasury/FxPreviewCard";
import { CashAccountDialog } from "../../components/treasury/CashAccountDialog";
import { CashAccountStatementDialog } from "../../components/treasury/CashAccountStatementDialog";
import { useAccounts } from "../../hooks/useAccounting";
import { filterPaymentSourceAccounts } from "../../lib/utils/coa";
import { type Account } from "../../api/endpoints/accounting";

const FX_TOLERANCE_LYD_DEFAULT = 0.01;
const FX_HARD_CAP_PERCENT_DEFAULT = 5.0;

type RouteTab = "all" | "bank" | "market";

export const TreasuryPage: React.FC = () => {
  const { data: cashAccounts = [], isLoading: isLoadingCash, refetch: refetchCash } = useCashAccounts();
  const { data: fxRates = [], isLoading: isLoadingFx, refetch: refetchFx } = useFxRates();
  const { data: bankHolds = [], isLoading: isLoadingHolds, refetch: refetchHolds } = useBankHolds();
  const { data: pendingPayments = [], isLoading: isLoadingPayments, refetch: refetchPayments } = usePaymentRequests({ status: "pending" });
  const { data: allPaymentRequests = [], refetch: refetchAllPayments } = usePaymentRequests();
  const { data: marketPaymentRequests = [], refetch: refetchMarketPayments } = usePaymentRequests({ route: "market" });
  const { data: currencies = [] } = useReferenceLookups("currencies", { isActive: true });

  const createFxRateMutation = useCreateFxRate();
  const executePaymentMutation = useExecutePaymentRequest();

  const isLoading = isLoadingCash || isLoadingFx || isLoadingHolds || isLoadingPayments;

  const [activeRouteTab, setActiveRouteTab] = useState<RouteTab>("all");
  const [cashAccountDialog, setCashAccountDialog] = useState<{ open: boolean; account: CashAccount | null }>({
    open: false,
    account: null,
  });
  const [statementAccount, setStatementAccount] = useState<CashAccount | null>(null);

  const handleRefreshAll = () => {
    refetchCash();
    refetchFx();
    refetchHolds();
    refetchPayments();
    refetchAllPayments();
    refetchMarketPayments();
  };

  // FX Modal State
  const [isFxModalOpen, setIsFxModalOpen] = useState(false);
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("LYD");
  const [rate, setRate] = useState<number>(0);

  // Execute Payment Modal State
  const [selectedPayment, setSelectedPayment] = useState<PaymentRequest | null>(null);
  const [fxRateUsed, setFxRateUsed] = useState<number>(0);
  const [exactAmountUsedLyd, setExactAmountUsedLyd] = useState<number>(0);
  const [bankReference, setBankReference] = useState<string>("");
  // The cash/bank leaf the payment leaves from — the API refuses a payment without one.
  const { data: accounts = [] } = useAccounts();
  const paymentSourceAccounts = useMemo(() => filterPaymentSourceAccounts(accounts), [accounts]);
  const [paymentSourceAccountId, setPaymentSourceAccountId] = useState<string | null>(null);
  const [extraAllocationNote, setExtraAllocationNote] = useState<string>("");
  const [extraAllocationTouched, setExtraAllocationTouched] = useState(false);
  const [hardCapAcknowledged, setHardCapAcknowledged] = useState(false);

  const bookedRate = selectedPayment?.booked_fx_rate ?? null;
  const toleranceLyd =
    selectedPayment?.fx_tolerance_lyd ?? FX_TOLERANCE_LYD_DEFAULT;
  const hardCapPercent =
    selectedPayment?.fx_hard_cap_percent ?? FX_HARD_CAP_PERCENT_DEFAULT;

  // FX-24 / FX-15: derive the effective values from whichever input the
  // operator fills. LYD wins when supplied (the bank statement is truth);
  // otherwise the rate × amount is used.
  const effectiveValues = useMemo(() => {
    if (!selectedPayment) {
      return { effectiveRate: null, effectiveSettledLyd: null };
    }
    const amount = Number(selectedPayment.amount_requested);
    if (exactAmountUsedLyd > 0) {
      const settled = exactAmountUsedLyd;
      const rate = amount > 0 ? settled / amount : fxRateUsed;
      return { effectiveRate: rate, effectiveSettledLyd: settled };
    }
    if (fxRateUsed > 0) {
      return {
        effectiveRate: fxRateUsed,
        effectiveSettledLyd: amount * fxRateUsed,
      };
    }
    return { effectiveRate: null, effectiveSettledLyd: null };
  }, [selectedPayment, fxRateUsed, exactAmountUsedLyd]);

  const varianceLyd = useMemo(() => {
    if (
      !selectedPayment ||
      effectiveValues.effectiveSettledLyd === null ||
      bookedRate === null ||
      bookedRate === undefined
    ) {
      return null;
    }
    const expected = Number(selectedPayment.amount_requested) * bookedRate;
    return effectiveValues.effectiveSettledLyd - expected;
  }, [selectedPayment, effectiveValues, bookedRate]);

  const varianceExceedsTolerance =
    varianceLyd !== null && Math.abs(varianceLyd) > toleranceLyd;
  const varianceExceedsHardCap =
    varianceLyd !== null &&
    effectiveValues.effectiveSettledLyd !== null &&
    effectiveValues.effectiveSettledLyd > 0 &&
    Math.abs(varianceLyd) > (hardCapPercent / 100) * effectiveValues.effectiveSettledLyd;

  const requiresNote = varianceExceedsTolerance;
  const noteMissing = requiresNote && extraAllocationNote.trim().length === 0;
  const hasAtLeastOneInput =
    fxRateUsed > 0 || exactAmountUsedLyd > 0;

  const openExecuteModal = (pay: PaymentRequest) => {
    setSelectedPayment(pay);
    setExtraAllocationNote("");
    setExtraAllocationTouched(false);
    setHardCapAcknowledged(false);
    setFxRateUsed(0);
    setExactAmountUsedLyd(
      pay.bank_hold ? Number(pay.bank_hold.held_amount_lyd) : 0
    );
  };

  const closeExecuteModal = () => {
    setSelectedPayment(null);
    setBankReference("");
    setPaymentSourceAccountId(null);
    setExtraAllocationNote("");
    setExtraAllocationTouched(false);
    setHardCapAcknowledged(false);
  };

  const handleCreateFxRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rate <= 0) return;

    const payload: CreateFxRatePayload = {
      from_currency: fromCurrency,
      to_currency: toCurrency,
      rate,
    };

    createFxRateMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("تم تسجيل سعر الصرف بنجاح");
        setIsFxModalOpen(false);
        setRate(0);
      },
      onError: (err: unknown) => {
        const payloadErr = apiErrorPayload(err);
        const message = payloadErr?.message || (isAxiosError(err) ? err.response?.data?.message : null);
        toast.error(message || "فشل تسجيل سعر الصرف");
      },
    });
  };

  const handleExecutePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) return;

    if (!hasAtLeastOneInput) {
      toast.error("أدخل سعر الصرف أو المبلغ المنفذ بالدينار على الأقل.");
      return;
    }

    if (noteMissing) {
      setExtraAllocationTouched(true);
      toast.error("سبب التكلفة الإضافية مطلوب عند وجود فرق عن السعر المرجعي.");
      return;
    }

    if (varianceExceedsHardCap && !hardCapAcknowledged) {
      toast.error("يجب الموافقة على فرق السعر الذي يتجاوز الحد الأقصى قبل المتابعة.");
      return;
    }

    if (!paymentSourceAccountId) {
      toast.error("اختر حساب الخزينة أو المصرف الذي يُدفع منه.");
      return;
    }

    const payload: ExecutePaymentPayload = {
      fx_rate_used: fxRateUsed > 0 ? fxRateUsed : null,
      exact_amount_used_lyd: exactAmountUsedLyd > 0 ? exactAmountUsedLyd : null,
      bank_reference: bankReference.trim() || undefined,
      extra_allocation_note: requiresNote ? extraAllocationNote.trim() : undefined,
      payment_source_account_id: paymentSourceAccountId,
    };

    executePaymentMutation.mutate(
      { id: selectedPayment.id, payload },
      {
        onSuccess: () => {
          toast.success("تم تنفيذ الدفع وتسوية الفارق في الخزينة بنجاح!");
          closeExecuteModal();
        },
        onError: (err: unknown) => {
          const payloadErr = apiErrorPayload(err);
          const message = payloadErr?.message || (isAxiosError(err) ? err.response?.data?.message : null);
          toast.error(message || "فشل تنفيذ طلب الدفع");
        },
      }
    );
  };

  const fxRateColumns = useTreasuryFxRatesColumns();
  const fxRateTableData = useMemo(() => fxRates, [fxRates]);
  const fxRateTable = useDataTable({
    exportFileName: "fx-rates",
    columns: fxRateColumns,
    data: fxRateTableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (fx) => fx.id,
  });

  const bankHoldColumns = useTreasuryBankHoldsColumns();
  const bankHoldTableData = useMemo(() => bankHolds, [bankHolds]);
  const bankHoldTable = useDataTable({
    exportFileName: "bank-holds",
    columns: bankHoldColumns,
    data: bankHoldTableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (bh) => bh.id,
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
            <Wallet className="h-6 w-6 text-app-accent" />
            <span>إدارة الخزينة وسعر الصرف وحجوزات المصارف</span>
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            متابعة أرصدة الحسابات النقدية، أسعار الصرف الحية، وتسوية حوافز وتدفقات الاعتمادات المستندية
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshAll}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span>تحديث البيانات</span>
          </button>
          <button
            onClick={() => setIsFxModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>تسجيل سعر صرف جديد</span>
          </button>
        </div>
      </div>

      {/* Cash Accounts Cards Grid */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-app-label-primary">الخزائن والحسابات المصرفية</h3>
        <button
          onClick={() => setCashAccountDialog({ open: true, account: null })}
          className="flex items-center gap-1.5 rounded-xl border border-app-accent/40 bg-app-accent/10 px-3 py-1.5 text-xs font-bold text-app-accent hover:bg-app-accent/15"
        >
          <Plus className="h-4 w-4" />
          <span>إضافة خزينة</span>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {cashAccounts.length === 0 ? (
          <div className="col-span-3 rounded-2xl border border-dashed border-app-separator bg-app-bg-primary p-4 text-center text-xs text-app-label-secondary">
            لا توجد حسابات خزينة مسجلة حتى الآن.
          </div>
        ) : (
          cashAccounts.map((acc) => {
            const isLyd = !acc.currency || acc.currency === "LYD" || acc.currency === "د.ل";
            const matchingCur = acc.currency_balances?.find((cb) => cb.currency === acc.currency);
            const originalBalance = matchingCur ? matchingCur.original_balance : 0;
            const mainBalance = isLyd ? acc.ledger_balance : originalBalance;
            const isNegative = mainBalance < 0;

            return (
              <div key={acc.id} className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-app-label-secondary">
                    {acc.kind === "bank" ? <Landmark className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
                    {acc.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-app-bg-secondary px-2 py-0.5 text-[10px] font-bold text-app-label-primary">
                      {acc.currency}
                    </span>
                    <button
                      onClick={() => setCashAccountDialog({ open: true, account: acc })}
                      className="rounded-md p-1 text-app-label-tertiary hover:bg-app-fill-f1 hover:text-app-accent"
                      title="تعديل"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <p className={`text-lg font-extrabold font-mono ${isNegative ? "text-app-status-danger" : "text-app-status-positive"}`}>
                    {formatNumber(mainBalance)} {acc.currency}
                  </p>
                  {!isLyd && (
                    <p className="text-[11px] font-mono text-app-label-tertiary">
                      يعادل {formatNumber(acc.ledger_balance)} د.ل
                    </p>
                  )}
                </div>
                {acc.account ? (
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-app-separator/50">
                    <p className="text-[11px] font-mono text-app-label-tertiary truncate" title={`${acc.account.account_code} — ${acc.account.name}`}>
                      {acc.account.account_code} — {acc.account.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => setStatementAccount(acc)}
                      className="inline-flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-0.5 text-[11px] font-semibold text-app-label-secondary hover:bg-app-fill-f1 hover:text-app-accent shrink-0 transition-colors"
                    >
                      <FileText className="h-3 w-3" />
                      <span>كشف الخزينة</span>
                    </button>
                  </div>
                ) : (
                  <p className="flex items-center gap-1 text-[11px] font-semibold text-app-status-warning">
                    <AlertTriangle className="h-3 w-3" />
                    غير مربوطة بحساب محاسبي — لا تستقبل مبيعات
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <CashAccountDialog
        open={cashAccountDialog.open}
        cashAccount={cashAccountDialog.account}
        onClose={() => setCashAccountDialog({ open: false, account: null })}
      />

      <CashAccountStatementDialog
        open={statementAccount !== null}
        cashAccount={statementAccount}
        onClose={() => setStatementAccount(null)}
      />

      {/* Two Column Layout: Pending Payments & FX Rates */}
      <div className="grid grid-cols-2 gap-6">
        {/* Pending Payments Section */}
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
            <Send className="h-4 w-4 text-app-accent" />
            <span>طلبات الدفع المالي المعلقة</span>
          </h3>

          {pendingPayments.length === 0 ? (
            <p className="text-xs text-app-label-secondary">لا توجد طلبات دفع معلقة بحاجة للتنفيذ.</p>
          ) : (
            <div className="space-y-3">
              {pendingPayments.map((pay) => (
                <div
                  key={pay.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-app-separator bg-app-bg-secondary"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-app-label-primary">
                        طلب دفع #{pay.id.slice(0, 6)} ({pay.route === "bank" ? "اعتماد مصرفي" : "سوق حر"})
                      </p>
                      {pay.import_order?.supplier?.name ? (
                        <span className="rounded-full bg-app-accent-subtle px-2 py-0.5 text-[10px] font-bold text-app-accent">
                          {pay.import_order.supplier.name}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-app-label-secondary font-mono">
                      {pay.import_order?.order_number ? (
                        <span>أمر الشراء: {pay.import_order.order_number}</span>
                      ) : null}
                      <span>القيمة: {formatNumber(pay.amount_requested)} USD</span>
                    </div>
                  </div>
                  <button
                    onClick={() => openExecuteModal(pay)}
                    className="rounded-xl bg-app-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-opacity"
                  >
                    قبول الطلب وتسوية الدفع
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live FX Rates History Section */}
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-app-accent" />
            <span>أسعار الصرف الرسمية والسائدة</span>
          </h3>

          <DataTable table={fxRateTable}>
            <DataTable.Header>
              <DataTable.Toolbar>
                <DataTable.SearchInput placeholder="بحث في أسعار الصرف..." />
              </DataTable.Toolbar>
            </DataTable.Header>
            <DataTable.Content
              isLoading={isLoadingFx}
              emptyMessage="لا توجد أسعار صرف مسجلة بالمنظومة."
              emptyIcon={TrendingUp}
            />
            <DataTable.Pagination />
          </DataTable>
        </div>
      </div>

      <PayablesPanel />

      {/* Payment Routes Tab Strip — All / Bank / Black market (حوالات السوق) */}
      <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
            <Send className="h-4 w-4 text-app-accent" />
            <span>سجل طلبات الدفع حسب المسار</span>
          </h3>
          <div className="inline-flex items-center gap-1 rounded-xl border border-app-separator bg-app-bg-secondary p-1">
            {(["all", "bank", "market"] as RouteTab[]).map((tab) => {
              const labels: Record<RouteTab, string> = {
                all: "الكل",
                bank: "اعتمادات بنكية",
                market: "حوالات السوق",
              };
              const isActive = activeRouteTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveRouteTab(tab)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                    isActive
                      ? "bg-app-accent text-white shadow-sm"
                      : "text-app-label-secondary hover:text-app-label-primary"
                  }`}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>
        </div>

        <BlackMarketTable
          tab={activeRouteTab}
          allRows={allPaymentRequests}
          marketRows={marketPaymentRequests}
        />
      </div>

      {/* Bank Holds Summary Table */}
      <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-app-accent" />
          <span>سجل الحجوزات البنكية والإفراج عن الفروقات (Bank Buffer Holds)</span>
        </h3>

        <DataTable table={bankHoldTable}>
          <DataTable.Header>
            <DataTable.Toolbar>
              <DataTable.SearchInput placeholder="بحث في الحجوزات البنكية..." />
            </DataTable.Toolbar>
          </DataTable.Header>
          <DataTable.Content
            isLoading={isLoadingHolds}
            emptyMessage="لا توجد حركات حجز احتياطي مصرفية مسجلة."
            emptyIcon={ShieldAlert}
          />
          <DataTable.Pagination />
        </DataTable>
      </div>

      {/* Record FX Rate Modal */}
      <Dialog open={isFxModalOpen} onOpenChange={setIsFxModalOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تسجيل سعر صرف جديد</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
        <form id="fx-rate-form" onSubmit={handleCreateFxRate} className="space-y-4" dir="rtl">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">من عملة</label>
              <SearchableSelect<LookupEntry>
                options={currencies}
                value={currencies.find((c) => c.code === fromCurrency) ?? null}
                onChange={(c) => setFromCurrency(c ? c.code : "")}
                getOptionId={(c) => c.id}
                getOptionLabel={(c) => `${c.name} (${c.code})`}
                getOptionSubLabel={(c) => c.fields?.symbol}
                placeholder="-- اختر العملة --"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">إلى عملة</label>
              <SearchableSelect<LookupEntry>
                options={currencies}
                value={currencies.find((c) => c.code === toCurrency) ?? null}
                onChange={(c) => setToCurrency(c ? c.code : "")}
                getOptionId={(c) => c.id}
                getOptionLabel={(c) => `${c.name} (${c.code})`}
                getOptionSubLabel={(c) => c.fields?.symbol}
                placeholder="-- اختر العملة --"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-app-label-secondary mb-1">
              سعر الصرف (Exchange Rate) <span className="text-app-status-danger">*</span>
            </label>
            <input
              type="number"
              step="0.0001"
              min="0.0001"
              required
              value={rate || ""}
              onChange={(e) => setRate(Number(e.target.value))}
              placeholder="5.2000"
              className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:outline-none"
            />
          </div>

        </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsFxModalOpen(false)}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="fx-rate-form"
              disabled={createFxRateMutation.isPending || rate <= 0}
              className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {createFxRateMutation.isPending ? "جاري الحفظ..." : "حفظ سعر الصرف"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Execute Payment Modal */}
      <Dialog open={Boolean(selectedPayment)} onOpenChange={(next) => !next && closeExecuteModal()}>
        <DialogContent size="md">
          <DialogHeader>
            <div>
              <DialogTitle>قبول الطلب وتسوية الدفع بالخزينة</DialogTitle>
              {selectedPayment && (
                <DialogDescription>
                  {selectedPayment.import_order?.supplier?.name
                    ? `المورد: ${selectedPayment.import_order.supplier.name} | `
                    : ""}
                  {selectedPayment.import_order?.order_number
                    ? `أمر الشراء: ${selectedPayment.import_order.order_number} | `
                    : ""}
                  المبلغ المطلوب: {formatNumber(selectedPayment.amount_requested)} USD
                </DialogDescription>
              )}
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
        {selectedPayment && (
          <form id="execute-payment-form" onSubmit={handleExecutePayment} className="space-y-4" dir="rtl">
            <FxPreviewCard
              bookedRate={bookedRate}
              effectiveRate={effectiveValues.effectiveRate}
              effectiveSettledLyd={effectiveValues.effectiveSettledLyd}
              varianceLyd={varianceLyd}
              toleranceLyd={toleranceLyd}
              hardCapPercent={hardCapPercent}
              amountRequested={Number(selectedPayment.amount_requested)}
              hardCapAcknowledged={hardCapAcknowledged}
              onAcknowledgeHardCap={setHardCapAcknowledged}
            />

            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                حساب مصدر الدفع <span className="text-app-status-danger">*</span>
              </label>
              <SearchableSelect<Account>
                options={paymentSourceAccounts}
                value={paymentSourceAccounts.find((a) => a.id === paymentSourceAccountId) ?? null}
                onChange={(a) => setPaymentSourceAccountId(a ? a.id : null)}
                getOptionId={(a) => a.id}
                getOptionLabel={(a) => `${a.account_code} - ${a.name}`}
                placeholder="اختر حساب الخزينة أو المصرف…"
                size="sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  سعر الصرف المنفذ فعلياً
                  {exactAmountUsedLyd <= 0 ? (
                    <span className="text-app-status-danger"> *</span>
                  ) : (
                    <span className="text-app-label-tertiary text-[10px] ms-1">(اختياري)</span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={fxRateUsed > 0 ? fxRateUsed : ""}
                  onChange={(e) => setFxRateUsed(Number(e.target.value))}
                  placeholder="5.2000"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  المبلغ المنفذ بالدينار (LYD)
                  {fxRateUsed <= 0 ? (
                    <span className="text-app-status-danger"> *</span>
                  ) : (
                    <span className="text-app-label-tertiary text-[10px] ms-1">(اختياري)</span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={exactAmountUsedLyd > 0 ? exactAmountUsedLyd : ""}
                  onChange={(e) => setExactAmountUsedLyd(Number(e.target.value))}
                  placeholder="5100.00"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                الرقم المرجعي للإشعار البنكي / الحوالة
              </label>
              <input
                type="text"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
                placeholder="BNK-TRF-900800"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:outline-none"
              />
            </div>

            {requiresNote ? (
              <div className="rounded-xl border border-app-status-warning/40 bg-app-status-warning/10 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-app-status-warning">
                  <AlertTriangle className="h-4 w-4" />
                  فرق عن السعر المرجعي
                  <span className="font-mono ms-auto">
                    {varianceLyd !== null && varianceLyd > 0 ? "+" : ""}
                    {formatNumber(varianceLyd ?? 0)} LYD
                  </span>
                </div>
                <label className="block text-[11px] font-bold text-app-label-primary">
                  سبب التكلفة الإضافية <span className="text-app-status-danger">*</span>
                </label>
                <textarea
                  value={extraAllocationNote}
                  onChange={(e) => {
                    setExtraAllocationNote(e.target.value);
                    setExtraAllocationTouched(true);
                  }}
                  onBlur={() => setExtraAllocationTouched(true)}
                  rows={2}
                  placeholder="مثال: شراء عبر الصرّاف بسبب تأخر الاعتماد البنكي"
                  className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
                {extraAllocationTouched && noteMissing ? (
                  <p className="text-[10px] text-app-status-danger font-bold">
                    السبب مطلوب عند وجود فرق عن السعر المرجعي.
                  </p>
                ) : null}
              </div>
            ) : null}
          </form>
        )}
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={closeExecuteModal}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="execute-payment-form"
              disabled={
                executePaymentMutation.isPending
                || !paymentSourceAccountId
                || !hasAtLeastOneInput
                || noteMissing
                || (varianceExceedsHardCap && !hardCapAcknowledged)
              }
              className="rounded-xl bg-app-status-positive px-5 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {executePaymentMutation.isPending ? "جاري التأكيد..." : "قبول الطلب وتسوية الدفع"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface BlackMarketTableProps {
  tab: RouteTab;
  allRows: PaymentRequest[];
  marketRows: PaymentRequest[];
}

const BlackMarketTable: React.FC<BlackMarketTableProps> = ({ tab, allRows, marketRows }) => {
  const rows = tab === "market" ? marketRows : allRows;
  const visible = useMemo(
    () => (tab === "bank" ? rows.filter((r) => r.route === ("bank" as PaymentRoute)) : rows),
    [tab, rows]
  );

  const columns = useBlackMarketColumns();

  const table = useDataTable({
    exportFileName: `payment-requests-${tab}`,
    columns,
    data: visible,
    enableSorting: true,
    enableGlobalFilter: false,
    pageSize: 10,
    getRowId: (r) => r.id,
  });

  return (
    <DataTable table={table}>
      <DataTable.Content
        emptyMessage={tab === "market" ? "لا توجد حوالات سوق حالية." : "لا توجد طلبات دفع مسجلة."}
        emptyIcon={Send}
      />
      <DataTable.Pagination />
    </DataTable>
  );
};

export default TreasuryPage;
