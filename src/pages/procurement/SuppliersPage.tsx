import React, { useMemo, useState } from "react";
import { Truck, Plus, RefreshCw, Building } from "lucide-react";
import { isAxiosError } from "axios";
import { CreateSupplierPayload, Supplier, SupplierDuplicate, UpdateSupplierPayload } from "../../types/procurement";
import { useSuppliers, useCreateSupplier, useUpdateSupplier } from "../../hooks/useProcurement";
import { useEntities, useOperatingUnits } from "../../hooks/usePartners";
import { usePermissions } from "../../hooks/usePermissions";
import { useIsCompanyWide } from "../../hooks/useAccounting";
import { useAuthStore } from "../../stores/authStore";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import { SUPPLIER_ERROR_MESSAGE, supplierErrorMessage } from "../../api/endpoints/procurement";
import { useReferenceLookups } from "../../hooks/useReferenceLookups";
import type { LookupEntry } from "../../config/referenceLookups";
import { toast } from "../../stores/toastStore";
import { apiErrorPayload } from "../../api/endpoints/production";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useSuppliersColumns } from "../../components/table-columns/suppliersColumns";
import { CoaAccountSelector } from "../../components/accounting/CoaAccountSelector";
import { PartnerStatementDialog } from "../../components/accounting/PartnerStatementDialog";
import type { CoaAction, Entity, NewCoaAccountPayload } from "../../types/entities";
import {
  SupplierDuplicateWarning,
  SupplierPartyFields,
  isLinkableSupplierEntity,
  isPrivateSupplierEntity,
} from "./SupplierPartyFields";
import { SupplierMergeDialog } from "./SupplierMergeDialog";

export const SuppliersPage: React.FC = () => {
  const { data: suppliers = [], isLoading, error: queryError, refetch } = useSuppliers();
  const { data: operatingUnits = [] } = useOperatingUnits();
  const { data: currencies = [] } = useReferenceLookups("currencies", { isActive: true });
  const { data: cities = [] } = useReferenceLookups("cities", { isActive: true });
  const createSupplierMutation = useCreateSupplier();
  const { data: allEntities = [], isLoading: entitiesLoading } = useEntities();
  const companyWide = useIsCompanyWide();
  const user = useAuthStore((s) => s.user);
  const currentUnitId = useServerConfigStore((s) => s.operatingUnitId);
  const { hasPermission } = usePermissions();
  // A merge is a write (the API sends it through edit-procurement).
  const canEdit = hasPermission("edit-procurement");

  // W5-07: the API refuses a supplier in a unit the caller holds no role in
  // (SUPPLIER_UNIT_FORBIDDEN), so the form offers only the caller's units, or
  // every unit to a company-wide role.
  const assignableUnits = useMemo(() => {
    if (companyWide) return operatingUnits;
    const roleUnitIds = new Set(
      (user?.roles ?? []).map((r) => r.pivot?.operating_unit_id).filter((id): id is string => Boolean(id))
    );
    return operatingUnits.filter((u) => roleUnitIds.has(u.id));
  }, [companyWide, operatingUnits, user]);
  const defaultUnitId = assignableUnits.find((u) => u.id === currentUnitId)?.id ?? assignableUnits[0]?.id ?? "";
  const unitName = (id: string | null | undefined): string =>
    (id && operatingUnits.find((u) => u.id === id)?.name) || "وحدة أخرى";

  // W5-07: clients and suppliers that a supplier can be linked to as its party.
  const linkableEntities = useMemo(() => allEntities.filter(isLinkableSupplierEntity), [allEntities]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [entityId, setEntityId] = useState<string | null>(null);
  const [taxNumber, setTaxNumber] = useState("");
  const [createDuplicates, setCreateDuplicates] = useState<SupplierDuplicate[]>([]);
  const [coaAction, setCoaAction] = useState<CoaAction>("create_new");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<NewCoaAccountPayload>({
    parent_account_id: "",
    account_code: "",
    name: "",
    currency: "USD",
  });

  // Edit Supplier States
  const updateSupplierMutation = useUpdateSupplier();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editUnitId, setEditUnitId] = useState("");
  const [editName, setEditName] = useState("");
  const [editContact, setEditContact] = useState("");
  const [editDefaultCurrency, setEditDefaultCurrency] = useState("USD");
  const [editAddress, setEditAddress] = useState("");
  const [editEntityId, setEditEntityId] = useState<string | null>(null);
  const [editTaxNumber, setEditTaxNumber] = useState("");
  const [editDuplicates, setEditDuplicates] = useState<SupplierDuplicate[]>([]);

  // W5-07: merge dialog (source = the duplicate that disappears).
  const [mergeSource, setMergeSource] = useState<Supplier | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [editCoaAction, setEditCoaAction] = useState<CoaAction>("none");
  const [editSelectedAccountId, setEditSelectedAccountId] = useState<string | null>(null);
  const [editNewAccount, setEditNewAccount] = useState<NewCoaAccountPayload>({
    parent_account_id: "",
    account_code: "",
    name: "",
    currency: "USD",
  });

  const resetForm = () => {
    setSelectedUnitId("");
    setName("");
    setContact("");
    setCity("");
    setAddress("");
    setEntityId(null);
    setTaxNumber("");
    setCreateDuplicates([]);
    setDefaultCurrency("USD");
    setCoaAction("create_new");
    setSelectedAccountId(null);
    setNewAccount({
      parent_account_id: "",
      account_code: "",
      name: "",
      currency: "USD",
    });
  };

  // Linking an entity brings its tax number (locked when it has one) and, on an empty form, its name.
  const handleCreateEntityChange = (entity: Entity | null) => {
    const previous = linkableEntities.find((x) => x.id === entityId);
    setEntityId(entity?.id ?? null);
    setTaxNumber(entity?.tax_number ?? (previous?.tax_number ? "" : taxNumber));
    if (entity && !name.trim()) setName(entity.name);
    setCreateDuplicates([]);
  };

  const handleCreateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    submitCreate(false);
  };

  const submitCreate = (force: boolean) => {
    const unitId = selectedUnitId || defaultUnitId;
    if (!name.trim() || !unitId) {
      toast.error("يرجى تعبئة اسم المورد والوحدة التشغيلية");
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

    const fullAddress = [city, address].filter(Boolean).join(" - ");

    const payload: CreateSupplierPayload = {
      operating_unit_id: unitId,
      name: name.trim(),
      contact: contact.trim() || undefined,
      default_currency: defaultCurrency,
      address: fullAddress || undefined,
      entity_id: entityId ?? undefined,
      tax_number: taxNumber.trim() || undefined,
      force: force || undefined,
      coa_action: coaAction,
      account_id: coaAction === "link_existing" ? selectedAccountId : undefined,
      new_account:
        coaAction === "create_new"
          ? {
              parent_account_id: newAccount.parent_account_id,
              account_code: newAccount.account_code.trim(),
              name: newAccount.name.trim(),
              currency: newAccount.currency || defaultCurrency,
            }
          : undefined,
    };

    createSupplierMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("تمت إضافة المورد بنجاح");
        setIsModalOpen(false);
        resetForm();
      },
      onError: (err: unknown) => {
        const payloadErr = apiErrorPayload(err);
        if (payloadErr?.code === "SUPPLIER_DUPLICATE" && payloadErr.duplicates?.length) {
          setCreateDuplicates(payloadErr.duplicates);
          toast.warning(SUPPLIER_ERROR_MESSAGE.SUPPLIER_DUPLICATE);
          return;
        }
        toast.error(supplierErrorMessage(err, "حدث خطأ أثناء حفظ بيانات المورد"));
      },
    });
  };

  const handleOpenEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setEditUnitId(supplier.operating_unit_id);
    setEditName(supplier.name || "");
    setEditContact(supplier.contact || "");
    setEditDefaultCurrency(supplier.default_currency || "USD");
    setEditAddress(supplier.address || "");
    setEditEntityId(supplier.entity_id ?? null);
    setEditTaxNumber(supplier.tax_number ?? "");
    setEditDuplicates([]);
    setEditCoaAction(supplier.account_id ? "link_existing" : "none");
    setEditSelectedAccountId(supplier.account_id || null);
    setEditNewAccount({
      parent_account_id: "",
      account_code: "",
      name: "",
      currency: supplier.default_currency || "USD",
    });
    setIsEditModalOpen(true);
  };

  // The supplier's own private entity (no other role, unit or supplier): its tax number is the supplier's.
  const editPrivateEntityId =
    editingSupplier &&
    isPrivateSupplierEntity(
      linkableEntities.find((x) => x.id === editingSupplier.entity_id),
      editingSupplier.operating_unit_id,
      suppliers.some((s) => s.id !== editingSupplier.id && s.entity_id === editingSupplier.entity_id)
    )
      ? editingSupplier.entity_id
      : null;

  const handleEditEntityChange = (entity: Entity | null) => {
    if (!entity) return;
    // A newly linked entity keeps its own tax number. Without one, the current tax number carries over
    // (the backend fills it in), unless it belonged to a previously linked shared party.
    const previous = linkableEntities.find((x) => x.id === editEntityId);
    const previousOwnsTax = Boolean(previous?.tax_number) && previous?.id !== editPrivateEntityId;
    setEditEntityId(entity.id);
    setEditTaxNumber(entity.tax_number ?? (previousOwnsTax ? "" : editTaxNumber));
    setEditDuplicates([]);
  };

  const handleUpdateSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    submitUpdate(false);
  };

  const submitUpdate = (force: boolean) => {
    if (!editingSupplier) return;

    const unitId = editUnitId || editingSupplier.operating_unit_id;
    if (!editName.trim() || !unitId) {
      toast.error("يرجى تعبئة اسم المورد والوحدة التشغيلية");
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

    // W5-07: send the link and the tax number only when they change.
    const entityChanged = Boolean(editEntityId) && editEntityId !== editingSupplier.entity_id;
    const tax = editTaxNumber.trim();
    const originalTax = (editingSupplier.tax_number ?? "").trim();
    let taxPayload: string | null | undefined;
    if (entityChanged) taxPayload = tax || undefined;
    else if (tax !== originalTax) taxPayload = tax || null;

    const payload: UpdateSupplierPayload = {
      record_version: editingSupplier.record_version,
      ...(entityChanged && editEntityId ? { entity_id: editEntityId } : {}),
      ...(taxPayload !== undefined ? { tax_number: taxPayload } : {}),
      ...(force ? { force: true } : {}),
      operating_unit_id: unitId,
      name: editName.trim(),
      contact: editContact.trim() || undefined,
      default_currency: editDefaultCurrency,
      address: editAddress.trim() || undefined,
      coa_action: editCoaAction,
      account_id: editCoaAction === "link_existing" ? editSelectedAccountId : (editCoaAction === "none" ? null : undefined),
      new_account:
        editCoaAction === "create_new"
          ? {
              parent_account_id: editNewAccount.parent_account_id,
              account_code: editNewAccount.account_code.trim(),
              name: editNewAccount.name.trim(),
              currency: editNewAccount.currency || editDefaultCurrency,
            }
          : undefined,
    };

    updateSupplierMutation.mutate(
      { id: editingSupplier.id, payload },
      {
        onSuccess: () => {
          toast.success("تم تحديث بيانات المورد بنجاح");
          setIsEditModalOpen(false);
          setEditingSupplier(null);
        },
        onError: (err: unknown) => {
          const payloadErr = apiErrorPayload(err);
          if (payloadErr?.code === "SUPPLIER_DUPLICATE" && payloadErr.duplicates?.length) {
            setEditDuplicates(payloadErr.duplicates);
            toast.warning(SUPPLIER_ERROR_MESSAGE.SUPPLIER_DUPLICATE);
            return;
          }
          toast.error(supplierErrorMessage(err, "تعذر تحديث بيانات المورد"));
          if (payloadErr?.code === "OPTIMISTIC_LOCK_CONFLICT") {
            // The dialog holds the old record_version; close it so the supplier is reopened fresh.
            setIsEditModalOpen(false);
            setEditingSupplier(null);
            refetch();
          }
        },
      }
    );
  };

  const [statementOpen, setStatementOpen] = useState(false);
  const [statementSupplier, setStatementSupplier] = useState<Supplier | null>(null);

  const handleOpenStatement = (supplier: Supplier) => {
    setStatementSupplier(supplier);
    setStatementOpen(true);
  };

  // The edit form keeps the supplier's current unit even when the caller could not choose it.
  const editUnitOptions = useMemo(() => {
    if (!editingSupplier || assignableUnits.some((u) => u.id === editingSupplier.operating_unit_id)) return assignableUnits;
    const current = operatingUnits.find((u) => u.id === editingSupplier.operating_unit_id) ?? editingSupplier.operating_unit;
    return current ? [current, ...assignableUnits] : assignableUnits;
  }, [assignableUnits, editingSupplier, operatingUnits]);

  const handleOpenMerge = (supplier: Supplier, targetId: string | null = null) => {
    setMergeTargetId(targetId);
    setMergeSource(supplier);
  };

  // From the edit form's duplicate warning: merge the supplier being edited into the match.
  const handleMergeFromEdit = (duplicate: SupplierDuplicate) => {
    if (!editingSupplier) return;
    const source = editingSupplier;
    setIsEditModalOpen(false);
    setEditingSupplier(null);
    handleOpenMerge(source, duplicate.id);
  };

  const columns = useSuppliersColumns({
    onEdit: handleOpenEditModal,
    onViewStatement: handleOpenStatement,
    onMerge: canEdit ? (supplier) => handleOpenMerge(supplier) : undefined,
  });
  const tableData = useMemo(() => suppliers, [suppliers]);
  const suppliersTable = useDataTable({
    exportFileName: "suppliers",
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (sup) => sup.id,
  });

  const errorMessage = queryError
    ? apiErrorPayload(queryError)?.message ||
      (isAxiosError(queryError) ? queryError.response?.data?.message : null) ||
      "تعذر تحميل قائمة الموردين"
    : null;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
            <Truck className="h-6 w-6 text-app-accent" />
            <span>سجل الموردين الخارجيين</span>
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            إدارة بيانات الشركات المزودة للمواد الخام والسلع المستوردة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span>تحديث</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>إضافة مورد جديد</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      {errorMessage ? (
        <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-center text-xs text-app-status-danger">
          {errorMessage}
        </div>
      ) : (
        <DataTable table={suppliersTable}>
          <DataTable.Header>
            <DataTable.Toolbar>
              <DataTable.SearchInput placeholder="بحث بالاسم أو العملة أو الاتصال..." />
            </DataTable.Toolbar>
          </DataTable.Header>
          <DataTable.Content
            isLoading={isLoading}
            emptyMessage="لا يوجد موردون مسجلون — قم بإنشاء سجل للموردين للبدء في إصدار أوامر الاستيراد"
            emptyIcon={Building}
          />
          <DataTable.Pagination />
        </DataTable>
      )}

      {/* Add Supplier Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>إضافة مورد خارجي جديد</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
        <form id="supplier-create-form" onSubmit={handleCreateSupplier} className="space-y-4" dir="rtl">
          <div>
            <label className="block text-xs font-semibold text-app-label-secondary mb-1">
              الوحدة التشغيلية <span className="text-app-status-danger">*</span>
            </label>
            <SearchableSelect<{ id: string; name: string }>
              options={assignableUnits}
              value={
                assignableUnits.find((u) => u.id === (selectedUnitId || defaultUnitId)) ?? null
              }
              onChange={(u) => {
                setSelectedUnitId(u ? u.id : "");
                setCreateDuplicates([]);
              }}
              getOptionId={(u) => u.id}
              getOptionLabel={(u) => u.name}
              placeholder="-- اختر الوحدة --"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-app-label-secondary mb-1">
              اسم الشركة الموردة <span className="text-app-status-danger">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setCreateDuplicates([]);
              }}
              placeholder="مثال: Global Steel Trading Corp"
              className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
            />
          </div>

          <SupplierPartyFields
            entities={linkableEntities}
            entitiesLoading={entitiesLoading}
            entityId={entityId}
            onEntityChange={handleCreateEntityChange}
            taxNumber={taxNumber}
            onTaxNumberChange={(value) => {
              setTaxNumber(value);
              setCreateDuplicates([]);
            }}
            unitName={unitName}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                العملة المعتمدة
              </label>
              <SearchableSelect<LookupEntry>
                options={currencies}
                value={currencies.find((c) => c.code === defaultCurrency) ?? null}
                onChange={(c) => setDefaultCurrency(c ? c.code : "USD")}
                getOptionId={(c) => c.id}
                getOptionLabel={(c) => `${c.name} (${c.code})`}
                getOptionSubLabel={(c) => c.fields?.symbol}
                placeholder="-- اختر العملة --"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                جهة / هاتف الاتصال
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="هاتف أو بريد أو مسؤول المبيعات"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                المدينة / المركز المحلي (اختياري)
              </label>
              <SearchableSelect<LookupEntry>
                options={cities}
                value={cities.find((c) => c.name === city) ?? null}
                onChange={(c) => setCity(c ? c.name : "")}
                getOptionId={(c) => c.id}
                getOptionLabel={(c) => c.name}
                getOptionSubLabel={(c) => c.code}
                placeholder="-- اختر المدينة --"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                العنوان التفصيلي / الدولة والميناء
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثال: إسطنبول، تركيا - ميناء أمبارلي"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Chart of Accounts Linkage */}
          <CoaAccountSelector
            entityTypeLabel="المورد"
            defaultEntityName={name.trim()}
            currency={defaultCurrency}
            action={coaAction}
            onActionChange={setCoaAction}
            selectedAccountId={selectedAccountId}
            onSelectedAccountIdChange={setSelectedAccountId}
            newAccount={newAccount}
            onNewAccountChange={setNewAccount}
            preferredParentCode="21"
            useEntityNameDirectly
          />

          {createDuplicates.length > 0 && (
            <SupplierDuplicateWarning
              duplicates={createDuplicates}
              saving={createSupplierMutation.isPending}
              onForce={() => submitCreate(true)}
            />
          )}
        </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="supplier-create-form"
              disabled={createSupplierMutation.isPending || !name.trim()}
              className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {createSupplierMutation.isPending ? "جاري الحفظ..." : "حفظ المورد"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>تعديل بيانات المورد الخارجي</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
            <form id="supplier-edit-form" onSubmit={handleUpdateSupplier} className="space-y-4" dir="rtl">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  الوحدة التشغيلية <span className="text-app-status-danger">*</span>
                </label>
                <SearchableSelect<{ id: string; name: string }>
                  options={editUnitOptions}
                  value={editUnitOptions.find((u) => u.id === editUnitId) ?? null}
                  onChange={(u) => {
                    setEditUnitId(u ? u.id : "");
                    setEditDuplicates([]);
                  }}
                  getOptionId={(u) => u.id}
                  getOptionLabel={(u) => u.name}
                  placeholder="-- اختر الوحدة التشغيلية --"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  اسم الشركة / المورد <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditDuplicates([]);
                  }}
                  placeholder="مثال: Istanbul Chemical Traders"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              </div>

              <SupplierPartyFields
                entities={linkableEntities}
                entitiesLoading={entitiesLoading}
                entityId={editEntityId}
                onEntityChange={handleEditEntityChange}
                clearable={false}
                privateEntityId={editPrivateEntityId}
                taxNumber={editTaxNumber}
                onTaxNumberChange={(value) => {
                  setEditTaxNumber(value);
                  setEditDuplicates([]);
                }}
                unitName={unitName}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    جهة الاتصال / الهاتف / البريد
                  </label>
                  <input
                    type="text"
                    value={editContact}
                    onChange={(e) => setEditContact(e.target.value)}
                    placeholder="مثال: contact@company.com"
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    العملة الافتراضية للتعامل
                  </label>
                  <SearchableSelect<LookupEntry>
                    options={currencies}
                    value={currencies.find((c) => c.code === editDefaultCurrency) ?? null}
                    onChange={(c) => {
                      if (c) {
                        setEditDefaultCurrency(c.code);
                        setEditNewAccount((prev) => ({ ...prev, currency: c.code }));
                      }
                    }}
                    getOptionId={(c) => c.id}
                    getOptionLabel={(c) => `${c.name} (${c.code})`}
                    getOptionSubLabel={(c) => c.fields?.symbol}
                    placeholder="-- اختر العملة --"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  العنوان / المرفأ / بلد الشحن
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="مثال: إسطنبول، تركيا - ميناء أمبارلي"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              </div>

              {/* Chart of Accounts Linkage */}
              <CoaAccountSelector
                entityTypeLabel="المورد"
                defaultEntityName={editName.trim()}
                currency={editDefaultCurrency}
                action={editCoaAction}
                onActionChange={setEditCoaAction}
                selectedAccountId={editSelectedAccountId}
                onSelectedAccountIdChange={setEditSelectedAccountId}
                newAccount={editNewAccount}
                onNewAccountChange={setEditNewAccount}
                preferredParentCode="21"
                useEntityNameDirectly
              />

              {/* A merge needs both suppliers in one unit; after a unit change the check ran on the new unit. */}
              {editDuplicates.length > 0 && (
                <SupplierDuplicateWarning
                  duplicates={editDuplicates}
                  saving={updateSupplierMutation.isPending}
                  onForce={() => submitUpdate(true)}
                  onMerge={
                    editingSupplier && (editUnitId || editingSupplier.operating_unit_id) === editingSupplier.operating_unit_id
                      ? handleMergeFromEdit
                      : undefined
                  }
                />
              )}
            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingSupplier(null);
              }}
              className="rounded-xl border border-app-separator bg-app-bg-secondary px-4 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="supplier-edit-form"
              disabled={updateSupplierMutation.isPending || !editName.trim()}
              className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {updateSupplierMutation.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* W5-07: Merge a duplicate supplier */}
      <SupplierMergeDialog
        source={mergeSource}
        initialTargetId={mergeTargetId}
        suppliers={suppliers}
        onClose={() => {
          setMergeSource(null);
          setMergeTargetId(null);
        }}
      />

      {/* Statement of Account Dialog */}
      {statementSupplier && (
        <PartnerStatementDialog
          open={statementOpen}
          onOpenChange={setStatementOpen}
          partyType="supplier"
          partyId={statementSupplier.id}
          partyName={statementSupplier.name}
        />
      )}
    </div>
  );
};

export default SuppliersPage;
