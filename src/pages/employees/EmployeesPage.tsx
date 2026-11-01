import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { UserCheck, Plus, RefreshCw } from "lucide-react";
import { isAxiosError } from "axios";
import { PayType, EmployeeStatus, Employee } from "../../types/entities";
import { useEmployees, useCreateEmployee } from "../../hooks/useEmployees";
import { useEntities, useOperatingUnits } from "../../hooks/usePartners";
import { useWorkShifts } from "../../hooks/useHr";
import { usePermissions } from "../../hooks/usePermissions";
import { PAY_ROLES, employeeErrorMessage, getEmployees } from "../../api/endpoints/employees";
import type { WorkShift } from "../../api/endpoints/hr";
import { formatNumber } from "../../lib/utils/format";
import { useReferenceLookups } from "../../hooks/useReferenceLookups";
import type { LookupEntry } from "../../config/referenceLookups";
import { useServerConfigStore } from "../../stores/serverConfigStore";
import { toast } from "../../stores/toastStore";
import { apiErrorPayload } from "../../api/endpoints/production";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useEmployeesColumns } from "../../components/table-columns/employeesColumns";

export const EmployeesPage: React.FC = () => {
  const navigate = useNavigate();
  const { allowManualEntitySelection } = useServerConfigStore();
  const [selectedOperatingUnitId, setSelectedOperatingUnitId] = useState("");

  const {
    data: employees = [],
    isLoading,
    error: queryError,
    refetch,
  } = useEmployees();
  const { data: entities = [] } = useEntities();
  const { data: operatingUnits = [] } = useOperatingUnits();
  const { data: employeeCategories = [] } = useReferenceLookups("employee-categories", { isActive: true });
  const createEmployeeMutation = useCreateEmployee();
  const { roleSlugs } = usePermissions();
  // HR-14: only the pay roles assign a shift (WORK_SHIFT_FORBIDDEN); the controller checks the exact slugs.
  const canAssignShift = roleSlugs.some((s) => PAY_ROLES.includes(s));
  const { data: workShifts = [] } = useWorkShifts();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [entityMode, setEntityMode] = useState<"auto" | "existing">("auto");
  const [employeeName, setEmployeeName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [isCustomJobTitle, setIsCustomJobTitle] = useState(false);
  const [laborRole, setLaborRole] = useState("");
  const [payType, setPayType] = useState<PayType>("monthly");
  const [monthlySalary, setMonthlySalary] = useState<string>("");
  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [dailyRate, setDailyRate] = useState<string>("");
  const [workShiftId, setWorkShiftId] = useState("");
  const [hireDate, setHireDate] = useState(new Date().toISOString().split("T")[0]);

  const resetForm = () => {
    setEmployeeName("");
    setTaxNumber("");
    setSelectedEntityId("");
    setJobTitle("");
    setIsCustomJobTitle(false);
    setLaborRole("");
    setMonthlySalary("");
    setHourlyRate("");
    setDailyRate("");
    setWorkShiftId("");
    setEntityMode("auto");
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitId = selectedOperatingUnitId || operatingUnits[0]?.id;

    if (entityMode === "existing" && !selectedEntityId) {
      toast.error("يرجى اختيار الكيان الحالي");
      return;
    }

    if (entityMode === "auto" && !employeeName.trim()) {
      toast.error("يرجى إدخال اسم الموظف لإنشاء الكيان التلقائي");
      return;
    }

    if (!jobTitle || !unitId) {
      toast.error("يرجى تعبئة كافة الحقول المطلوبة والوحدة التشغيلية");
      return;
    }

    // StoreEmployeeRequest refuses these with English messages; catch them here in Arabic.
    if (payType === "monthly" && monthlySalary.trim() === "") {
      toast.error("أدخل الراتب الشهري للموظف براتب شهري.");
      return;
    }
    if (payType === "hourly" && !laborRole.trim() && hourlyRate.trim() === "") {
      toast.error("موظف بالساعة بلا دور عمالي يحتاج أجر ساعة شخصياً.");
      return;
    }
    if (payType === "daily" && dailyRate.trim() === "") {
      toast.error("أدخل الأجر اليومي للموظف بأجر يومي.");
      return;
    }

    const payload = {
      operating_unit_id: unitId,
      job_title: jobTitle,
      labor_role: laborRole.trim() || undefined,
      pay_type: payType,
      monthly_salary: payType === "monthly" && monthlySalary ? Number(monthlySalary) : undefined,
      hourly_rate: payType === "hourly" && hourlyRate ? Number(hourlyRate) : undefined,
      daily_rate: payType === "daily" && dailyRate ? Number(dailyRate) : undefined,
      work_shift_id: canAssignShift && workShiftId ? workShiftId : undefined,
      hire_date: hireDate,
      status: "active" as EmployeeStatus,
      ...(entityMode === "existing"
        ? { entity_id: selectedEntityId }
        : { name: employeeName.trim(), entity_type: "individual" as const, tax_number: taxNumber.trim() || undefined }),
    };

    createEmployeeMutation.mutate(payload, {
      onSuccess: () => {
        toast.success("تمت إضافة الموظف بنجاح");
        setIsModalOpen(false);
        resetForm();
      },
      onError: (err: unknown) => toast.error(employeeErrorMessage(err, "خطأ أثناء إضافة الموظف")),
    });
  };

  const errorMessage = queryError
    ? apiErrorPayload(queryError)?.message ||
      (isAxiosError(queryError) ? queryError.response?.data?.message : null) ||
      "تعذر تحميل سجلات الموظفين"
    : null;

  const columns = useEmployeesColumns();

  const tableData = useMemo(() => employees, [employees]);
  const employeesTable = useDataTable({
    exportFileName: "employees",
    // W6-04: the capped all-rows read (the list itself sends no filters).
    fetchAllRowsForExport: () => getEmployees({ all: 1 }),
    // The plain list is uncapped and already holds every employee: past the cap, export it.
    loadedRowsAreComplete: true,
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (emp) => emp.id,
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary">إدارة الموظفين والعمالة</h1>
          <p className="text-xs text-app-label-secondary mt-1">
            متابعة القوى العاملة المباشرة بالوحدة التشغيلية
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-2 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            تحديث
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            إضافة موظف
          </button>
        </div>
      </div>

      {/* Main Table */}
      {errorMessage ? (
        <div className="rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-center text-xs text-app-status-danger">
          {errorMessage}
        </div>
      ) : (
        <DataTable table={employeesTable}>
          <DataTable.Header>
            <DataTable.Toolbar>
              <DataTable.SearchInput placeholder="بحث بالاسم أو المسمى الوظيفي..." />
            </DataTable.Toolbar>
          </DataTable.Header>
          <DataTable.Content
            isLoading={isLoading}
            emptyMessage="لا يوجد موظفون مضافون"
            onRowClick={(row: Employee) => navigate(`/employees/${row.id}`)}
            emptyIcon={UserCheck}
          />
          <DataTable.Pagination />
        </DataTable>
      )}

      {/* Add Employee Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>إضافة موظف / عامل جديد</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <DialogBody>
        <form id="employee-create-form" onSubmit={handleAddEmployee} className="space-y-4" dir="rtl">
          <div>
            <label className="block text-xs font-semibold text-app-label-secondary mb-1">
              الوحدة التشغيلية <span className="text-app-status-danger">*</span>
            </label>
            <SearchableSelect<{ id: string; name: string }>
              options={operatingUnits}
              value={
                operatingUnits.find((u) => u.id === selectedOperatingUnitId) ??
                null
              }
              onChange={(u) => setSelectedOperatingUnitId(u ? u.id : "")}
              getOptionId={(u) => u.id}
              getOptionLabel={(u) => u.name}
              placeholder="-- اختر الوحدة التشغيلية --"
              required
            />
          </div>

          {/* Entity Information (Auto-create or Select Existing) */}
          {allowManualEntitySelection ? (
            <div className="rounded-xl border border-app-separator bg-app-bg-secondary p-3 space-y-3">
              <label className="block text-xs font-bold text-app-label-primary">
                الكيان المرتبط بالموظف
              </label>
              <div className="flex items-center gap-4 text-xs font-semibold text-app-label-primary">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="empEntityMode"
                    checked={entityMode === "auto"}
                    onChange={() => setEntityMode("auto")}
                    className="text-app-accent"
                  />
                  <span>إنشاء فرد جديد تلقائياً</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="empEntityMode"
                    checked={entityMode === "existing"}
                    onChange={() => setEntityMode("existing")}
                    className="text-app-accent"
                  />
                  <span>اختيار كيان حالي</span>
                </label>
              </div>

              {entityMode === "auto" ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                      اسم الموظف الثلاثي <span className="text-app-status-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={employeeName}
                      onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="مثال: أحمد عبد الله المحمودي"
                      className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-1.5 text-xs text-app-label-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                      الرقم الوطني / جواز السفر (اختياري)
                    </label>
                    <input
                      type="text"
                      value={taxNumber}
                      onChange={(e) => setTaxNumber(e.target.value)}
                      placeholder="مثال: 11985002010"
                      className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-3 py-1.5 text-xs text-app-label-primary focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="pt-1">
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">الكيان المرتبط</label>
                  <SearchableSelect<{ id: string; name: string }>
                    options={entities.filter(
                      (ent) => ent.entity_type === "individual"
                    )}
                    value={
                      entities.find((ent) => ent.id === selectedEntityId) ??
                      null
                    }
                    onChange={(ent) => setSelectedEntityId(ent ? ent.id : "")}
                    getOptionId={(ent) => ent.id}
                    getOptionLabel={(ent) => ent.name}
                    getOptionSubLabel={() => "فرد"}
                    placeholder="-- اختر كيان --"
                    required
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  اسم الموظف الثلاثي <span className="text-app-status-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  placeholder="مثال: أحمد عبد الله المحمودي"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  الرقم الوطني / جواز السفر (اختياري)
                </label>
                <input
                  type="text"
                  value={taxNumber}
                  onChange={(e) => setTaxNumber(e.target.value)}
                  placeholder="مثال: 11985002010"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-app-label-secondary">
                  المسمى الوظيفي <span className="text-app-status-danger">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomJobTitle(!isCustomJobTitle)}
                  className="text-[10px] text-app-accent hover:underline"
                >
                  {isCustomJobTitle ? "اختيار من القائمة" : "إدخال مسمى مخصص"}
                </button>
              </div>
              {isCustomJobTitle ? (
                <input
                  type="text"
                  required
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="مثال: مشغل آلة صب الفوم"
                  className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                />
              ) : (
                <SearchableSelect<LookupEntry>
                  options={employeeCategories}
                  value={employeeCategories.find((c) => c.name === jobTitle) ?? null}
                  onChange={(c) => setJobTitle(c ? c.name : "")}
                  getOptionId={(c) => c.id}
                  getOptionLabel={(c) => c.name}
                  getOptionSubLabel={(c) => c.notes || c.code}
                  placeholder="-- اختر المسمى الوظيفي --"
                  required
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                الدور العمالي (للربط بتكلفة الإنتاج)
              </label>
              <input
                type="text"
                value={laborRole}
                onChange={(e) => setLaborRole(e.target.value)}
                placeholder="مثال: operator, tailor, cutter"
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                تاريخ التعيين
              </label>
              <input
                type="date"
                value={hireDate}
                onChange={(e) => setHireDate(e.target.value)}
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                نوع الدفع / الأجر
              </label>
              <select
                value={payType}
                onChange={(e) => setPayType(e.target.value as PayType)}
                className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
              >
                <option value="monthly">راتب شهري ثابت</option>
                <option value="hourly">أجر بالساعة</option>
                <option value="daily">أجر يومي</option>
              </select>
            </div>

            <div>
              {payType === "monthly" && (
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    الراتب الشهري (LYD) <span className="text-app-status-danger">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    placeholder="مثال: 1500"
                    required
                    value={monthlySalary}
                    onChange={(e) => setMonthlySalary(e.target.value)}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>
              )}
              {payType === "hourly" && (
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    الأجر بالساعة (LYD)
                    {!laborRole.trim() && <span className="text-app-status-danger"> *</span>}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder={laborRole.trim() ? "اتركه فارغاً ليُحتسب بأجر الدور" : "مثال: 10"}
                    required={!laborRole.trim()}
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>
              )}
              {payType === "daily" && (
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    الأجر اليومي (LYD) <span className="text-app-status-danger">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="مثال: 60"
                    required
                    value={dailyRate}
                    onChange={(e) => setDailyRate(e.target.value)}
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs text-app-label-primary focus:outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {canAssignShift && (
            <div>
              <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                الوردية (لاحتساب الساعات الإضافية)
              </label>
              <SearchableSelect<WorkShift>
                options={workShifts}
                value={workShifts.find((w) => w.id === workShiftId) ?? null}
                onChange={(w) => setWorkShiftId(w ? w.id : "")}
                getOptionId={(w) => w.id}
                getOptionLabel={(w) => w.name}
                getOptionSubLabel={(w) => `${formatNumber(w.standard_hours)} س · إضافي × ${formatNumber(w.overtime_multiplier)}`}
                placeholder="بدون وردية (إعدادات الشركة الافتراضية)"
              />
            </div>
          )}

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
              form="employee-create-form"
              disabled={
                createEmployeeMutation.isPending ||
                (entityMode === "existing" && !selectedEntityId) ||
                (entityMode === "auto" && !employeeName.trim()) ||
                !jobTitle
              }
              className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {createEmployeeMutation.isPending ? "جاري الحفظ..." : "حفظ الموظف"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeesPage;
