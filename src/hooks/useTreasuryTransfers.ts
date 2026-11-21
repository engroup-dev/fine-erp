import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getTreasuryTransfers,
  getTreasuryTransfer,
  createTreasuryTransfer,
  approveTreasuryTransfer,
  rejectTreasuryTransfer,
  cancelTreasuryTransfer,
  type TreasuryTransferFilters,
  type CreateTreasuryTransferPayload,
  type ApproveTreasuryTransferPayload,
  type RejectTreasuryTransferPayload,
} from "../api/endpoints/treasuryTransfers";
import { useIsCompanyWide } from "./useAccounting";

const ACCOUNTING_QUERY_KEYS = [
  "journalEntries",
  "journalEntry",
  "accounts",
  "account",
  "trialBalance",
  "accountLedger",
  "incomeStatement",
  "balanceSheet",
  "unitProfitability",
] as const;

/**
 * A company-wide approver (owner, accounting manager) must see pending
 * transfers from every unit, not only the unit pinned in the top bar.
 */
export function useTreasuryTransfers(filters?: Omit<TreasuryTransferFilters, "company_wide">) {
  const companyWide = useIsCompanyWide();
  return useQuery({
    queryKey: ["treasuryTransfers", filters, companyWide],
    queryFn: () =>
      getTreasuryTransfers(companyWide ? { ...filters, company_wide: 1 } : filters),
  });
}

export function useTreasuryTransfer(id: string | null) {
  return useQuery({
    queryKey: ["treasuryTransfers", id],
    queryFn: () => getTreasuryTransfer(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateTreasuryTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateTreasuryTransferPayload) => createTreasuryTransfer(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasuryTransfers"] });
    },
  });
}

export function useApproveTreasuryTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: ApproveTreasuryTransferPayload }) =>
      approveTreasuryTransfer(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasuryTransfers"] });
      qc.invalidateQueries({ queryKey: ["cashAccounts"] });
      qc.invalidateQueries({ queryKey: ["treasuryOptions"] });
      qc.invalidateQueries({ queryKey: ["cashAccountStatement"] });
      for (const key of ACCOUNTING_QUERY_KEYS) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useRejectTreasuryTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RejectTreasuryTransferPayload }) =>
      rejectTreasuryTransfer(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasuryTransfers"] });
    },
  });
}

export function useCancelTreasuryTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelTreasuryTransfer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasuryTransfers"] });
    },
  });
}
