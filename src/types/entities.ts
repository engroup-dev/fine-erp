export type EntityType = 'individual' | 'organization';

export type EntityRoleType = 'employee' | 'client' | 'vendor';

/**
 * piece_rate stays only for legacy rows: payroll does not support it and the API refuses it (W5-01).
 * daily (W5-04, HR-14): paid per attended day (half a day for a half day) at the daily rate.
 */
export type PayType = 'hourly' | 'monthly' | 'daily' | 'piece_rate';

export type EmployeeStatus = 'active' | 'terminated' | 'on_leave';

export type ClientStatus = 'active' | 'suspended' | 'blacklisted';

export interface OperatingUnit {
  id: string;
  company_id?: string;
  blueprint_id?: string;
  blueprint?: { id: string; name: string };
  name: string;
  unit_type?: string;
  currency?: string;
  status?: "provisioning" | "active" | "inactive" | string;
  manager_user_id?: string | null;
  manager?: { id: string; name: string } | null;
  /** The unit's own sales revenue account; null posts sales to the 41 header. */
  revenue_account_id?: string | null;
  /** FR-SLREP-008: the POS runs cashier shifts (opening float, X/Z reports per shift). */
  pos_shifts_enabled?: boolean;
  /**
   * Per-event chart-of-accounts overrides for this unit, when eager-loaded by
   * the show endpoint. Every item transacted inside this unit inherits these
   * accounts — the inventory item itself carries no account data.
   */
  accounts?: Array<{
    id: string;
    event_type: string;
    event_label: string;
    account: {
      id: string;
      account_code: string;
      name: string;
      type: string;
      currency: string;
    } | null;
  }>;
  warehouses?: Warehouse[];
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface Warehouse {
  id: string;
  operating_unit_id: string;
  parent_id?: string | null;
  name: string;
  is_internal_unit?: boolean;
  /** Only meaningful on a sub-warehouse — a "location-types" reference-lookup code (e.g. SHELF). */
  location_type?: string | null;
  /** Only present on a top-level warehouse, from GET /warehouses. */
  children?: Warehouse[];
  created_at?: string;
  updated_at?: string;
}

export interface EntityContact {
  id?: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  is_primary?: boolean;
  created_at?: string;
}

export interface EntityRole {
  id?: string;
  role_type: EntityRoleType;
  operating_unit_id?: string | null;
  created_at?: string;
}

export interface Entity {
  id: string;
  name: string;
  entity_type: EntityType;
  tax_number?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  user_id?: string | null;
  is_active: boolean;
  record_version?: number;
  roles?: EntityRole[];
  contacts?: EntityContact[];
  primary_contact?: EntityContact | null;
  employee?: Employee | null;
  client?: Client | null;
  created_at?: string;
  updated_at?: string;
}

export interface Employee {
  id: string;
  entity_id: string;
  operating_unit_id: string;
  operating_unit?: { id: string; name: string };
  job_title: string;
  labor_role?: string | null;
  pay_type: PayType;
  monthly_salary?: string | number | null;
  hourly_rate?: string | number | null;
  /** HR-14: the daily rate of daily pay terms. */
  daily_rate?: string | number | null;
  /** HR-14: the employee's work shift (overtime multiplier, standard hours); null = company defaults. */
  work_shift_id?: string | null;
  work_shift?: { id: string; name: string; standard_hours: number; overtime_multiplier: number } | null;
  hire_date: string;
  employee_number?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
  probation_end?: string | null;
  termination_date?: string | null;
  /** Present only for the pay roles (owner, hr-manager, accounting-manager). */
  bank_name?: string | null;
  bank_account?: string | null;
  status: EmployeeStatus;
  record_version?: number;
  entity?: Entity;
  created_at?: string;
  updated_at?: string;
  /** Set only on a deleted employee, listed through `with_trashed` (W5-02). */
  deleted_at?: string | null;
}

export interface Client {
  id: string;
  entity_id: string;
  operating_unit_id: string;
  operating_unit?: { id: string; name: string };
  /** W5-06: the client's group (company-wide); null when it has none. */
  client_group_id?: string | null;
  client_group?: { id: string; code: string; name: string; default_price_tier: 'retail' | 'wholesale' } | null;
  credit_limit: string | number;
  current_balance?: string | number;
  payment_terms_days: number;
  account_id?: string | null;
  account?: { id: string; account_code: string; name: string } | null;
  status: ClientStatus;
  record_version?: number;
  entity?: Entity;
  created_at?: string;
  updated_at?: string;
}

/** "merged" is the row a supplier merge leaves on the surviving supplier (W5-07). */
export type AuditAction = "created" | "updated" | "deleted" | "restored" | "merged";

export interface AuditLogEntry {
  id: string;
  user_id?: string | null;
  /** W6-01: the acting user's id and name; null for system rows, absent on older payloads. */
  user?: { id: string; name: string } | null;
  operating_unit_id?: string | null;
  table_name: string;
  record_id: string;
  action: AuditAction;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at?: string;
}

export interface BlueprintEntry {
  id: string;
  name: string;
  workflow_set?: Record<string, unknown>;
  default_role_template?: Record<string, unknown>;
  default_inventory_config?: Record<string, unknown>;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UnitBlueprintCreatePayload {
  name: string;
  workflow_set: Record<string, unknown>;
  default_role_template: Record<string, unknown>;
  default_inventory_config: Record<string, unknown>;
}

export interface UnitBlueprintUpdatePayload {
  name?: string;
  workflow_set?: Record<string, unknown>;
  default_role_template?: Record<string, unknown>;
  default_inventory_config?: Record<string, unknown>;
}

export interface OperatingUnitCreatePayload {
  name: string;
  blueprint_id: string;
}

export interface OperatingUnitUpdatePayload {
  name?: string;
  status?: "provisioning" | "active" | "inactive";
  manager_user_id?: string | null;
  revenue_account_id?: string | null;
}

export interface AuditLogFilters {
  action?: AuditAction;
  from?: string;
  to?: string;
}

/** W6-01: the company-wide viewer's filters (GET /audit-logs) on top of action/from/to. */
export interface AuditLogSearchFilters extends AuditLogFilters {
  table_name?: string;
  record_id?: string;
  operating_unit_id?: string;
  user_id?: string;
  search?: string;
}
export interface CreateEmployeePayload {
  entity_id?: string;
  name?: string;
  entity_type?: EntityType;
  tax_number?: string;
  operating_unit_id: string;
  job_title: string;
  labor_role?: string | null;
  pay_type: PayType;
  monthly_salary?: number | null;
  hourly_rate?: number | null;
  /** HR-14: required for daily pay. */
  daily_rate?: number | null;
  /** HR-14: only the pay roles may send one (WORK_SHIFT_FORBIDDEN). */
  work_shift_id?: string | null;
  hire_date: string;
  employee_number?: string | null;
  contract_start?: string | null;
  contract_end?: string | null;
  probation_end?: string | null;
  termination_date?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  status?: EmployeeStatus;
}

/**
 * PUT /employees/{id}: the card fields only. Pay type and rates are refused here;
 * they change through a dated pay change (POST /employees/{id}/compensations, HR-11).
 */
export interface UpdateEmployeePayload {
  employee_number?: string | null;
  job_title?: string;
  labor_role?: string | null;
  /** HR-14: only the pay roles may change it (WORK_SHIFT_FORBIDDEN); sending back the stored value is not a change. */
  work_shift_id?: string | null;
  hire_date?: string;
  contract_start?: string | null;
  contract_end?: string | null;
  probation_end?: string | null;
  termination_date?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  status?: EmployeeStatus;
  record_version: number;
}

/** "auto" = the server opens the next receivable sub-account under 122. */
export type CoaAction = "none" | "link_existing" | "create_new" | "auto";

export interface NewCoaAccountPayload {
  parent_account_id: string;
  account_code: string;
  name: string;
  currency?: string;
}

export interface CreateClientPayload {
  entity_id?: string;
  name?: string;
  entity_type?: EntityType;
  tax_number?: string;
  /** Optional for a POS quick-add — the backend uses the current unit. */
  operating_unit_id?: string;
  /** W5-06: on create, a blank credit_limit / payment_terms_days comes from the group; null clears it on update. */
  client_group_id?: string | null;
  credit_limit?: number;
  payment_terms_days?: number;
  account_id?: string | null;
  coa_action?: CoaAction;
  phone?: string;
  new_account?: NewCoaAccountPayload | null;
  status?: ClientStatus;
  city?: string;
  address?: string;
}

export interface UpdateClientPayload extends Partial<CreateClientPayload> {
  record_version: number;
}
