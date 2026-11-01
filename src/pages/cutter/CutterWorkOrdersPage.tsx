import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Scissors,
  Plus,
  RefreshCw,
  AlertTriangle,
  Package,
} from "lucide-react";
import {
  useCutterOrders,
  useCreateCutterOrder,
  useAvailableFoamBlocks,
} from "../../hooks/useCutter";
import { getClients } from "../../api/endpoints/clients";
import {
  AvailableFoamBlock,
  CutterWorkOrder,
  CUTTER_STATUS_ORDER,
  CUTTER_STATUS_LABEL,
  CutterWorkOrderStatus,
  cutterApi,
} from "../../api/endpoints/cutter";
import { fetchAllPages } from "../../lib/utils/fetchAllPages";
import { apiErrorPayload } from "../../api/endpoints/production";
import { formatNumber } from "../../lib/utils/format";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { useCutterWorkOrdersColumns } from "../../components/table-columns/cutterWorkOrdersColumns";

export const CutterWorkOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [internalOnly, setInternalOnly] = useState(false);
  // Server paging: the endpoint returns 15 orders a page by default.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState("");
  const [notes, setNotes] = useState("");
  const [stockLotId, setStockLotId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => getClients() });
  const { data: foamBlocksPage } = useAvailableFoamBlocks();
  const foamBlocks: AvailableFoamBlock[] = foamBlocksPage?.data ?? [];
  const selectedBlock = foamBlocks.find((b) => b.id === stockLotId);

  const { data, isLoading, refetch } = useCutterOrders(
    {
      status: statusFilter || undefined,
      internal_only: internalOnly || undefined,
      page,
      per_page: perPage,
    },
    { keepPrevious: true },
  );
  const createMutation = useCreateCutterOrder();

  const orders = data?.data ?? [];

  const resetCreateForm = () => {
    setClientId("");
    setNotes("");
    setStockLotId("");
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createMutation.mutate(
      {
        client_id: clientId || undefined,
        notes: notes || undefined,
        stock_lot_id: stockLotId || undefined,
      },
      {
        onSuccess: (res) => {
          setShowForm(false);
          resetCreateForm();
          navigate(`/cutter/orders/${res.data.id}`);
        },
        onError: (err: unknown) =>
          setError(apiErrorPayload(err)?.message ?? "تعذر إنشاء أمر العمل."),
      },
    );
  };

  const openOrder = (order: CutterWorkOrder) => navigate(`/cutter/orders/${order.id}`);

  const columns = useCutterWorkOrdersColumns({ onOpenOrder: openOrder });

  const tableData = useMemo(() => orders, [orders]);
  const ordersTable = useDataTable({
    exportFileName: "cutter-orders",
    // Every page under the current filters, not just the one on screen.
    fetchAllRowsForExport: () =>
      fetchAllPages(async (p, size) =>
        (
          await cutterApi.getOrders({
            status: statusFilter || undefined,
            internal_only: internalOnly || undefined,
            page: p,
            per_page: size,
          })
        ).data,
      ),
    columns,
    data: tableData,
    enableSorting: true,
    enableGlobalFilter: false,
    getRowId: (o) => o.id,
    serverPagination: {
      page,
      perPage,
      total: data?.total ?? 0,
      lastPage: data?.last_page ?? 1,
      onChange: (p, size) => {
        setPage(p);
        setPerPage(size);
      },
    },
  });

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Scissors className="w-7 h-7 text-app-accent" />
            أوامر عمل التقطيع
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            بلوكات إسفنج تُقطع إلى أشكال القوالب. تُوزن القصاصات قبل أن يتمكن الأمر من اجتياز فحص
            الجودة.
          </p>
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
              setShowForm(true);
              setError(null);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" /> أمر عمل جديد
          </button>
        </div>
      </div>

      {error && !showForm && (
        <div className="flex items-start gap-2 rounded-2xl border border-app-status-danger/30 bg-app-status-danger/10 p-4 text-xs text-app-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Pipeline filter — the lifecycle doubles as the filter row */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-app-separator bg-app-bg-primary p-3 shadow-sm">
        <button
          onClick={() => {
            setStatusFilter("");
            setPage(1);
          }}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            statusFilter === ""
              ? "bg-app-accent text-white"
              : "bg-app-fill-f1 text-app-label-secondary hover:bg-app-fill-f2"
          }`}
        >
          الكل
        </button>
        {CUTTER_STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === s
                ? "bg-app-accent text-white"
                : "bg-app-fill-f1 text-app-label-secondary hover:bg-app-fill-f2"
            }`}
          >
            {CUTTER_STATUS_LABEL[s]}
          </button>
        ))}

        <label className="ms-auto flex items-center gap-2 text-xs text-app-label-secondary">
          <input
            type="checkbox"
            checked={internalOnly}
            onChange={(e) => {
              setInternalOnly(e.target.checked);
              setPage(1);
            }}
            className="accent-current"
          />
          الداخلية فقط
        </label>
      </div>

      <DataTable table={ordersTable}>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage={`لا توجد أوامر عمل تقطيع${statusFilter ? ` في مرحلة ${CUTTER_STATUS_LABEL[statusFilter as CutterWorkOrderStatus]}` : ""}.`}
          emptyIcon={Scissors}
        />
        <DataTable.Pagination />
      </DataTable>

      <Dialog
        open={showForm}
        onOpenChange={(next) => {
          setShowForm(next);
          if (!next) resetCreateForm();
        }}
      >
        <DialogContent size="2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-app-accent-subtle text-app-accent rounded-xl">
                <Scissors className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle>أمر عمل تقطيع جديد</DialogTitle>
                <DialogDescription>
                  اترك العميل بدون تحديد لأمر داخلي. يمكن اختيار بلوك الآن أو تحديده لاحقاً من صفحة تفاصيل الأمر قبل بدء التقطيع.
                </DialogDescription>
              </div>
            </div>
            <DialogClose />
          </DialogHeader>
          <DialogBody className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-app-status-danger/30 bg-app-status-danger/10 p-3 text-xs text-app-status-danger">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form id="cutter-work-order-form" onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                  العميل
                </label>
                <SearchableSelect<{ id: string; entity?: { name?: string } }>
                  options={clients ?? []}
                  value={
                    clients?.find((c) => c.id === clientId) ?? null
                  }
                  onChange={(c) => setClientId(c ? c.id : "")}
                  getOptionId={(c) => c.id}
                  getOptionLabel={(c) => c.entity?.name ?? c.id}
                  placeholder="داخلي (من وحدة أخرى)"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                  بلوك مُقطَّع مسبقاً (اختياري)
                </label>
                <SearchableSelect<AvailableFoamBlock>
                  options={foamBlocks}
                  value={
                    foamBlocks.find((b) => b.id === stockLotId) ?? null
                  }
                  onChange={(b) => setStockLotId(b ? b.id : "")}
                  getOptionId={(b) => b.id}
                  getOptionLabel={(b) => b.lot_number}
                  getOptionSubLabel={(b) =>
                    `${b.inventory_item?.code ?? ""} · ${formatNumber(Number(b.unit_cost))} ${
                      b.warehouse?.name ?? ""
                    }`
                  }
                  getOptionSearchText={(b) =>
                    `${b.lot_number} ${b.inventory_item?.code ?? ""} ${b.inventory_item?.name ?? ""}`
                  }
                  placeholder="لا يوجد بلوك بعد — يُختار لاحقاً"
                />
                {selectedBlock && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-app-accent-subtle px-2 py-0.5 font-mono text-app-accent">
                      <Package className="h-3 w-3" />
                      {selectedBlock.lot_number}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-app-bg-secondary px-2 py-0.5 text-app-label-secondary border border-app-separator">
                      {Number(selectedBlock.length_m ?? 0).toFixed(2)} ×
                      {" "}{Number(selectedBlock.width_m ?? 0).toFixed(2)} ×
                      {" "}{Number(selectedBlock.height_m ?? 0).toFixed(2)} م
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-app-bg-secondary px-2 py-0.5 text-app-label-secondary border border-app-separator">
                      {Number(selectedBlock.volume_m3 ?? 0).toFixed(4)} م³
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-app-accent/10 px-2 py-0.5 font-bold text-app-accent">
                      {formatNumber(Number(selectedBlock.unit_cost))} سعر مثبت
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-app-label-tertiary mt-1">
                  اختياري. في حال تحديده، سيتم حجز البلوك للأمر. يمكنك أيضاً اختياره أو تغييره لاحقاً من صفحة تفاصيل الأمر قبل بدء التقطيع.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary uppercase mb-1">
                  ملاحظات
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-xl bg-app-bg-secondary text-xs text-app-label-primary border-app-separator focus:border-app-accent focus:outline-none"
                />
              </div>

            </form>
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetCreateForm();
              }}
              className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="cutter-work-order-form"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl shadow-sm disabled:opacity-50"
            >
              {createMutation.isPending ? "جاري الإنشاء…" : "إنشاء أمر العمل"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
