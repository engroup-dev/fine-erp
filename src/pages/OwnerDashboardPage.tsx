import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Percent,
  Globe2,
  Inbox,
  Check,
  X,
  Gauge,
} from "lucide-react";
import {
  useDashboardKpis,
  useUnitComparison,
  useOperationalPipeline,
  usePendingApprovals,
  useInboxDecision,
} from "../hooks/useDashboard";
import { apiErrorPayload } from "../api/endpoints/production";
import { formatNumber } from "../lib/utils/format";
import { usePermissions } from "../hooks/usePermissions";
import { INVENTORY_ROLES } from "../routes/routes.config";

// Keys must match DashboardService::operationalPipeline() on the backend —
// furniture_orders was removed there when production_orders/boms were
// dropped in the Bundle redesign (2026-09-25) and has no replacement yet.
const PIPELINE_LABEL: Record<string, string> = {
  import_orders: "أوامر الاستيراد",
  foam_batches: "تشغيلات الإسفنج",
  cutter_work_orders: "أوامر التقطيع",
  sales_orders: "أوامر البيع",
};

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
}> = ({ icon, label, value, sub, onClick }) => (
  <div
    onClick={onClick}
    className={`rounded-2xl border border-app-separator bg-app-bg-primary p-4 shadow-sm ${
      onClick ? "cursor-pointer hover:border-app-accent/40 transition-colors" : ""
    }`}
  >
    <div className="flex items-center gap-2 text-xs text-app-label-secondary">
      {icon}
      {label}
    </div>
    <div className="mt-2 font-mono text-xl font-bold text-app-label-primary">
      {value}
    </div>
    {sub && (
      <div className="mt-1 text-[10px] text-app-label-tertiary">{sub}</div>
    )}
  </div>
);

export const OwnerDashboardPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  // The low-stock card opens the reorder report only for viewers whose role reaches /inventory/*.
  const { hasRole, hasPermission } = usePermissions();
  const canOpenReorder = hasRole(INVENTORY_ROLES) && hasPermission("view-inventory");

  const kpis = useDashboardKpis();
  const comparison = useUnitComparison();
  const pipeline = useOperationalPipeline();
  const approvals = usePendingApprovals();
  const decide = useInboxDecision();

  const act = (
    kind: "credit" | "restock" | "payroll" | "leave",
    id: string,
    decision: "approve" | "reject",
  ) => {
    setError(null);
    decide.mutate(
      { kind, id, decision },
      {
        onError: (err) =>
          setError(apiErrorPayload(err)?.message ?? "تعذر تنفيذ القرار."),
      },
    );
  };

  const maxRevenue = Math.max(
    1,
    ...(comparison.data?.rows.map((r) => Math.abs(r.revenue)) ?? [1]),
  );
  const maxInventory = Math.max(
    1,
    ...(comparison.data?.rows.map((r) => r.inventory_value) ?? [1]),
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
          <LayoutGrid className="w-7 h-7 text-app-accent" />
          لوحة المالك (Owner Dashboard)
        </h1>
        <p className="text-xs text-app-label-secondary mt-1">
          نظرة شاملة على الشركة، مشتقة من الدفاتر مباشرة — الفترة:{" "}
          {kpis.data?.period.from} ← {kpis.data?.period.to}. تتحدث تلقائيًا كل
          30 ثانية.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          icon={<TrendingUp className="w-4 h-4 text-app-accent" />}
          label="إيرادات الشهر"
          value={formatNumber(kpis.data?.revenue_mtd ?? 0)}
          sub={`تكلفة المبيعات ${formatNumber(kpis.data?.cogs_mtd ?? 0)}`}
        />
        <KpiCard
          icon={<Percent className="w-4 h-4 text-app-accent" />}
          label="هامش الربح الإجمالي"
          value={
            kpis.data?.gross_margin_pct != null
              ? `${formatNumber(kpis.data.gross_margin_pct)}%`
              : "—"
          }
          sub={`صافي الشهر ${formatNumber(kpis.data?.net_profit_mtd ?? 0)}`}
        />
        <KpiCard
          icon={<Wallet className="w-4 h-4 text-app-accent" />}
          label="النقدية"
          value={formatNumber(kpis.data?.cash_position ?? 0)}
          sub={`خزائن ${formatNumber(kpis.data?.cash_position_cash ?? 0)} · مصارف ${formatNumber(kpis.data?.cash_position_banks ?? 0)}`}
          onClick={() => navigate("/treasury")}
        />
        <KpiCard
          icon={<Globe2 className="w-4 h-4 text-app-accent" />}
          label="التزامات بالعملة الأجنبية"
          value={
            Object.entries(kpis.data?.fx_exposure ?? {})
              .map(([ccy, amt]) => `${formatNumber(amt)} ${ccy}`)
              .join(" | ") || "0"
          }
          sub="أوامر استيراد لم تكتمل"
        />
        <KpiCard
          icon={<Inbox className="w-4 h-4 text-app-accent" />}
          label="بانتظار القرار"
          value={String(approvals.data?.total ?? 0)}
          sub={`ائتمان ${kpis.data?.pending_approvals.credit ?? 0} · تزويد ${kpis.data?.pending_approvals.restock ?? 0} · رواتب ${kpis.data?.pending_approvals.payroll ?? 0} · إجازات ${kpis.data?.pending_approvals.leave ?? 0} · توزيعات ${kpis.data?.pending_approvals.overhead_allocations ?? 0} · تكاليف ${kpis.data?.pending_approvals.landed_cost_lines ?? 0}`}
        />
        <KpiCard
          icon={<Gauge className="w-4 h-4 text-app-status-danger" />}
          label="أصناف تحت الحد الأدنى"
          value={String(kpis.data?.low_stock_count ?? 0)}
          sub="مخزن/صنف وصل رصيده إلى الحد الأدنى — كل الوحدات (التقرير يعرض الوحدة المحددة)"
          onClick={canOpenReorder ? () => navigate("/inventory/reorder") : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-6">
          {/* Unit comparison */}
          <div className="rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
            <h3 className="px-4 py-2.5 text-xs font-bold text-app-label-primary bg-app-bg-secondary border-b border-app-separator rounded-t-2xl">
              مقارنة الوحدات — ربحية الشهر وقيمة المخزون
            </h3>
            <div className="divide-y divide-app-separator">
              {comparison.data?.rows.map((row) => (
                <div key={row.operating_unit_id} className="p-4 space-y-1.5">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="w-44 font-bold text-app-label-primary truncate">
                      {row.unit_name}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-app-fill-f1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-app-accent"
                        style={{
                          width: `${(Math.abs(row.revenue) / maxRevenue) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-24 text-end font-mono">
                      {formatNumber(row.revenue)}
                    </span>
                    <span
                      className={`w-24 text-end font-mono font-bold ${row.net < 0 ? "text-app-status-danger" : "text-app-status-positive"}`}
                    >
                      {formatNumber(row.net)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-app-label-tertiary">
                    <span className="w-44">المخزون</span>
                    <div className="flex-1 h-1.5 rounded-full bg-app-fill-f1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-app-status-yellow"
                        style={{
                          width: `${(row.inventory_value / maxInventory) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="w-24 text-end font-mono">
                      {formatNumber(row.inventory_value)}
                    </span>
                    <span className="w-24" />
                  </div>
                </div>
              ))}
              {comparison.data &&
                Math.abs(comparison.data.unallocated_net) > 0 && (
                  <div className="px-4 py-2 text-[10px] text-app-label-tertiary">
                    صافي غير موزّع على الوحدات:{" "}
                    <span className="font-mono">
                      {formatNumber(comparison.data.unallocated_net)}
                    </span>
                  </div>
                )}
            </div>
          </div>

          {/* Pipelines */}
          <div className="rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
            <h3 className="px-4 py-2.5 text-xs font-bold text-app-label-primary bg-app-bg-secondary border-b border-app-separator rounded-t-2xl">
              خطوط العمليات الجارية
            </h3>
            <div className="divide-y divide-app-separator">
              {pipeline.data &&
                (
                  Object.keys(PIPELINE_LABEL) as (keyof typeof pipeline.data)[]
                )
                  .filter((key) => pipeline.data?.[key])
                  .map((key) => (
                  <div
                    key={key}
                    className="flex flex-wrap items-center gap-2 px-4 py-2.5"
                  >
                    <span className="w-36 text-xs font-bold text-app-label-primary">
                      {PIPELINE_LABEL[key]}
                    </span>
                    <span className="text-[10px] font-mono text-app-label-tertiary w-10">
                      {pipeline.data[key].total}
                    </span>
                    {Object.entries(pipeline.data[key].statuses).map(
                      ([status, count]) => (
                        <span
                          key={status}
                          className="rounded-full bg-app-fill-f1 px-2 py-0.5 text-[10px] font-mono text-app-label-secondary"
                        >
                          {status.replace(/_/g, " ")} × {count}
                        </span>
                      ),
                    )}
                    {pipeline.data[key].total === 0 && (
                      <span className="text-[10px] text-app-label-tertiary">
                        لا شيء جارٍ
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Approval inbox */}
        <div className="rounded-2xl border border-app-separator bg-app-bg-primary shadow-sm">
          <h3 className="px-4 py-2.5 text-xs font-bold text-app-label-primary bg-app-bg-secondary border-b border-app-separator rounded-t-2xl flex items-center gap-1.5">
            <Inbox className="w-4 h-4 text-app-accent" />
            صندوق الاعتمادات
          </h3>
          <div className="divide-y divide-app-separator">
            {approvals.data?.credit_approvals.map((item) => (
              <div key={item.id} className="p-3 space-y-1.5">
                <div className="text-xs font-bold text-app-label-primary">
                  تجاوز ائتمان — {item.client_name ?? "عميل"}
                </div>
                <div className="text-[10px] font-mono text-app-label-secondary">
                  {item.order_number} · فوق الحد بـ{" "}
                  {formatNumber(item.amount_over_limit)}
                </div>
                <InboxActions
                  onDecide={(d) => act("credit", item.id, d)}
                  busy={decide.isPending}
                />
              </div>
            ))}
            {approvals.data?.restock_requests.map((item) => (
              <div key={item.id} className="p-3 space-y-1.5">
                <div className="text-xs font-bold text-app-label-primary">
                  تزويد داخلي — {item.request_number}
                </div>
                <div className="text-[10px] text-app-label-secondary">
                  {item.requesting_unit} ← {item.source_unit}
                </div>
                <InboxActions
                  onDecide={(d) => act("restock", item.id, d)}
                  busy={decide.isPending}
                />
              </div>
            ))}
            {approvals.data?.payroll_runs.map((item) => (
              <div key={item.id} className="p-3 space-y-1.5">
                <div className="text-xs font-bold text-app-label-primary">
                  مسير رواتب {item.period}
                </div>
                <div className="text-[10px] font-mono text-app-label-secondary">
                  صافي {formatNumber(item.total_net)}
                </div>
                <InboxActions
                  approveOnly
                  onDecide={(d) => act("payroll", item.id, d)}
                  busy={decide.isPending}
                />
              </div>
            ))}
            {approvals.data?.leave_requests.map((item) => (
              <div key={item.id} className="p-3 space-y-1.5">
                <div className="text-xs font-bold text-app-label-primary">
                  إجازة — {item.employee_name ?? "موظف"}
                </div>
                <div className="text-[10px] font-mono text-app-label-secondary">
                  {item.start_date} ← {item.end_date}
                </div>
                <InboxActions
                  onDecide={(d) => act("leave", item.id, d)}
                  busy={decide.isPending}
                />
              </div>
            ))}
            {approvals.data?.overhead_allocations.map((item) => (
              <div key={item.id} className="p-3 space-y-1.5">
                <div className="text-xs font-bold text-app-label-primary">
                  توزيع مصروف عمومي (
                  {item.status === "paid" ? "مدفوع" : "بانتظار"})
                </div>
                <div className="text-[10px] font-mono text-app-label-secondary">
                  وحدة {item.operating_unit_id ? item.operating_unit_id.slice(0, 8) : "عامة"} ·{" "}
                  {formatNumber(item.amount)} · {item.category ?? "—"}
                </div>
              </div>
            ))}
            {approvals.data?.landed_cost_lines.map((item) => (
              <div key={item.id} className="p-3 space-y-1.5">
                <div className="text-xs font-bold text-app-label-primary">
                  تكلفة رأسمالية — {item.type}
                </div>
                <div className="text-[10px] font-mono text-app-label-secondary">
                  أمر شراء {(item.purchase_order_id ?? item.import_order_id ?? "").slice(0, 8)} ·{" "}
                  {formatNumber(item.amount)} {item.currency}
                </div>
              </div>
            ))}
            {approvals.data?.total === 0 && (
              <div className="p-8 text-center text-xs text-app-label-tertiary">
                لا قرارات معلقة
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const InboxActions: React.FC<{
  onDecide: (decision: "approve" | "reject") => void;
  busy: boolean;
  approveOnly?: boolean;
}> = ({ onDecide, busy, approveOnly }) => (
  <div className="flex gap-1.5">
    <button
      onClick={() => onDecide("approve")}
      disabled={busy}
      className="flex items-center gap-1 rounded-lg bg-app-accent px-2.5 py-1 text-[10px] font-bold text-white hover:opacity-90 disabled:opacity-50"
    >
      <Check className="w-3 h-3" /> اعتماد
    </button>
    {!approveOnly && (
      <button
        onClick={() => onDecide("reject")}
        disabled={busy}
        className="flex items-center gap-1 rounded-lg border border-app-status-danger/40 px-2.5 py-1 text-[10px] font-bold text-app-status-danger hover:bg-app-status-danger/10 disabled:opacity-50"
      >
        <X className="w-3 h-3" /> رفض
      </button>
    )}
  </div>
);
