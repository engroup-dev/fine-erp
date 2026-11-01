import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  Plus,
  RefreshCw,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useRestoreUser,
  useAssignRole,
  useRemoveRole,
} from "../../hooks/useUsers";
import { useRoles } from "../../hooks/useRoles";
import { AppUser } from "../../api/endpoints/users";
import { useOperatingUnits } from "../../hooks/useOperatingUnits";
import { OperatingUnit } from "../../types/entities";
import { apiErrorPayload } from "../../api/endpoints/production";
import { toast } from "../../stores/toastStore";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useUsersColumns } from "../../components/table-columns/usersColumns";
import { useAuthStore } from "../../stores/authStore";
import { cn } from "../../lib/utils/utils";

const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const { data: users, isLoading, isError, error, refetch } = useUsers({ withTrashed: tab === "deleted" });
  const { data: roles } = useRoles();
  const { data: units } = useOperatingUnits();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const restoreUser = useRestoreUser();
  const assignRole = useAssignRole();
  const removeRole = useRemoveRole();

  const currentUserId = useAuthStore((s) => s.user?.id);

  const [showCreate, setShowCreate] = useState(false);
  const [rolesFor, setRolesFor] = useState<AppUser | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState<AppUser | null>(null);
  const [restoring, setRestoring] = useState<AppUser | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [unitId, setUnitId] = useState("");

  const COMPANY_WIDE_OPTION: OperatingUnit = { id: "", name: "على مستوى الشركة" };
  const unitOptions = [COMPANY_WIDE_OPTION, ...(units ?? [])];

  const unitName = (id: string | null) =>
    id === null
      ? "على مستوى الشركة"
      : units?.find((u) => u.id === id)?.name ?? "وحدة محذوفة";

  // The list refetches after every mutation; keep the modal's user fresh.
  const rolesForUser = rolesFor ? users?.find((u) => u.id === rolesFor.id) ?? rolesFor : null;

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("الاسم مطلوب.");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setFormError("يجب إدخال البريد الإلكتروني أو رقم الهاتف على الأقل.");
      return;
    }
    if (phone.trim() && !/^09\d{8}$/.test(phone.trim())) {
      setFormError("رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بـ 09.");
      return;
    }
    setFormError(null);
    createUser.mutate(
      {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        password,
      },
      {
        onSuccess: () => {
          setShowCreate(false);
          setName("");
          setEmail("");
          setPhone("");
          setPassword("");
          toast.success("تم إنشاء المستخدم — سيُطلب منه تغيير كلمة المرور عند أول دخول");
        },
        onError: (err: unknown) =>
          setFormError(apiErrorPayload(err)?.message ?? "تعذر إنشاء المستخدم."),
      },
    );
  };

  const submitAssign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rolesForUser || !roleId) {
      return;
    }
    setFormError(null);
    assignRole.mutate(
      { userId: rolesForUser.id, roleId, operatingUnitId: unitId || null },
      {
        onSuccess: () => {
          setRoleId("");
          setUnitId("");
          toast.success("تم إسناد الدور");
        },
        onError: (err: unknown) =>
          setFormError(apiErrorPayload(err)?.message ?? "تعذر إسناد الدور."),
      },
    );
  };

  const toggleActive = (u: AppUser) => {
    updateUser.mutate(
      { id: u.id, is_active: !u.is_active, record_version: u.record_version },
      {
        onSuccess: () => toast.success(u.is_active ? "تم تعطيل الحساب" : "تم تفعيل الحساب"),
        onError: (err: unknown) =>
          toast.error(apiErrorPayload(err)?.message ?? "تعذر تحديث الحساب."),
      },
    );
  };

  const openRoles = (u: AppUser) => {
    setRolesFor(u);
    setFormError(null);
    setRoleId("");
    setUnitId("");
  };

  const openEdit = (u: AppUser) => {
    setEditing(u);
    setEditName(u.name);
    setEditEmail(u.email ?? "");
    setEditPhone(u.phone ?? "");
    setEditPassword("");
    setFormError(null);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editEmail.trim() && !editPhone.trim()) {
      setFormError("يجب توفير البريد الإلكتروني أو رقم الهاتف على الأقل.");
      return;
    }
    if (editPhone.trim() && !/^09\d{8}$/.test(editPhone.trim())) {
      setFormError("رقم الهاتف يجب أن يتكون من 10 أرقام ويبدأ بـ 09.");
      return;
    }
    if (editPassword && editPassword.length < 8) {
      setFormError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    setFormError(null);
    const payload: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
      password?: string;
      record_version: number;
    } = {
      id: editing.id,
      name: editName.trim(),
      email: editEmail.trim() || null,
      phone: editPhone.trim() || null,
      record_version: editing.record_version,
    };
    if (editPassword) {
      payload.password = editPassword;
    }
    updateUser.mutate(payload, {
      onSuccess: () => {
        setEditing(null);
        toast.success("تم تحديث المستخدم");
      },
      onError: (err: unknown) =>
        setFormError(apiErrorPayload(err)?.message ?? "تعذر تحديث المستخدم."),
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    deleteUser.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        toast.success("تم حذف المستخدم");
      },
      onError: (err: unknown) =>
        setFormError(apiErrorPayload(err)?.message ?? "تعذر حذف المستخدم."),
    });
  };

  const columns = useUsersColumns({
    currentUserId,
    unitName,
    onViewDetails: (u) => navigate(`/users/${u.id}`),
    onOpenRoles: openRoles,
    onEdit: openEdit,
    onToggleActive: toggleActive,
    onDelete: setDeleting,
    onRestore: setRestoring,
  });

  const tableData = useMemo(() => users ?? [], [users]);
  const usersTable = useDataTable({
    exportFileName: "users",
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (u) => u.id,
  });

  if (isError) {
    const payload = apiErrorPayload(error);
    return (
      <div className="p-6">
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {payload?.message ?? "غير مصرح لك بإدارة المستخدمين — هذه الصفحة للمالك ومديري النظام."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-app-accent" />
            المستخدمون والصلاحيات
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            حسابات الدخول وأدوارها — الدور بلا وحدة يسري على مستوى الشركة كاملة.
          </p>
        </div>

        <div className="flex gap-2 border-b border-app-separator self-end">
          <button
            type="button"
            onClick={() => setTab("active")}
            className={cn(
              "px-4 py-2 text-xs font-bold transition-colors",
              tab === "active"
                ? "border-b-2 border-app-accent text-app-accent"
                : "text-app-label-secondary hover:text-app-label-primary",
            )}
          >
            نشط ({users?.filter((u) => !u.deleted_at).length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTab("deleted")}
            className={cn(
              "px-4 py-2 text-xs font-bold transition-colors",
              tab === "deleted"
                ? "border-b-2 border-app-accent text-app-accent"
                : "text-app-label-secondary hover:text-app-label-primary",
            )}
          >
            محذوف ({users?.filter((u) => u.deleted_at).length ?? 0})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> تحديث
          </button>
          <button
            onClick={() => {
              setShowCreate(true);
              setFormError(null);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" /> إضافة مستخدم
          </button>
        </div>
      </div>

      <DataTable table={usersTable}>
        <DataTable.Header>
          <DataTable.Toolbar>
            <DataTable.SearchInput placeholder="بحث بالاسم أو البريد أو الدور..." />
          </DataTable.Toolbar>
        </DataTable.Header>
        <DataTable.Content isLoading={isLoading} emptyMessage="لا يوجد مستخدمون." emptyIcon={ShieldCheck} />
        <DataTable.Pagination />
      </DataTable>

      {/* Create user modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger mb-4">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form id="user-create-form" onSubmit={submitCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">الاسم</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    dir="ltr"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">رقم الهاتف (اختياري)</label>
                  <input
                    type="tel"
                    dir="ltr"
                    placeholder="09xxxxxxxx"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                  />
                </div>
              </div>
              <p className="text-[11px] text-app-label-tertiary">
                * يجب إدخال البريد الإلكتروني أو رقم الهاتف (10 أرقام يبدأ بـ 09) على الأقل.
              </p>
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  كلمة المرور المؤقتة (8 أحرف على الأقل)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                />
                <p className="text-[10px] text-app-label-tertiary mt-1">
                  سيُجبر المستخدم على تغييرها عند أول تسجيل دخول.
                </p>
              </div>

            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="user-create-form"
              disabled={createUser.isPending}
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl shadow-sm disabled:opacity-50"
            >
              {createUser.isPending ? "جاري الإنشاء..." : "إنشاء المستخدم"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role management modal */}
      <Dialog open={Boolean(rolesForUser)} onOpenChange={(next) => !next && setRolesFor(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <div>
              {rolesForUser && <DialogTitle>أدوار {rolesForUser.name}</DialogTitle>}
              <DialogDescription>
                اترك الوحدة فارغة ليكون الدور على مستوى الشركة كاملة.
              </DialogDescription>
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger mb-4">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {rolesForUser && (
            <div className="space-y-2">
              {rolesForUser.roles?.length ? (
                rolesForUser.roles.map((r, i) => (
                  <div
                    key={`${r.id}-${r.pivot?.operating_unit_id ?? "company"}-${i}`}
                    className="flex items-center justify-between rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2"
                  >
                    <div className="text-xs">
                      <span className="font-bold text-app-label-primary">{r.name}</span>
                      <span className="text-app-label-secondary ms-2">
                        {unitName(r.pivot?.operating_unit_id ?? null)}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        removeRole.mutate(
                          {
                            userId: rolesForUser.id,
                            roleId: r.id,
                            operatingUnitId: r.pivot?.operating_unit_id ?? null,
                          },
                          { onSuccess: () => toast.success("تمت إزالة الدور") },
                        )
                      }
                      disabled={removeRole.isPending}
                      className="text-xs font-semibold text-app-status-danger hover:underline disabled:opacity-50"
                    >
                      إزالة
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-xs text-app-label-tertiary py-2">لا توجد أدوار مسندة.</div>
              )}
            </div>
            )}

            <form onSubmit={submitAssign} className="flex items-end gap-2 pt-3 border-t border-app-separator">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">الدور</label>
                <SearchableSelect<{ id: string; name: string }>
                  options={roles ?? []}
                  value={
                    roles?.find((r) => r.id === roleId) ?? null
                  }
                  onChange={(r) => setRoleId(r ? r.id : "")}
                  getOptionId={(r) => r.id}
                  getOptionLabel={(r) => r.name}
                  placeholder="اختر دوراً..."
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">الوحدة التشغيلية</label>
                <SearchableSelect<OperatingUnit>
                  options={unitOptions}
                  value={
                    unitOptions.find((u) => u.id === unitId) ?? null
                  }
                  onChange={(u) => setUnitId(u ? u.id : "")}
                  getOptionId={(u) => u.id}
                  getOptionLabel={(u) => u.name}
                  placeholder="على مستوى الشركة"
                  clearable={false}
                />
              </div>
              <button
                type="submit"
                disabled={assignRole.isPending || !roleId}
                className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl shadow-sm disabled:opacity-50"
              >
                إسناد
              </button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Edit user modal */}
      <Dialog open={Boolean(editing)} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-app-accent" />
              تعديل المستخدم
            </DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            {formError && (
              <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger mb-4">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form id="user-edit-form" onSubmit={submitEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">الاسم</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    dir="ltr"
                    placeholder="name@example.com"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">رقم الهاتف (اختياري)</label>
                  <input
                    type="tel"
                    dir="ltr"
                    placeholder="09xxxxxxxx"
                    maxLength={10}
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                  />
                </div>
              </div>
              <p className="text-[11px] text-app-label-tertiary">
                * يجب توفير البريد الإلكتروني أو رقم الهاتف (10 أرقام يبدأ بـ 09) على الأقل.
              </p>
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  إعادة تعيين كلمة المرور (اختياري)
                </label>
                <input
                  type="password"
                  minLength={8}
                  dir="ltr"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="اتركها فارغة لعدم التغيير"
                  className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none font-mono"
                />
                <p className="text-[10px] text-app-label-tertiary mt-1">
                  عند التعبئة، سيُجبر المستخدم على تغييرها عند أول تسجيل دخول.
                </p>
              </div>

            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="user-edit-form"
              disabled={updateUser.isPending}
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl shadow-sm disabled:opacity-50"
            >
              {updateUser.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => {
          setDeleting(null);
          setFormError(null);
        }}
        onConfirm={confirmDelete}
        title="حذف المستخدم"
        message={`سيتم حذف "${deleting?.name ?? ""}" ناعماً. يمكن استعادته لاحقاً من تبويب "محذوف".`}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="danger"
        isLoading={deleteUser.isPending}
      />

      <ConfirmDialog
        isOpen={!!restoring}
        onClose={() => setRestoring(null)}
        onConfirm={async () => {
          if (!restoring) return;
          try {
            await restoreUser.mutateAsync(restoring.id);
            toast.success("تمت استعادة المستخدم.");
            setRestoring(null);
            setTab("active");
          } catch (err) {
            toast.error(apiErrorPayload(err)?.message ?? "فشل الاستعادة.");
          }
        }}
        title="استعادة مستخدم"
        message={`سيتم استعادة "${restoring?.name ?? ""}".`}
        confirmText="استعادة"
        isLoading={restoreUser.isPending}
      />
    </div>
  );
};

export default UsersPage;
