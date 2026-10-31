import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AuditLogSearchQuery,
  getAuditLogs,
  getAuditTables,
  searchAuditLogs,
} from "../api/endpoints/auditLogs";
import {
  BlueprintEntry,
  OperatingUnit,
  OperatingUnitCreatePayload,
  OperatingUnitUpdatePayload,
  UnitBlueprintCreatePayload,
  UnitBlueprintUpdatePayload,
} from "../types/entities";
import {
  createOperatingUnit,
  createUnitBlueprint,
  deleteOperatingUnit,
  deleteUnitBlueprint,
  getOperatingUnit,
  getOperatingUnits,
  getUnitBlueprint,
  getUnitBlueprints,
  restoreOperatingUnit,
  restoreUnitBlueprint,
  updateOperatingUnit,
  updateUnitBlueprint,
} from "../api/endpoints/operatingUnits";

export function useOperatingUnits(options: { withTrashed?: boolean } = {}) {
  return useQuery({
    queryKey: ["operatingUnits", options],
    queryFn: () => getOperatingUnits({ withTrashed: options.withTrashed }),
  });
}

export function useOperatingUnit(id?: string) {
  return useQuery({
    queryKey: ["operatingUnit", id],
    queryFn: () => getOperatingUnit(id as string),
    enabled: Boolean(id),
  });
}

export function useUnitBlueprints(options: { withTrashed?: boolean } = {}) {
  return useQuery({
    queryKey: ["unitBlueprints", options],
    queryFn: () => getUnitBlueprints({ withTrashed: options.withTrashed }),
  });
}

export function useUnitBlueprint(id?: string) {
  return useQuery({
    queryKey: ["unitBlueprint", id],
    queryFn: () => getUnitBlueprint(id as string),
    enabled: Boolean(id),
  });
}

export function useAuditLog(args: {
  table: string;
  recordId: string | undefined;
  action?: "created" | "updated" | "deleted" | "restored" | "merged";
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: ["auditLog", args.table, args.recordId, args.action, args.from, args.to],
    queryFn: () =>
      getAuditLogs({
        table: args.table,
        recordId: args.recordId as string,
        action: args.action,
        from: args.from,
        to: args.to,
      }),
    enabled: Boolean(args.recordId),
  });
}

/**
 * Retry network/5xx failures (up to 3 times, like the app default) but not a 4xx: a 403 from
 * the unit scope or a 422 on the filters is final, and retrying only delays the error panel
 * while keepPreviousData shows stale rows under the new filters.
 */
export const retryUnlessClientError = (failureCount: number, error: unknown): boolean => {
  const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 3;
};

/** W6-01: the company-wide audit log viewer — one server page of GET /audit-logs. */
export function useAuditLogSearch(query: AuditLogSearchQuery) {
  return useQuery({
    queryKey: ["auditLog", "search", query],
    queryFn: () => searchAuditLogs(query),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

/** W6-01: the audited table names for the viewer's table filter. */
export function useAuditTables() {
  return useQuery({
    queryKey: ["auditLog", "tables"],
    queryFn: getAuditTables,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessClientError,
  });
}

function invalidateOperatingUnits(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["operatingUnits"] });
  qc.invalidateQueries({ queryKey: ["operatingUnit"] });
  qc.invalidateQueries({ queryKey: ["users"] });
  qc.invalidateQueries({ queryKey: ["entities"] });
  qc.invalidateQueries({ queryKey: ["employees"] });
  qc.invalidateQueries({ queryKey: ["suppliers"] });
  qc.invalidateQueries({ queryKey: ["clients"] });
  qc.invalidateQueries({ queryKey: ["salesOrders"] });
}

export function useCreateOperatingUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OperatingUnitCreatePayload) => createOperatingUnit(payload),
    onSuccess: () => invalidateOperatingUnits(qc),
  });
}

export function useUpdateOperatingUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & OperatingUnitUpdatePayload) =>
      updateOperatingUnit(id, patch),
    onSuccess: (_, vars) => {
      invalidateOperatingUnits(qc);
      qc.invalidateQueries({ queryKey: ["auditLog", "operating_units", vars.id] });
    },
  });
}

export function useDeleteOperatingUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOperatingUnit(id),
    onSuccess: () => invalidateOperatingUnits(qc),
  });
}

export function useRestoreOperatingUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreOperatingUnit(id),
    onSuccess: () => invalidateOperatingUnits(qc),
  });
}

function invalidateBlueprints(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["unitBlueprints"] });
  qc.invalidateQueries({ queryKey: ["unitBlueprint"] });
  qc.invalidateQueries({ queryKey: ["operatingUnits"] });
  qc.invalidateQueries({ queryKey: ["operatingUnit"] });
}

export function useCreateUnitBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UnitBlueprintCreatePayload) => createUnitBlueprint(payload),
    onSuccess: () => invalidateBlueprints(qc),
  });
}

export function useUpdateUnitBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & UnitBlueprintUpdatePayload) =>
      updateUnitBlueprint(id, patch),
    onSuccess: (_, vars) => {
      invalidateBlueprints(qc);
      qc.invalidateQueries({ queryKey: ["auditLog", "unit_blueprints", vars.id] });
    },
  });
}

export function useDeleteUnitBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUnitBlueprint(id),
    onSuccess: () => invalidateBlueprints(qc),
  });
}

export function useRestoreUnitBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreUnitBlueprint(id),
    onSuccess: () => invalidateBlueprints(qc),
  });
}

export type {
  BlueprintEntry,
  OperatingUnit,
  OperatingUnitCreatePayload,
  OperatingUnitUpdatePayload,
  UnitBlueprintCreatePayload,
  UnitBlueprintUpdatePayload,
};
