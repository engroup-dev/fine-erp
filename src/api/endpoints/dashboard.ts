import apiClient from "../client";

export interface DashboardKpis {
  period: { from: string; to: string };
  revenue_mtd: number;
  cogs_mtd: number;
  gross_margin_pct: number | null;
  net_profit_mtd: number;
  cash_position: number;
  /** CR 8: the same total split into cash boxes and banks (1212). */
  cash_position_cash?: number;
  cash_position_banks?: number;
  fx_exposure: Record<string, number>;
  pending_approvals: {
    credit: number;
    restock: number;
    payroll: number;
    leave: number;
    overhead_allocations: number;
    landed_cost_lines: number;
  };
  /** W4-02: warehouse/item pairs at or below their minimum, company-wide. */
  low_stock_count: number;
}

export interface UnitComparisonRow {
  operating_unit_id: string;
  unit_name: string;
  revenue: number;
  expenses: number;
  net: number;
  inventory_value: number;
}

export interface UnitComparison {
  period: string;
  rows: UnitComparisonRow[];
  unallocated_net: number;
}

export interface PipelineBreakdown {
  total: number;
  statuses: Record<string, number>;
}

export type OperationalPipeline = Record<
  "import_orders" | "foam_batches" | "cutter_work_orders" | "furniture_orders" | "sales_orders",
  PipelineBreakdown
>;

export interface PendingApprovals {
  credit_approvals: { id: string; order_number: string | null; client_name: string | null; amount_over_limit: number }[];
  restock_requests: { id: string; request_number: string; requesting_unit: string | null; source_unit: string | null }[];
  payroll_runs: { id: string; period: string; total_net: number }[];
  leave_requests: { id: string; employee_name: string | null; start_date: string; end_date: string; leave_type: string }[];
  overhead_allocations: {
    id: string;
    overhead_expense_id: string;
    operating_unit_id: string;
    status: string;
    amount: number;
    category: string | null;
  }[];
  landed_cost_lines: {
    id: string;
    purchase_order_id?: string;
    import_order_id?: string;
    operating_unit_id?: string;
    status: string;
    amount: number;
    currency: string;
    type: string;
  }[];
  total: number;
}

export interface MyAllocationApprovals {
  overhead_allocations: {
    id: string;
    kind: "overhead_allocation";
    overhead_expense_id: string;
    operating_unit_id: string;
    status: string;
    amount: number;
    category: string | null;
  }[];
  landed_cost_lines: {
    id: string;
    kind: "landed_cost_line";
    purchase_order_id?: string;
    import_order_id?: string;
    operating_unit_id?: string;
    status: string;
    amount: number;
    currency: string;
    type: string;
  }[];
  total: number;
}

export const dashboardApi = {
  kpis: () => apiClient.get<DashboardKpis>("/dashboard/kpis"),
  unitComparison: () => apiClient.get<UnitComparison>("/dashboard/unit-comparison"),
  operationalPipeline: () => apiClient.get<OperationalPipeline>("/dashboard/operational-pipeline"),
  pendingApprovals: () => apiClient.get<PendingApprovals>("/dashboard/pending-approvals"),
  myAllocationApprovals: () => apiClient.get<MyAllocationApprovals>("/dashboard/my-allocation-approvals"),

  decideCreditApproval: (id: string, decision: "approve" | "reject") =>
    apiClient.put(`/credit-approval-requests/${id}/${decision}`),

  decideRestock: (id: string, decision: "approve" | "reject") =>
    apiClient.put(`/internal-restock-requests/${id}/${decision}`),

  approvePayroll: (id: string) => apiClient.post(`/payroll-runs/${id}/approve`),

  decideLeave: (id: string, decision: "approve" | "reject") =>
    apiClient.put(`/leave-requests/${id}/${decision}`),
};
