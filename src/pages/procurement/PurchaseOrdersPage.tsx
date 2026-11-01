import React, { useMemo, useState, useEffect, useCallback, useDeferredValue, useRef } from "react";
import {
  FileCheck,
  Plus,
  RefreshCw,
  DollarSign,
  Package,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  Anchor,
  Truck,
  Warehouse as WarehouseIcon,
  ShieldCheck,
  Percent,
  Trash2,
  ListChecks,
  Edit,
} from "lucide-react";
import { FxPreviewCard } from "../../components/treasury/FxPreviewCard";
import { isAxiosError } from "axios";
import {
  PurchaseOrder,
  PurchaseOrderItemInput,
  PurchaseOrderStatus,
  CreatePurchaseOrderPayload,
  TransitionPurchaseOrderPayload,
  PaymentRoute,
  LandedCostType,
  LandedCostLine,
  getPurchaseOrderTotal,
} from "../../types/procurement";
import {
  approvePurchaseOrder,
  receivePurchaseOrder,
  payLocalPurchaseOrder,
  getPurchaseOrders,
} from "../../api/endpoints/procurement";
import {
  usePurchaseOrders,
  useSuppliers,
  useCreatePurchaseOrder,
  useTransitionPurchaseOrder,
  useLandedCostLines,
  useCreateLandedCostLine,
  useApproveLandedCostLine,
  useMarkLandedCostLinePaid,
  useExecutePaymentRequest,
} from "../../hooks/useProcurement";
import { usePermissions } from "../../hooks/usePermissions";
import { useOperatingUnits } from "../../hooks/usePartners";
import { useInventoryItems } from "../../hooks/useInventory";
import { useAccounts } from "../../hooks/useAccounting";
import { useWarehouses, Warehouse } from "../../hooks/useWarehouses";
import { InventoryItem } from "../../api/endpoints/inventory";
import { type Account } from "../../api/endpoints/accounting";
import { toast } from "../../stores/toastStore";
import { apiErrorPayload } from "../../api/endpoints/production";
import { formatNumber } from "../../lib/utils/format";
import { filterPaymentSourceAccounts } from "../../lib/utils/coa";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { useReferenceLookups } from "../../hooks/useReferenceLookups";
import type { LookupEntry } from "../../config/referenceLookups";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogBody, DialogFooter } from "../../components/ui/Dialog";
import { DataTable, useDataTable } from "../../components/ui/DataTable";
import { cn } from "../../lib/utils/utils";
import { tokens } from "../../lib/tokens";
import { usePurchaseOrdersColumns } from "../../components/table-columns/purchaseOrdersColumns";
import { usePurchaseOrderLineItemsColumns } from "../../components/table-columns/purchaseOrderLineItemsColumns";
import { usePurchaseOrderLandedCostColumns } from "../../components/table-columns/purchaseOrderLandedCostColumns";
import { EditPurchaseOrderItemsModal } from "./EditPurchaseOrderItemsModal";

const STAGES: { key: PurchaseOrderStatus; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: "draft", label: "مسودة", icon: Clock },
  { key: "pending_payment", label: "في انتظار تحديد الدفع", icon: DollarSign },
  { key: "awaiting_bank_approval", label: "اعتماد مصرفي", icon: ShieldCheck },
  { key: "awaiting_transfer", label: "حوالة سوق", icon: Send },
  { key: "paid", label: "تم مدفوع", icon: CheckCircle2 },
  { key: "in_transit", label: "في الشحن البحرية", icon: Truck },
  { key: "at_port", label: "وصلت الميناء", icon: Anchor },
  { key: "in_transit_to_warehouse", label: "نقل بري للمخزن", icon: Truck },
  { key: "at_warehouse", label: "وصلت المخزن", icon: WarehouseIcon },
  { key: "awaiting_receipt", label: "نقل للمخزن", icon: WarehouseIcon },
  { key: "received", label: "تم الاستلام", icon: Package },
  { key: "complete", label: "مكتمل ومحسوب", icon: FileCheck },
];

export const PurchaseOrdersPage: React.FC = () => {
  // Wave 5: market scope (foreign | local | all) for the orders list + a map
  // of line-id -> received-quantity input value for the local receive form.
  const [market, setMarket] = useState<"all" | "foreign" | "local">("all");
  const [receiveDraft, setReceiveDraft] = useState<Record<string, number>>({});
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [actingOnOrder, setActingOnOrder] = useState(false);

  const { data: orders = [], isLoading, isFetching, error: queryError, refetch } = usePurchaseOrders({
    kind: market === "all" ? undefined : market,
    per_page: 100,
  });
  const { data: suppliers = [] } = useSuppliers();
  const { data: operatingUnits = [] } = useOperatingUnits();
  const { data: currencies = [] } = useReferenceLookups("currencies", { isActive: true });

  const { hasRole } = usePermissions();
  const isFinance = hasRole(["owner", "admin", "accounting-manager", "treasury-officer"]);

  const createOrderMutation = useCreatePurchaseOrder();
  const transitionMutation = useTransitionPurchaseOrder();
  const createLandedCostMutation = useCreateLandedCostLine();
  const approveLandedCostMutation = useApproveLandedCostLine();
  const markLandedCostPaidMutation = useMarkLandedCostLinePaid();
  const executePaymentMutation = useExecutePaymentRequest();

  const [isModalOpen, setIsModalOpen] = useState(false);

  // Detail Modal & Stepper State
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const { data: landedCosts = [], isLoading: isLoadingCosts, refetch: refetchCosts } = useLandedCostLines(selectedOrder?.id);
  const isSubmitting = createOrderMutation.isPending || transitionMutation.isPending || createLandedCostMutation.isPending || executePaymentMutation.isPending;

  // Transition Form State
  const [transitionRoute, setTransitionRoute] = useState<PaymentRoute>("bank");
  const [heldAmountLyd, setHeldAmountLyd] = useState<number>(0);
  const [amountRequested, setAmountRequested] = useState<number>(0);
  const [invoiceRef, setInvoiceRef] = useState<string>("");
  const [arrivedWarehouseId, setArrivedWarehouseId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [receivedQty, setReceivedQty] = useState<number>(0);

  // Step 3 Payment Execution Form State
  const [fxRateUsed, setFxRateUsed] = useState<number>(0);
  const [exactAmountUsedLyd, setExactAmountUsedLyd] = useState<number>(0);
  const [bankReference, setBankReference] = useState<string>("");
  const [extraAllocationNote, setExtraAllocationNote] = useState<string>("");
  const [extraAllocationTouched, setExtraAllocationTouched] = useState(false);
  const [hardCapAcknowledged, setHardCapAcknowledged] = useState(false);

  // Payment source account (cash/bank COA sub-account the payment leaves
  // from). Used by both the foreign `execute_payment` step and the local
  // `payLocal` action. Strict filter to the 121* asset sub-tree.
  const { data: accounts = [] } = useAccounts();
  const paymentSourceAccounts = useMemo(
    () => filterPaymentSourceAccounts(accounts),
    [accounts],
  );
  const [paymentSourceAccountId, setPaymentSourceAccountId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    setPaymentSourceAccountId(null);
  }, [selectedOrder?.id]);

  useEffect(() => {
    if (selectedOrder) {
      const pendingPayment = selectedOrder.payment_requests?.find((p) => p.status === "pending");
      if (pendingPayment?.bank_hold?.held_amount_lyd) {
        const held = Number(pendingPayment.bank_hold.held_amount_lyd);
        setHeldAmountLyd(held);
      }
      setFxRateUsed(0);
      setExactAmountUsedLyd(0);
      setBankReference("");
      setExtraAllocationNote("");
      setExtraAllocationTouched(false);
      setHardCapAcknowledged(false);
    }
  }, [selectedOrder]);

  const bookedRate = selectedOrder?.booked_fx_rate ?? null;
  const toleranceLyd = 0.01;
  const hardCapPercent = 5.0;

  // FX-24 / FX-15: derive the effective values from whichever input the
  // operator fills. LYD wins when supplied (the bank statement is truth).
  const effectiveValues = useMemo(() => {
    if (!selectedOrder) {
      return { effectiveRate: null, effectiveSettledLyd: null };
    }
    const amount = Number(getPurchaseOrderTotal(selectedOrder));
    if (exactAmountUsedLyd > 0) {
      const settled = exactAmountUsedLyd;
      const rate = amount > 0 ? settled / amount : fxRateUsed;
      return { effectiveRate: rate, effectiveSettledLyd: settled };
    }
    if (fxRateUsed > 0) {
      return {
        effectiveRate: fxRateUsed,
        effectiveSettledLyd: amount * fxRateUsed,
      };
    }
    return { effectiveRate: null, effectiveSettledLyd: null };
  }, [selectedOrder, fxRateUsed, exactAmountUsedLyd]);

  const varianceLyd = useMemo(() => {
    if (
      !selectedOrder ||
      effectiveValues.effectiveSettledLyd === null ||
      bookedRate === null ||
      bookedRate === undefined
    ) {
      return null;
    }
    const amount = Number(getPurchaseOrderTotal(selectedOrder));
    return effectiveValues.effectiveSettledLyd - amount * bookedRate;
  }, [selectedOrder, effectiveValues, bookedRate]);

  const varianceExceedsTolerance =
    varianceLyd !== null && Math.abs(varianceLyd) > toleranceLyd;
  const varianceExceedsHardCap =
    varianceLyd !== null &&
    effectiveValues.effectiveSettledLyd !== null &&
    effectiveValues.effectiveSettledLyd > 0 &&
    Math.abs(varianceLyd) > (hardCapPercent / 100) * effectiveValues.effectiveSettledLyd;

  const requiresNote = varianceExceedsTolerance;
  const noteMissing = requiresNote && extraAllocationNote.trim().length === 0;
  const hasAtLeastOneInput =
    fxRateUsed > 0 || exactAmountUsedLyd > 0;

  const handleExecutePayment = async () => {
    if (!selectedOrder) return;
    const pendingPayment = selectedOrder.payment_requests?.find((p) => p.status === "pending");
    if (!pendingPayment) {
      toast.error("لا يوجد طلب دفع معلق لهذا الأمر");
      return;
    }
    if (!hasAtLeastOneInput) {
      toast.error("أدخل سعر الصرف أو المبلغ المنفذ بالدينار على الأقل.");
      return;
    }
    if (noteMissing) {
      setExtraAllocationTouched(true);
      toast.error("سبب التكلفة الإضافية مطلوب عند وجود فرق عن السعر المرجعي.");
      return;
    }
    if (varianceExceedsHardCap && !hardCapAcknowledged) {
      toast.error("يجب الموافقة على فرق السعر الذي يتجاوز الحد الأقصى قبل المتابعة.");
      return;
    }
    if (!paymentSourceAccountId) {
      toast.error("اختر حساب مصدر الدفع من الدليل المحاسبي قبل التنفيذ.");
      return;
    }

    executePaymentMutation.mutate(
      {
        id: pendingPayment.id,
        payload: {
          fx_rate_used: fxRateUsed > 0 ? fxRateUsed : null,
          exact_amount_used_lyd: exactAmountUsedLyd > 0 ? exactAmountUsedLyd : null,
          bank_reference: bankReference.trim() || undefined,
          extra_allocation_note: requiresNote ? extraAllocationNote.trim() : undefined,
          payment_source_account_id: paymentSourceAccountId,
        },
      },
      {
        onSuccess: () => {
          toast.success("تم سداد الدفعة بنجاح ونقل أمر الشراء إلى مدفوع!");
          refetch();
          setSelectedOrder((prev) =>
            prev ? { ...prev, status: "paid", payment_source_account_id: paymentSourceAccountId } : null,
          );
        },
        onError: (err: unknown) => {
          const payloadErr = apiErrorPayload(err);
          const message = payloadErr?.message || (isAxiosError(err) ? err.response?.data?.message : null);
          toast.error(message || "فشل تنفيذ عملية الدفع للمورد");
        },
      }
    );
  };

  const { data: warehouses = [] } = useWarehouses();

  // Landed Cost Form State
  const [costType, setCostType] = useState<LandedCostType>("freight");
  const [costAmount, setCostAmount] = useState<number>(0);
  const [costNote, setCostNote] = useState<string>("");
  const [costNoteTouched, setCostNoteTouched] = useState(false);
  const [lineError, setLineError] = useState<Record<string, string>>({});

  // Create Form State
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [kind, setKind] = useState<"foreign" | "local">("local");
  // Remember the foreign-mode currency so toggling back from local restores it.
  const foreignCurrencyRef = useRef<string>("USD");
  const [lineItems, setLineItems] = useState<PurchaseOrderItemInput[]>([
    { inventory_item_id: "", quantity: 1, unit_price: 0 },
  ]);
  // Destination warehouse — where the goods will land as StockLots once the
  // order reaches its final accounting step. Optional on create (can be set
  // later on the foreign arriveAtWarehouse step), but recommended.
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  // Warehouses filtered by the currently selected operating unit so the picker
  // stays short. `warehouses` is loaded globally; we narrow on the fly.
  const destinationWarehouseOptions = useMemo(
    () =>
      warehouses.filter(
        (w) => !selectedUnitId || (w as Warehouse).operating_unit_id === selectedUnitId,
      ),
    [warehouses, selectedUnitId],
  );
  const [itemTypeFilter, setItemTypeFilter] = useState<
    "raw_material" | "packaging" | "barrel" | "pallet"
  >("raw_material");
  const effectiveCurrency = kind === "local" ? "LYD" : currency;

  // Kind <-> currency consistency. Local orders are always LYD; remember the
  // foreign currency so toggling back restores it. Intentionally depends only
  // on `kind` to avoid an effect feedback loop with the currency state.
  useEffect(() => {
    if (kind === "local") {
      foreignCurrencyRef.current = currency;
      if (currency !== "LYD") {
        setCurrency("LYD");
      }
    } else if (currency === "LYD") {
      setCurrency(foreignCurrencyRef.current || "USD");
    }
  }, [kind]);

  const { data: inventoryItemsPage } = useInventoryItems({
    item_type: itemTypeFilter,
  });
  const inventoryItems: InventoryItem[] = inventoryItemsPage?.data ?? [];

  const itemsTotal = useMemo(
    () =>
      lineItems.reduce(
        (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0),
        0,
      ),
    [lineItems],
  );

  const resetCreateForm = () => {
    setSelectedUnitId("");
    setSelectedSupplierId("");
    setCurrency("USD");
    setKind("local");
    setDestinationWarehouseId("");
    setLineItems([{ inventory_item_id: "", quantity: 1, unit_price: 0 }]);
  };

  const updateLine = (idx: number, patch: Partial<PurchaseOrderItemInput>) => {
    setLineItems((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLineItems((prev) => [
      ...prev,
      { inventory_item_id: "", quantity: 1, unit_price: 0 },
    ]);
  };

  const removeLine = (idx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const findInventoryItem = (id: string): InventoryItem | undefined =>
    inventoryItems.find((it) => it.id === id);

  const openOrderDetail = useCallback((order: PurchaseOrder) => {
    setSelectedOrder(order);
    setAmountRequested(getPurchaseOrderTotal(order));
    setReceivedQty(Number(order.quantity));
    // Pre-fill from the order's existing arrival warehouse so the picker
    // shows the right value as soon as the operator opens the drawer.
    setArrivedWarehouseId(order.arrived_warehouse_id ?? "");
    setWarehouseId(
      order.goods_receipt?.warehouse_id ?? order.arrived_warehouse_id ?? "",
    );
  }, []);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitId = selectedUnitId || operatingUnits[0]?.id;
    if (!unitId || !selectedSupplierId) {
      toast.error("يرجى اختيار الوحدة والمورد");
      return;
    }

    const cleanLines = lineItems.filter(
      (l) =>
        l.inventory_item_id &&
        Number(l.quantity) > 0 &&
        Number(l.unit_price) > 0,
    );
    if (cleanLines.length === 0) {
      toast.error("أضف بندًا واحدًا على الأقل بصنف وكمية وسعر صحيحين");
      return;
    }

    const payload: CreatePurchaseOrderPayload = {
      operating_unit_id: unitId,
      supplier_id: selectedSupplierId,
      kind,
      currency: effectiveCurrency,
      items: cleanLines,
      destination_warehouse_id: destinationWarehouseId || undefined,
    };

    createOrderMutation.mutate(payload, {
      onSuccess: () => {
        toast.success(
          kind === "local"
            ? "تم إنشاء أمر الشراء المحلي بنجاح"
            : "تم إنشاء أمر الاستيراد بنجاح",
        );
        setIsModalOpen(false);
        resetCreateForm();
      },
      onError: (err: unknown) => {
        const payloadErr = apiErrorPayload(err);
        const message =
          payloadErr?.message ||
          (isAxiosError(err) ? err.response?.data?.message : null);
        toast.error(
          message ||
            (kind === "local"
              ? "حدث خطأ أثناء إنشاء أمر الشراء المحلي"
              : "حدث خطأ أثناء إنشاء أمر الاستيراد"),
        );
      },
    });
  };

  const handleApplyTransition = async (action: any) => {
    if (!selectedOrder) return;

    let payload: TransitionPurchaseOrderPayload = { action };

    if (action === "select_route") {
      payload = {
        action,
        route: transitionRoute,
        amount_requested: amountRequested,
        held_amount_lyd: transitionRoute === "bank" ? heldAmountLyd : undefined,
        invoice_ref: invoiceRef || undefined,
      };
    } else if (action === "arrived_at_warehouse") {
      if (!arrivedWarehouseId) {
        toast.error("اختر المخزن الذي وصلت إليه الشحنة");
        return;
      }
      payload = {
        action,
        warehouse_id: arrivedWarehouseId,
      };
    } else if (action === "receive_goods") {
      const effectiveWarehouse =
        warehouseId || selectedOrder.arrived_warehouse_id || "";
      if (!effectiveWarehouse) {
        toast.error("اختر المخزن الذي ستجري فيه عملية الاستلام");
        return;
      }
      payload = {
        action,
        warehouse_id: effectiveWarehouse,
        received_qty: receivedQty,
      };
    }

    transitionMutation.mutate(
      { id: selectedOrder.id, payload },
      {
        onSuccess: (res) => {
          setSelectedOrder(res.data);
          toast.success("تم تنفيذ المرحلة بنجاح!");
        },
        onError: (err: unknown) => {
          const payloadErr = apiErrorPayload(err);
          const message = payloadErr?.message || (isAxiosError(err) ? err.response?.data?.message : null);
          toast.error(message || "فشل تنفيذ المرحلة المالية/اللوجستية");
        },
      }
    );
  };

  const handleAddLandedCost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || costAmount <= 0) return;

    const noteRequired = costType === "fx_spread" && costAmount > 0;
    if (noteRequired && costNote.trim().length === 0) {
      setCostNoteTouched(true);
      toast.error("سبب فرق سعر الصرف مطلوب عند تسجيل قيمة غير صفرية.");
      return;
    }

    createLandedCostMutation.mutate(
      {
        orderId: selectedOrder.id,
        payload: {
          type: costType,
          amount: costAmount,
          currency: "LYD",
          note: costNote.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success("تمت إضافة التكلفة الإضافية بنجاح");
          setCostAmount(0);
          setCostNote("");
          setCostNoteTouched(false);
          refetchCosts();
        },
        onError: (err: unknown) => {
          const payloadErr = apiErrorPayload(err);
          const message = payloadErr?.message || (isAxiosError(err) ? err.response?.data?.message : null);
          toast.error(message || "فشل إضافة خط التكلفة");
        },
      }
    );
  };

  const getStatusBadge = useCallback((status: PurchaseOrderStatus) => {
    switch (status) {
      case "draft":
        return <span className="rounded-full bg-app-bg-secondary px-2.5 py-1 text-[10px] font-bold text-app-label-secondary">مسودة</span>;
      case "pending_payment":
        return <span className="rounded-full bg-app-status-warning/15 px-2.5 py-1 text-[10px] font-bold text-app-status-warning">في انتظار الدفع</span>;
      case "awaiting_bank_approval":
        return <span className="rounded-full bg-app-accent/15 px-2.5 py-1 text-[10px] font-bold text-app-accent">حجز بنكي</span>;
      case "paid":
        return <span className="rounded-full bg-app-status-positive/15 px-2.5 py-1 text-[10px] font-bold text-app-status-positive">مدفوع</span>;
      case "in_transit":
        return <span className="rounded-full bg-app-accent/15 px-2.5 py-1 text-[10px] font-bold text-app-accent">في الشحن</span>;
      case "at_port":
        return <span className="rounded-full bg-app-bg-secondary px-2.5 py-1 text-[10px] font-bold text-app-label-primary">وصل الميناء</span>;
      case "received":
        return <span className="rounded-full bg-app-status-positive/15 px-2.5 py-1 text-[10px] font-bold text-app-status-positive">مستلم</span>;
      case "approved":
        return <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[10px] font-bold text-blue-600">معتمد</span>;
      case "closed":
        return <span className="rounded-full bg-app-status-positive/25 px-2.5 py-1 text-[10px] font-extrabold text-app-status-positive">مغلق</span>;
      case "complete":
        return <span className="rounded-full bg-app-status-positive/25 px-2.5 py-1 text-[10px] font-extrabold text-app-status-positive">مكتمل ومحسوب</span>;
      default:
        return <span className="rounded-full bg-app-bg-secondary px-2.5 py-1 text-[10px] font-bold text-app-label-secondary">{status}</span>;
    }
  }, []);


  const handleEditItems = useCallback((order: PurchaseOrder) => {
    setEditingOrder(order);
  }, []);

  const orderColumnsArgs = useMemo(
    () => ({ getStatusBadge, onOpenDetail: openOrderDetail, onEditItems: handleEditItems }),
    [getStatusBadge, openOrderDetail, handleEditItems],
  );
  const orderColumns = usePurchaseOrdersColumns(orderColumnsArgs);
  // Defer the heavy table re-render so the tab click stays interactive.
  const deferredOrders = useDeferredValue(orders);
  const ordersTableData = useMemo(() => deferredOrders, [deferredOrders]);
  const ordersTable = useDataTable({
    exportFileName: "purchase-orders",
    // W6-04: every order of the market tab, past the 100 the list loads.
    fetchAllRowsForExport: () => getPurchaseOrders({ kind: market === "all" ? undefined : market, all: 1 }),
    columns: orderColumns,
    data: ordersTableData,
    enableSorting: true,
    enableGlobalFilter: true,
    pageSize: 10,
    getRowId: (ord) => ord.id,
  });

  const isFullyReceived = Boolean(
    selectedOrder?.items?.data?.length &&
      selectedOrder.items.data.every(
        (l) => (l.received_quantity ?? 0) >= l.quantity,
      ),
  );

  const lineItemColumns = usePurchaseOrderLineItemsColumns();
  const lineItemsData = useMemo(() => selectedOrder?.items?.data ?? [], [selectedOrder]);
  const lineItemsTable = useDataTable({
    exportFileName: "purchase-order-lines",
    columns: lineItemColumns,
    data: lineItemsData,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (line) => line.id,
  });

  const activeStages = useMemo(() => {
    if (!selectedOrder) return STAGES;
    const isMarket =
      selectedOrder.status === "awaiting_transfer" ||
      selectedOrder.payment_requests?.[0]?.route === "market";
    const isBank =
      selectedOrder.status === "awaiting_bank_approval" ||
      selectedOrder.payment_requests?.[0]?.route === "bank";

    return STAGES.filter((s) => {
      if (s.key === "awaiting_receipt") return false;
      if (isMarket && s.key === "awaiting_bank_approval") return false;
      if (isBank && s.key === "awaiting_transfer") return false;
      return true;
    });
  }, [selectedOrder]);

  const approveLandedCostLine = (lc: LandedCostLine, note: string) => {
    if (!selectedOrder) return;
    approveLandedCostMutation.mutate(
      { orderId: selectedOrder.id, lineId: lc.id, note },
      {
        onSuccess: () =>
          setLineError((prev) => {
            const { [lc.id]: _drop, ...rest } = prev;
            return rest;
          }),
        onError: (err: unknown) =>
          setLineError((prev) => ({
            ...prev,
            [lc.id]: apiErrorPayload(err)?.message ?? "تعذر الاعتماد.",
          })),
      },
    );
  };

  const markLandedCostLinePaid = (lc: LandedCostLine, note: string) => {
    if (!selectedOrder) return;
    markLandedCostPaidMutation.mutate(
      { orderId: selectedOrder.id, lineId: lc.id, note },
      {
        onSuccess: () =>
          setLineError((prev) => {
            const { [lc.id]: _drop, ...rest } = prev;
            return rest;
          }),
        onError: (err: unknown) =>
          setLineError((prev) => ({
            ...prev,
            [lc.id]: apiErrorPayload(err)?.message ?? "تعذر تأكيد الدفع.",
          })),
      },
    );
  };

  const landedCostColumnsArgs = useMemo(
    () => ({
      selectedOrder,
      operatingUnits,
      approveLandedCostMutation,
      markLandedCostPaidMutation,
      lineError,
      onApprove: approveLandedCostLine,
      onMarkPaid: markLandedCostLinePaid,
    }),
    [
      selectedOrder,
      operatingUnits,
      approveLandedCostMutation,
      markLandedCostPaidMutation,
      lineError,
      approveLandedCostLine,
      markLandedCostLinePaid,
    ],
  );
  const landedCostColumns = usePurchaseOrderLandedCostColumns(landedCostColumnsArgs);
  const landedCostsTable = useDataTable({
    exportFileName: "landed-costs",
    columns: landedCostColumns,
    data: landedCosts,
    enableSorting: false,
    enableGlobalFilter: false,
    enablePagination: false,
    getRowId: (lc) => lc.id,
  });

  return (
<div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-app-label-primary flex items-center gap-2">
            <Package className="h-6 w-6 text-app-accent" />
            <span>مشتريات</span>
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            أوامر الشراء الأجنبية مع دورة المسار الكامل، والأوامر المحلية بسلسلة الحالة المختصرة (موافقة ← استلام ← سداد ← إقفال)
          </p>
          {/* Wave 5: foreign vs local sub-tabs. Default 'all' shows both. */}
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-app-separator bg-app-bg-secondary p-1">
            {([
              { value: "all" as const, label: "الكل" },
              { value: "foreign" as const, label: "أجنبية" },
              { value: "local" as const, label: "محلية" },
            ]).map((opt) => {
              const isActive = market === opt.value;
              const showFetchingCue = isActive && isFetching && !isLoading;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMarket(opt.value)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold transition-colors inline-flex items-center gap-1.5",
                    isActive
                      ? "bg-app-accent text-white"
                      : "text-app-label-secondary hover:bg-app-fill-f1",
                    showFetchingCue && "opacity-70",
                  )}
                  aria-pressed={isActive}
                >
                  {showFetchingCue && (
                    <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
                  )}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            <span>تحديث البيانات</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all active:scale-95"
          >
            <Plus className="h-4 w-4" />
            <span>إنشاء أمر شراء جديد</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <DataTable table={ordersTable}>
        <DataTable.Header>
          <DataTable.Toolbar>
            <DataTable.SearchInput placeholder="بحث بالمورد أو الحالة..." />
          </DataTable.Toolbar>
        </DataTable.Header>
        <DataTable.Content
          isLoading={isLoading}
          emptyMessage="لا توجد أوامر استيراد حالية — قم بإنشاء أمر استيراد جديد للبدء في تتبع الاعتمادات المستندية والشحن"
          emptyIcon={Package}
        />
        <DataTable.Pagination />
      </DataTable>

      {/* Add New Import Order Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent size="3xl">
          <DialogHeader>
            <div>
              <DialogTitle>
                {kind === "local"
                  ? "إنشاء أمر شراء محلي جديد"
                  : "إنشاء أمر شراء خارجي جديد"}
              </DialogTitle>
              <DialogDescription>
                {kind === "local"
                  ? "دورة مختصرة: موافقة ← استلام ← سداد. العملة مقفلة على الدينار الليبي."
                  : "اختر المورد وأضف بنود الأصناف المطلوب استيرادها."}
              </DialogDescription>
            </div>
            <DialogClose />
          </DialogHeader>

          <DialogBody className="p-0">
            <form id="import-order-create-form" onSubmit={handleCreateOrder} className="space-y-4 p-6">
              {/* Wave 5 / Local-vs-Foreign kind selector. Default: local.
                  Mirrors the tab strip visual treatment further up the page. */}
              <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-app-label-secondary">
                  <Package className="h-3.5 w-3.5 text-app-accent" />
                  <span>نوع أمر الشراء</span>
                </div>
                <div className="inline-flex items-center gap-1 rounded-full border border-app-separator bg-app-bg-primary p-1">
                  {([
                    {
                      value: "foreign" as const,
                      label: "خارجي (استيراد)",
                      hint: "عملة أجنبية + مسار تمويل",
                    },
                    {
                      value: "local" as const,
                      label: "محلي",
                      hint: "موافقة ← استلام ← سداد",
                    },
                  ]).map((opt) => {
                    const active = kind === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setKind(opt.value)}
                        aria-pressed={active}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors inline-flex items-center gap-1.5",
                          active
                            ? "bg-app-accent text-white"
                            : "text-app-label-secondary hover:bg-app-fill-f1",
                        )}
                      >
                        <span>{opt.label}</span>
                        {active && (
                          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                            {opt.hint}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-app-label-tertiary leading-relaxed">
                  {kind === "local"
                    ? "الأوامر المحلية تُعملة بالدينار الليبي تلقائيًا بدون مسار تمويل خارجي."
                    : "الأوامر الخارجية تمر بمسار اعتماد بنكي/سوق الصرف ثم الشحن والاستلام."}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    الوحدة التشغيلية{" "}
                    <span className="text-app-status-danger">*</span>
                  </label>
                  <SearchableSelect<{ id: string; name: string }>
                    options={operatingUnits}
                    value={
                      operatingUnits.find((u) => u.id === selectedUnitId) ??
                      null
                    }
                    onChange={(u) => {
                      const next = u ? u.id : "";
                      setSelectedUnitId(next);
                      // Reset the destination warehouse when the operating
                      // unit changes — the previously-picked warehouse may
                      // belong to a different unit.
                      if (next !== selectedUnitId) {
                        setDestinationWarehouseId("");
                      }
                    }}
                    getOptionId={(u) => u.id}
                    getOptionLabel={(u) => u.name}
                    placeholder="-- اختر الوحدة --"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                    المورد{" "}
                    <span className="text-app-status-danger">*</span>
                  </label>
                  <SearchableSelect<{
                    id: string;
                    name: string;
                    default_currency?: string;
                  }>
                    options={suppliers}
                    value={
                      suppliers.find((s) => s.id === selectedSupplierId) ??
                      null
                    }
                    onChange={(s) => setSelectedSupplierId(s ? s.id : "")}
                    getOptionId={(s) => s.id}
                    getOptionLabel={(s) => s.name}
                    getOptionSubLabel={(s) => s.default_currency}
                    getOptionSearchText={(s) =>
                      `${s.name} ${s.default_currency ?? ""}`
                    }
                    placeholder="-- اختر المورد --"
                    required
                  />
                  {kind === "local" && (
                    <p className="mt-1 text-[10px] text-app-label-tertiary">
                      * للأوامر المحلية يُفضّل مورد بعملة افتراضية LYD، لكن يمكنك استخدام أي مورد.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                  المخزن الوجهة{" "}
                  <span className="text-[10px] text-app-label-tertiary font-normal">
                    (اختياري — يُحدَّد هنا أو عند وصول الشحنة)
                  </span>
                </label>
                <SearchableSelect<Warehouse>
                  options={destinationWarehouseOptions}
                  value={
                    destinationWarehouseOptions.find(
                      (w) => w.id === destinationWarehouseId,
                    ) ?? null
                  }
                  onChange={(w) => setDestinationWarehouseId(w ? w.id : "")}
                  getOptionId={(w) => w.id}
                  getOptionLabel={(w) => w.name}
                  getOptionSearchText={(w) => `${w.name} ${w.location_type ?? ""}`}
                  placeholder="-- اختر المخزن الوجهة --"
                />
                <p className="mt-1 text-[10px] text-app-label-tertiary leading-relaxed">
                  عند اكتمال أمر الشراء (مستلم ومدفوع) ستُضاف الأصناف تلقائياً إلى هذا المخزن.
                  يمكنك تجاوزه لاحقاً في خطوة الوصول إلى المخزن للأوامر الخارجية.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {kind === "foreign" ? (
                  <>
                    <div className="col-span-1">
                      <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                        العملة
                      </label>
                      <SearchableSelect<LookupEntry>
                        options={currencies}
                        value={currencies.find((c) => c.code === currency) ?? null}
                        onChange={(c) => setCurrency(c ? c.code : "USD")}
                        getOptionId={(c) => c.id}
                        getOptionLabel={(c) => `${c.name} (${c.code})`}
                        getOptionSubLabel={(c) => c.fields?.symbol}
                        placeholder="-- العملة --"
                      />
                    </div>
                    <div className="col-span-2 flex items-end">
                      <p className="text-[10px] text-app-label-tertiary leading-relaxed">
                        تُطبق العملة المختارة على جميع بنود الأمر. الإجمالي يُحسب
                        تلقائيًا من مجموع البنود.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="col-span-3 rounded-xl border border-dashed border-app-separator bg-app-bg-secondary px-3 py-2 text-[11px] text-app-label-secondary">
                    العملة مقفلة على{" "}
                    <span className="font-mono font-bold text-app-label-primary">LYD</span>{" "}
                    للأوامر المحلية.
                  </div>
                )}
              </div>

              {/* Line items */}
              <div className="border-t border-app-separator pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-app-accent" />
                    <h4 className="text-sm font-bold text-app-label-primary">
                      بنود أمر الاستيراد
                    </h4>
                    <span className="text-[10px] text-app-label-tertiary">
                      ({lineItems.length} بند)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addLine}
                    className="flex items-center gap-1 rounded-lg border border-app-accent px-2.5 py-1 text-[11px] font-bold text-app-accent hover:bg-app-accent-subtle transition-colors"
                  >
                    <Plus className="h-3 w-3" /> إضافة بند
                  </button>
                </div>

                {/* Type filter pills */}
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  {(
                    [
                      { value: "raw_material", label: "مواد خام" },
                      { value: "packaging", label: "مواد تعبئة" },
                      { value: "barrel", label: "براميل" },
                      { value: "pallet", label: "بالتات" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setItemTypeFilter(opt.value)}
                      className={cn(
                        tokens.typography.webUI.c1Emphasized,
                        "rounded-full px-3 py-1 transition-colors",
                        itemTypeFilter === opt.value
                          ? "bg-app-accent text-white"
                          : "bg-app-bg-secondary text-app-label-secondary hover:bg-app-fill-f1",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {lineItems.map((line, idx) => {
                    const selectedItem = findInventoryItem(line.inventory_item_id);
                    const lineTotal = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-app-separator bg-app-bg-secondary p-3 space-y-2"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-semibold text-app-label-secondary mb-1">الصنف</label>
                            <SearchableSelect<InventoryItem>
                              options={inventoryItems}
                              value={
                                line.inventory_item_id
                                  ? inventoryItems.find(
                                      (it) => it.id === line.inventory_item_id,
                                    ) ?? null
                                  : null
                              }
                              onChange={(item) =>
                                updateLine(idx, {
                                  inventory_item_id: item ? item.id : "",
                                  unit_price:
                                    item && item.purchase_price !== null && item.purchase_price !== undefined && (!line.unit_price || Number(line.unit_price) === 0)
                                      ? Number(item.purchase_price)
                                      : line.unit_price,
                                })
                              }
                              getOptionId={(it) => it.id}
                              getOptionLabel={(it) => it.name}
                              getOptionSubLabel={(it) =>
                                `${it.code} · ${it.unit_of_measure}${
                                  it.purchase_price ? ` · سعر الشراء: ${it.purchase_price} د.ل` : ""
                                }`
                              }
                              getOptionSearchText={(it) =>
                                `${it.name} ${it.code}`
                              }
                              placeholder="اختر صنفًا..."
                              size="sm"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            disabled={lineItems.length <= 1}
                            className="rounded-lg p-1.5 text-app-status-danger hover:bg-app-status-danger/10 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            title="حذف البند"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {selectedItem && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="rounded-full bg-app-bg-primary px-2 py-0.5 font-mono text-app-label-secondary border border-app-separator">
                              {selectedItem.code}
                            </span>
                            <span className="rounded-full bg-app-bg-primary px-2 py-0.5 text-app-label-secondary border border-app-separator">
                              {selectedItem.unit_of_measure}
                            </span>
                            {selectedItem.primary_uom && (
                              <span className="rounded-full bg-app-bg-primary px-2 py-0.5 text-app-label-tertiary border border-app-separator">
                                {selectedItem.primary_uom}
                                {selectedItem.secondary_uom
                                  ? ` / ${selectedItem.secondary_uom}`
                                  : ""}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div>
                            <label
                              className={cn(
                                tokens.typography.webUI.c1Emphasized,
                                "block mb-1 text-app-label-secondary",
                              )}
                            >
                              الكمية
                            </label>
                            <input
                              type="number"
                              step="0.0001"
                              min="0.0001"
                              value={line.quantity || ""}
                              onChange={(e) =>
                                updateLine(idx, {
                                  quantity: Number(e.target.value) || 0,
                                })
                              }
                              placeholder="0"
                              className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-2.5 py-1.5 text-xs font-mono focus:border-app-accent focus:outline-none"
                            />
                          </div>
                          <div>
                            <label
                              className={cn(
                                tokens.typography.webUI.c1Emphasized,
                                "block mb-1 text-app-label-secondary",
                              )}
                            >
                              سعر الوحدة ({effectiveCurrency})
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.unit_price || ""}
                              onChange={(e) =>
                                updateLine(idx, {
                                  unit_price: Number(e.target.value) || 0,
                                })
                              }
                              placeholder="0.00"
                              className="w-full rounded-lg border border-app-separator bg-app-bg-primary px-2.5 py-1.5 text-xs font-mono focus:border-app-accent focus:outline-none"
                            />
                          </div>
                          <div>
                            <label
                              className={cn(
                                tokens.typography.webUI.c1Emphasized,
                                "block mb-1 text-app-label-secondary",
                              )}
                            >
                              إجمالي البند
                            </label>
                            <div className="rounded-lg border border-app-separator bg-app-bg-primary px-2.5 py-1.5 text-xs font-mono font-bold text-app-accent text-start">
                              {formatNumber(lineTotal)} {effectiveCurrency}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </form>
          </DialogBody>

          <DialogFooter>
            <div className="flex w-full items-center justify-between gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase text-app-label-tertiary">
                  إجمالي الأمر
                </span>
                <span className="text-base font-mono font-bold text-app-label-primary">
                  {formatNumber(itemsTotal)} {effectiveCurrency}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  form="import-order-create-form"
                  disabled={
                    createOrderMutation.isPending ||
                    !selectedSupplierId ||
                    lineItems.every(
                      (l) =>
                        !l.inventory_item_id ||
                        Number(l.quantity) <= 0 ||
                        Number(l.unit_price) <= 0,
                    )
                  }
                  className="rounded-xl bg-app-accent px-5 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {createOrderMutation.isPending
                    ? "جاري الحفظ..."
                    : kind === "local"
                      ? "حفظ أمر الشراء المحلي"
                      : "حفظ أمر الاستيراد"}
                </button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Stepper & Detail Drawer */}
      <Dialog open={Boolean(selectedOrder)} onOpenChange={(next) => !next && setSelectedOrder(null)}>
        <DialogContent size="full" className="rounded-3xl">
          <DialogHeader>
            <div>
              {selectedOrder && (
                <>
                  <div className="flex items-center gap-2">
                    <DialogTitle>
                      {selectedOrder.kind === "local" ? "أمر شراء محلي" : "أمر شراء خارجي"} #{selectedOrder.id.slice(0, 8)}
                    </DialogTitle>
                    {getStatusBadge(selectedOrder.status)}
                  </div>
                  <DialogDescription>
                    المورد:{" "}
                    <span className="font-bold text-app-label-primary">
                      {selectedOrder.supplier?.name}
                    </span>{" "}
                    | الكمية: {formatNumber(selectedOrder.quantity)} | إجمالي العقد:{" "}
                    <span className="font-bold text-emerald-600 font-mono">
                      {formatNumber(getPurchaseOrderTotal(selectedOrder))}{" "}
                      {selectedOrder.currency}
                    </span>{" "}
                    | المخزن الوجهة:{" "}
                    {selectedOrder.resolved_warehouse_id ? (
                      <span className="font-bold text-app-accent">
                        {selectedOrder.destination_warehouse?.name ??
                          (selectedOrder.arrived_warehouse?.name ?? "—")}
                      </span>
                    ) : (
                      <span className="font-bold text-app-status-danger">
                        غير محدد
                      </span>
                    )}
                  </DialogDescription>
                </>
              )}
            </div>
            <DialogClose />
          </DialogHeader>

          <DialogBody className="space-y-6">
          {selectedOrder && (
          <>
            {/* Wave 5 Local Flow Actions */}
            {selectedOrder.kind === "local" && (
              <div className="rounded-xl border border-app-accent/30 bg-app-accent-subtle/40 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-app-label-primary flex items-center gap-2">
                    <Package className="h-3.5 w-3.5 text-app-accent" />
                    مسار الأمر المحلي
                  </h4>
                  <span className="text-[10px] font-mono uppercase text-app-label-secondary">
                    {selectedOrder.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedOrder.status === "draft" && (
                    <button
                      type="button"
                      disabled={actingOnOrder}
                      onClick={async () => {
                        setActingOnOrder(true);
                        try {
                          await approvePurchaseOrder(selectedOrder.id);
                          toast.success("تمت الموافقة على الأمر");
                          await refetch();
                          setSelectedOrder((prev) => (prev ? { ...prev, status: "approved" } : null));
                        } catch (err: unknown) {
                          toast.error(apiErrorPayload(err)?.message ?? "فشلت الموافقة");
                        } finally {
                          setActingOnOrder(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-app-status-positive/40 bg-app-status-positive px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span>موافقة</span>
                    </button>
                  )}

                  {(selectedOrder.status === "approved" || selectedOrder.status === "received") && !isFullyReceived && (
                    <button
                      type="button"
                      onClick={() => {
                        const initial: Record<string, number> = {};
                        selectedOrder.items?.data?.forEach((l) => {
                          const remaining = Math.max(0, Number(l.quantity) - Number(l.received_quantity ?? 0));
                          initial[l.id] = remaining;
                        });
                        setReceiveDraft(initial);
                        setShowReceiveForm((prev) => !prev);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-app-accent/40 bg-app-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                    >
                      <Package className="h-3 w-3" />
                      <span>{showReceiveForm ? "إخفاء نموذج الاستلام" : "استلام بضاعة"}</span>
                    </button>
                  )}

                  {selectedOrder.status !== "paid" && selectedOrder.status !== "closed" && selectedOrder.status !== "draft" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-72">
                        <SearchableSelect<Account>
                          options={paymentSourceAccounts}
                          value={
                            paymentSourceAccounts.find(
                              (a) => a.id === paymentSourceAccountId,
                            ) ?? null
                          }
                          onChange={(a) =>
                            setPaymentSourceAccountId(a ? a.id : null)
                          }
                          getOptionId={(a) => a.id}
                          getOptionLabel={(a) =>
                            `${a.account_code} - ${a.name}`
                          }
                          placeholder="اختر حساب مصدر الدفع…"
                          size="sm"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={actingOnOrder || !paymentSourceAccountId}
                        onClick={async () => {
                          if (!paymentSourceAccountId) {
                            toast.error("اختر حساب مصدر الدفع أولاً");
                            return;
                          }
                          setActingOnOrder(true);
                          try {
                            await payLocalPurchaseOrder(selectedOrder.id, {
                              payment_source_account_id: paymentSourceAccountId,
                            });
                            toast.success("تم تسجيل السداد وإقفال الأمر");
                            await refetch();
                            setSelectedOrder((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    status: "closed",
                                    payment_source_account_id: paymentSourceAccountId,
                                  }
                                : null,
                            );
                          } catch (err: unknown) {
                            toast.error(apiErrorPayload(err)?.message ?? "فشل السداد");
                          } finally {
                            setActingOnOrder(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        <DollarSign className="h-3 w-3" />
                        <span>سداد</span>
                      </button>
                    </div>
                  )}
                </div>

                {showReceiveForm && (
                  <div className="rounded-lg border border-app-separator bg-app-bg-primary p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-app-label-primary">استلام كميات البنود</h5>
                      <button
                        type="button"
                        onClick={() => {
                          const allRemaining: Record<string, number> = {};
                          selectedOrder.items?.data?.forEach((l) => {
                            allRemaining[l.id] = Math.max(0, Number(l.quantity) - Number(l.received_quantity ?? 0));
                          });
                          setReceiveDraft(allRemaining);
                        }}
                        className="text-[11px] text-app-accent hover:underline"
                      >
                        استلام الكل
                      </button>
                    </div>

                    <div className="space-y-2">
                      {selectedOrder.items?.data?.map((line) => {
                        const remaining = Math.max(0, Number(line.quantity) - Number(line.received_quantity ?? 0));
                        const currentVal = receiveDraft[line.id] ?? 0;
                        return (
                          <div key={line.id} className="flex items-center justify-between gap-3 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold truncate">
                                {line.inventory_item?.name ?? line.inventory_item_id}
                              </div>
                              <div className="text-[10px] text-app-label-secondary">
                                متبقي: {remaining} {line.inventory_item?.unit_of_measure ?? ""}
                              </div>
                            </div>
                            <input
                              type="number"
                              min="0"
                              max={remaining}
                              value={currentVal === 0 ? "" : currentVal}
                              onChange={(e) => {
                                const v = Number(e.target.value) || 0;
                                setReceiveDraft((prev) => ({ ...prev, [line.id]: v }));
                              }}
                              placeholder="0"
                              className="w-24 rounded-lg border border-app-separator bg-app-bg-secondary px-2 py-1 text-xs text-right font-mono"
                            />
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-app-separator">
                      <button
                        type="button"
                        onClick={() => setShowReceiveForm(false)}
                        className="rounded-lg bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-secondary hover:bg-app-fill-f1"
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        disabled={actingOnOrder}
                        onClick={async () => {
                          const toReceive = Object.entries(receiveDraft)
                            .filter(([, qty]) => qty > 0)
                            .map(([id, received_quantity]) => ({ id, received_quantity }));
                          if (toReceive.length === 0) {
                            toast.error("أدخل كمية أكبر من صفر لصنف واحد على الأقل");
                            return;
                          }
                          setActingOnOrder(true);
                          try {
                            const updated = await receivePurchaseOrder(selectedOrder.id, { items: toReceive });
                            toast.success("تم تسجيل الاستلام");
                            setShowReceiveForm(false);
                            await refetch();
                            setSelectedOrder(updated ?? null);
                          } catch (err: unknown) {
                            toast.error(apiErrorPayload(err)?.message ?? "فشل تسجيل الاستلام");
                          } finally {
                            setActingOnOrder(false);
                          }
                        }}
                        className="rounded-lg bg-app-accent px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        تأكيد الاستلام
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Line Items Breakdown */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-app-label-secondary flex items-center gap-2">
                  <ListChecks className="h-3.5 w-3.5 text-app-accent" />
                  بنود الأمر ({selectedOrder.items?.data?.length ?? 0})
                </h4>
                {selectedOrder.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => setEditingOrder(selectedOrder)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-app-accent/40 bg-app-accent-subtle px-2.5 py-1 text-xs font-bold text-app-accent hover:bg-app-accent hover:text-white transition-colors"
                  >
                    <Edit className="h-3 w-3" />
                    <span>تعديل البنود</span>
                  </button>
                )}
              </div>
              {selectedOrder.items?.data?.length ? (
                <DataTable table={lineItemsTable}>
                  <DataTable.Content emptyMessage="لا توجد بنود." />
                  <div className="flex items-center justify-between border-t border-app-separator bg-app-bg-primary px-4 py-3">
                    <span className="text-[11px] font-bold uppercase text-app-label-secondary">
                      الإجمالي
                    </span>
                    <span className="font-mono font-bold text-end text-app-accent">
                      {formatNumber(Number(selectedOrder.items.items_total))}{" "}
                      {selectedOrder.currency}
                    </span>
                  </div>
                </DataTable>
              ) : (
                <div className="rounded-xl border border-dashed border-app-separator bg-app-bg-secondary p-3 text-center text-xs text-app-label-tertiary">
                  لا توجد بنود مسجلة على هذا الأمر (تم إنشاؤه قبل تحديث بنود الأصناف).
                </div>
              )}
            </div>

            {/* Stepper Progress & Foreign Workflow */}
            {selectedOrder.kind !== "local" && (
            <>
            <div>
              <h4 className="text-xs font-bold text-app-label-secondary mb-3">مسار المراحل الزمنية والاعتمادات:</h4>
              <div className="grid grid-cols-5 gap-2">
                {activeStages.map((stg, idx) => {
                  const currentIdx = activeStages.findIndex((s) => s.key === selectedOrder.status);
                  const isDone = idx <= currentIdx;
                  const isCurrent = idx === currentIdx;
                  const Icon = stg.icon;
                  const isFinanceStage =
                    stg.key === "pending_payment" ||
                    stg.key === "awaiting_bank_approval" ||
                    stg.key === "awaiting_transfer";

                  return (
                    <div
                      key={stg.key}
                      className={`flex flex-col items-center p-2.5 rounded-2xl border text-center transition-all ${
                        isCurrent
                          ? "bg-app-accent/10 border-app-accent text-app-accent font-bold ring-2 ring-app-accent/20"
                          : isDone
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-app-bg-secondary border-app-separator text-app-label-secondary opacity-50"
                      }`}
                    >
                      <Icon className="h-5 w-5 mb-1" />
                      <span className="text-[11px] leading-tight">{stg.label}</span>
                      {isFinanceStage && (
                        <span className="mt-1 rounded-md bg-app-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-app-accent">
                          إجراء مالي
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Next Action Trigger Panel */}
            <div className="rounded-2xl border border-app-separator bg-app-bg-secondary p-4 space-y-3">
              <h4 className="text-xs font-bold text-app-label-primary flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-app-accent" />
                <span>العمليات المتاحة للمرحلة الحالية:</span>
              </h4>

              {selectedOrder.status === "draft" && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-app-label-secondary">
                    تحويل أمر الاستيراد للمالية لتحديد وسيلة الدفع (مصرفي / سوق)
                  </p>
                  <button
                    onClick={() => handleApplyTransition("pending_payment")}
                    disabled={createOrderMutation.isPending || transitionMutation.isPending}
                    className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    إرسال للمالية للموافقة
                  </button>
                </div>
              )}

              {selectedOrder.status === "pending_payment" && (
                !isFinance ? (
                  <div className="rounded-xl border border-dashed border-app-separator bg-app-bg-primary p-3.5 text-xs text-app-label-secondary flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-app-label-primary">المرحلة 2: في انتظار تحديد مسار الدفع</p>
                      <p className="text-[11px] text-app-label-secondary mt-0.5">
                        أمر الشراء قيد مراجعة وتحديد وسيلة وخطة الدفع من قبل الإدارة المالية (المالية فقط مخولون بالاطلاع والاعتماد).
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-app-label-secondary mb-1">مسار الدفع</label>
                        <select
                          value={transitionRoute}
                          onChange={(e) => setTransitionRoute(e.target.value as PaymentRoute)}
                          className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs focus:outline-none"
                        >
                          <option value="bank">اعتماد مصرفي (حجز بالدينار + موافقة)</option>
                          <option value="market">شراء عبر سوق الصرف</option>
                        </select>
                      </div>
                      {transitionRoute === "bank" && (
                        <div>
                          <label className="block text-xs font-semibold text-app-label-secondary mb-1">
                            قيمة الحجز الاحتياطي بالحساب (LYD)
                          </label>
                          <input
                            type="number"
                            value={heldAmountLyd || ""}
                            onChange={(e) => setHeldAmountLyd(Number(e.target.value))}
                            placeholder="مثال: 65000"
                            className="w-full rounded-xl border border-app-separator bg-app-bg-primary px-3 py-2 text-xs focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => handleApplyTransition("select_route")}
                        disabled={isSubmitting || (transitionRoute === "bank" && heldAmountLyd <= 0)}
                        className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                      >
                        تأكيد خطة الدفع
                      </button>
                    </div>
                  </div>
                )
              )}

              {(selectedOrder.status === "awaiting_bank_approval" || selectedOrder.status === "awaiting_transfer") && (
                !isFinance ? (
                  <div className="rounded-xl border border-dashed border-app-separator bg-app-bg-primary p-3.5 text-xs text-app-label-secondary flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-app-accent shrink-0" />
                    <div>
                      <p className="font-semibold text-app-label-primary">
                        {selectedOrder.status === "awaiting_bank_approval"
                          ? "المرحلة 3: اعتماد مصرفي — بانتظار تنفيذ الدفع"
                          : "المرحلة 3: حوالة سوق — بانتظار تنفيذ الدفع"}
                      </p>
                      <p className="text-[11px] text-app-label-secondary mt-0.5">
                        أمر الشراء بانتظار سداد الدفعة المالية للمورد من قبل إدارة الخزينة والمالية.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-app-accent/20 bg-app-bg-primary p-3.5">
                    <div className="flex items-center justify-between border-b border-app-separator pb-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-app-accent" />
                        <span className="text-xs font-bold text-app-label-primary">
                          {selectedOrder.status === "awaiting_bank_approval"
                            ? "المرحلة 3: تنفيذ سداد الاعتماد المصرفي للمورد"
                            : "المرحلة 3: تنفيذ سداد حوالة سوق الصرف للمورد"}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-emerald-700">
                        {formatNumber(getPurchaseOrderTotal(selectedOrder))} {selectedOrder.currency}
                      </span>
                    </div>

                    <FxPreviewCard
                      bookedRate={bookedRate}
                      effectiveRate={effectiveValues.effectiveRate}
                      effectiveSettledLyd={effectiveValues.effectiveSettledLyd}
                      varianceLyd={varianceLyd}
                      toleranceLyd={toleranceLyd}
                      hardCapPercent={hardCapPercent}
                      amountRequested={Number(getPurchaseOrderTotal(selectedOrder))}
                      hardCapAcknowledged={hardCapAcknowledged}
                      onAcknowledgeHardCap={setHardCapAcknowledged}
                    />

                    <div>
                      <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                        حساب مصدر الدفع <span className="text-app-status-danger">*</span>
                      </label>
                      <SearchableSelect<Account>
                        options={paymentSourceAccounts}
                        value={
                          paymentSourceAccounts.find(
                            (a) => a.id === paymentSourceAccountId,
                          ) ?? null
                        }
                        onChange={(a) =>
                          setPaymentSourceAccountId(a ? a.id : null)
                        }
                        getOptionId={(a) => a.id}
                        getOptionLabel={(a) =>
                          `${a.account_code} - ${a.name}`
                        }
                        placeholder="اختر الحساب البنكي / الخزينة…"
                        required
                      />
                      <p className="mt-1 text-[10px] text-app-label-tertiary">
                        الحساب الذي خرج منه المبلغ (121* — النقدية والمصارف).
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                          سعر الصرف المنفذ (LYD/{selectedOrder.currency})
                          {exactAmountUsedLyd > 0 ? (
                            <span className="text-app-label-tertiary text-[10px] ms-1">(اختياري)</span>
                          ) : (
                            <span className="text-app-status-danger ms-1">*</span>
                          )}
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          value={fxRateUsed > 0 ? fxRateUsed : ""}
                          onChange={(e) => setFxRateUsed(Number(e.target.value))}
                          className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs focus:outline-none font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                          المبلغ الفعلي المخصوم (LYD)
                          {fxRateUsed > 0 ? (
                            <span className="text-app-label-tertiary text-[10px] ms-1">(اختياري)</span>
                          ) : (
                            <span className="text-app-status-danger ms-1">*</span>
                          )}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={exactAmountUsedLyd > 0 ? exactAmountUsedLyd : ""}
                          onChange={(e) => setExactAmountUsedLyd(Number(e.target.value))}
                          placeholder="المبلغ الفعلي المخصوم"
                          className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs focus:outline-none font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-app-label-secondary mb-1">
                        رقم إشعار المصرف / الحوالة (اختياري)
                      </label>
                      <input
                        type="text"
                        value={bankReference}
                        onChange={(e) => setBankReference(e.target.value)}
                        placeholder={selectedOrder.status === "awaiting_bank_approval" ? "مثال: BNK-REF-1092" : "مثال: TXN-88120"}
                        className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs focus:outline-none font-mono"
                      />
                    </div>

                    {requiresNote && (
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-app-label-secondary">
                          سبب فرق سعر الصرف <span className="text-app-status-danger">*</span>
                        </label>
                        <input
                          type="text"
                          value={extraAllocationNote}
                          onChange={(e) => {
                            setExtraAllocationNote(e.target.value);
                            setExtraAllocationTouched(true);
                          }}
                          placeholder="مثال: فرق سعر التنفيذ الفعلي بالمصرف"
                          className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs focus:outline-none"
                        />
                        {extraAllocationTouched && noteMissing && (
                          <p className="text-[10px] text-app-status-danger font-bold">
                            سبب فرق سعر الصرف مطلوب.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end pt-1">
                      <button
                        onClick={handleExecutePayment}
                        disabled={
                          executePaymentMutation.isPending
                          || !hasAtLeastOneInput
                          || noteMissing
                          || (varianceExceedsHardCap && !hardCapAcknowledged)
                        }
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {executePaymentMutation.isPending ? "جاري التنفيذ..." : "تنفيذ وتأكيد السداد للمورد"}
                      </button>
                    </div>
                  </div>
                )
              )}

              {selectedOrder.status === "paid" && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-app-label-secondary">تأكيد تم انطلاق الشحنة في البحر</p>
                  <button
                    onClick={() => handleApplyTransition("shipment")}
                    disabled={createOrderMutation.isPending || transitionMutation.isPending}
                    className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    تأكيد الانطلاق والشحن
                  </button>
                </div>
              )}

              {selectedOrder.status === "in_transit" && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-app-label-secondary">تأكيد وصول السفينة إلى الميناء الخارجي / المحلي</p>
                  <button
                    onClick={() => handleApplyTransition("arrive_port")}
                    disabled={createOrderMutation.isPending || transitionMutation.isPending}
                    className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    تأكيد الوصول للميناء
                  </button>
                </div>
              )}

              {selectedOrder.status === "at_port" && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-app-label-secondary">بدء إجراءات النقل والشحن الداخلي لمخازن الشركة</p>
                  <button
                    onClick={() => handleApplyTransition("transport_warehouse")}
                    disabled={createOrderMutation.isPending || transitionMutation.isPending}
                    className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    بدء النقل للمخازن
                  </button>
                </div>
              )}

              {selectedOrder.status === "in_transit_to_warehouse" && (
                <div className="space-y-2">
                  <p className="text-xs text-app-label-secondary">
                    اختر المخزن الذي وصلت إليه الشحنة فعليًا
                  </p>
                  <SearchableSelect<Warehouse>
                    options={warehouses}
                    value={
                      warehouses.find((w) => w.id === arrivedWarehouseId) ?? null
                    }
                    onChange={(w) => setArrivedWarehouseId(w ? w.id : "")}
                    getOptionId={(w) => w.id}
                    getOptionLabel={(w) => w.name}
                    placeholder="اختر المخزن..."
                    required
                  />
                  <button
                    onClick={() => handleApplyTransition("arrived_at_warehouse")}
                    disabled={
                      transitionMutation.isPending || !arrivedWarehouseId
                    }
                    className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    تأكيد الوصول للمخزن
                  </button>
                </div>
              )}

              {selectedOrder.status === "at_warehouse" && (
                <div className="space-y-2">
                  <p className="text-xs text-app-label-secondary">
                    فحص واستلام البضاعة بالكامل في{" "}
                    <span className="font-bold text-app-label-primary">
                      {selectedOrder.arrived_warehouse?.name ?? "المخزن"}
                    </span>
                  </p>
                  <SearchableSelect<Warehouse>
                    options={warehouses}
                    value={
                      warehouses.find((w) => w.id === warehouseId) ?? null
                    }
                    onChange={(w) => setWarehouseId(w ? w.id : "")}
                    getOptionId={(w) => w.id}
                    getOptionLabel={(w) => w.name}
                    placeholder="اختر المخزن..."
                    required
                  />
                  <button
                    onClick={() => handleApplyTransition("receive_goods")}
                    disabled={transitionMutation.isPending || !warehouseId}
                    className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    تأكيد الاستلام بالمخزن
                  </button>
                </div>
              )}

              {/* Legacy orders that predate the in_transit_to_warehouse
                  split may still arrive in awaiting_receipt; surface the
                  same receive picker so they can close. */}
              {selectedOrder.status === "awaiting_receipt" && (
                <div className="space-y-2">
                  <p className="text-xs text-app-label-secondary">
                    فحص واستلام البضاعة بالكامل في المخزن
                  </p>
                  <SearchableSelect<Warehouse>
                    options={warehouses}
                    value={
                      warehouses.find((w) => w.id === warehouseId) ?? null
                    }
                    onChange={(w) => setWarehouseId(w ? w.id : "")}
                    getOptionId={(w) => w.id}
                    getOptionLabel={(w) => w.name}
                    placeholder="اختر المخزن..."
                    required
                  />
                  <button
                    onClick={() => handleApplyTransition("receive_goods")}
                    disabled={transitionMutation.isPending || !warehouseId}
                    className="rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    تأكيد الاستلام بالمخزن
                  </button>
                </div>
              )}

              {selectedOrder.status === "received" && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-app-label-secondary">إغلاق وتكتمل التكاليف الرأسمالية كاملة</p>
                  <button
                    onClick={() => handleApplyTransition("complete")}
                    disabled={createOrderMutation.isPending || transitionMutation.isPending}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    إغلاق أمر الاستيراد
                  </button>
                </div>
              )}

              {selectedOrder.status === "complete" && (
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>تم إغلاق الأمر واحتساب كافة التكاليف الرأسمالية بالمخزون.</span>
                </p>
              )}
            </div>

            {/* Landed Costs Breakdown Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-app-label-primary flex items-center gap-1.5">
                  <Percent className="h-4 w-4 text-app-accent" />
                  <span>التكاليف الإضافية والرأسمالية (Landed Costs Allocation):</span>
                </h4>
              </div>

              {/* Add Cost Form */}
              <form onSubmit={handleAddLandedCost} className="space-y-2">
                <div className="flex items-end gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">نوع التكلفة الإضافية</label>
                    <select
                      value={costType}
                      onChange={(e) => setCostType(e.target.value as LandedCostType)}
                      className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:outline-none"
                    >
                      <option value="freight">شحن بحري / جوي (Freight)</option>
                      <option value="customs">رسوم جمركية (Customs)</option>
                      <option value="fx_spread">فوارق عملة (FX Spread)</option>
                      <option value="local_transport">نقل داخلي (Local Transport)</option>
                      <option value="other">مصاريف أخرى (Other)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-app-label-secondary mb-1">المبلغ (LYD)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={costAmount || ""}
                      onChange={(e) => setCostAmount(Number(e.target.value))}
                      placeholder="0.00"
                      className="rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting || costAmount <= 0}
                    className="rounded-xl bg-app-accent px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    إضافة خط تكلفة
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-app-label-secondary">
                    ملاحظة {costType === "fx_spread" ? <span className="text-app-status-danger">*</span> : null}
                  </label>
                  <textarea
                    value={costNote}
                    onChange={(e) => {
                      setCostNote(e.target.value);
                      setCostNoteTouched(true);
                    }}
                    onBlur={() => setCostNoteTouched(true)}
                    rows={2}
                    placeholder={
                      costType === "fx_spread"
                        ? "مثال: فرق سعر بسبب الصرّاف الموازي"
                        : "اختياري — سبب هذه التكلفة"
                    }
                    className="w-full rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-1.5 text-xs text-app-label-primary focus:outline-none"
                  />
                  {costType === "fx_spread" && costNoteTouched && costNote.trim().length === 0 ? (
                    <p className="text-[10px] text-app-status-danger font-bold">
                      السبب مطلوب عند تسجيل فرق سعر صرف بقيمة غير صفرية.
                    </p>
                  ) : null}
                </div>
              </form>

              {/* Cost Lines List */}
              <DataTable table={landedCostsTable}>
                <DataTable.Content
                  isLoading={isLoadingCosts}
                  emptyMessage="لا توجد خطوط تكلفة مضافة حتى الآن."
                  emptyIcon={Percent}
                />
              </DataTable>
            </div>
            </>
            )}
          </>
          )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {editingOrder && (
        <EditPurchaseOrderItemsModal
          order={editingOrder}
          isOpen={Boolean(editingOrder)}
          onClose={() => setEditingOrder(null)}
          onSuccess={(updated) => {
            if (selectedOrder?.id === updated.id) {
              setSelectedOrder(updated);
            }
          }}
        />
      )}
    </div>
  );
};

export default PurchaseOrdersPage;
