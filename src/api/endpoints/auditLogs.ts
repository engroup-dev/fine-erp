import apiClient from "../client";
import {
  AuditAction,
  AuditLogEntry,
  AuditLogFilters,
  AuditLogSearchFilters,
} from "../../types/entities";

export interface AuditLogQuery extends AuditLogFilters {
  table: string;
  recordId: string;
}

export const getAuditLogs = async ({
  table,
  recordId,
  action,
  from,
  to,
}: AuditLogQuery): Promise<AuditLogEntry[]> => {
  const params: Record<string, string> = {};
  if (action) params.action = action;
  if (from) params.from = from;
  if (to) params.to = to;
  const response = await apiClient.get<{ data: AuditLogEntry[] } | AuditLogEntry[]>(
    `/audit-logs/${table}/${recordId}`,
    { params },
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data?.data ?? [];
};

/** W6-01: one page of GET /audit-logs (a Laravel resource paginator), newest first. */
export interface AuditLogPage {
  data: AuditLogEntry[];
  meta?: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface AuditLogSearchQuery extends AuditLogSearchFilters {
  page?: number;
  /** 1..200 on the server; it defaults to 50. */
  per_page?: number;
}

/** Drops empty filters so the server never validates a blank uuid/date. */
const searchParams = (query: AuditLogSearchQuery): Record<string, string | number> => {
  const params: Record<string, string | number> = {};
  (Object.keys(query) as Array<keyof AuditLogSearchQuery>).forEach((key) => {
    const value = query[key];
    if (value === undefined || value === null) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed !== "") params[key] = trimmed;
      return;
    }
    params[key] = value;
  });
  return params;
};

export const searchAuditLogs = async (query: AuditLogSearchQuery): Promise<AuditLogPage> =>
  (await apiClient.get<AuditLogPage>("/audit-logs", { params: searchParams(query) })).data;

/** W6-01: the distinct audited table names (sorted), for the viewer's table filter. */
export const getAuditTables = async (): Promise<string[]> =>
  (await apiClient.get<{ data: string[] }>("/audit-logs/tables")).data?.data ?? [];

export type { AuditAction, AuditLogEntry, AuditLogFilters, AuditLogSearchFilters };
