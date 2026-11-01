import apiClient from "../client";
import { Employee, CreateEmployeePayload, type UpdateEmployeePayload } from "../../types/entities";
import type { Paginated } from "./accounting";
import { LEDGER_ERROR_MESSAGE, apiErrorMessage, apiErrorPayload } from "./production";
import type { Attendance, Payslip, PayrollRunStatus } from "./hr";
import { formatDate } from "../../lib/utils/format";

export interface GetEmployeesParams {
  operating_unit_id?: string;
  status?: string;
  /** W5-02: include deleted employees (an advance they owe stays listed and repayable). */
  with_trashed?: 1;
  /** W6-04: every row the filters match as one page (CSV export); 422 EXPORT_TOO_LARGE past the server cap. */
  all?: 1;
}

export const getEmployees = async (params?: GetEmployeesParams): Promise<Employee[]> => {
  const response = await apiClient.get<{ data: Employee[] }>("/employees", { params });
  return response.data.data;
};

export const getEmployee = async (id: string): Promise<Employee> => {
  const response = await apiClient.get<{ data: Employee }>(`/employees/${id}`);
  return response.data.data;
};

export const createEmployee = async (payload: CreateEmployeePayload): Promise<Employee> => {
  const response = await apiClient.post<{ data: Employee }>("/employees", payload);
  return response.data.data;
};

export function deleteEmployee(id: string) {
  return apiClient.delete<{ message: string }>(`/employees/${id}`);
}

export const updateEmployee = async (id: string, payload: UpdateEmployeePayload): Promise<Employee> => {
  const response = await apiClient.put<{ data: Employee }>(`/employees/${id}`, payload);
  return response.data.data;
};

export type EmployeePayslip = Payslip & {
  created_at?: string;
  payroll_run?: { id: string; period: string; status: PayrollRunStatus } | null;
};

export const getEmployeeAttendance = async (id: string, page = 1): Promise<Paginated<Attendance>> => {
  const response = await apiClient.get<Paginated<Attendance>>(`/employees/${id}/attendance`, { params: { page } });
  return response.data;
};

export const getEmployeePayslips = async (id: string, page = 1): Promise<Paginated<EmployeePayslip>> => {
  const response = await apiClient.get<Paginated<EmployeePayslip>>(`/employees/${id}/payslips`, { params: { page } });
  return response.data;
};

/** Roles that set pay and see/set bank details (HR-10; EmployeeResource::BANK_DETAIL_ROLES). */
export const PAY_ROLES = ["owner", "hr-manager", "accounting-manager"];

/** HR-11: one dated version of an employee's pay terms. */
export interface EmployeeCompensation {
  id: string;
  employee_id: string;
  pay_type: "monthly" | "hourly" | "daily" | "piece_rate";
  monthly_salary: number | null;
  hourly_rate: number | null;
  /** HR-14: the daily rate of daily pay terms. */
  daily_rate?: number | null;
  effective_from: string;
  reason: string | null;
  created_by: string | null;
  creator?: { id: string; name: string } | null;
  created_at?: string;
}

export interface CreateCompensationPayload {
  pay_type: "monthly" | "hourly" | "daily";
  monthly_salary?: number | null;
  hourly_rate?: number | null;
  /** HR-14: required for daily pay. */
  daily_rate?: number | null;
  effective_from: string;
  reason?: string | null;
}

/** Newest first. */
export const getEmployeeCompensations = async (id: string): Promise<EmployeeCompensation[]> => {
  const response = await apiClient.get<{ data: EmployeeCompensation[] }>(`/employees/${id}/compensations`);
  return response.data.data;
};

export const createEmployeeCompensation = async (
  id: string,
  payload: CreateCompensationPayload,
): Promise<EmployeeCompensation> => {
  const response = await apiClient.post<{ data: EmployeeCompensation }>(`/employees/${id}/compensations`, payload);
  return response.data.data;
};

export const deleteEmployeeCompensation = (id: string, compensationId: string) =>
  apiClient.delete<{ message: string }>(`/employees/${id}/compensations/${compensationId}`);

/** Arabic text for the employee-card refusal codes whose backend message is English. */
export const EMPLOYEE_ERROR_MESSAGE: Record<string, string> = {
  ...LEDGER_ERROR_MESSAGE,
  BANK_DETAILS_FORBIDDEN: "البيانات المصرفية يحددها مدير الموارد البشرية أو مدير الحسابات أو المالك فقط.",
  COMPENSATION_FORBIDDEN: "تغيير الأجر من صلاحية مدير الموارد البشرية أو مدير الحسابات أو المالك فقط.",
  HR_SETTINGS_FORBIDDEN: "إعدادات الموارد البشرية يغيّرها مدير الموارد البشرية أو المالك فقط.",
  OPTIMISTIC_LOCK_CONFLICT: "عدّل مستخدم آخر بيانات هذا الموظف للتو — أغلق النافذة وأعد فتحها ثم حاول مرة أخرى.",
};

/**
 * INVALID_COMPENSATION messages (EmployeeCompensationService, English) in Arabic.
 * The frozen-payroll refusals are the ones users hit most: a pay change dated inside
 * a month whose payroll has already left review.
 */
const COMPENSATION_MESSAGES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [
    /^Payroll for (\d{4}-\d{2}) has already left review; a pay change must take effect after (\d{4}-\d{2}-\d{2})\.$/,
    (m) => `مسير ${m[1]} تجاوز المراجعة؛ لا يسري تغيير الأجر إلا بعد ${formatDate(m[2])}.`,
  ],
  [
    /^Payroll for (\d{4}-\d{2}) has already left review; only a pay change taking effect after (\d{4}-\d{2}-\d{2})/,
    (m) => `مسير ${m[1]} تجاوز المراجعة؛ لا يُحذف إلا تغيير أجر يسري بعد ${formatDate(m[2])}.`,
  ],
  [
    /^Payroll for (\d{4}-\d{2}) has already left review; the hire date can only move within dates on or before (\d{4}-\d{2}-\d{2}) or after (\d{4}-\d{2}-\d{2})\.$/,
    (m) =>
      `مسير ${m[1]} تجاوز المراجعة؛ لا يُنقل تاريخ التعيين إلا ضمن التواريخ حتى ${formatDate(m[2])} أو بعد ${formatDate(m[3])}.`,
  ],
  [
    /^A pay change cannot take effect before the hire date \((\d{4}-\d{2}-\d{2})\)\.$/,
    (m) => `لا يسري تغيير الأجر قبل تاريخ التعيين (${formatDate(m[1])}).`,
  ],
  [
    /^A pay change effective (\d{4}-\d{2}-\d{2}) already exists/,
    (m) => `يوجد تغيير أجر يسري من ${formatDate(m[1])} لهذا الموظف؛ اختر تاريخاً آخر.`,
  ],
  [
    /^A pay change cannot take effect before the start of the pay history \((\d{4}-\d{2}-\d{2})\)\.$/,
    (m) => `لا يسري تغيير الأجر قبل بداية سجل الراتب (${formatDate(m[1])}).`,
  ],
  [/^The opening pay terms cannot be removed/, () => "لا تُحذف شروط الأجر الافتتاحية؛ سجّل تغيير أجر لاحقاً بدلاً من ذلك."],
  [
    /^A pay change takes effect on (\d{4}-\d{2}-\d{2}); the hire date must stay before it\.$/,
    (m) => `يسري تغيير أجر من ${formatDate(m[1])}؛ يجب أن يبقى تاريخ التعيين قبله.`,
  ],
];

/**
 * INVALID_COMPENSATION carries a specific reason (before the hire date, a duplicate
 * date, a frozen payroll period…): known reasons are shown in Arabic, an unknown one
 * keeps the server's text after an Arabic lead.
 */
export const employeeErrorMessage = (err: unknown, fallback: string): string => {
  const payload = apiErrorPayload(err);
  if (payload?.code === "INVALID_COMPENSATION") {
    const message = payload.message ?? "";
    for (const [pattern, toArabic] of COMPENSATION_MESSAGES) {
      const match = message.match(pattern);
      if (match) return toArabic(match);
    }
    return message ? `${fallback} ${message}` : fallback;
  }
  // Rule::unique('employees','employee_number'): the 422 carries no code and an English message.
  if (payload?.errors?.employee_number) {
    return "الرقم الوظيفي مستخدم لموظف آخر.";
  }
  const known = payload?.code ? EMPLOYEE_ERROR_MESSAGE[payload.code] : undefined;
  if (known) return known;
  // HR-14: the shift was deleted after the picker loaded (EmployeeController::lockAssignableShift
  // or the Rule::exists check); the 422 carries no code and an English message.
  if (!payload?.code && payload?.errors?.work_shift_id) {
    return "الوردية المختارة حُذفت — اختر وردية أخرى.";
  }
  return apiErrorMessage(err, fallback);
};
