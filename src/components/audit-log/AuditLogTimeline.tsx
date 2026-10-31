import React, { useState } from "react";
import { ChevronDown, ChevronUp, Clock, User as UserIcon } from "lucide-react";
import { cn } from "../../lib/utils/utils";
import { AuditAction, AuditLogEntry } from "../../types/entities";
import { AuditLogDiff } from "./AuditLogDiff";

export const ACTION_LABEL: Record<AuditAction, string> = {
  created: "إنشاء",
  updated: "تعديل",
  deleted: "حذف",
  restored: "استعادة",
  merged: "دمج",
};

export const ACTION_CHIP: Record<AuditAction, string> = {
  created: "bg-app-status-positive/15 text-app-status-positive",
  updated: "bg-app-status-warning/15 text-app-status-warning",
  deleted: "bg-app-status-danger/15 text-app-status-danger",
  restored: "bg-app-accent/15 text-app-accent",
  merged: "bg-app-accent/15 text-app-accent",
};

const formatDateTime = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface AuditLogTimelineProps {
  entries: AuditLogEntry[];
  userLookup?: Record<string, string>;
  emptyMessage?: string;
}

export const AuditLogTimeline: React.FC<AuditLogTimelineProps> = ({
  entries,
  userLookup,
  emptyMessage = "لا توجد سجلات نشاط.",
}) => {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-6 text-center text-xs text-app-label-secondary">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <AuditLogTimelineEntry
          key={entry.id}
          entry={entry}
          userName={(entry.user_id ? userLookup?.[entry.user_id] : undefined) ?? entry.user?.name}
        />
      ))}
    </ol>
  );
};

const AuditLogTimelineEntry: React.FC<{
  entry: AuditLogEntry;
  userName?: string;
}> = ({ entry, userName }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = entry.action === "updated";

  return (
    <li className="rounded-2xl border border-app-separator bg-app-bg-primary p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 inline-flex h-6 items-center rounded-full px-2 text-[10px] font-bold uppercase",
              ACTION_CHIP[entry.action] ?? "bg-app-bg-secondary text-app-label-secondary",
            )}
          >
            {ACTION_LABEL[entry.action] ?? entry.action}
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs text-app-label-primary">
              {userName && (
                <span className="flex items-center gap-1 font-semibold">
                  <UserIcon className="h-3 w-3 text-app-label-secondary" />
                  {userName}
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] text-app-label-secondary">
                <Clock className="h-3 w-3" />
                {formatDateTime(entry.created_at)}
              </span>
              {entry.ip_address && (
                <span className="text-[10px] font-mono text-app-label-tertiary">
                  {entry.ip_address}
                </span>
              )}
            </div>
            {hasDiff && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 self-start text-[11px] font-semibold text-app-accent hover:underline"
              >
                {expanded ? "إخفاء الفروقات" : "عرض الفروقات"}
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>
      </div>
      {expanded && hasDiff && (
        <div className="mt-3">
          <AuditLogDiff oldValues={entry.old_values} newValues={entry.new_values} />
        </div>
      )}
    </li>
  );
};

export default AuditLogTimeline;
