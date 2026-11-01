import React, { useMemo, useState } from "react";
import { RefreshCw, UserPlus } from "lucide-react";
import { isAxiosError } from "axios";
import { Entity } from "../../types/entities";
import { useEntities, useProvisionUserAccount } from "../../hooks/usePartners";
import { useUsers } from "../../hooks/useUsers";
import { toast } from "../../stores/toastStore";
import { apiErrorPayload } from "../../api/endpoints/production";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useAdminEntitiesColumns } from "../../components/table-columns/adminEntitiesColumns";

export const AdminEntitiesPage: React.FC = () => {
  const { data: entities = [], isLoading, error: queryError, refetch } = useEntities();
  const { data: users } = useUsers();
  const provisionUserMutation = useProvisionUserAccount();

  const [provisioningEntity, setProvisioningEntity] = useState<Entity | null>(null);
  const [provisionEmail, setProvisionEmail] = useState("");
  const [provisionPassword, setProvisionPassword] = useState("");

  const handleProvisionUser = async () => {
    if (!provisioningEntity) return;
    try {
      const res = await provisionUserMutation.mutateAsync({
        id: provisioningEntity.id,
        email: provisionEmail.trim() || undefined,
        password: provisionPassword.trim() || undefined,
      });
      toast.success(`تم تزويد حساب النظام للكيان ${res.data.name}`);
      setProvisioningEntity(null);
      setProvisionEmail("");
      setProvisionPassword("");
    } catch (err: unknown) {
      const payloadErr = apiErrorPayload(err);
      const message = payloadErr?.message || (isAxiosError(err) ? err.response?.data?.message : null);
      toast.error(message || "خطأ أثناء تزويد حساب النظام");
    }
  };

  const userByEntity = new Map(
    (users ?? [])
      .filter((u) => Boolean(u.id))
      .map((u) => [u.id, u] as const)
  );
  void userByEntity;

  const errorMessage = queryError
    ? apiErrorPayload(queryError)?.message ||
      (isAxiosError(queryError) ? queryError.response?.data?.message : null) ||
      "تعذر تحميل قائمة الكيانات"
    : null;

  const openProvision = (entity: Entity) => {
    setProvisioningEntity(entity);
    setProvisionEmail(entity.primary_contact?.email ?? "");
    setProvisionPassword("");
  };

  const columns = useAdminEntitiesColumns({ onProvision: openProvision });

  const tableData = useMemo(() => entities, [entities]);
  const entitiesTable = useDataTable({
    exportFileName: "entities",
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (entity) => entity.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary">إدارة الكيانات (للمشرفين)</h1>
          <p className="text-xs text-app-label-secondary mt-1">
            عرض الكيانات المسجلة وتزويدها بحسابات دخول للنظام
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-center text-xs text-app-status-danger">
          {errorMessage}
        </div>
      ) : (
        <DataTable table={entitiesTable}>
          <DataTable.Header>
            <DataTable.Toolbar>
              <DataTable.SearchInput placeholder="بحث بالاسم..." />
            </DataTable.Toolbar>
          </DataTable.Header>
          <DataTable.Content
            isLoading={isLoading}
            emptyMessage="لا توجد كيانات"
            emptyIcon={UserPlus}
          />
          <DataTable.Pagination />
        </DataTable>
      )}

      <Dialog
        open={Boolean(provisioningEntity)}
        onOpenChange={(next) => {
          if (!next) {
            setProvisioningEntity(null);
            setProvisionEmail("");
            setProvisionPassword("");
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تزويد حساب نظام</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-xs text-app-label-secondary">
              سيتم إنشاء حساب دخول للنظام للكيان: {provisioningEntity?.name}
            </p>
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={provisionEmail}
                onChange={(e) => setProvisionEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                كلمة المرور المؤقتة (اتركها فارغة لتوليد كلمة عشوائية)
              </label>
              <input
                type="text"
                value={provisionPassword}
                onChange={(e) => setProvisionPassword(e.target.value)}
                placeholder="8 أحرف على الأقل"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setProvisioningEntity(null);
                setProvisionEmail("");
                setProvisionPassword("");
              }}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={provisionUserMutation.isPending}
              onClick={handleProvisionUser}
              className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {provisionUserMutation.isPending ? "جاري التزويد..." : "تزويد"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminEntitiesPage;
