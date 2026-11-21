import React, { useMemo, useState } from "react";
import { AlertTriangle, FileText, Landmark, Pencil, Plus, Wallet } from "lucide-react";
import { useCashAccounts } from "../../hooks/useTreasury";
import { formatNumber } from "../../lib/utils/format";
import { CashAccountDialog } from "./CashAccountDialog";
import { CashAccountStatementDialog } from "./CashAccountStatementDialog";
import type { CashAccount, CashAccountKind } from "../../types/procurement";

const COPY: Record<CashAccountKind, { title: string; add: string; empty: string }> = {
  cash: {
    title: "الخزائن النقدية",
    add: "إضافة خزينة نقدية",
    empty: "لا توجد خزائن نقدية مسجلة حتى الآن.",
  },
  bank: {
    title: "الحسابات المصرفية",
    add: "إضافة حساب مصرفي",
    empty: "لا توجد حسابات مصرفية مسجلة حتى الآن.",
  },
};

interface TreasuryAccountsGridProps {
  /** CR 8: cash boxes and bank accounts are listed (and added) separately. */
  kind: CashAccountKind;
}

/** Balance cards for one kind of treasury, with add/edit and the treasury statement. */
export const TreasuryAccountsGrid: React.FC<TreasuryAccountsGridProps> = ({ kind }) => {
  const { data: cashAccounts = [] } = useCashAccounts();
  const accounts = useMemo(() => cashAccounts.filter((a) => a.kind === kind), [cashAccounts, kind]);
  const totalLyd = useMemo(() => accounts.reduce((sum, a) => sum + (a.ledger_balance ?? 0), 0), [accounts]);

  const [dialog, setDialog] = useState<{ open: boolean; account: CashAccount | null }>({
    open: false,
    account: null,
  });
  const [statementAccount, setStatementAccount] = useState<CashAccount | null>(null);
  const copy = COPY[kind];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-app-label-primary">
          {kind === "bank" ? <Landmark className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
          {copy.title}
          {accounts.length > 0 && (
            <span className="rounded-md bg-app-bg-secondary px-2 py-0.5 font-mono text-[11px] text-app-label-secondary">
              {formatNumber(totalLyd)} د.ل
            </span>
          )}
        </h3>
        <button
          onClick={() => setDialog({ open: true, account: null })}
          className="flex items-center gap-1.5 rounded-xl border border-app-accent/40 bg-app-accent/10 px-3 py-1.5 text-xs font-bold text-app-accent hover:bg-app-accent/15"
        >
          <Plus className="h-4 w-4" />
          <span>{copy.add}</span>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {accounts.length === 0 ? (
          <div className="col-span-3 rounded-2xl border border-dashed border-app-separator bg-app-bg-primary p-4 text-center text-xs text-app-label-secondary">
            {copy.empty}
          </div>
        ) : (
          accounts.map((acc) => {
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
                      onClick={() => setDialog({ open: true, account: acc })}
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
        open={dialog.open}
        cashAccount={dialog.account}
        fixedKind={kind}
        onClose={() => setDialog({ open: false, account: null })}
      />

      <CashAccountStatementDialog
        open={statementAccount !== null}
        cashAccount={statementAccount}
        onClose={() => setStatementAccount(null)}
      />
    </section>
  );
};
