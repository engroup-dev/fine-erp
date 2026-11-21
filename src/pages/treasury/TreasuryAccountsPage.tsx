import React from "react";
import { Landmark, Wallet } from "lucide-react";
import { TreasuryAccountsGrid } from "../../components/treasury/TreasuryAccountsGrid";
import type { CashAccountKind } from "../../types/procurement";

const HEADINGS: Record<CashAccountKind, { title: string; subtitle: string }> = {
  cash: {
    title: "الخزائن النقدية",
    subtitle: "أرصدة الخزائن والصناديق النقدية في الوحدات وكشف حركة كل خزينة.",
  },
  bank: {
    title: "الحسابات المصرفية",
    subtitle: "أرصدة الحسابات لدى المصارف وكشف حركتها. المطابقة مع كشف البنك من «التسوية المصرفية».",
  },
};

/** CR 8: cash boxes and bank accounts each have their own page. */
export const TreasuryAccountsPage: React.FC<{ kind: CashAccountKind }> = ({ kind }) => {
  const heading = HEADINGS[kind];
  const Icon = kind === "bank" ? Landmark : Wallet;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-app-label-primary">
          <Icon className="h-6 w-6 text-app-accent" />
          <span>{heading.title}</span>
        </h1>
        <p className="mt-1 text-xs text-app-label-secondary">{heading.subtitle}</p>
      </div>
      <TreasuryAccountsGrid kind={kind} />
    </div>
  );
};
