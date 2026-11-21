import React, { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ArrowRight,
  User as UserIcon,
  ShieldCheck,
  KeyRound,
  Pencil,
  Trash2,
  Undo2,
  UserCheck,
  UserX,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Search,
  Building2,
} from "lucide-react";
import {
  useUser,
  useUpdateUser,
  useDeleteUser,
  useRestoreUser,
  useAssignRole,
  useRemoveRole,
  useUsers,
} from "../../hooks/useUsers";
import { useRoles } from "../../hooks/useRoles";
import { useOperatingUnits, useAuditLog } from "../../hooks/useOperatingUnits";
import { useAuthStore } from "../../stores/authStore";
import { toast } from "../../stores/toastStore";
import { apiErrorPayload } from "../../api/endpoints/production";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../../components/ui/Dialog";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { AuditLogFiltersBar } from "../../components/audit-log/AuditLogFilters";
import { AuditLogTimeline } from "../../components/audit-log/AuditLogTimeline";
import { AuditLogFilters, OperatingUnit } from "../../types/entities";

const formatDateTime = (iso?: string): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-LY", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const UserDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data: user, isLoading, isError, error } = useUser(id, { withTrashed: true });
  const { data: roles } = useRoles();
  const { data: units } = useOperatingUnits();
  const { data: allUsers } = useUsers({ withTrashed: true });

  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const restoreUser = useRestoreUser();
  const assignRole = useAssignRole();
  const removeRole = useRemoveRole();

  const [activeTab, setActiveTab] = useState<"overview" | "roles" | "audit">("overview");

  // Edit User Dialog state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  // Assign Role Dialog state
  const [showAssignRole, setShowAssignRole] = useState(false);
  const [newRoleId, setNewRoleId] = useState("");
  const [newUnitId, setNewUnitId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);

  // Remove Role confirmation state
  const [roleToRemove, setRoleToRemove] = useState<{
    roleId: string;
    roleName: string;
    operatingUnitId: string | null;
  } | null>(null);

  // Delete & Restore confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showToggleActiveConfirm, setShowToggleActiveConfirm] = useState(false);

  // Permission search
  const [permissionSearch, setPermissionSearch] = useState("");

  // Audit log filters
  const [auditFilters, setAuditFilters] = useState<AuditLogFilters>({});
  const { data: auditLogs, isLoading: auditLoading } = useAuditLog({
    table: "users",
    recordId: id,
    action: auditFilters.action,
    from: auditFilters.from,
    to: auditFilters.to,
  });

  const userLookup = useMemo(() => {
    const map: Record<string, string> = {};
    if (allUsers) {
      allUsers.forEach((u) => {
        map[u.id] = u.name;
      });
    }
    return map;
  }, [allUsers]);

  const COMPANY_WIDE_OPTION: OperatingUnit = { id: "", name: "على مستوى الشركة (عام)" };
  const unitOptions = [COMPANY_WIDE_OPTION, ...(units ?? [])];

  const unitName = (unitId: string | null) =>
    unitId === null
      ? "على مستوى الشركة"
      : units?.find((u) => u.id === unitId)?.name ?? "وحدة غير معروفة أو محذوفة";

  const isDeleted = Boolean(user?.deleted_at);

  const openEditDialog = () => {
    if (!user) return;
    setEditName(user.name);
    setEditEmail(user.email ?? "");
    setEditPhone(user.phone ?? "");
    setEditPassword("");
    setEditIsActive(user.is_active);
    setEditError(null);
    setShowEdit(true);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!editEmail.trim() && !editPhone.trim()) {
      setEditError("يجب توفير البريد الإلكتروني أو رقم الهاتف على الأقل.");
      return;
    }
    if (editPhone.trim() && !/^09\d{8}$/.test(editPhone.trim())) {
      setEditError("رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بـ 09.");
      return;
    }
    if (editPassword.trim() && editPassword.trim().length < 8) {
      setEditError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    setEditError(null);

    const payload: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
      password?: string;
      is_active: boolean;
      record_version: number;
    } = {
      id: user.id,
      name: editName.trim(),
      email: editEmail.trim() || null,
      phone: editPhone.trim() || null,
      is_active: editIsActive,
      record_version: user.record_version,
    };

    if (editPassword.trim()) {
      payload.password = editPassword.trim();
    }

    updateUser.mutate(payload, {
      onSuccess: () => {
        setShowEdit(false);
        toast.success("تم تحديث بيانات المستخدم بنجاح");
      },
      onError: (err: unknown) => {
        setEditError(apiErrorPayload(err)?.message ?? "تعذر تحديث بيانات المستخدم.");
      },
    });
  };

  const submitToggleActive = () => {
    if (!user) return;
    updateUser.mutate(
      {
        id: user.id,
        is_active: !user.is_active,
        record_version: user.record_version,
      },
      {
        onSuccess: () => {
          setShowToggleActiveConfirm(false);
          toast.success(
            user.is_active ? "تم تعطيل حساب المستخدم" : "تم تفعيل حساب المستخدم"
          );
        },
        onError: (err: unknown) => {
          toast.error(apiErrorPayload(err)?.message ?? "تعذر تغيير حالة الحساب.");
        },
      }
    );
  };

  const submitDelete = () => {
    if (!user) return;
    deleteUser.mutate(user.id, {
      onSuccess: () => {
        setShowDeleteConfirm(false);
        toast.success("تم حذف المستخدم بنجاح");
      },
      onError: (err: unknown) => {
        toast.error(apiErrorPayload(err)?.message ?? "تعذر حذف المستخدم.");
      },
    });
  };

  const submitRestore = () => {
    if (!user) return;
    restoreUser.mutate(user.id, {
      onSuccess: () => {
        setShowRestoreConfirm(false);
        toast.success("تم استعادة حساب المستخدم بنجاح");
      },
      onError: (err: unknown) => {
        toast.error(apiErrorPayload(err)?.message ?? "تعذر استعادة المستخدم.");
      },
    });
  };

  const submitAssignRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newRoleId) return;
    setAssignError(null);

    assignRole.mutate(
      {
        userId: user.id,
        roleId: newRoleId,
        operatingUnitId: newUnitId || null,
      },
      {
        onSuccess: () => {
          setShowAssignRole(false);
          setNewRoleId("");
          setNewUnitId("");
          toast.success("تم تعيين الدور بنجاح");
        },
        onError: (err: unknown) => {
          setAssignError(apiErrorPayload(err)?.message ?? "تعذر تعيين الدور.");
        },
      }
    );
  };

  const submitRemoveRole = () => {
    if (!user || !roleToRemove) return;
    removeRole.mutate(
      {
        userId: user.id,
        roleId: roleToRemove.roleId,
        operatingUnitId: roleToRemove.operatingUnitId,
      },
      {
        onSuccess: () => {
          setRoleToRemove(null);
          toast.success("تم إلغاء تعيين الدور بنجاح");
        },
        onError: (err: unknown) => {
          toast.error(apiErrorPayload(err)?.message ?? "تعذر إلغاء تعيين الدور.");
        },
      }
    );
  };

  const isOwner = Boolean(
    user?.role_slugs?.includes("owner") ||
    user?.roles?.some((r) => r.slug === "owner") ||
    user?.permissions?.includes("*")
  );

  const filteredPermissions = useMemo(() => {
    if (!user?.permissions) return [];
    if (!permissionSearch.trim()) return user.permissions;
    const term = permissionSearch.trim().toLowerCase();
    return user.permissions.filter((p) => p.toLowerCase().includes(term));
  }, [user?.permissions, permissionSearch]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-app-label-secondary">
        جارٍ تحميل بيانات المستخدم…
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="space-y-4 p-6">
        <button
          type="button"
          onClick={() => navigate("/users")}
          className="flex items-center gap-1 text-xs font-semibold text-app-accent hover:underline"
        >
          <ArrowRight className="h-4 w-4" />
          العودة لقائمة المستخدمين
        </button>
        <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-6 text-center text-app-status-danger text-sm">
          {apiErrorPayload(error)?.message ?? "تعذر العثور على بيانات المستخدم."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb & Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-app-label-secondary">
          <Link
            to="/users"
            className="flex items-center gap-1 font-semibold text-app-accent hover:underline"
          >
            <ArrowRight className="h-4 w-4" />
            المستخدمون
          </Link>
          <span>/</span>
          <span className="font-semibold text-app-label-primary">{user.name}</span>
        </div>
      </div>

      {/* Deleted Banner */}
      {isDeleted && (
        <div className="flex items-center justify-between rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-app-status-danger">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AlertTriangle className="h-4 w-4" />
            هذا الحساب محذوف (Soft-deleted) منذ {formatDateTime(user.deleted_at ?? undefined)}.
          </div>
          <button
            type="button"
            onClick={() => setShowRestoreConfirm(true)}
            className="flex items-center gap-1 rounded-xl bg-app-status-danger px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90"
          >
            <Undo2 className="h-3.5 w-3.5" />
            استعادة الحساب
          </button>
        </div>
      )}

      {/* Hero Header Card */}
      <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-app-accent/10 text-xl font-bold text-app-accent shadow-inner">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-app-label-primary">{user.name}</h1>
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    user.is_active
                      ? "bg-app-status-positive/15 text-app-status-positive"
                      : "bg-app-status-danger/15 text-app-status-danger"
                  }`}
                >
                  {user.is_active ? "مفعل" : "معطل"}
                </span>

                {user.must_change_password && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-app-status-yellow/15 px-2.5 py-0.5 text-xs font-semibold text-app-status-yellow">
                    <KeyRound className="h-3 w-3" />
                    بانتظار تغيير كلمة المرور
                  </span>
                )}

                {isOwner && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-app-accent-subtle px-2.5 py-0.5 text-xs font-bold text-app-accent">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    مالك النظام
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-3 font-mono text-xs text-app-label-secondary" dir="ltr">
                {user.email && <span>{user.email}</span>}
                {user.email && user.phone && <span>•</span>}
                {user.phone && <span>{user.phone}</span>}
              </div>
            </div>
          </div>

          {/* Actions Menu */}
          <div className="flex flex-wrap items-center gap-2">
            {!isDeleted && (
              <>
                <button
                  type="button"
                  onClick={openEditDialog}
                  className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3.5 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 shadow-sm"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  تعديل البيانات
                </button>

                <button
                  type="button"
                  onClick={() => setShowToggleActiveConfirm(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3.5 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 shadow-sm"
                >
                  {user.is_active ? (
                    <>
                      <UserX className="h-3.5 w-3.5 text-app-status-danger" />
                      تعطيل الحساب
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5 text-app-status-positive" />
                      تفعيل الحساب
                    </>
                  )}
                </button>
              </>
            )}

            {isDeleted ? (
              <button
                type="button"
                onClick={() => setShowRestoreConfirm(true)}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
              >
                <Undo2 className="h-3.5 w-3.5" />
                استعادة
              </button>
            ) : (
              user.id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 px-3.5 py-2 text-xs font-semibold text-app-status-danger hover:bg-app-status-danger/20 shadow-sm"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف الحساب
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-app-separator text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === "overview"
              ? "border-app-accent text-app-accent"
              : "border-transparent text-app-label-secondary hover:text-app-label-primary"
          }`}
        >
          <UserIcon className="h-4 w-4" />
          نظرة عامة والصلاحيات
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("roles")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === "roles"
              ? "border-app-accent text-app-accent"
              : "border-transparent text-app-label-secondary hover:text-app-label-primary"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          الأدوار ونطاقات الوحدات
          {user.roles && user.roles.length > 0 && (
            <span className="rounded-full bg-app-bg-secondary px-2 py-0.5 text-[10px] font-mono">
              {user.roles.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors ${
            activeTab === "audit"
              ? "border-app-accent text-app-accent"
              : "border-transparent text-app-label-secondary hover:text-app-label-primary"
          }`}
        >
          <Clock className="h-4 w-4" />
          سجل التدقيق والنشاط
        </button>
      </div>

      {/* Tab 1: Overview & Permissions */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Basic Info Card */}
          <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm space-y-4">
            <h2 className="flex items-center gap-2 text-sm font-bold text-app-label-primary border-b border-app-separator pb-3">
              <UserIcon className="h-4 w-4 text-app-accent" />
              بيانات الحساب الأساسية
            </h2>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-app-label-secondary">معرّف المستخدم (ID)</div>
                <div className="font-mono text-app-label-primary mt-0.5 break-all text-[11px]">
                  {user.id}
                </div>
              </div>

              <div>
                <div className="text-app-label-secondary">الاسم الكامل</div>
                <div className="font-bold text-app-label-primary mt-0.5">{user.name}</div>
              </div>

              <div>
                <div className="text-app-label-secondary">البريد الإلكتروني</div>
                <div className="font-mono text-app-label-primary mt-0.5" dir="ltr">
                  {user.email || "—"}
                </div>
              </div>

              <div>
                <div className="text-app-label-secondary">رقم الهاتف</div>
                <div className="font-mono text-app-label-primary mt-0.5" dir="ltr">
                  {user.phone || "—"}
                </div>
              </div>

              <div>
                <div className="text-app-label-secondary">حالة الحساب</div>
                <div className="mt-0.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      user.is_active
                        ? "bg-app-status-positive/15 text-app-status-positive"
                        : "bg-app-status-danger/15 text-app-status-danger"
                    }`}
                  >
                    {user.is_active ? "مفعل ومتاح للاستخدام" : "معطل (لا يمكن تسجيل الدخول)"}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-app-label-secondary">حالة كلمة المرور</div>
                <div className="mt-0.5 text-app-label-primary">
                  {user.must_change_password ? (
                    <span className="text-app-status-yellow font-semibold">
                      مطلوب تغييرها عند أول تسجيل دخول
                    </span>
                  ) : (
                    <span className="text-app-status-positive font-semibold">
                      كلمة المرور محددة ومفعلة
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-app-label-secondary">إصدار السجل (Record Version)</div>
                <div className="font-mono text-app-label-primary mt-0.5">
                  v{user.record_version}
                </div>
              </div>

              <div>
                <div className="text-app-label-secondary">تاريخ الإنشاء</div>
                <div className="font-mono text-app-label-primary mt-0.5">
                  {formatDateTime(user.created_at)}
                </div>
              </div>

              <div>
                <div className="text-app-label-secondary">آخر تحديث</div>
                <div className="font-mono text-app-label-primary mt-0.5">
                  {formatDateTime(user.updated_at)}
                </div>
              </div>
            </div>
          </div>

          {/* Effective Permissions Card */}
          <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-app-separator pb-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-app-label-primary">
                <ShieldCheck className="h-4 w-4 text-app-accent" />
                الصلاحيات الفعالة الممنوحة
              </h2>
              {user.permissions && (
                <span className="font-mono text-xs text-app-label-secondary">
                  {isOwner ? "شاملة" : `${user.permissions.length} صلاحية`}
                </span>
              )}
            </div>

            {isOwner ? (
              <div className="rounded-xl border border-app-accent/30 bg-app-accent-subtle p-4 text-xs text-app-accent space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  حساب مالك النظام (Super Admin)
                </div>
                <p className="text-app-label-secondary">
                  يمتلك هذا المستخدم الرمز الشامل <code className="font-mono font-bold">[*]</code> ولديه
                  وصول غير مقيد لكافة وحدات وبيانات وعمليات النظام دون قيود أو استثناءات.
                </p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute start-2.5 top-2 h-3.5 w-3.5 text-app-label-tertiary" />
                  <input
                    type="text"
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                    placeholder="بحث في الصلاحيات الممنوحة…"
                    className="w-full rounded-lg border border-app-separator bg-app-bg-secondary py-1 pe-2 ps-7 text-xs text-app-label-primary placeholder:text-app-label-tertiary focus:outline-none focus:ring-1 focus:ring-app-accent"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1.5 pe-1">
                  {filteredPermissions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-app-label-tertiary">
                      {permissionSearch ? "لا توجد صلاحيات تطابق البحث." : "لا توجد صلاحيات ممنوحة لهذا الحساب."}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {filteredPermissions.map((perm) => (
                        <span
                          key={perm}
                          className="inline-flex items-center gap-1 rounded-lg border border-app-separator bg-app-bg-secondary px-2.5 py-1 font-mono text-[11px] text-app-label-primary"
                        >
                          <CheckCircle2 className="h-3 w-3 text-app-status-positive" />
                          {perm}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Roles & Unit Scopes */}
      {activeTab === "roles" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-app-label-primary flex items-center gap-2">
                <Layers className="h-4 w-4 text-app-accent" />
                الأدوار المسندة ونطاقات العمل
              </h2>
              <p className="text-xs text-app-label-secondary mt-0.5">
                تحدد الأدوار شاشات وعمليات النظام المتاحة، بينما يحدد نطاق الوحدة التشغيلية مجال البيانات المرئي.
              </p>
            </div>

            {!isDeleted && (
              <button
                type="button"
                onClick={() => {
                  setNewRoleId("");
                  setNewUnitId("");
                  setAssignError(null);
                  setShowAssignRole(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                إسناد دور جديد
              </button>
            )}
          </div>

          <div className="overflow-hidden rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
            {!user.roles || user.roles.length === 0 ? (
              <div className="p-8 text-center text-xs text-app-label-secondary">
                لم يتم إسناد أي دور لهذا المستخدم حتى الآن.
              </div>
            ) : (
              <div className="divide-y divide-app-separator">
                {user.roles.map((r, index) => {
                  const operatingUnitId = r.pivot?.operating_unit_id ?? null;
                  return (
                    <div
                      key={`${r.id}-${operatingUnitId ?? "company"}-${index}`}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-app-accent-subtle text-app-accent">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-app-label-primary">
                              {r.name}
                            </span>
                            <span className="rounded font-mono text-[10px] bg-app-fill-f1 px-1.5 py-0.5 text-app-label-secondary">
                              {r.slug}
                            </span>
                          </div>
                          <div className="text-xs text-app-label-secondary mt-0.5">
                            {r.description || "بدون وصف محدد للدور."}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs">
                            <Building2 className="h-3.5 w-3.5 text-app-label-tertiary" />
                            <span className="text-app-label-secondary">نطاق العمل:</span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                operatingUnitId === null
                                  ? "bg-app-accent-subtle text-app-accent"
                                  : "bg-app-bg-secondary text-app-label-primary border border-app-separator"
                              }`}
                            >
                              {unitName(operatingUnitId)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {!isDeleted && (
                        <button
                          type="button"
                          onClick={() =>
                            setRoleToRemove({
                              roleId: r.id,
                              roleName: r.name,
                              operatingUnitId,
                            })
                          }
                          className="flex items-center gap-1 self-end sm:self-auto rounded-lg border border-app-status-danger/30 bg-app-status-danger/5 px-2.5 py-1.5 text-xs font-semibold text-app-status-danger hover:bg-app-status-danger/15"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          إلغاء الإسناد
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Audit Trail */}
      {activeTab === "audit" && (
        <div className="space-y-4">
          <AuditLogFiltersBar filters={auditFilters} onChange={setAuditFilters} />

          {auditLoading ? (
            <div className="flex h-36 items-center justify-center text-xs text-app-label-secondary">
              جارٍ تحميل سجل التدقيق…
            </div>
          ) : (
            <AuditLogTimeline
              entries={auditLogs ?? []}
              userLookup={userLookup}
              emptyMessage="لا توجد سجلات تدقيق مسجلة لهذا المستخدم حتى الآن."
            />
          )}
        </div>
      )}

      {/* Edit User Dialog */}
      <Dialog open={showEdit} onOpenChange={(open) => !open && setShowEdit(false)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تعديل بيانات المستخدم</DialogTitle>
            <DialogDescription>
              تعديل الاسم والبريد الإلكتروني أو تعيين كلمة مرور جديدة وحالة الحساب.
            </DialogDescription>
            <DialogClose />
          </DialogHeader>
          <form onSubmit={submitEdit} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-3">
              {editError && (
                <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-2.5 text-xs text-app-status-danger">
                  {editError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-app-label-secondary">
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-app-label-secondary">
                    البريد الإلكتروني (اختياري)
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    placeholder="name@example.com"
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full font-mono rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-app-label-secondary">
                    رقم الهاتف (اختياري)
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    placeholder="09xxxxxxxx"
                    maxLength={10}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full font-mono rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                    dir="ltr"
                  />
                </div>
              </div>
              <p className="text-[11px] text-app-label-tertiary">
                * يجب توفير البريد الإلكتروني أو رقم الهاتف (10 أرقام يبدأ بـ 09) على الأقل.
              </p>

              <div>
                <label className="mb-1 block text-xs font-semibold text-app-label-secondary">
                  كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="8 أحرف على الأقل"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs text-app-label-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsActive}
                    onChange={(e) => setEditIsActive(e.target.checked)}
                    className="rounded border-app-separator text-app-accent focus:ring-app-accent"
                  />
                  <span>حساب مفعل ومتاح للاستخدام</span>
                </label>
              </div>
            </DialogBody>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={updateUser.isPending}
                className="rounded-xl bg-app-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {updateUser.isPending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Role Dialog */}
      <Dialog open={showAssignRole} onOpenChange={(open) => !open && setShowAssignRole(false)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>إسناد دور للمستخدم</DialogTitle>
            <DialogDescription>
              اختر الدور والنطاق التشغيلي المراد ربط المستخدم به.
            </DialogDescription>
            <DialogClose />
          </DialogHeader>
          <form onSubmit={submitAssignRole} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-4">
              {assignError && (
                <div className="rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-2.5 text-xs text-app-status-danger">
                  {assignError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-app-label-secondary">
                  الدور المراد إسناده
                </label>
                <SearchableSelect<{ id: string; name: string; slug?: string }>
                  options={roles ?? []}
                  value={roles?.find((r) => r.id === newRoleId) ?? null}
                  onChange={(r) => setNewRoleId(r ? r.id : "")}
                  getOptionId={(r) => r.id}
                  getOptionLabel={(r) => (r.slug ? `${r.name} (${r.slug})` : r.name)}
                  placeholder="اختر الدور…"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-app-label-secondary">
                  نطاق الوحدة التشغيلية
                </label>
                <SearchableSelect<OperatingUnit>
                  options={unitOptions}
                  value={unitOptions.find((u) => u.id === newUnitId) ?? null}
                  onChange={(u) => setNewUnitId(u ? u.id : "")}
                  getOptionId={(u) => u.id}
                  getOptionLabel={(u) => u.name}
                  placeholder="على مستوى الشركة"
                  clearable={false}
                />
                <p className="mt-1 text-[11px] text-app-label-tertiary">
                  اختر &quot;على مستوى الشركة&quot; لمنح صلاحيات الدور لجميع الوحدات، أو حدد وحدة تشغيلية بعينها.
                </p>
              </div>
            </DialogBody>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setShowAssignRole(false)}
                className="rounded-xl border border-app-separator px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={!newRoleId || assignRole.isPending}
                className="rounded-xl bg-app-accent px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {assignRole.isPending ? "جارٍ الإسناد…" : "إسناد الدور"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Role Removal Dialog */}
      <ConfirmDialog
        isOpen={Boolean(roleToRemove)}
        title="تأكيد إلغاء إسناد الدور"
        message={`هل أنت متأكد من إلغاء دور "${roleToRemove?.roleName}" عن هذا المستخدم؟`}
        confirmText="إلغاء الإسناد"
        variant="danger"
        isLoading={removeRole.isPending}
        onConfirm={submitRemoveRole}
        onClose={() => setRoleToRemove(null)}
      />

      {/* Confirm Delete User Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="تأكيد حذف المستخدم"
        message={`هل أنت متأكد من رغبتك في حذف المستخدم "${user.name}"؟ سيتم تعطيل الحساب مع إمكانية استعادته لاحقًا.`}
        confirmText="حذف المستخدم"
        variant="danger"
        isLoading={deleteUser.isPending}
        onConfirm={submitDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />

      {/* Confirm Restore User Dialog */}
      <ConfirmDialog
        isOpen={showRestoreConfirm}
        title="تأكيد استعادة المستخدم"
        message={`هل أنت متأكد من رغبتك في استعادة حساب المستخدم "${user.name}"؟`}
        confirmText="استعادة الحساب"
        variant="primary"
        isLoading={restoreUser.isPending}
        onConfirm={submitRestore}
        onClose={() => setShowRestoreConfirm(false)}
      />

      {/* Confirm Toggle Active Dialog */}
      <ConfirmDialog
        isOpen={showToggleActiveConfirm}
        title={user.is_active ? "تأكيد تعطيل الحساب" : "تأكيد تفعيل الحساب"}
        message={
          user.is_active
            ? `هل أنت متأكد من تعطيل حساب "${user.name}"؟ لن يتمكن المستخدم من تسجيل الدخول.`
            : `هل أنت متأكد من إعادة تفعيل حساب "${user.name}"؟`
        }
        confirmText={user.is_active ? "تعطيل الحساب" : "تفعيل الحساب"}
        variant={user.is_active ? "danger" : "primary"}
        isLoading={updateUser.isPending}
        onConfirm={submitToggleActive}
        onClose={() => setShowToggleActiveConfirm(false)}
      />
    </div>
  );
};

export default UserDetail;
