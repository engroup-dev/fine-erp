import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { Package, Plus, Wand2, X } from "lucide-react";
import {
  useCreateInventoryItem,
  useInventoryItem,
  useUpdateInventoryItem,
} from "../../hooks/useInventory";
import { useLeafItemCategories } from "../../hooks/useCategories";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { ItemPageTabs } from "../../components/inventory/ItemPageTabs";
import {
  Field,
  GuidedFormLoading,
  GuidedFormPage,
  Question,
  SummaryRow,
  formInputClass as inputClass,
} from "../../components/ui/GuidedForm";
import {
  type InventoryItem,
  type PriceBasis,
  PRICE_BASIS_LABELS,
  UOM_LABELS,
  internalBarcodeFromCode,
} from "../../api/endpoints/inventory";
import { isCode128B } from "../../lib/code128";
import { Code128Barcode } from "../../components/print/Code128Barcode";
import {
  ITEM_TYPE_LABELS,
  type InventoryItemType,
} from "../../api/endpoints/categories";
import { toast } from "../../stores/toastStore";
import { LEDGER_ERROR_MESSAGE, apiErrorPayload } from "../../api/endpoints/production";
import { formatNumber } from "../../lib/utils/format";
import { cn } from "../../lib/utils/utils";
import { tokens } from "../../lib/tokens";

const type = tokens.typography.webUI;

const UNIT_CHOICES: { value: string; label: string; hint: string }[] = [
  { value: "kg", label: "كيلوغرام", hint: "مواد تُوزن" },
  { value: "liter", label: "لتر", hint: "سوائل" },
  { value: "m3", label: "متر مكعب", hint: "قوالب إسفنج" },
  { value: "meter", label: "متر", hint: "أقمشة ولفّات" },
  { value: "each", label: "قطعة", hint: "تُعدّ بالعدد" },
];

const PACKAGE_PRESETS = ["برميل", "صندوق", "كيس", "رول", "طرد", "منصة"];

/** W6-06: the seeded general category new items start in (code GEN, name «عام»). */
const GENERAL_CATEGORY_CODE = "GEN";
const GENERAL_CATEGORY_NAME = "عام";

const InventoryItemFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: editingItem, isLoading: isLoadingItem } = useInventoryItem(id);
  const { data: leafCategories, all: categories } = useLeafItemCategories(editingItem?.category_id ?? undefined);
  const createItemMutation = useCreateInventoryItem();
  const updateItemMutation = useUpdateInventoryItem();

  const [name, setName] = useState("");
  const [codeSegment, setCodeSegment] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [itemType, setItemType] =
    useState<InventoryItem["item_type"]>("raw_material");
  const [uom, setUom] = useState<InventoryItem["unit_of_measure"]>("kg");
  const [isPackaged, setIsPackaged] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [showSize, setShowSize] = useState(false);
  const [lengthM, setLengthM] = useState("");
  const [widthM, setWidthM] = useState("");
  const [heightM, setHeightM] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [costManuallyEdited, setCostManuallyEdited] = useState(false);
  const [priceBasis, setPriceBasis] = useState<PriceBasis>("unit");
  const [error, setError] = useState<string | null>(null);
  // W6-06: a new item starts in «عام» once, so clearing the picker afterwards stays cleared.
  const [categoryDefaulted, setCategoryDefaulted] = useState(false);
  // W6-06: an edited item whose stored code does not start with its category's
  // code (e.g. one the backfill moved into «عام») keeps that code as-is while it
  // stays in that category; the prefix only applies once another category is picked.
  const [legacyCodeCategoryId, setLegacyCodeCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (uom === "m3") setShowSize(true);
  }, [uom]);

  useEffect(() => {
    if (!isEdit || !editingItem) return;
    setName(editingItem.name);
    const prefix = editingItem.category?.code ?? "";
    const keepsPrefix = Boolean(prefix) && editingItem.code.startsWith(prefix);
    setCodeSegment(keepsPrefix ? editingItem.code.slice(prefix.length) : editingItem.code);
    setLegacyCodeCategoryId(prefix && !keepsPrefix ? (editingItem.category_id ?? null) : null);
    setBarcode(editingItem.barcode ?? "");
    setCategoryId(editingItem.category_id ?? "");
    setItemType(editingItem.item_type);
    setUom(editingItem.unit_of_measure || "kg");
    setIsPackaged(
      Number(editingItem.container_capacity) > 0 ||
        Boolean(editingItem.primary_uom),
    );
    setPackageName(editingItem.primary_uom ?? "");
    setCapacity(
      editingItem.container_capacity
        ? String(editingItem.container_capacity)
        : "",
    );
    setLengthM(editingItem.length_m ? String(editingItem.length_m) : "");
    setWidthM(editingItem.width_m ? String(editingItem.width_m) : "");
    setHeightM(editingItem.height_m ? String(editingItem.height_m) : "");
    setCostPrice(
      editingItem.cost_price !== null && editingItem.cost_price !== undefined
        ? String(Number(editingItem.cost_price))
        : "",
    );
    setPurchasePrice(
      editingItem.purchase_price !== null && editingItem.purchase_price !== undefined
        ? String(Number(editingItem.purchase_price))
        : "",
    );
    setSellingPrice(
      editingItem.selling_price !== null && editingItem.selling_price !== undefined
        ? String(Number(editingItem.selling_price))
        : "",
    );
    setWholesalePrice(
      editingItem.wholesale_price !== null && editingItem.wholesale_price !== undefined
        ? String(Number(editingItem.wholesale_price))
        : "",
    );
    setMinPrice(
      editingItem.min_price !== null && editingItem.min_price !== undefined
        ? String(Number(editingItem.min_price))
        : "",
    );
    if (editingItem.cost_price !== null && editingItem.cost_price !== undefined) {
      setCostManuallyEdited(true);
    }
    setPriceBasis(editingItem.price_basis ?? "unit");
    if (
      editingItem.length_m ||
      editingItem.width_m ||
      editingItem.height_m ||
      editingItem.unit_of_measure === "m3"
    ) {
      setShowSize(true);
    }
  }, [isEdit, editingItem]);

  // W6-06: a category is required; a new item defaults to the general one.
  // Same rule as the backfill migration: the oldest top-level untyped leaf named
  // «عام» (whatever its code, GEN-2… when GEN was taken), then an untyped
  // top-level GEN leaf. Both are untyped, so the default never drives item_type.
  const oldestFirst = (a: { created_at: string }, b: { created_at: string }) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? "");
  const untypedTopLevel = leafCategories.filter((c) => !c.parent_id && !c.item_type);
  const generalCategory =
    untypedTopLevel.filter((c) => c.name === GENERAL_CATEGORY_NAME).sort(oldestFirst)[0] ??
    untypedTopLevel.find((c) => c.code === GENERAL_CATEGORY_CODE);
  useEffect(() => {
    if (isEdit || categoryDefaulted || !generalCategory) return;
    setCategoryDefaulted(true);
    setCategoryId((current) => current || generalCategory.id);
  }, [isEdit, categoryDefaulted, generalCategory]);

  const selectedCategory = categories?.find((c) => c.id === categoryId);
  const keepsLegacyCode = legacyCodeCategoryId !== null && categoryId === legacyCodeCategoryId;
  const categoryPrefix = keepsLegacyCode ? "" : (selectedCategory?.code ?? "");
  const fullCode = `${categoryPrefix}${codeSegment.trim()}`;
  const typeFromCategory = Boolean(selectedCategory?.item_type);
  const trimmedBarcode = barcode.trim();
  // W4-03: the backend takes printable ASCII only (the Code128 set B range the labels encode).
  const barcodeInvalid = trimmedBarcode !== "" && !isCode128B(trimmedBarcode);
  const unitLabel = UOM_LABELS[uom] || uom;
  const capacityNumber = Number(capacity);
  const volume = Number(lengthM) * Number(widthM) * Number(heightM);
  // Min price and cost share one basis, so they compare directly; a zero/empty min price warns about nothing.
  const minBelowCost = Number(minPrice) > 0 && Number(costPrice) > 0 && Number(minPrice) < Number(costPrice);
  const minAboveSelling = Number(minPrice) > 0 && Number(sellingPrice) > 0 && Number(minPrice) > Number(sellingPrice);

  const handleCategoryChange = (nextId: string) => {
    setCategoryId(nextId);
    const matched = categories?.find((c) => c.id === nextId);
    if (matched?.item_type)
      setItemType(matched.item_type as InventoryItem["item_type"]);
  };

  const clearSize = () => {
    setLengthM("");
    setWidthM("");
    setHeightM("");
    setShowSize(false);
  };

  const handlePurchasePriceChange = (val: string) => {
    setPurchasePrice(val);
    if (!costManuallyEdited) {
      setCostPrice(val);
    }
  };

  const handleCostPriceChange = (val: string) => {
    setCostPrice(val);
    setCostManuallyEdited(true);
  };

  const generateBarcode = () => {
    const generated = internalBarcodeFromCode(fullCode);
    if (!generated) {
      toast.error("أدخل رمز صنف بأحرف أو أرقام لاتينية أولاً — منه يُولَّد الباركود.");
      return;
    }
    setBarcode(generated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (barcodeInvalid) {
      setError("الباركود يقبل الأحرف والأرقام اللاتينية والرموز فقط.");
      return;
    }
    if (!categoryId) {
      setError(LEDGER_ERROR_MESSAGE.ITEM_CATEGORY_REQUIRED);
      return;
    }

    const payload = {
      name: name.trim(),
      // An unchanged code is left out on edit, so saving a price never rewrites it.
      code: isEdit && editingItem?.code === fullCode ? undefined : fullCode,
      barcode: trimmedBarcode || null,
      category_id: categoryId,
      item_type: itemType,
      unit_of_measure: uom,
      primary_uom: isPackaged ? packageName.trim() || null : null,
      secondary_uom: isPackaged ? uom : null,
      container_capacity:
        isPackaged && capacityNumber > 0 ? capacityNumber : null,
      length_m: lengthM.trim() ? Number(lengthM) : null,
      width_m: widthM.trim() ? Number(widthM) : null,
      height_m: heightM.trim() ? Number(heightM) : null,
      cost_price: costPrice.trim() ? Number(costPrice) : null,
      purchase_price: purchasePrice.trim() ? Number(purchasePrice) : null,
      selling_price: sellingPrice.trim() ? Number(sellingPrice) : null,
      wholesale_price: wholesalePrice.trim() ? Number(wholesalePrice) : null,
      min_price: minPrice.trim() ? Number(minPrice) : null,
      price_basis: priceBasis,
    };

    try {
      if (isEdit && id) {
        await updateItemMutation.mutateAsync({ id, data: payload });
        toast.success("تم حفظ التعديلات");
      } else {
        await createItemMutation.mutateAsync(payload);
        toast.success("تمت إضافة الصنف");
      }
      navigate("/settings/products/items");
    } catch (err: unknown) {
      // W6-06: a missing category comes back coded.
      if (apiErrorPayload(err)?.code === "ITEM_CATEGORY_REQUIRED") {
        setError(LEDGER_ERROR_MESSAGE.ITEM_CATEGORY_REQUIRED);
        return;
      }
      if (isAxiosError(err)) {
        const errors = err.response?.data?.errors;
        if (errors && typeof errors === "object") {
          // W4-03: the scan-code clashes (the backend's "unique" messages)
          // come back in English; say them in Arabic.
          const isTaken = (field: string) => /already used/i.test(String(errors[field]?.[0] ?? ""));
          if (isTaken("barcode")) {
            setError("هذا الباركود مستخدم لصنف آخر (باركود أو رمز صنف) أو كرقم دفعة.");
            return;
          }
          if (isTaken("code")) {
            setError("رمز الصنف مستخدم لصنف آخر (رمز أو باركود) أو كرقم دفعة.");
            return;
          }
          const firstMsg = errors[Object.keys(errors)[0]]?.[0];
          if (firstMsg) {
            setError(String(firstMsg));
            return;
          }
        }
        setError(err.response?.data?.message ?? "تعذّر حفظ الصنف");
      } else {
        setError("تعذّر حفظ الصنف");
      }
    }
  };

  const isSubmitting =
    createItemMutation.isPending || updateItemMutation.isPending;

  if (isEdit && isLoadingItem) {
    return <GuidedFormLoading>جارٍ تحميل الصنف…</GuidedFormLoading>;
  }

  return (
    <GuidedFormPage
      backTo="/settings/products/items"
      backLabel="الأصناف"
      title={isEdit ? `تعديل: ${editingItem?.name ?? ""}` : "صنف جديد"}
      error={error}
      onSubmit={handleSubmit}
      summaryIcon={Package}
      summaryTitle={name}
      summaryPlaceholder="صنف بدون اسم"
      summarySubtitle={fullCode}
      summary={
        <>
          <SummaryRow label="التصنيف">
            {selectedCategory?.name ?? "—"}
          </SummaryRow>
          <SummaryRow label="الباركود">
            {trimmedBarcode ? (
              <span className="font-mono" dir="ltr">
                {trimmedBarcode}
              </span>
            ) : (
              <span className="text-app-label-tertiary">بدون — يُمسح برمز الصنف</span>
            )}
          </SummaryRow>
          <SummaryRow label="النوع">
            {ITEM_TYPE_LABELS[itemType as InventoryItemType] ?? itemType}
          </SummaryRow>
          <SummaryRow label="يُحسب بـ">{unitLabel}</SummaryRow>
          <SummaryRow label="التوريد">
            {isPackaged ? (
              packageName.trim() && capacityNumber > 0 ? (
                <>
                  {packageName.trim()} ={" "}
                  <span className="font-mono">
                    {formatNumber(capacityNumber)}
                  </span>{" "}
                  {unitLabel}
                </>
              ) : (
                <span className="text-app-label-tertiary">
                  في عبوات — أكمل البيانات
                </span>
              )
            ) : (
              "سائب"
            )}
          </SummaryRow>
          <SummaryRow label="سعر بيع القطعة">
            {sellingPrice.trim() ? (
              <>
                <span className="font-mono">
                  {formatNumber(Number(sellingPrice))}
                </span>{" "}
                د.ل {PRICE_BASIS_LABELS[priceBasis]}
              </>
            ) : (
              <span className="text-app-label-tertiary">غير محدد</span>
            )}
          </SummaryRow>
          <SummaryRow label="سعر بيع بالجملة">
            {wholesalePrice.trim() ? (
              <>
                <span className="font-mono">
                  {formatNumber(Number(wholesalePrice))}
                </span>{" "}
                د.ل {PRICE_BASIS_LABELS[priceBasis]}
              </>
            ) : (
              <span className="text-app-label-tertiary">غير محدد</span>
            )}
          </SummaryRow>
          {(costPrice.trim() || purchasePrice.trim()) && (
            <SummaryRow label="التكلفة / الشراء">
              <span className="font-mono">
                {costPrice.trim() ? formatNumber(Number(costPrice)) : "—"} / {purchasePrice.trim() ? formatNumber(Number(purchasePrice)) : "—"}
              </span>{" "}
              د.ل
            </SummaryRow>
          )}
          {volume > 0 && (
            <SummaryRow label="المقاس">
              <span className="font-mono" dir="ltr">
                {lengthM} × {widthM} × {heightM} م
              </span>
            </SummaryRow>
          )}
        </>
      }
      submitLabel={isEdit ? "حفظ التعديلات" : "حفظ الصنف"}
      isSubmitting={isSubmitting}
      onCancel={() => navigate("/settings/products/items")}
      tabs={isEdit && id ? <ItemPageTabs itemId={id} /> : undefined}
    >
      <Question number="1" title="ما هو الصنف؟">
        <Field label="اسم الصنف">
          <input
            type="text"
            required
            placeholder="مثال: كحول صناعي"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="التصنيف"
            hint={
              categoryId
                ? "يحدد بداية الرمز ونوع الصنف تلقائياً"
                : "التصنيف إلزامي — اختر تصنيفاً (يمكن اختيار «عام»)."
            }
          >
            <SearchableSelect<{ id: string; name: string; code?: string; path?: string }>
              options={leafCategories}
              value={leafCategories.find((c) => c.id === categoryId) ?? selectedCategory ?? null}
              onChange={(c) => handleCategoryChange(c ? c.id : "")}
              getOptionId={(c) => c.id}
              getOptionLabel={(c) => c.path ?? c.name}
              getOptionSubLabel={(c) => c.code}
              getOptionSearchText={(c) => `${c.path ?? c.name} ${c.code ?? ""}`}
              placeholder="اختر التصنيف"
            />
          </Field>

          <Field label="رمز الصنف">
            <div className="flex items-center gap-1.5" dir="ltr">
              {categoryPrefix && (
                <span
                  className={cn(
                    type.b2Emphasized,
                    "shrink-0 rounded-app-md bg-app-fill-f1 px-2.5 py-2 font-mono text-app-label-secondary",
                  )}
                >
                  {categoryPrefix}
                </span>
              )}
              <input
                type="text"
                required
                placeholder={categoryPrefix ? "01" : "الرمز"}
                value={codeSegment}
                onChange={(e) => setCodeSegment(e.target.value)}
                className={cn(inputClass, "font-mono")}
              />
            </div>
          </Field>
        </div>

        <Field
          label="الباركود"
          hint="اختياري — امسح باركود المنتج أو اضغط «توليد» لإنشاء رمز داخلي من رمز الصنف"
        >
          <div className="flex items-center gap-1.5" dir="ltr">
            <input
              type="text"
              maxLength={64}
              placeholder="6291234567890"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => {
                // A barcode reader ends every scan with Enter: keep the code
                // in the field instead of submitting a half-filled form.
                if (e.key === "Enter") e.preventDefault();
              }}
              className={cn(inputClass, "font-mono", barcodeInvalid && "border-app-status-danger")}
            />
            <button
              type="button"
              onClick={generateBarcode}
              className={cn(
                type.c1Emphasized,
                "flex shrink-0 items-center gap-1 rounded-app-md border border-app-separator bg-app-bg-secondary px-3 py-2 text-app-accent hover:bg-app-fill-f1",
              )}
            >
              <Wand2 className="h-3.5 w-3.5" />
              توليد
            </button>
          </div>
          {barcodeInvalid ? (
            <p className={cn(type.c1Regular, "mt-1 text-app-status-danger")}>
              الباركود يقبل الأحرف والأرقام اللاتينية والرموز فقط.
            </p>
          ) : (
            trimmedBarcode && (
              <div className="mt-2 w-56 rounded-app-md border border-app-separator bg-app-bg-primary p-2">
                <Code128Barcode value={trimmedBarcode} height="10mm" />
              </div>
            )
          )}
        </Field>

        <Field
          label="نوع الصنف"
          aside={
            typeFromCategory && (
              <span className={cn(type.c1Regular, "text-app-accent")}>
                محدد من التصنيف
              </span>
            )
          }
        >
          <select
            value={itemType}
            onChange={(e) =>
              setItemType(e.target.value as InventoryItem["item_type"])
            }
            className={inputClass}
          >
            {(Object.keys(ITEM_TYPE_LABELS) as InventoryItemType[]).map(
              (key) => (
                <option key={key} value={key}>
                  {ITEM_TYPE_LABELS[key]}
                </option>
              ),
            )}
          </select>
        </Field>
      </Question>

      <Question
        number="2"
        title="كيف تُحسب كميته؟"
        subtitle="بهذه الوحدة يُسجَّل الرصيد وتُحسب التكلفة"
      >
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {UNIT_CHOICES.map((choice) => {
            const active = uom === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => setUom(choice.value)}
                className={cn(
                  "rounded-app-md border px-3 py-2.5 text-start transition-colors",
                  active
                    ? "border-app-accent bg-app-accent/10"
                    : "border-app-separator bg-app-bg-primary hover:bg-app-fill-f1",
                )}
              >
                <span
                  className={cn(
                    type.b2Emphasized,
                    "block",
                    active ? "text-app-accent" : "text-app-label-primary",
                  )}
                >
                  {choice.label}
                </span>
                <span
                  className={cn(
                    type.c1Regular,
                    "block text-app-label-tertiary",
                  )}
                >
                  {choice.hint}
                </span>
              </button>
            );
          })}
        </div>
      </Question>

      <Question
        number="3"
        title="هل يُورَّد في عبوات؟"
        subtitle="مثل براميل أو صناديق أو أكياس بسعة ثابتة"
      >
        <div className="inline-flex rounded-app-md border border-app-separator p-1 bg-app-bg-secondary">
          {[
            { value: false, label: "لا" },
            { value: true, label: "نعم، في عبوات" },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setIsPackaged(opt.value)}
              className={cn(
                type.c1Emphasized,
                "rounded-app-sm px-4 py-1.5 transition-colors",
                isPackaged === opt.value
                  ? "bg-app-bg-primary text-app-label-primary shadow-sm"
                  : "text-app-label-secondary hover:text-app-label-primary",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {isPackaged && (
          <div className="space-y-3 rounded-app-lg bg-app-bg-secondary p-4">
            <div
              className={cn(
                type.b2Regular,
                "flex flex-wrap items-center gap-2 text-app-label-primary",
              )}
            >
              <span>كل</span>
              <input
                type="text"
                placeholder="برميل"
                value={packageName}
                onChange={(e) => setPackageName(e.target.value)}
                className={cn(inputClass, "w-32")}
              />
              <span>يحتوي على</span>
              <input
                type="number"
                step="0.0001"
                min="0"
                placeholder="200"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className={cn(inputClass, "w-28 font-mono")}
                dir="ltr"
              />
              <span>{unitLabel}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PACKAGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPackageName(preset)}
                  className={cn(
                    type.c1Regular,
                    "rounded-full border px-2.5 py-0.5 transition-colors",
                    packageName === preset
                      ? "border-app-accent bg-app-accent text-white"
                      : "border-app-separator bg-app-bg-primary text-app-label-secondary hover:text-app-label-primary",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}
      </Question>

      <Question
        number="4"
        title="المقاس"
        subtitle="اختياري — الطول والعرض والارتفاع بالمتر"
      >
        {showSize ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "الطول",
                  value: lengthM,
                  set: setLengthM,
                  ph: "1.00",
                },
                {
                  label: "العرض",
                  value: widthM,
                  set: setWidthM,
                  ph: "2.00",
                },
                {
                  label: "الارتفاع",
                  value: heightM,
                  set: setHeightM,
                  ph: "0.20",
                },
              ].map((f) => (
                <Field key={f.label} label={f.label}>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder={f.ph}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    className={cn(inputClass, "font-mono")}
                    dir="ltr"
                  />
                </Field>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className={cn(type.c1Regular, "text-app-label-secondary")}>
                {volume > 0 ? (
                  <>
                    الحجم:{" "}
                    <span className="font-mono font-semibold text-app-accent">
                      {formatNumber(volume)} م³
                    </span>
                  </>
                ) : (
                  "أدخل الأبعاد الثلاثة لحساب الحجم"
                )}
              </span>
              {uom !== "m3" && (
                <button
                  type="button"
                  onClick={clearSize}
                  className={cn(
                    type.c1Regular,
                    "flex items-center gap-1 text-app-label-tertiary hover:text-app-status-danger",
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                  إزالة المقاس
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSize(true)}
            className={cn(
              type.c1Emphasized,
              "flex w-fit items-center gap-1.5 text-app-accent hover:underline",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            إضافة المقاس
          </button>
        )}
      </Question>

      <Question
        number="5"
        title="الأسعار والتسعير"
        subtitle="اختياري — تحديد تكاليف الشراء والتكلفة وأسعار البيع بالقطعة وبالجملة"
      >
        <div className="space-y-5">
          {/* Basis selector: unit vs m3 */}
          <div>
            <label className="block text-xs font-semibold text-app-label-secondary mb-1.5">
              أساس احتساب السعر
            </label>
            <div className="inline-flex rounded-app-md border border-app-separator p-1 bg-app-bg-secondary">
              {(Object.keys(PRICE_BASIS_LABELS) as PriceBasis[]).map((basis) => (
                <button
                  key={basis}
                  type="button"
                  onClick={() => setPriceBasis(basis)}
                  className={cn(
                    type.c1Emphasized,
                    "rounded-app-sm px-4 py-1.5 transition-colors",
                    priceBasis === basis
                      ? "bg-app-bg-primary text-app-label-primary shadow-sm"
                      : "text-app-label-secondary hover:text-app-label-primary",
                  )}
                >
                  {PRICE_BASIS_LABELS[basis]}
                </button>
              ))}
            </div>
            {priceBasis === "m3" && (
              <p className="mt-1 text-[11px] text-app-label-tertiary">
                الأسعار المدخلة أدناه ستُحسب لكل متر مكعب (م³).
              </p>
            )}
          </div>

          {/* Group 1: Cost & Purchase */}
          <div className="rounded-xl border border-app-separator bg-app-bg-secondary/40 p-4 space-y-3">
            <h4 className="text-xs font-bold text-app-label-primary flex items-center gap-1.5">
              <span>أسعار التكلفة والتوريد (Sourcing & Costs)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label={priceBasis === "m3" ? "سعر الشراء للمتر المكعب (د.ل)" : "سعر الشراء (د.ل)"}
                hint="سعر الشراء من المورد — يُقترح كقيمة مبدئية لسعر التكلفة"
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={purchasePrice}
                  onChange={(e) => handlePurchasePriceChange(e.target.value)}
                  className={cn(inputClass, "font-mono")}
                  dir="ltr"
                />
              </Field>

              <Field
                label={priceBasis === "m3" ? "سعر التكلفة للمتر المكعب (د.ل)" : "سعر التكلفة (د.ل)"}
                hint="التكلفة الإجمالية (شراء + شحن/جمارك) — قابلة للتعديل بحرية"
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={costPrice}
                  onChange={(e) => handleCostPriceChange(e.target.value)}
                  className={cn(inputClass, "font-mono")}
                  dir="ltr"
                />
              </Field>
            </div>
          </div>

          {/* Group 2: Selling Prices */}
          <div className="rounded-xl border border-app-separator bg-app-bg-secondary/40 p-4 space-y-3">
            <h4 className="text-xs font-bold text-app-label-primary flex items-center gap-1.5">
              <span>أسعار البيع (Selling Prices)</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field
                label={priceBasis === "m3" ? "سعر بيع القطعة للمتر المكعب (د.ل)" : "سعر بيع القطعة (قطاعي) (د.ل)"}
                hint="سعر البيع الافتراضي للمستهلك أو المعرض"
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className={cn(inputClass, "font-mono")}
                  dir="ltr"
                />
              </Field>

              <Field
                label={priceBasis === "m3" ? "سعر بيع بالجملة للمتر المكعب (د.ل)" : "سعر بيع بالجملة (د.ل)"}
                hint="سعر البيع لعملاء الجملة والتجار"
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(e.target.value)}
                  className={cn(inputClass, "font-mono")}
                  dir="ltr"
                />
              </Field>

              <Field
                label={priceBasis === "m3" ? "أقل سعر بيع للمتر المكعب (د.ل)" : "أقل سعر بيع (د.ل)"}
                hint="البيع بأقل من هذا السعر أو من التكلفة يحتاج موافقة المدير"
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className={cn(inputClass, "font-mono")}
                  dir="ltr"
                />
              </Field>
            </div>
          </div>

          {/* Profit margin live feedback */}
          {((Number(costPrice) > 0 && (Number(sellingPrice) > 0 || Number(wholesalePrice) > 0)) ||
            minBelowCost ||
            minAboveSelling) && (
            <div className="flex flex-wrap items-center gap-4 text-xs bg-app-bg-primary border border-app-separator p-2.5 rounded-lg">
              {Number(costPrice) > 0 && Number(sellingPrice) > 0 && (
                <div>
                  <span className="text-app-label-secondary">هامش ربح القطعة: </span>
                  <span className={cn("font-mono font-bold", Number(sellingPrice) >= Number(costPrice) ? "text-app-status-positive" : "text-app-status-danger")}>
                    {formatNumber(((Number(sellingPrice) - Number(costPrice)) / Number(sellingPrice)) * 100)}%
                  </span>
                  <span className="text-app-label-tertiary font-mono ms-1">
                    (+{formatNumber(Number(sellingPrice) - Number(costPrice))} د.ل)
                  </span>
                </div>
              )}
              {Number(costPrice) > 0 && Number(wholesalePrice) > 0 && (
                <div>
                  <span className="text-app-label-secondary">هامش ربح الجملة: </span>
                  <span className={cn("font-mono font-bold", Number(wholesalePrice) >= Number(costPrice) ? "text-app-status-positive" : "text-app-status-danger")}>
                    {formatNumber(((Number(wholesalePrice) - Number(costPrice)) / Number(wholesalePrice)) * 100)}%
                  </span>
                  <span className="text-app-label-tertiary font-mono ms-1">
                    (+{formatNumber(Number(wholesalePrice) - Number(costPrice))} د.ل)
                  </span>
                </div>
              )}
              {minBelowCost && (
                <div className="w-full font-semibold text-app-status-warning">
                  أقل سعر بيع ({formatNumber(Number(minPrice))}) أقل من التكلفة ({formatNumber(Number(costPrice))}) — الحد الفعلي عند البيع هو التكلفة.
                </div>
              )}
              {minAboveSelling && (
                <div className="w-full font-semibold text-app-status-warning">
                  أقل سعر بيع ({formatNumber(Number(minPrice))}) أعلى من سعر البيع ({formatNumber(Number(sellingPrice))}) — كل بيع بالسعر الافتراضي سيحتاج موافقة المدير.
                </div>
              )}
            </div>
          )}

          {priceBasis === "m3" && volume > 0 && (
            <div className="text-[11px] text-app-label-secondary">
              حساب المقاس الحالي ({formatNumber(volume)} م³):{" "}
              {Number(sellingPrice) > 0 && (
                <span className="me-3">
                  قطاعي: <strong className="font-mono text-app-accent">{formatNumber(Number(sellingPrice) * volume)} د.ل</strong>
                </span>
              )}
              {Number(wholesalePrice) > 0 && (
                <span>
                  جملة: <strong className="font-mono text-app-accent">{formatNumber(Number(wholesalePrice) * volume)} د.ل</strong>
                </span>
              )}
            </div>
          )}
        </div>
      </Question>
    </GuidedFormPage>
  );
};

export default InventoryItemFormPage;
