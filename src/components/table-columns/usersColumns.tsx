import { useMemo } from "react";
import { KeyRound, Pencil, ShieldCheck, Undo2, UserCheck, UserX, Trash2, Eye } from "lucide-react";
import { ColumnDef } from "../ui/DataTable";
import { RowActionsMenu, RowActionItem } from "../ui/RowActionsMenu";
import { AppUser } from "../../api/endpoints/users";

export interface UseUsersColumnsArgs {
  currentUserId: string | number | undefined;
  unitName: (id: string | null) => string;
  onViewDetails?: (user: AppUser) => void;
  onOpenRoles: (user: AppUser) => void;
  onEdit: (user: AppUser) => void;
  onToggleActive: (user: AppUser) => void;
  onDelete: (user: AppUser) => void;
  onRestore: (user: AppUser) => void;
}

export function useUsersColumns({
  currentUserId,
  unitName,
  onViewDetails,
  onOpenRoles,
  onEdit,
  onToggleActive,
  onDelete,
  onRestore,
}: UseUsersColumnsArgs): ColumnDef<AppUser, unknown>[] {
  return useMemo<ColumnDef<AppUser, unknown>[]>(
    () => [
      {
        id: "user",
        header: "المستخدم",
        meta: { exportValue: (u) => [u.name, u.email, u.phone].filter(Boolean).join(" — ") },
        accessorFn: (u) =>
          [u.name, u.email, u.phone, ...(u.roles?.map((r) => r.name) ?? [])].filter(Boolean).join(" "),
        cell: ({ row }) => (
          <div>
            {onViewDetails ? (
              <button
                type="button"
                onClick={() => onViewDetails(row.original)}
                className="font-bold text-app-label-primary hover:text-app-accent hover:underline text-start"
              >
                {row.original.name}
              </button>
            ) : (
              <div className="font-bold">{row.original.name}</div>
            )}
            <div className="text-app-label-secondary font-mono text-xs flex items-center gap-2" dir="ltr">
              {row.original.email && <span>{row.original.email}</span>}
              {row.original.email && row.original.phone && <span>•</span>}
              {row.original.phone && <span>{row.original.phone}</span>}
            </div>
          </div>
        ),
      },
      {
        id: "roles",
        header: "الأدوار",
        meta: { exportValue: (u) => (u.roles ?? []).map((r) => `${r.name} · ${unitName(r.pivot?.operating_unit_id ?? null)}`).join("، ") },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.roles?.length ? (
              row.original.roles.map((r, i) => (
                <span
                  key={`${r.id}-${r.pivot?.operating_unit_id ?? "company"}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-app-accent-subtle px-2.5 py-1 text-[11px] font-semibold text-app-accent"
                >
                  {r.name}
                  <span className="text-app-label-tertiary">
                    · {unitName(r.pivot?.operating_unit_id ?? null)}
                  </span>
                </span>
              ))
            ) : (
              <span className="text-app-label-tertiary">بدون أدوار</span>
            )}
          </div>
        ),
      },
      {
        id: "status",
        header: "الحالة",
        meta: { exportValue: (u) => (u.is_active ? "مفعل" : "معطل") },
        accessorFn: (u) => u.is_active,
        cell: ({ row }) => (
          <>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
                row.original.is_active
                  ? "bg-app-status-positive/15 text-app-status-positive"
                  : "bg-app-status-danger/15 text-app-status-danger"
              }`}
            >
              {row.original.is_active ? "مفعل" : "معطل"}
            </span>
            {row.original.must_change_password && (
              <span className="ms-2 inline-flex items-center gap-1 text-[10px] text-app-label-tertiary">
                <KeyRound className="w-3 h-3" /> بانتظار تغيير كلمة المرور
              </span>
            )}
          </>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { export: false, align: "end" },
        cell: ({ row }) => {
          const u = row.original;
          if (u.deleted_at) {
            return (
              <button
                type="button"
                onClick={() => onRestore(u)}
                className="rounded-lg border border-app-accent/40 bg-app-accent/10 px-2 py-1 text-[11px] font-bold text-app-accent hover:bg-app-accent/20"
              >
                <Undo2 className="me-1 inline h-3 w-3" />
                استعادة
              </button>
            );
          }
          const items: RowActionItem[] = [];
          if (onViewDetails) {
            items.push({
              label: "عرض التفاصيل",
              icon: Eye,
              onClick: () => onViewDetails(u),
            });
          }
          items.push(
            { label: "الأدوار", icon: ShieldCheck, onClick: () => onOpenRoles(u) },
            { label: "تعديل", icon: Pencil, onClick: () => onEdit(u) },
            {
              label: u.is_active ? "تعطيل" : "تفعيل",
              icon: u.is_active ? UserX : UserCheck,
              onClick: () => onToggleActive(u),
            }
          );
          if (u.id !== currentUserId) {
            items.push({
              label: "حذف",
              icon: Trash2,
              danger: true,
              onClick: () => onDelete(u),
            });
          }
          return <RowActionsMenu items={items} />;
        },
      },
    ],
    [currentUserId, unitName, onViewDetails, onOpenRoles, onEdit, onToggleActive, onDelete, onRestore]
  );
}
