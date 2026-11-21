import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getBankReconciliations,
  getBankReconciliation,
  createBankReconciliation,
  toggleReconciliationLines,
  finishBankReconciliation,
  discardBankReconciliation,
  addReconciliationAdjustment,
  removeReconciliationAdjustment,
  type AddReconciliationAdjustmentPayload,
  type CreateBankReconciliationPayload,
  type ToggleReconciliationLinesPayload,
  type BankReconciliationDetail,
} from "../api/endpoints/bankReconciliations";
import { apiErrorMessage } from "../api/endpoints/production";
import { toast } from "../stores/toastStore";

export function useBankReconciliations(cashAccountId?: string) {
  return useQuery({
    queryKey: ["bankReconciliations", cashAccountId],
    queryFn: () => getBankReconciliations(cashAccountId),
    enabled: Boolean(cashAccountId),
  });
}

export function useBankReconciliation(id: string | null) {
  return useQuery({
    queryKey: ["bankReconciliation", id],
    queryFn: () => getBankReconciliation(id as string),
    enabled: Boolean(id),
  });
}

export function useCreateBankReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBankReconciliationPayload) => createBankReconciliation(payload),
    onSuccess: (data: BankReconciliationDetail) => {
      qc.setQueryData(["bankReconciliation", data.reconciliation.id], data);
      qc.invalidateQueries({ queryKey: ["bankReconciliations"] });
    },
  });
}

export function useToggleReconciliationLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ToggleReconciliationLinesPayload }) =>
      toggleReconciliationLines(id, payload),
    onSuccess: (data: BankReconciliationDetail, variables) => {
      qc.setQueryData(["bankReconciliation", variables.id], data);
    },
    // A refused tick used to look like nothing happened.
    onError: (err) => {
      toast.error(apiErrorMessage(err, "تعذر تحديث حالة الحركات."));
    },
  });
}

export function useFinishBankReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => finishBankReconciliation(id),
    onSuccess: (data: BankReconciliationDetail, id: string) => {
      qc.setQueryData(["bankReconciliation", id], data);
      qc.invalidateQueries({ queryKey: ["bankReconciliations"] });
    },
  });
}

export function useDiscardBankReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => discardBankReconciliation(id),
    onSuccess: (_data: void, id: string) => {
      qc.removeQueries({ queryKey: ["bankReconciliation", id] });
      qc.invalidateQueries({ queryKey: ["bankReconciliations"] });
    },
  });
}

/** An adjustment posts a voucher, so voucher lists and treasury balances move too. */
function invalidateAfterAdjustment(qc: ReturnType<typeof useQueryClient>, id: string, data: BankReconciliationDetail) {
  qc.setQueryData(["bankReconciliation", id], data);
  qc.invalidateQueries({ queryKey: ["bankReconciliations"] });
  qc.invalidateQueries({ queryKey: ["treasuryVouchers"] });
  qc.invalidateQueries({ queryKey: ["cashAccounts"] });
  qc.invalidateQueries({ queryKey: ["treasuryOptions"] });
}

export function useAddReconciliationAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AddReconciliationAdjustmentPayload }) =>
      addReconciliationAdjustment(id, payload),
    onSuccess: (data: BankReconciliationDetail, variables) => invalidateAfterAdjustment(qc, variables.id, data),
  });
}

export function useRemoveReconciliationAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, adjustmentId }: { id: string; adjustmentId: string }) =>
      removeReconciliationAdjustment(id, adjustmentId),
    onSuccess: (data: BankReconciliationDetail, variables) => invalidateAfterAdjustment(qc, variables.id, data),
  });
}
