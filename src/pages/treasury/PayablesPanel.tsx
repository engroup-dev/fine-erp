import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HandCoins, AlertTriangle } from "lucide-react";
import {
  getPayableOutstanding,
  getPayableSettlements,
  settlePayable,
  type PayableOutstanding,
  type PayableSettlement,
} from "../../api/endpoints/procurement";
import { apiErrorMessage } from "../../api/endpoints/production";
import { TreasurySelect } from "../../components/treasury/TreasurySelect";
import { formatNumber, localDateIso } from "../../lib/utils/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { usePayablesSettlementsColumns } from "../../components/table-columns/payablesSettlementsColumns";

const ACCOUNT_LABEL: Record<string, string> = {
  "21": "الذمم الدائنة (مشتريات آجلة)",
  "221": "الموردين",
  "225": "استقطاعات الرواتب المستحقة",
  "23": "تكاليف الاستيراد المعلقة (جمارك وشحن)",
};

const defaultDueDate = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return localDateIso(d);
};

/**
 * "What do we owe" — the payables the operational flows accumulate, each
 * settled from the treasury the money actually leaves. The backend caps every
 * payment at the ledger's live outstanding balance.
 */
export const PayablesPanel: React.FC = () => {
  const qc = useQueryClient();
  const [outstanding, setOutstanding] = useState<PayableOutstanding[]>([]);
  const [settlements, setSettlements] = useState<PayableSettlement[]>([]);
  const [settling, setSettling] = useState<PayableOutstanding | null>(null);
  const [method, setMethod] = useState<"cash" | "cheque">("cash");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [treasuryId, setTreasuryId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [issueDate, setIssueDate] = useState(() => localDateIso());
  const [payeeName, setPayeeName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [balances, history] = await Promise.all([
        getPayableOutstanding(),
        getPayableSettlements(),
      ]);
      setOutstanding(balances);
      setSettlements(history);
    } catch {
      // The treasury page surfaces connection problems globally.
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const settlementColumns = usePayablesSettlementsColumns();
  const settlementTableData = useMemo(() => settlements, [settlements]);
  const settlementTable = useDataTable({
    exportFileName: "payable-settlements",
    columns: settlementColumns,
    data: settlementTableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (s) => s.id,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settling) return;
    setError(null);
    setIsSubmitting(true);

    try {
      if (method === "cash") {
        await settlePayable({
          account_code: settling.account_code,
          amount: Number(amount),
          method: "cash",
          cash_account_id: treasuryId,
          reference: reference.trim() || undefined,
        });
      } else {
        await settlePayable({
          account_code: settling.account_code,
          amount: Number(amount),
          method: "cheque",
          reference: reference.trim() || undefined,
          cheque: {
            cash_account_id: bankAccountId,
            cheque_no: chequeNo.trim(),
            due_date: dueDate,
            issue_date: issueDate || undefined,
            payee_name: payeeName.trim() || undefined,
          },
        });
        qc.invalidateQueries({ queryKey: ["cheques"] });
        qc.invalidateQueries({ queryKey: ["chequeSummary"] });
      }

      setSettling(null);
      setAmount("");
      setReference("");
      setTreasuryId("");
      setBankAccountId("");
      setChequeNo("");
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "تعذر تنفيذ السداد."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm space-y-4">
      <h3 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-app-accent" />
        <span>الذمم المستحقة للسداد (Outstanding Payables)</span>
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {outstanding.map((payable) => (
          <div
            key={payable.account_code}
            className="rounded-xl border border-app-separator bg-app-bg-secondary p-4 space-y-2"
          >
            <p className="text-[11px] font-bold text-app-label-secondary">
              <span className="font-mono text-app-accent me-1">{payable.account_code}</span>
              {ACCOUNT_LABEL[payable.account_code] ?? payable.account_code}
            </p>
            <p className={`font-mono text-lg font-bold ${Number(payable.outstanding) > 0 ? "text-app-label-primary" : "text-app-status-positive"}`}>
              {formatNumber(payable.outstanding)} <span className="text-[10px] font-normal">LYD</span>
            </p>
            <button
              onClick={() => {
                setSettling(payable);
                setAmount(String(payable.outstanding));
                setMethod("cash");
                setTreasuryId("");
                setReference("");
                setBankAccountId("");
                setChequeNo("");
                setDueDate(defaultDueDate());
                setIssueDate(localDateIso());
                setPayeeName(ACCOUNT_LABEL[payable.account_code] ?? payable.account_code);
                setError(null);
              }}
              disabled={Number(payable.outstanding) <= 0}
              className="w-full rounded-lg bg-app-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              سداد
            </button>
          </div>
        ))}
      </div>

      {settlements.length > 0 && (
        <DataTable table={settlementTable}>
          <DataTable.Header>
            <DataTable.Toolbar>
              <DataTable.SearchInput placeholder="بحث في سجل التسويات..." />
            </DataTable.Toolbar>
          </DataTable.Header>
          <DataTable.Content emptyMessage="لا توجد تسويات مسجلة." emptyIcon={HandCoins} />
          <DataTable.Pagination />
        </DataTable>
      )}

      <Dialog open={Boolean(settling)} onOpenChange={(next) => !next && setSettling(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <div>
              {settling && (
                <>
                  <DialogTitle>سداد {ACCOUNT_LABEL[settling.account_code] ?? settling.account_code}</DialogTitle>
                  <DialogDescription>
                    الرصيد المستحق حالياً <span className="font-mono font-bold">{formatNumber(settling.outstanding)}</span> د.ل —
                    {method === "cash"
                      ? " يُقيد السداد مديناً على الحساب ودائناً على الخزينة المختارة، ولا يمكن تجاوز المستحق."
                      : " يُقيد السداد مديناً على الحساب ودائناً على أوراق الدفع (227)، ولا يمكن تجاوز المستحق."}
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

            {settling && (
              <form id="settle-payable-form" onSubmit={submit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1.5">
                    طريقة السداد
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMethod("cash")}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                        method === "cash"
                          ? "border-app-accent bg-app-accent text-white"
                          : "border-app-separator bg-app-bg-secondary text-app-label-secondary hover:text-app-label-primary"
                      }`}
                    >
                      نقداً من الخزينة
                    </button>
                    <button
                      type="button"
                      onClick={() => setMethod("cheque")}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                        method === "cheque"
                          ? "border-app-accent bg-app-accent text-white"
                          : "border-app-separator bg-app-bg-secondary text-app-label-secondary hover:text-app-label-primary"
                      }`}
                    >
                      بشيك صادر
                    </button>
                  </div>
                </div>

                {method === "cash" ? (
                  <>
                    <TreasurySelect
                      value={treasuryId}
                      onChange={setTreasuryId}
                      label="الخزينة التي يُدفع منها"
                    />
                    <div>
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        المبلغ المراد سداده (LYD)
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        max={Number(settling.outstanding)}
                        required
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        المرجع (رقم الشيك أو الحوالة)
                      </label>
                      <input
                        type="text"
                        placeholder="رقم الشيك أو الحوالة (اختياري)"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <TreasurySelect
                      kind="bank"
                      value={bankAccountId}
                      onChange={setBankAccountId}
                      label="المصرف المسحوب عليه"
                    />
                    <div>
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        المبلغ المراد سداده (LYD)
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        max={Number(settling.outstanding)}
                        required
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        رقم الشيك <span className="text-app-status-danger">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="رقم الشيك"
                        value={chequeNo}
                        onChange={(e) => setChequeNo(e.target.value)}
                        className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                          تاريخ الاستحقاق <span className="text-app-status-danger">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                          تاريخ الإصدار
                        </label>
                        <input
                          type="date"
                          max={localDateIso()}
                          value={issueDate}
                          onChange={(e) => setIssueDate(e.target.value)}
                          className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        اسم المستفيد
                      </label>
                      <input
                        type="text"
                        placeholder="اسم المستفيد"
                        value={payeeName}
                        onChange={(e) => setPayeeName(e.target.value)}
                        className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        المرجع (اختياري)
                      </label>
                      <input
                        type="text"
                        placeholder="مرجع إضافي (اختياري)"
                        value={reference}
                        onChange={(e) => setReference(e.target.value)}
                        className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                      />
                    </div>
                    <p className="rounded-xl border border-app-separator bg-app-bg-secondary p-3 text-xs text-app-label-secondary leading-relaxed">
                      يُسجَّل الشيك على أوراق الدفع (227) ويُخصم من المصرف عند صرفه من صفحة الشيكات.
                    </p>
                  </>
                )}
              </form>
            )}
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setSettling(null)}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="settle-payable-form"
              disabled={
                isSubmitting ||
                Number(amount) <= 0 ||
                (method === "cash"
                  ? !treasuryId
                  : !bankAccountId || !chequeNo.trim() || !dueDate)
              }
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {isSubmitting ? "جارٍ السداد…" : "سداد وقيد"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
