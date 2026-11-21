import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../ui/Dialog";
import { TreasurySelect } from "./TreasurySelect";
import { useTreasuryOptions } from "../../hooks/useProcurement";
import { CoaAccountSelector } from "../accounting/CoaAccountSelector";
import { useAccounts, useIsCompanyWide } from "../../hooks/useAccounting";
import { SearchableSelect } from "../ui/SearchableSelect";
import { useClients } from "../../hooks/useClients";
import { useEmployees } from "../../hooks/useEmployees";
import type { GetEmployeesParams } from "../../api/endpoints/employees";
import { useOperatingUnits } from "../../hooks/usePartners";
import { formatNumber, localDateIso } from "../../lib/utils/format";
import { LEDGER_ERROR_MESSAGE, apiErrorMessage } from "../../api/endpoints/production";
import { EMPLOYEE_ADVANCES_ROOT_CODE, TREASURY_ROOT_CODE, accountSubtreeIds } from "../../lib/utils/coa";
import { useCreateTreasuryVoucher } from "../../hooks/useTreasuryVouchers";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import type {
  TreasuryVoucher,
  TreasuryVoucherKind,
  CreateTreasuryVoucherPayload,
} from "../../api/endpoints/treasuryVouchers";
import type { Client, Employee } from "../../types/entities";

export interface TreasuryVoucherDialogProps {
  open: boolean;
  onClose: () => void;
  defaultKind?: TreasuryVoucherKind;
  onSuccessPrint?: (voucher: TreasuryVoucher) => void;
}

export const TreasuryVoucherDialog: React.FC<TreasuryVoucherDialogProps> = ({
  open,
  onClose,
  defaultKind = "receipt",
  onSuccessPrint,
}) => {
  const [kind, setKind] = useState<TreasuryVoucherKind>(defaultKind);
  const [cashAccountId, setCashAccountId] = useState("");
  const [counterMode, setCounterMode] = useState<"client" | "account">("account");
  const [clientId, setClientId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [fxRate, setFxRate] = useState("1");
  const today = localDateIso();
  const [voucherDate, setVoucherDate] = useState(today);
  const [payee, setPayee] = useState("");
  const [description, setDescription] = useState("");
  const [operatingUnitId, setOperatingUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isCompanyWide = useIsCompanyWide();
  const pinnedUnitId = useServerConfigStore((s) => s.operatingUnitId);
  const { data: treasuries = [] } = useTreasuryOptions();
  const { data: accounts = [] } = useAccounts();
  const { data: clients = [] } = useClients();
  const { data: units = [] } = useOperatingUnits();
  // A company-wide caller picks the unit, so list that unit's employees (the advance belongs there).
  // W5-02: a receipt may settle what a deleted employee still owes (the backend refuses only a
  // debit to them, PARTY_EMPLOYEE_DELETED), so receipts list deleted employees too.
  const employeeParams = useMemo(() => {
    const params: GetEmployeesParams = {};
    if (isCompanyWide && operatingUnitId) params.operating_unit_id = operatingUnitId;
    if (kind === "receipt") params.with_trashed = 1;
    return Object.keys(params).length > 0 ? params : undefined;
  }, [isCompanyWide, operatingUnitId, kind]);
  const { data: employees = [] } = useEmployees(employeeParams);

  const createMutation = useCreateTreasuryVoucher();

  // Reset or initialize when opened
  useEffect(() => {
    if (open) {
      setKind(defaultKind);
      setCashAccountId("");
      setCounterMode("account");
      setClientId(null);
      setSelectedAccountId(null);
      setEmployeeId(null);
      setAmount("");
      setFxRate("1");
      setVoucherDate(localDateIso());
      setPayee("");
      setDescription("");
      setOperatingUnitId("");
      setError(null);
    }
  }, [open, defaultKind]);

  const selectedTreasury = treasuries.find((t) => t.id === cashAccountId);
  const isLyd =
    !selectedTreasury?.currency ||
    selectedTreasury.currency === "LYD" ||
    selectedTreasury.currency === "د.ل";

  const client = clients.find((c) => c.id === clientId) ?? null;
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // W5-00: treasury accounts are the 121 subtree by parent; 1214/1215 now sit under 12.
  const treasuryAccountIds = useMemo(() => accountSubtreeIds(accounts, TREASURY_ROOT_CODE), [accounts]);
  const advanceAccountIds = useMemo(() => accountSubtreeIds(accounts, EMPLOYEE_ADVANCES_ROOT_CODE), [accounts]);
  // The backend also refuses any account a cash account is linked to (VOUCHER_COUNTER_IS_TREASURY),
  // e.g. a pre-W5-00 treasury still linked to 1214/1215; the options list spans every unit.
  const linkedTreasuryCodes = useMemo(
    () => new Set(treasuries.map((t) => t.account_code).filter((code): code is string => Boolean(code))),
    [treasuries],
  );
  const needsEmployee =
    counterMode === "account" && selectedAccountId !== null && advanceAccountIds.has(selectedAccountId);
  const unitEmployees = employees.filter(
    (emp) =>
      (!isCompanyWide || emp.operating_unit_id === operatingUnitId) &&
      // A payment would charge a new advance, which a deleted employee cannot take.
      (kind === "receipt" || !emp.deleted_at),
  );
  const employee = unitEmployees.find((emp) => emp.id === employeeId) ?? null;
  // The backend looks the voucher's employee up under the pinned unit (X-Operating-Unit-ID), so a
  // company-wide caller can only name an employee of the unit pinned in the top bar. Until that
  // lookup is lifted server-side, an advance for another unit's employee needs a unit switch first.
  const employeeUnitBlocked =
    needsEmployee && isCompanyWide && !!pinnedUnitId && !!operatingUnitId && operatingUnitId !== pinnedUnitId;
  const pinnedUnitName = units.find((u) => u.id === pinnedUnitId)?.name;
  const employeeUnitBlockedMessage = `لا يمكن تحديد موظف من وحدة غير الوحدة المحددة في الشريط العلوي${
    pinnedUnitName ? ` («${pinnedUnitName}»)` : ""
  } — بدّل الوحدة من الشريط العلوي أو اختر الوحدة نفسها للسند.`;

  const numAmount = Number(amount);
  const numFxRate = Number(fxRate);
  const computedLyd = (numAmount || 0) * (numFxRate || 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cashAccountId) {
      setError("يرجى اختيار الخزينة.");
      return;
    }

    if (counterMode === "client" && !clientId) {
      setError("يرجى اختيار العميل.");
      return;
    }

    if (counterMode === "account" && !selectedAccount?.account_code) {
      setError("يرجى اختيار الحساب المقابل.");
      return;
    }

    if (employeeUnitBlocked) {
      setError(employeeUnitBlockedMessage);
      return;
    }

    if (needsEmployee && !employee) {
      setError(LEDGER_ERROR_MESSAGE.PARTY_EMPLOYEE_REQUIRED);
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setError("المبلغ يجب أن يكون أكبر من صفر.");
      return;
    }

    if (!isLyd && (!numFxRate || numFxRate <= 0)) {
      setError("سعر الصرف مطلوب ويجب أن يكون أكبر من صفر.");
      return;
    }

    if (!description.trim()) {
      setError("البيان مطلوب.");
      return;
    }

    if (isCompanyWide && !operatingUnitId) {
      setError("يرجى اختيار الوحدة التشغيلية.");
      return;
    }

    const payload: CreateTreasuryVoucherPayload = {
      kind,
      cash_account_id: cashAccountId,
      amount: numAmount,
      voucher_date: voucherDate || undefined,
      payee: payee.trim() || undefined,
      description: description.trim(),
      operating_unit_id:
        isCompanyWide && operatingUnitId ? operatingUnitId : undefined,
    };

    if (counterMode === "client") {
      if (!clientId) {
        setError("يرجى اختيار العميل.");
        return;
      }
      payload.client_id = clientId;
    } else {
      if (!selectedAccount?.account_code) {
        setError("يرجى اختيار الحساب المقابل.");
        return;
      }
      payload.counter_account_code = selectedAccount.account_code;
      if (needsEmployee && employee) {
        payload.employee_id = employee.id;
      }
    }

    if (!isLyd) {
      payload.fx_rate = numFxRate;
    }

    createMutation.mutate(payload, {
      onSuccess: (newVoucher) => {
        onClose();
        if (onSuccessPrint) {
          onSuccessPrint(newVoucher);
        }
      },
      onError: (err) => {
        setError(apiErrorMessage(err, "تعذر تسجيل السند."));
      },
    });
  };

  const isReceipt = kind === "receipt";
  const title = isReceipt ? "سند قبض جديد" : "سند صرف جديد";
  const clientToggleLabel = isReceipt ? "من عميل" : "إلى عميل";
  const payeeFieldLabel = isReceipt ? "اسم الدافع (المستلم منه)" : "اسم المستلم (المصروف له)";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="2xl">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle>{title}</DialogTitle>
            <div className="flex items-center gap-1 bg-app-bg-secondary p-1 rounded-xl border border-app-separator text-xs ms-4">
              <button
                type="button"
                onClick={() => setKind("receipt")}
                className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                  isReceipt
                    ? "bg-app-status-positive/20 text-app-status-positive shadow-sm"
                    : "text-app-label-secondary hover:text-app-label-primary"
                }`}
              >
                سند قبض
              </button>
              <button
                type="button"
                onClick={() => setKind("payment")}
                className={`px-3 py-1 rounded-lg font-bold transition-colors ${
                  !isReceipt
                    ? "bg-app-status-danger/20 text-app-status-danger shadow-sm"
                    : "text-app-label-secondary hover:text-app-label-primary"
                }`}
              >
                سند صرف
              </button>
            </div>
          </div>
          <DialogClose />
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            {error && (
              <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs font-semibold text-app-status-danger">
                {error}
              </div>
            )}

            {/* Treasury Select */}
            <div className="space-y-1.5">
              <TreasurySelect
                value={cashAccountId}
                onChange={setCashAccountId}
                label={isReceipt ? "الخزينة المودع فيها" : "الخزينة المصروف منها"}
              />
              {selectedTreasury && (
                <div className="flex items-center justify-between rounded-lg border border-app-separator bg-app-bg-secondary/60 px-3 py-1.5 text-[11px] font-mono text-app-label-secondary">
                  <span>الرصيد الدفتري الحالي:</span>
                  <span className="font-bold text-app-label-primary">
                    {formatNumber(selectedTreasury.ledger_balance)} {selectedTreasury.currency || "LYD"}
                  </span>
                </div>
              )}
            </div>

            {/* Counter Party Mode Toggle (Client vs Account) */}
            <div className="space-y-2 rounded-xl border border-app-separator bg-app-bg-secondary/40 p-3">
              <label className="block text-xs font-semibold text-app-label-secondary">
                الطرف المقابل <span className="text-app-status-danger">*</span>
              </label>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setCounterMode("account")}
                  className={`rounded-lg border py-2 px-3 font-bold transition-colors ${
                    counterMode === "account"
                      ? "border-app-accent bg-app-accent/10 text-app-accent"
                      : "border-app-separator bg-app-bg-primary text-app-label-secondary hover:text-app-label-primary"
                  }`}
                >
                  حساب مالي من دليل الحسابات
                </button>
                <button
                  type="button"
                  onClick={() => setCounterMode("client")}
                  className={`rounded-lg border py-2 px-3 font-bold transition-colors ${
                    counterMode === "client"
                      ? "border-app-accent bg-app-accent/10 text-app-accent"
                      : "border-app-separator bg-app-bg-primary text-app-label-secondary hover:text-app-label-primary"
                  }`}
                >
                  {clientToggleLabel}
                </button>
              </div>

              {counterMode === "client" ? (
                <div className="space-y-2 pt-1">
                  <SearchableSelect<Client>
                    options={clients}
                    value={client}
                    onChange={(c) => {
                      setClientId(c ? c.id : null);
                      if (c?.entity?.name && !payee.trim()) {
                        setPayee(c.entity.name);
                      }
                    }}
                    getOptionId={(c) => c.id}
                    getOptionLabel={(c) => c.entity?.name ?? c.id}
                    getOptionSubLabel={(c) => c.entity?.primary_contact?.phone ?? undefined}
                    getOptionSearchText={(c) =>
                      `${c.entity?.name ?? ""} ${c.entity?.primary_contact?.phone ?? ""}`
                    }
                    placeholder="ابحث عن العميل بالاسم أو الهاتف…"
                    size="sm"
                  />
                  {client && (
                    <div className="flex flex-wrap gap-3 rounded-lg border border-app-separator bg-app-bg-primary px-3 py-1.5 text-[11px] font-mono text-app-label-secondary">
                      <span>
                        الرصيد المستحق:{" "}
                        <strong className="text-app-label-primary">
                          {formatNumber(Number(client.current_balance ?? 0))} د.ل
                        </strong>
                      </span>
                      {client.account && (
                        <span>
                          حساب الأستاذ: {client.account.account_code} — {client.account.name}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <CoaAccountSelector
                    entityTypeLabel="الحساب المقابل"
                    selectedAccountId={selectedAccountId}
                    onSelectedAccountIdChange={(id) => {
                      setSelectedAccountId(id);
                      if (!id || !advanceAccountIds.has(id)) {
                        setEmployeeId(null);
                      }
                      const acc = accounts.find((a) => a.id === id);
                      if (acc?.name && !payee.trim()) {
                        setPayee(acc.name);
                      }
                    }}
                    filter={(a) => !treasuryAccountIds.has(a.id) && !linkedTreasuryCodes.has(a.account_code)}
                    hideActionToggle
                  />
                  {needsEmployee && (
                    <div>
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        الموظف <span className="text-app-status-danger">*</span>
                      </label>
                      <SearchableSelect<Employee>
                        options={unitEmployees}
                        value={employee}
                        onChange={(emp) => {
                          setEmployeeId(emp ? emp.id : null);
                          const name = emp?.entity?.name;
                          if (name && (!payee.trim() || payee === selectedAccount?.name)) {
                            setPayee(name);
                          }
                        }}
                        getOptionId={(emp) => emp.id}
                        getOptionLabel={(emp) => `${emp.entity?.name ?? emp.id}${emp.deleted_at ? " (محذوف)" : ""}`}
                        getOptionSubLabel={(emp) => emp.job_title || undefined}
                        getOptionSearchText={(emp) => `${emp.entity?.name ?? ""} ${emp.job_title ?? ""}`}
                        placeholder={
                          isCompanyWide && !operatingUnitId
                            ? "اختر الوحدة التشغيلية أولاً…"
                            : "ابحث عن الموظف بالاسم…"
                        }
                        disabled={(isCompanyWide && !operatingUnitId) || employeeUnitBlocked}
                        required
                        size="sm"
                      />
                      {employeeUnitBlocked ? (
                        <p className="mt-1 text-[11px] text-app-status-warning">{employeeUnitBlockedMessage}</p>
                      ) : (
                        <p className="mt-1 text-[11px] text-app-label-secondary">
                          حساب سلف الموظفين يتطلب تحديد الموظف.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Amount and FX Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  المبلغ ({selectedTreasury?.currency || "LYD"}) <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.0001"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-sm font-mono focus:border-app-accent focus:outline-none"
                />
              </div>

              {!isLyd ? (
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    سعر الصرف مقابل الدينار <span className="text-app-status-danger">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.0001"
                    required
                    value={fxRate}
                    onChange={(e) => setFxRate(e.target.value)}
                    placeholder="1.0000"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-sm font-mono focus:border-app-accent focus:outline-none"
                  />
                  <div className="mt-1 text-[11px] font-mono text-app-label-secondary">
                    المعادل بالدينار:{" "}
                    <span className="font-bold text-app-label-primary">
                      {formatNumber(computedLyd)} د.ل
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    التاريخ <span className="text-app-status-danger">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    max={today}
                    value={voucherDate}
                    onChange={(e) => setVoucherDate(e.target.value)}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                  />
                </div>
              )}
            </div>

            {!isLyd && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  التاريخ <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="date"
                  required
                  max={today}
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-mono focus:border-app-accent focus:outline-none"
                />
              </div>
            )}

            {/* Payee / Receiver */}
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                {payeeFieldLabel}
              </label>
              <input
                type="text"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="مثال: الاسم الشخصي أو الجهة المستلمة/الدافعة…"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                البيان <span className="text-app-status-danger">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="اكتب بياناً تفصيلياً لسبب القبض أو الصرف…"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
              />
            </div>

            {/* Operating Unit for Company-Wide Users */}
            {isCompanyWide && (
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  الوحدة التشغيلية <span className="text-app-status-danger">*</span>
                </label>
                <select
                  value={operatingUnitId}
                  onChange={(e) => {
                    setOperatingUnitId(e.target.value);
                    // The advance belongs to the employee's unit, so a unit change drops the pick.
                    setEmployeeId(null);
                  }}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs focus:border-app-accent focus:outline-none"
                >
                  <option value="">اختر الوحدة…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
            >
              {createMutation.isPending ? "جارٍ الحفظ…" : "حفظ وترحيل السند"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
