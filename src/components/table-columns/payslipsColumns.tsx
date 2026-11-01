import React, { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useSetDeductions } from "../../hooks/useHr";
import { usePayCodes } from "../../hooks/usePayItems";
import { ADVANCE_PAY_CODES, DEDUCTION_ROLE_LABEL, type DeductionAccountRole } from "../../api/endpoints/payItems";
import { apiErrorMessage } from "../../api/endpoints/production";
import {
  isAdvanceDeduction,
  isLockedDeduction,
  type Deduction,
  type PayrollRun,
  type Payslip,
  type PayslipAddition,
} from "../../api/endpoints/hr";
import { ColumnDef } from "../ui/DataTable";

const fmt = (v: number | string) =>
  Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

const LOCKED_TITLE: Record<NonNullable<Deduction["source"]>, string> = {
  pay_item: "استقطاع ثابت من بطاقة الموظف (البدلات والاستقطاعات) — يُعدَّل هناك لا هنا",
  adjustment: "جزاء معتمد لهذا الشهر — يُعدَّل من صفحة المكافآت والجزاءات لا هنا",
};

/**
 * Payroll's own lines — read-only: HR-12 advance recovery from the advance schedule,
 * and HR-13 standing deductions and approved one-off penalties.
 */
const LockedDeduction: React.FC<{ d: Deduction; nameOf: (code: string) => string }> = ({ d, nameOf }) => (
  <span
    className="rounded bg-app-accent/10 px-1.5 py-0.5 text-app-accent"
    title={d.source ? LOCKED_TITLE[d.source] : "يُستقطع آلياً من جدول أقساط السلفة ولا يُعدّل يدوياً"}
  >
    {isAdvanceDeduction(d) ? "استرداد سلفة" : nameOf(d.type)}
    {d.period ? ` (${d.period})` : ""}
    {d.source === "adjustment" ? " (لمرة واحدة)" : ""}: {fmt(d.amount)}
  </span>
);

/** HR-13: the allowances and bonuses payroll added to gross pay. */
const AdditionsCell: React.FC<{ payslip: Payslip }> = ({ payslip }) => {
  const { nameOf } = usePayCodes();
  const additions: PayslipAddition[] = payslip.additions ?? [];
  if (additions.length === 0) return <span className="font-mono text-app-label-tertiary">—</span>;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono">{fmt(payslip.additions_pay ?? 0)}</span>
      <div className="flex flex-wrap justify-end gap-1 text-[10px] font-mono text-app-label-secondary">
        {additions.map((a, i) => (
          <span
            key={a.pay_item_id ?? a.adjustment_id ?? i}
            className="rounded bg-app-status-positive/10 px-1.5 py-0.5 text-app-status-positive"
            title={a.source === "adjustment" ? (a.reason ?? "مكافأة لمرة واحدة") : "بدل ثابت من بطاقة الموظف"}
          >
            {nameOf("addition", a.type)}
            {a.source === "adjustment" ? " (لمرة واحدة)" : a.calc === "percent_of_base" ? ` ${fmt(a.value ?? 0)}٪` : ""}: {fmt(a.amount)}
          </span>
        ))}
      </div>
    </div>
  );
};

const DeductionEditor: React.FC<{ payslip: Payslip; editable: boolean; onError: (m: string) => void }> = ({
  payslip,
  editable,
  onError,
}) => {
  const [editing, setEditing] = useState(false);
  const { nameOf, deductionTypes } = usePayCodes();
  const deductionName = (code: string) => nameOf("deduction", code);
  // HR-13: the server credits a manual line by the deduction type its code names
  // (expense_reduction → 57); any other text is a withholding credited to 225.
  const codeOptions = useMemo(
    () =>
      deductionTypes.filter(
        (entry) => entry.isActive && !ADVANCE_PAY_CODES.includes(entry.code.trim().toUpperCase()),
      ),
    [deductionTypes],
  );
  const roleOf = (code: string): DeductionAccountRole => {
    const entry = deductionTypes.find((e) => e.code.trim().toUpperCase() === code.trim().toUpperCase());
    return entry?.fields.account_role === "expense_reduction" ? "expense_reduction" : "liability";
  };
  const isKnownCode = (code: string) =>
    deductionTypes.some((e) => e.code.trim().toUpperCase() === code.trim().toUpperCase());
  // The server refuses a typed advance line (ADVANCE_DEDUCTION_MANUAL), so its hint warns instead.
  const isAdvanceCode = (code: string) => ADVANCE_PAY_CODES.includes(code.trim().toUpperCase());
  const lineHint = (code: string): { text: string; title?: string; warn: boolean } => {
    if (isAdvanceCode(code)) {
      return {
        text: "استرداد السلف يُستقطع آلياً ولا يُدخل يدوياً",
        title: "يُستقطع استرداد السلف والقروض من جدول أقساطها عند احتساب المسير — احذف هذا السطر.",
        warn: true,
      };
    }
    if (!isKnownCode(code)) {
      return {
        text: `رمز غير معرّف · ${DEDUCTION_ROLE_LABEL.liability}`,
        title: "رمز غير موجود في أنواع الخصومات — يُقيَّد استقطاعاً يُسدَّد لجهة (225)",
        warn: true,
      };
    }
    return { text: `${deductionName(code)} · ${DEDUCTION_ROLE_LABEL[roleOf(code)]}`, warn: false };
  };
  const save = () => {
    // A line with an amount but no code would otherwise be dropped without a word.
    if (items.some((d) => d.type.trim() === "" && Number(d.amount) > 0)) {
      onError("اختر رمز نوع الخصم لكل سطر له مبلغ، أو احذف السطر قبل الحفظ.");
      return;
    }
    setDeductions.mutate(
      { payslipId: payslip.id, deductions: items.filter((d) => d.type.trim() !== "") },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => onError(apiErrorMessage(err, "تعذر حفظ الاستقطاعات.")),
      },
    );
  };
  const datalistId = `deduction-codes-${payslip.id}`;
  // HR-12/HR-13: the locked lines (advance recovery, standing and one-off deductions)
  // stay out of the editor; the server keeps them and re-caps the advance lines
  // against net pay after the manual lines.
  const locked = (payslip.deductions ?? []).filter(isLockedDeduction);
  const manual = (payslip.deductions ?? []).filter((d) => !isLockedDeduction(d));
  const [items, setItems] = useState(manual);
  const setDeductions = useSetDeductions();

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-app-label-secondary">
        {locked.map((d, i) => (
          <LockedDeduction key={`locked-${d.installment_id ?? d.pay_item_id ?? d.adjustment_id ?? i}`} d={d} nameOf={deductionName} />
        ))}
        {manual.map((d, i) => (
          <span key={i} title={DEDUCTION_ROLE_LABEL[roleOf(d.type)]}>{deductionName(d.type)}: {fmt(d.amount)}</span>
        ))}
        {editable && (
          <button
            onClick={() => { setItems(manual); setEditing(true); }}
            className="text-app-accent font-bold hover:opacity-80"
          >
            تعديل الاستقطاعات
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {locked.length > 0 && (
        <div className="space-y-1 text-[10px] font-mono">
          <div className="flex flex-wrap gap-1.5">
            {locked.map((d, i) => (
              <LockedDeduction key={`locked-${d.installment_id ?? d.pay_item_id ?? d.adjustment_id ?? i}`} d={d} nameOf={deductionName} />
            ))}
          </div>
          <p className="font-sans text-app-label-tertiary">
            الاستقطاعات الثابتة والجزاءات المعتمدة تأتي من بطاقة الموظف وصفحة المكافآت والجزاءات، واسترداد السلف يُعاد حسابه آلياً
            على صافي الراتب بعد الاستقطاعات اليدوية.
          </p>
        </div>
      )}
      <datalist id={datalistId}>
        {codeOptions.map((o) => (
          <option key={o.id} value={o.code}>
            {o.name}
          </option>
        ))}
      </datalist>
      {items.map((d, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text" value={d.type} placeholder="رمز نوع الخصم" list={datalistId}
            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}
            className="w-32 rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-[10px] focus:border-app-accent focus:outline-none"
          />
          <input
            type="number" step="0.01" min="0" value={d.amount}
            onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))}
            className="w-24 rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-[10px] font-mono focus:border-app-accent focus:outline-none"
          />
          {d.type.trim() !== "" && (() => {
            const hint = lineHint(d.type);
            return (
              <span
                className={`text-[10px] ${hint.warn ? "text-app-status-yellow" : "text-app-label-tertiary"}`}
                title={hint.title}
              >
                {hint.text}
              </span>
            );
          })()}
          <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="p-0.5 text-app-label-tertiary hover:text-app-status-danger">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 text-[10px] font-bold">
        <button
          onClick={() => setItems([...items, { type: codeOptions[0]?.code ?? "", amount: 0 }])}
          className="text-app-accent hover:opacity-80"
        >
          + سطر
        </button>
        <button
          onClick={save}
          disabled={setDeductions.isPending}
          className="rounded-lg bg-app-accent px-2 py-1 text-white hover:opacity-90 disabled:opacity-50"
        >
          حفظ
        </button>
        <button onClick={() => setEditing(false)} className="text-app-label-secondary hover:opacity-80">
          إلغاء
        </button>
      </div>
    </div>
  );
};

export interface UsePayslipsColumnsArgs {
  run: PayrollRun;
  onError: (m: string) => void;
}

export function usePayslipsColumns({ run, onError }: UsePayslipsColumnsArgs): ColumnDef<Payslip, unknown>[] {
  return useMemo<ColumnDef<Payslip, unknown>[]>(
    () => [
      {
        id: "employee",
        header: "الموظف",
        accessorFn: (p) => p.employee?.entity?.name ?? p.employee_id,
        meta: { className: "font-bold text-app-label-primary" },
        cell: ({ row }) => row.original.employee?.entity?.name ?? row.original.employee_id.slice(0, 8),
      },
      {
        id: "unit",
        header: "الوحدة",
        accessorFn: (p) => p.operating_unit?.name,
        meta: { className: "text-app-label-secondary" },
        cell: ({ row }) => row.original.operating_unit?.name,
      },
      {
        accessorKey: "base_pay",
        header: "أساسي",
        meta: { align: "end", className: "font-mono" },
        cell: ({ row }) => fmt(row.original.base_pay),
      },
      {
        accessorKey: "attendance_pay",
        header: "حضور",
        meta: { align: "end", className: "font-mono" },
        cell: ({ row }) => fmt(row.original.attendance_pay),
      },
      {
        id: "overtime",
        header: "إضافي",
        accessorFn: (p) => Number(p.overtime_pay ?? 0),
        meta: { align: "end", className: "font-mono" },
        // HR-14: overtime pay is its own figure inside gross.
        cell: ({ row }) =>
          Number(row.original.overtime_pay ?? 0) > 0 ? (
            fmt(row.original.overtime_pay ?? 0)
          ) : (
            <span className="text-app-label-tertiary">—</span>
          ),
      },
      {
        accessorKey: "labor_log_pay",
        header: "إنتاج",
        meta: { align: "end", className: "font-mono" },
        cell: ({ row }) => fmt(row.original.labor_log_pay),
      },
      {
        id: "additions",
        header: "بدلات ومكافآت",
        accessorFn: (p) => Number(p.additions_pay ?? 0),
        meta: { align: "end" },
        cell: ({ row }) => <AdditionsCell payslip={row.original} />,
      },
      {
        accessorKey: "gross_pay",
        header: "إجمالي",
        meta: { align: "end", className: "font-mono font-bold" },
        cell: ({ row }) => fmt(row.original.gross_pay),
      },
      {
        id: "deductions",
        header: "استقطاعات",
        meta: { exportValue: (p) => (p.deductions ?? []).reduce((sum, d) => sum + Number(d.amount || 0), 0) },
        enableSorting: false,
        cell: ({ row }) => (
          <DeductionEditor payslip={row.original} editable={run.status === "calculated" && !run.needs_recalculation} onError={onError} />
        ),
      },
      {
        accessorKey: "net_pay",
        header: "صافي",
        meta: { align: "end", className: "font-mono font-bold text-app-status-positive" },
        cell: ({ row }) => fmt(row.original.net_pay),
      },
    ],
    [run.status, run.needs_recalculation, onError],
  );
}
