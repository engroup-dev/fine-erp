import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Users, Plus, RefreshCw, CreditCard, Filter, UsersRound } from "lucide-react";
import { isAxiosError } from "axios";
import { EntityType, Client, ClientStatus } from "../../types/entities";
import { useClients, useCreateClient, useUpdateClient } from "../../hooks/useClients";
import { useClientGroups } from "../../hooks/useClientGroups";
import { usePermissions } from "../../hooks/usePermissions";
import { navItems } from "../../routes/routes.config";
import type { ClientGroup } from "../../api/endpoints/clientGroups";
import { getClients } from "../../api/endpoints/clients";
import { useEntities, useOperatingUnits } from "../../hooks/usePartners";
import { useReferenceLookups } from "../../hooks/useReferenceLookups";
import type { LookupEntry } from "../../config/referenceLookups";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import { toast } from "../../stores/toastStore";
import { LEDGER_ERROR_MESSAGE, apiErrorMessage, apiErrorPayload } from "../../api/endpoints/production";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogBody,
  DialogFooter,
} from "../../components/ui/Dialog";
import { formatNumber } from "../../lib/utils/format";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useClientsColumns } from "../../components/table-columns/clientsColumns";
import { CoaAccountSelector } from "../../components/accounting/CoaAccountSelector";
import { PartnerStatementDialog } from "../../components/accounting/PartnerStatementDialog";
import type { CoaAction, NewCoaAccountPayload } from "../../types/entities";

export const ClientsPage: React.FC = () => {
  const navigate = useNavigate();
  const { allowManualEntitySelection } = useServerConfigStore();
  const [selectedOperatingUnitId, setSelectedOperatingUnitId] = useState("");
  // W5-06: the list filter by client group ("" = all groups).
  const [groupFilter, setGroupFilter] = useState("");
  const { canAccess } = usePermissions();
  const canOpenGroups = canAccess(navItems.find((i) => i.id === "settings-client-groups"));

  const queryClient = useQueryClient();

  // One unfiltered list: the KPI cards always total every client, and the group
  // filter narrows only the table (client-side), so a filter change never blanks the page.
  const {
    data: clients = [],
    isLoading,
    error: queryError,
    refetch,
  } = useClients();
  const { data: clientGroups = [] } = useClientGroups();
  const { data: entities = [] } = useEntities();
  const { data: operatingUnits = [] } = useOperatingUnits();
  const { data: cities = [] } = useReferenceLookups("cities", { isActive: true });
  const createClientMutation = useCreateClient();

  /**
   * W5-06: the backend refuses client_group_id (422) when the picked group was
   * deleted after this page loaded; say so in Arabic and refresh the picker.
   */
  const clientGroupRefusal = (err: unknown): string | null => {
    if (!apiErrorPayload(err)?.errors?.client_group_id) return null;
    queryClient.invalidateQueries({ queryKey: ["clientGroups"] });
    return "المجموعة المختارة لم تعد موجودة — اختر مجموعة أخرى أو أزل المجموعة.";
  };

  /**
   * W6-06: one client per receivable account. A cheap hint from the loaded
   * list (the backend refuses with CLIENT_ACCOUNT_TAKEN either way).
   */
  const accountTakenMessage = (accountId: string | null, ignoreClientId?: string): string | null => {
    if (!accountId) return null;
    const holder = clients.find((c) => c.account_id === accountId && c.id !== ignoreClientId);
    if (!holder) return null;
    const holderName = holder.entity?.name;
    return holderName
      ? `${LEDGER_ERROR_MESSAGE.CLIENT_ACCOUNT_TAKEN} (مربوط حالياً بالعميل «${holderName}»)`
      : LEDGER_ERROR_MESSAGE.CLIENT_ACCOUNT_TAKEN;
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [entityMode, setEntityMode] = useState<"auto" | "existing">("auto");
  const [clientName, setClientName] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("organization");
  const [taxNumber, setTaxNumber] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientCity, setClientCity] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [creditLimit, setCreditLimit] = useState<number>(10000);
  const [paymentTermsDays, setPaymentTermsDays] = useState<number>(30);
  const [clientGroupId, setClientGroupId] = useState("");
  const [coaAction, setCoaAction] = useState<CoaAction>("create_new");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<NewCoaAccountPayload>({
    parent_account_id: "",
    account_code: "",
    name: "",
    currency: "LYD",
  });

  // Edit Client States
  const updateClientMutation = useUpdateClient();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editOperatingUnitId, setEditOperatingUnitId] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editEntityType, setEditEntityType] = useState<EntityType>("organization");
  const [editTaxNumber, setEditTaxNumber] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCreditLimit, setEditCreditLimit] = useState<number>(10000);
  const [editCreditLimitReason, setEditCreditLimitReason] = useState("");
  const [editPaymentTermsDays, setEditPaymentTermsDays] = useState<number>(30);
  const [editClientGroupId, setEditClientGroupId] = useState("");
  const [editStatus, setEditStatus] = useState<ClientStatus>("active");
  const [editCoaAction, setEditCoaAction] = useState<CoaAction>("none");
  const [editSelectedAccountId, setEditSelectedAccountId] = useState<string | null>(null);
  const [editNewAccount, setEditNewAccount] = useState<NewCoaAccountPayload>({
    parent_account_id: "",
    account_code: "",
    name: "",
    currency: "LYD",
  });

  const resetForm = () => {
    setClientName("");
    setTaxNumber("");
    setClientPhone("");
    setClientCity("");
    setClientAddress("");
    setSelectedEntityId("");
    setCreditLimit(10000);
    setPaymentTermsDays(30);
    setClientGroupId("");
    setEntityMode("auto");
    setCoaAction("create_new");
    setSelectedAccountId(null);
    setNewAccount({
      parent_account_id: "",
      account_code: "",
      name: "",
      currency: "LYD",
    });
  };

  /** A new client starts from its group's defaults (W5-06); the fields stay editable. */
  const handlePickCreateGroup = (group: ClientGroup | null) => {
    setClientGroupId(group ? group.id : "");
    if (group) {
      setCreditLimit(Number(group.default_credit_limit));
      setPaymentTermsDays(group.default_payment_terms_days);
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitId = selectedOperatingUnitId || operatingUnits[0]?.id;

    if (entityMode === "existing" && !selectedEntityId) {
      toast.error("يرجى اختيار الكيان الحالي");
      return;
    }

    if (entityMode === "auto" && !clientName.trim()) {
      toast.error("يرجى إدخال اسم العميل/الشركة لإنشاء الكيان التلقائي");
      return;
    }

    if (!unitId) {
      toast.error("يرجى اختيار الوحدة التشغيلية");
      return;
    }

    if (coaAction === "create_new") {
      if (!newAccount.parent_account_id) {
        toast.error("يرجى اختيار الحساب الأب لإنشاء حساب في دليل الحسابات");
        return;
      }
      if (!newAccount.account_code.trim()) {
        toast.error("يرجى إدخال رمز الحساب الفرعي");
        return;
      }
      if (!newAccount.name.trim()) {
        toast.error("يرجى إدخال اسم الحساب المالي");
        return;
      }
    }

    if (coaAction === "link_existing" && !selectedAccountId) {
      toast.error("يرجى اختيار الحساب المراد ربطه من دليل الحسابات");
      return;
    }

    const createAccountTaken = coaAction === "link_existing" ? accountTakenMessage(selectedAccountId) : null;
    if (createAccountTaken) {
      toast.error(createAccountTaken);
      return;
    }

    const payload = {
      operating_unit_id: unitId,
      entity_id: entityMode === "existing" ? selectedEntityId : undefined,
      name: entityMode === "auto" ? clientName.trim() : undefined,
      entity_type: entityMode === "auto" ? entityType : undefined,
      tax_number:
        entityMode === "auto" && taxNumber.trim()
          ? taxNumber.trim()
          : undefined,
      client_group_id: clientGroupId || undefined,
      credit_limit: creditLimit,
      payment_terms_days: paymentTermsDays,
      phone: clientPhone.trim() || undefined,
      city: clientCity.trim() || undefined,
      address: clientAddress.trim() || undefined,
      coa_action: coaAction,
      account_id: coaAction === "link_existing" ? selectedAccountId : undefined,
      new_account:
        coaAction === "create_new"
          ? {
              parent_account_id: newAccount.parent_account_id,
              account_code: newAccount.account_code.trim(),
              name: newAccount.name.trim(),
              currency: newAccount.currency || "LYD",
            }
          : undefined,
    };

    createClientMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("تمت إضافة العميل بنجاح");
        setIsModalOpen(false);
        resetForm();
      },
      onError: (err: unknown) => {
        // W6-06: CLIENT_ACCOUNT_TAKEN maps to Arabic in apiErrorMessage.
        toast.error(clientGroupRefusal(err) || apiErrorMessage(err, "تعذر إضافة العميل"));
      },
    });
  };

  const handleOpenEditModal = (client: Client) => {
    setEditingClient(client);
    setEditOperatingUnitId(client.operating_unit_id);
    setEditClientName(client.entity?.name || "");
    setEditEntityType((client.entity?.entity_type as EntityType) || "organization");
    setEditTaxNumber(client.entity?.tax_number || "");
    setEditPhone(client.entity?.phone || client.entity?.primary_contact?.phone || "");
    setEditCity(client.entity?.city || client.entity?.primary_contact?.city || "");
    setEditAddress(client.entity?.address || client.entity?.primary_contact?.address || "");
    setEditCreditLimit(Number(client.credit_limit || 0));
    setEditCreditLimitReason("");
    setEditPaymentTermsDays(client.payment_terms_days ?? 30);
    setEditClientGroupId(client.client_group_id ?? "");
    setEditStatus(client.status || "active");
    setEditCoaAction(client.account_id ? "link_existing" : "none");
    setEditSelectedAccountId(client.account_id || null);
    setEditNewAccount({
      parent_account_id: "",
      account_code: "",
      name: "",
      currency: "LYD",
    });
    setIsEditModalOpen(true);
  };

  const editCreditLimitChanged =
    editingClient !== null && Number(editCreditLimit) !== Number(editingClient.credit_limit || 0);

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    if (!editClientName.trim()) {
      toast.error("يرجى إدخال اسم العميل/الشركة");
      return;
    }

    if (editCoaAction === "create_new") {
      if (!editNewAccount.parent_account_id) {
        toast.error("يرجى اختيار الحساب الأب لإنشاء حساب في دليل الحسابات");
        return;
      }
      if (!editNewAccount.account_code.trim()) {
        toast.error("يرجى إدخال رمز الحساب الفرعي");
        return;
      }
      if (!editNewAccount.name.trim()) {
        toast.error("يرجى إدخال اسم الحساب المالي");
        return;
      }
    }

    if (editCoaAction === "link_existing" && !editSelectedAccountId) {
      toast.error("يرجى اختيار الحساب المراد ربطه من دليل الحسابات");
      return;
    }

    const editAccountTaken =
      editCoaAction === "link_existing" ? accountTakenMessage(editSelectedAccountId, editingClient.id) : null;
    if (editAccountTaken) {
      toast.error(editAccountTaken);
      return;
    }

    const payload = {
      record_version: editingClient.record_version ?? 1,
      operating_unit_id: editOperatingUnitId || editingClient.operating_unit_id,
      name: editClientName.trim(),
      entity_type: editEntityType,
      tax_number: editTaxNumber.trim() || undefined,
      phone: editPhone.trim() || undefined,
      city: editCity.trim() || undefined,
      address: editAddress.trim() || undefined,
      credit_limit: editCreditLimit,
      // W5-05: a credit limit change is logged with its reason on the client card.
      credit_limit_reason: editCreditLimitChanged ? editCreditLimitReason.trim() || null : undefined,
      payment_terms_days: editPaymentTermsDays,
      // Moving a client to another group keeps its own limit and terms (W5-06).
      client_group_id: editClientGroupId || null,
      status: editStatus,
      coa_action: editCoaAction,
      account_id: editCoaAction === "link_existing" ? editSelectedAccountId : (editCoaAction === "none" ? null : undefined),
      new_account:
        editCoaAction === "create_new"
          ? {
              parent_account_id: editNewAccount.parent_account_id,
              account_code: editNewAccount.account_code.trim(),
              name: editNewAccount.name.trim(),
              currency: editNewAccount.currency || "LYD",
            }
          : undefined,
    };

    updateClientMutation.mutate(
      { id: editingClient.id, payload },
      {
        onSuccess: () => {
          toast.success("تم تحديث بيانات العميل بنجاح");
          setIsEditModalOpen(false);
          setEditingClient(null);
        },
        onError: (err: unknown) => {
          toast.error(clientGroupRefusal(err) || apiErrorMessage(err, "تعذر تحديث بيانات العميل"));
        },
      }
    );
  };

  const totalCreditExposure = clients.reduce(
    (acc, c) => acc + Number(c.credit_limit || 0),
    0,
  );
  const totalOutstandingBalance = clients.reduce(
    (acc, c) => acc + Number(c.current_balance || 0),
    0,
  );
  const totalActiveClients = clients.filter(
    (c) => c.status === "active",
  ).length;

  const errorMessage = queryError
    ? apiErrorPayload(queryError)?.message ||
      (isAxiosError(queryError) ? queryError.response?.data?.message : null) ||
      "تعذر تحميل سجلات العملاء"
    : null;

  const [statementOpen, setStatementOpen] = useState(false);
  const [statementClient, setStatementClient] = useState<Client | null>(null);

  const handleOpenStatement = (client: Client) => {
    setStatementClient(client);
    setStatementOpen(true);
  };

  const columns = useClientsColumns({
    onEdit: handleOpenEditModal,
    onViewStatement: handleOpenStatement,
  });

  const tableData = useMemo(
    () => (groupFilter ? clients.filter((c) => c.client_group_id === groupFilter) : clients),
    [clients, groupFilter],
  );
  const clientsTable = useDataTable({
    exportFileName: "clients",
    // W6-04: the capped all-rows read, narrowed by the same group filter.
    fetchAllRowsForExport: () => getClients({ client_group_id: groupFilter || undefined, all: 1 }),
    // The plain list is uncapped and already holds every client: past the cap, export it.
    loadedRowsAreComplete: true,
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (c) => c.id,
  });

  console.log("ClientsPage render", {
    clients,
    totalCreditExposure,
    totalOutstandingBalance,
    totalActiveClients,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary">
            إدارة العملاء والآجل
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            متابعة سقف الائتمان، شروط السداد، ومحفظة عملاء الكيانات بالوحدة
            التشغيلية
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canOpenGroups && (
            <button
              type="button"
              onClick={() => navigate("/settings/client-groups")}
              className="flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1"
            >
              <UsersRound className="h-4 w-4 text-app-accent" />
              مجموعات العملاء
            </button>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            تحديث
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            إضافة عميل
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-label-secondary">
              إجمالي سقف الائتمان
            </span>
            <CreditCard className="h-4 w-4 text-app-accent" />
          </div>
          <p className="mt-2 text-xl font-bold text-app-label-primary">
            {formatNumber(totalCreditExposure)}{" "}
            <span className="text-xs font-normal">د.ل</span>
          </p>
        </div>
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-label-secondary">
              إجمالي المديونية المستحقة
            </span>
            <Users className="h-4 w-4 text-app-status-danger" />
          </div>
          <p className="mt-2 text-xl font-bold text-app-status-danger">
            {formatNumber(totalOutstandingBalance)}{" "}
            <span className="text-xs font-normal">د.ل</span>
          </p>
        </div>
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-app-label-secondary">
              العملاء النشطون
            </span>
            <Users className="h-4 w-4 text-app-status-positive" />
          </div>
          <p className="mt-2 text-xl font-bold text-app-label-primary">
            {totalActiveClients}{" "}
            <span className="text-xs font-normal">عميل</span>
          </p>
        </div>
      </div>

      {/* Main Table */}
      {errorMessage ? (
        <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-center text-xs text-app-status-danger">
          {errorMessage}
        </div>
      ) : (
        <DataTable table={clientsTable}>
          <DataTable.Header>
            <DataTable.Toolbar>
              <DataTable.SearchInput placeholder="بحث بالاسم..." />
              {clientGroups.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-app-label-secondary">
                  <Filter className="w-3.5 h-3.5 text-app-label-tertiary" />
                  <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="rounded-xl border border-app-separator bg-app-bg-primary px-2.5 py-1.5 text-xs text-app-label-primary focus:border-app-accent focus:outline-none"
                  >
                    <option value="">جميع المجموعات</option>
                    {clientGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </DataTable.Toolbar>
          </DataTable.Header>
          <DataTable.Content
            isLoading={isLoading}
            emptyMessage={groupFilter ? "لا يوجد عملاء في هذه المجموعة" : "لا يوجد عملاء مضافون"}
            onRowClick={(row: Client) => navigate(`/clients/${row.id}`)}
            emptyIcon={Users}
          />
          <DataTable.Pagination />
        </DataTable>
      )}

      {/* Add Client Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <form
              id="client-create-form"
              onSubmit={handleAddClient}
              className="space-y-4"
              dir="rtl"
            >
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  الوحدة التشغيلية{" "}
                  <span className="text-app-status-danger">*</span>
                </label>
                <SearchableSelect<{ id: string; name: string }>
                  options={operatingUnits}
                  value={
                    operatingUnits.find(
                      (u) => u.id === selectedOperatingUnitId,
                    ) ?? null
                  }
                  onChange={(u) => setSelectedOperatingUnitId(u ? u.id : "")}
                  getOptionId={(u) => u.id}
                  getOptionLabel={(u) => u.name}
                  placeholder="-- اختر الوحدة التشغيلية --"
                  required
                />
              </div>

              {allowManualEntitySelection ? (
                <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-3 space-y-3">
                  <label className="block text-xs font-bold text-app-label-primary">
                    الكيان المرتبط بالعميل
                  </label>
                  <div className="flex items-center gap-4 text-xs font-semibold text-app-label-primary">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="entityMode"
                        checked={entityMode === "auto"}
                        onChange={() => setEntityMode("auto")}
                        className="text-app-accent"
                      />
                      <span>إنشاء كيان جديد تلقائياً</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="entityMode"
                        checked={entityMode === "existing"}
                        onChange={() => setEntityMode("existing")}
                        className="text-app-accent"
                      />
                      <span>اختيار كيان حالي</span>
                    </label>
                  </div>

                  {entityMode === "auto" ? (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                          اسم العميل / الشركة{" "}
                          <span className="text-app-status-danger">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          placeholder="مثال: شركة الصحراء للمقاولات"
                          className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-1.5 text-xs text-app-label-primary focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                            نوع الكيان
                          </label>
                          <select
                            value={entityType}
                            onChange={(e) =>
                              setEntityType(e.target.value as EntityType)
                            }
                            className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-1.5 text-xs text-app-label-primary focus:outline-none"
                          >
                            <option value="organization">شركة / مؤسسة</option>
                            <option value="individual">فرد</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                            الرقم الضريبي (اختياري)
                          </label>
                          <input
                            type="text"
                            value={taxNumber}
                            onChange={(e) => setTaxNumber(e.target.value)}
                            placeholder="مثال: TAX-900800"
                            className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-1.5 text-xs text-app-label-primary focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">الكيان المرتبط</label>
                      <SearchableSelect<{
                        id: string;
                        name: string;
                        entity_type?: string;
                      }>
                        options={entities}
                        value={
                          entities.find((ent) => ent.id === selectedEntityId) ??
                          null
                        }
                        onChange={(ent) =>
                          setSelectedEntityId(ent ? ent.id : "")
                        }
                        getOptionId={(ent) => ent.id}
                        getOptionLabel={(ent) => ent.name}
                        getOptionSubLabel={(ent) =>
                          ent.entity_type === "organization" ? "شركة" : "فرد"
                        }
                        placeholder="-- اختر كيان --"
                        required
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                      اسم العميل / الشركة{" "}
                      <span className="text-app-status-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="مثال: شركة الصحراء للمقاولات"
                      className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        نوع الكيان
                      </label>
                      <select
                        value={entityType}
                        onChange={(e) =>
                          setEntityType(e.target.value as EntityType)
                        }
                        className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                      >
                        <option value="organization">شركة / مؤسسة</option>
                        <option value="individual">فرد</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        الرقم الضريبي (اختياري)
                      </label>
                      <input
                        type="text"
                        value={taxNumber}
                        onChange={(e) => setTaxNumber(e.target.value)}
                        placeholder="مثال: TAX-900800"
                        className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    رقم الهاتف (اختياري)
                  </label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="مثال: 0912345678"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    المدينة
                  </label>
                  <SearchableSelect<LookupEntry>
                    options={cities}
                    value={cities.find((c) => c.name === clientCity) ?? null}
                    onChange={(c) => setClientCity(c ? c.name : "")}
                    getOptionId={(c) => c.id}
                    getOptionLabel={(c) => c.name}
                    getOptionSubLabel={(c) => c.code}
                    placeholder="-- اختر المدينة --"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  العنوان التفصيلي (اختياري)
                </label>
                <input
                  type="text"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="مثال: طريق المطار، المنطقة الصناعية"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  مجموعة العملاء (اختياري)
                </label>
                <SearchableSelect<ClientGroup>
                  options={clientGroups}
                  value={clientGroups.find((g) => g.id === clientGroupId) ?? null}
                  onChange={handlePickCreateGroup}
                  getOptionId={(g) => g.id}
                  getOptionLabel={(g) => g.name}
                  getOptionSubLabel={(g) => g.code}
                  getOptionSearchText={(g) => `${g.name} ${g.code}`}
                  placeholder="-- بدون مجموعة --"
                />
                {clientGroupId && (
                  <p className="mt-1 text-[11px] text-app-label-tertiary">
                    عُبِّئ الحد الائتماني وفترة السداد من المجموعة، ويمكن تعديلهما لهذا العميل.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    الحد الائتماني المسموح (LYD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(Number(e.target.value))}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    فترة السداد الآجل (أيام)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={paymentTermsDays}
                    onChange={(e) =>
                      setPaymentTermsDays(Number(e.target.value))
                    }
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Chart of Accounts Linkage */}
              <CoaAccountSelector
                entityTypeLabel="العميل"
                defaultEntityName={clientName.trim()}
                action={coaAction}
                onActionChange={setCoaAction}
                selectedAccountId={selectedAccountId}
                onSelectedAccountIdChange={setSelectedAccountId}
                newAccount={newAccount}
                onNewAccountChange={setNewAccount}
                preferredParentCode="13"
                useEntityNameDirectly
              />
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="client-create-form"
              disabled={
                createClientMutation.isPending ||
                (entityMode === "existing" && !selectedEntityId) ||
                (entityMode === "auto" && !clientName.trim())
              }
              className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {createClientMutation.isPending ? "جاري الحفظ..." : "حفظ العميل"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Client Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>تعديل بيانات العميل والكيان</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <form
              id="client-edit-form"
              onSubmit={handleUpdateClient}
              className="space-y-4"
              dir="rtl"
            >
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  الوحدة التشغيلية{" "}
                  <span className="text-app-status-danger">*</span>
                </label>
                <SearchableSelect<{ id: string; name: string }>
                  options={operatingUnits}
                  value={
                    operatingUnits.find(
                      (u) => u.id === editOperatingUnitId,
                    ) ?? null
                  }
                  onChange={(u) => setEditOperatingUnitId(u ? u.id : "")}
                  getOptionId={(u) => u.id}
                  getOptionLabel={(u) => u.name}
                  placeholder="-- اختر الوحدة التشغيلية --"
                  required
                />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    اسم العميل / الشركة{" "}
                    <span className="text-app-status-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editClientName}
                    onChange={(e) => setEditClientName(e.target.value)}
                    placeholder="مثال: شركة الصحراء للمقاولات"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                      نوع الكيان
                    </label>
                    <select
                      value={editEntityType}
                      onChange={(e) =>
                        setEditEntityType(e.target.value as EntityType)
                      }
                      className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                    >
                      <option value="organization">شركة / مؤسسة</option>
                      <option value="individual">فرد</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                      الرقم الضريبي (اختياري)
                    </label>
                    <input
                      type="text"
                      value={editTaxNumber}
                      onChange={(e) => setEditTaxNumber(e.target.value)}
                      placeholder="مثال: TAX-900800"
                      className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    رقم الهاتف (اختياري)
                  </label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="مثال: 0912345678"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    المدينة
                  </label>
                  <SearchableSelect<LookupEntry>
                    options={cities}
                    value={cities.find((c) => c.name === editCity) ?? null}
                    onChange={(c) => setEditCity(c ? c.name : "")}
                    getOptionId={(c) => c.id}
                    getOptionLabel={(c) => c.name}
                    getOptionSubLabel={(c) => c.code}
                    placeholder="-- اختر المدينة --"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  العنوان التفصيلي (اختياري)
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="مثال: طريق المطار، المنطقة الصناعية"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  مجموعة العملاء
                </label>
                <SearchableSelect<ClientGroup>
                  options={clientGroups}
                  value={clientGroups.find((g) => g.id === editClientGroupId) ?? null}
                  onChange={(g) => setEditClientGroupId(g ? g.id : "")}
                  getOptionId={(g) => g.id}
                  getOptionLabel={(g) => g.name}
                  getOptionSubLabel={(g) => g.code}
                  getOptionSearchText={(g) => `${g.name} ${g.code}`}
                  placeholder="-- بدون مجموعة --"
                />
                {editingClient && editClientGroupId !== (editingClient.client_group_id ?? "") && (
                  <p className="mt-1 text-[11px] text-app-label-tertiary">
                    نقل العميل إلى مجموعة أخرى لا يغيّر حده الائتماني ولا فترة سداده.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    الحد الائتماني المسموح (LYD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={editCreditLimit}
                    onChange={(e) => setEditCreditLimit(Number(e.target.value))}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    فترة السداد الآجل (أيام)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editPaymentTermsDays}
                    onChange={(e) =>
                      setEditPaymentTermsDays(Number(e.target.value))
                    }
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    الحالة
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as ClientStatus)
                    }
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  >
                    <option value="active">نشط</option>
                    <option value="suspended">موقوف</option>
                    <option value="blacklisted">محظور</option>
                  </select>
                </div>
              </div>

              {editCreditLimitChanged && (
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    سبب تغيير الحد الائتماني
                  </label>
                  <input
                    type="text"
                    maxLength={500}
                    value={editCreditLimitReason}
                    onChange={(e) => setEditCreditLimitReason(e.target.value)}
                    placeholder="يُحفظ في سجل حد الائتمان على بطاقة العميل"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>
              )}

              {/* Chart of Accounts Linkage */}
              <CoaAccountSelector
                entityTypeLabel="العميل"
                defaultEntityName={editClientName.trim()}
                action={editCoaAction}
                onActionChange={setEditCoaAction}
                selectedAccountId={editSelectedAccountId}
                onSelectedAccountIdChange={setEditSelectedAccountId}
                newAccount={editNewAccount}
                onNewAccountChange={setEditNewAccount}
                preferredParentCode="13"
                useEntityNameDirectly
              />
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingClient(null);
              }}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="client-edit-form"
              disabled={
                updateClientMutation.isPending || !editClientName.trim()
              }
              className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {updateClientMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Statement of Account Dialog */}
      {statementClient && (
        <PartnerStatementDialog
          open={statementOpen}
          onOpenChange={setStatementOpen}
          partyType="client"
          partyId={statementClient.id}
          partyName={statementClient.entity?.name}
        />
      )}
    </div>
  );
};

export default ClientsPage;
