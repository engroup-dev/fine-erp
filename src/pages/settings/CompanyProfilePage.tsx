import React, { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ImagePlus, Info, Loader2, Save, Trash2 } from "lucide-react";
import {
  COMPANY_LOGO_MAX_BYTES,
  CompanyProfile,
  CompanyProfileUpdatePayload,
} from "../../api/endpoints/company";
import { apiErrorMessage, apiErrorPayload } from "../../api/endpoints/production";
import {
  printContactLine,
  printRegistrationLine,
  toPrintProfile,
  useCompanyProfile,
  useUpdateCompanyProfile,
} from "../../hooks/useCompanyProfile";
import { fileToLogoDataUrl, LogoImageError } from "../../lib/utils/logoImage";
import { useAuthStore } from "../../stores/authStore";
import { toast } from "../../stores/toastStore";
import type { User } from "../../types/auth/types";

const inputClass =
  "w-full px-3 py-2 border border-app-separator rounded-lg bg-app-bg-secondary text-xs text-app-label-primary focus:border-app-accent focus:outline-none disabled:opacity-60";
const labelClass = "block text-[11px] font-semibold text-app-label-secondary mb-1";

type TextField =
  | "name"
  | "legal_name"
  | "tax_number"
  | "commercial_register"
  | "address"
  | "phone"
  | "email"
  | "receipt_footer"
  | "invoice_terms";

type FormState = Record<TextField, string> & { logo: string | null };

/** The server's length limits (CompanyController::update). */
const MAX_LENGTH: Record<TextField, number> = {
  name: 255,
  legal_name: 255,
  tax_number: 50,
  commercial_register: 50,
  address: 500,
  phone: 50,
  email: 255,
  receipt_footer: 1000,
  invoice_terms: 5000,
};

const FIELD_LABEL: Record<TextField | "logo", string> = {
  name: "الاسم التجاري",
  legal_name: "الاسم القانوني",
  tax_number: "الرقم الضريبي",
  commercial_register: "رقم السجل التجاري",
  address: "العنوان",
  phone: "الهاتف",
  email: "البريد الإلكتروني",
  logo: "الشعار",
  receipt_footer: "تذييل الإيصال",
  invoice_terms: "شروط الفاتورة",
};

const TEXT_FIELDS = Object.keys(MAX_LENGTH) as TextField[];

const toForm = (p: CompanyProfile): FormState => ({
  name: p.name ?? "",
  legal_name: p.legal_name ?? "",
  tax_number: p.tax_number ?? "",
  commercial_register: p.commercial_register ?? "",
  address: p.address ?? "",
  phone: p.phone ?? "",
  email: p.email ?? "",
  receipt_footer: p.receipt_footer ?? "",
  invoice_terms: p.invoice_terms ?? "",
  logo: p.logo,
});

/** Mirrors CompanyController::ensureCompanyWideWriter: an owner or admin role bound to no unit. */
const isCompanyWideWriter = (user: User | null): boolean =>
  Boolean(
    user?.roles?.some(
      (r) => (r.slug === "owner" || r.slug === "admin") && r.pivot !== undefined && r.pivot.operating_unit_id === null,
    ),
  );

/** The server's 422 field errors are English — name the fields in Arabic instead. */
const saveErrorMessage = (err: unknown): string => {
  const payload = apiErrorPayload(err);
  const fields = Object.keys(payload?.errors ?? {}) as (TextField | "logo")[];
  if (fields.length > 0) {
    return `تحقق من الحقول: ${fields.map((f) => FIELD_LABEL[f] ?? f).join("، ")}.`;
  }
  return apiErrorMessage(err, "تعذّر حفظ بيانات الشركة.");
};

/**
 * W6-02: Settings › Company › company profile — the names, registration numbers,
 * contact details, logo and footers every printed document and receipt carries.
 * Everyone here reads it; only a company-wide owner or admin saves it.
 */
export const CompanyProfilePage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const canEdit = isCompanyWideWriter(user);
  const profileQuery = useCompanyProfile();
  const updateMutation = useUpdateCompanyProfile();
  const [form, setForm] = useState<FormState | null>(null);
  // The server copy the form was filled from. Edits are measured against it (not against the
  // latest refetch), so a save sends only the fields this user changed and never writes back
  // stale values over another admin's newer save.
  const [baseline, setBaseline] = useState<FormState | null>(null);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const changed = useMemo<CompanyProfileUpdatePayload>(() => {
    if (!form || !baseline) return {};
    const patch: CompanyProfileUpdatePayload = {};
    TEXT_FIELDS.forEach((f) => {
      if (form[f].trim() !== baseline[f].trim()) {
        const value = form[f].trim();
        patch[f] = f === "name" ? value : value || null;
      }
    });
    if (form.logo !== baseline.logo) patch.logo = form.logo;
    return patch;
  }, [form, baseline]);
  const isDirty = Object.keys(changed).length > 0;

  // Fill the form when the profile arrives. A later refetch refreshes an untouched form;
  // it never overwrites unsaved edits.
  useEffect(() => {
    if (!profileQuery.data || (form !== null && isDirty)) return;
    const next = toForm(profileQuery.data);
    setForm(next);
    setBaseline(next);
    // Only a new server copy triggers this; `form` / `isDirty` are read, not watched.
  }, [profileQuery.data]);

  const preview = useMemo(
    () =>
      form
        ? toPrintProfile({
            ...(profileQuery.data as CompanyProfile),
            ...form,
          })
        : null,
    [form, profileQuery.data],
  );

  if (profileQuery.isLoading || (!form && !profileQuery.isError)) {
    return (
      <div className="flex items-center justify-center gap-2 p-16 text-xs text-app-label-secondary" dir="rtl">
        <Loader2 className="h-4 w-4 animate-spin" />
        جارٍ تحميل بيانات الشركة…
      </div>
    );
  }

  if (profileQuery.isError || !form || !preview) {
    return (
      <div className="p-16 text-center text-xs text-app-status-danger" dir="rtl">
        {apiErrorMessage(profileQuery.error, "تعذّر تحميل بيانات الشركة.")}
      </div>
    );
  }

  const set = (field: TextField, value: string) => setForm((f) => (f ? { ...f, [field]: value } : f));

  const handlePickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsProcessingLogo(true);
    try {
      const logo = await fileToLogoDataUrl(file, COMPANY_LOGO_MAX_BYTES);
      setForm((f) => (f ? { ...f, logo } : f));
    } catch (err) {
      toast.error(err instanceof LogoImageError ? err.message : "تعذّر تجهيز الصورة.");
    } finally {
      setIsProcessingLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !isDirty) return;
    if (form.name.trim() === "") {
      toast.error("الاسم التجاري مطلوب.");
      return;
    }
    try {
      const profile = await updateMutation.mutateAsync(changed);
      const next = toForm(profile);
      setForm(next);
      setBaseline(next);
      toast.success("تم حفظ بيانات الشركة");
    } catch (err) {
      toast.error(saveErrorMessage(err));
    }
  };

  const textInput = (field: TextField, opts: { dir?: "ltr"; type?: string; hint?: string } = {}) => (
    <div>
      <label htmlFor={`company-${field}`} className={labelClass}>
        {FIELD_LABEL[field]}
        {field === "name" && <span className="text-app-status-danger"> *</span>}
      </label>
      <input
        id={`company-${field}`}
        type={opts.type ?? "text"}
        dir={opts.dir}
        value={form[field]}
        maxLength={MAX_LENGTH[field]}
        disabled={!canEdit}
        onChange={(e) => set(field, e.target.value)}
        className={inputClass}
      />
      {opts.hint && <p className="mt-1 text-[10px] text-app-label-secondary">{opts.hint}</p>}
    </div>
  );

  const textArea = (field: TextField, rows: number, hint: string) => (
    <div>
      <label htmlFor={`company-${field}`} className={labelClass}>
        {FIELD_LABEL[field]}
      </label>
      <textarea
        id={`company-${field}`}
        rows={rows}
        value={form[field]}
        maxLength={MAX_LENGTH[field]}
        disabled={!canEdit}
        onChange={(e) => set(field, e.target.value)}
        className={inputClass}
      />
      <p className="mt-1 flex justify-between gap-2 text-[10px] text-app-label-secondary">
        <span>{hint}</span>
        <span className="font-mono">
          {form[field].length}/{MAX_LENGTH[field]}
        </span>
      </p>
    </div>
  );

  const registration = printRegistrationLine(preview);
  const contact = printContactLine(preview);

  return (
    <form onSubmit={(e) => void handleSave(e)} className="space-y-6 p-6" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-label-primary flex items-center gap-2">
            <Building2 className="w-7 h-7 text-app-accent" />
            بيانات الشركة
          </h1>
          <p className="text-xs text-app-label-secondary mt-1">
            تُطبع في ترويسة الفواتير وعروض الأسعار والسندات والكشوف وإيصالات نقطة البيع لكل الوحدات.
          </p>
        </div>
        {canEdit && (
          <button
            type="submit"
            disabled={!isDirty || updateMutation.isPending || isProcessingLogo}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-app-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ التغييرات
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 rounded-xl border border-app-status-yellow/30 bg-app-status-yellow/10 p-3 text-xs font-semibold text-app-label-primary">
          <Info className="h-4 w-4 shrink-0 text-app-status-yellow" />
          للعرض فقط — تعديل بيانات الشركة من صلاحية المالك أو المدير على مستوى الشركة.
        </div>
      )}

      {/* Header preview */}
      <section className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 space-y-3">
        <h2 className="text-sm font-bold text-app-label-primary">معاينة ترويسة المستندات</h2>
        <div className="rounded-xl bg-white p-4 text-black">
          <div className="flex items-center gap-3 border-b-2 border-black pb-3">
            <img src={preview.logo} alt="" className="h-12 w-auto max-w-[140px] object-contain" />
            <div className="text-[12px] leading-relaxed">
              <div className="text-base font-bold">{preview.name}</div>
              {registration && <div className="text-[10px] text-gray-600">{registration}</div>}
              {contact && <div className="text-[10px] text-gray-600">{contact}</div>}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-app-label-secondary">
          الحقول الفارغة لا تُطبع؛ وبلا اسم قانوني أو شعار تُطبع الترويسة الافتراضية.
        </p>
      </section>

      {/* Identity */}
      <section className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 space-y-4">
        <h2 className="text-sm font-bold text-app-label-primary">الهوية والتسجيل</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {textInput("name", { hint: "اسم الشركة داخل النظام." })}
          {textInput("legal_name", { hint: "يُطبع في ترويسة كل المستندات والإيصالات." })}
          {textInput("tax_number", { dir: "ltr" })}
          {textInput("commercial_register", { dir: "ltr" })}
        </div>

        <div>
          <span className={labelClass}>{FIELD_LABEL.logo}</span>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-40 items-center justify-center rounded-xl border border-dashed border-app-separator bg-white p-2">
              {form.logo ? (
                <img src={form.logo} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-[10px] text-gray-500">بلا شعار (يُطبع الشعار الافتراضي)</span>
              )}
            </div>
            {canEdit && (
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void handlePickLogo(e)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingLogo}
                  className="flex items-center gap-1.5 rounded-xl border border-app-separator bg-app-bg-secondary px-3 py-2 text-xs font-semibold text-app-label-primary hover:bg-app-fill-f1 disabled:opacity-50"
                >
                  {isProcessingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {form.logo ? "تغيير الشعار" : "اختيار شعار"}
                </button>
                {form.logo && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => (f ? { ...f, logo: null } : f))}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-app-status-danger hover:bg-app-status-danger/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    إزالة الشعار
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="mt-1 text-[10px] text-app-label-secondary">
            PNG أو JPEG أو WebP (لا يُقبل SVG). تُصغَّر الصورة تلقائياً لتبقى دون 200 ك.ب.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 space-y-4">
        <h2 className="text-sm font-bold text-app-label-primary">بيانات الاتصال</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {textInput("phone", { dir: "ltr" })}
          {textInput("email", { dir: "ltr", type: "email" })}
        </div>
        {textArea("address", 2, "يُطبع تحت اسم الشركة مع الهاتف.")}
      </section>

      {/* Footers */}
      <section className="rounded-2xl border border-app-separator bg-app-bg-primary p-5 space-y-4">
        <h2 className="text-sm font-bold text-app-label-primary">التذييلات</h2>
        {textArea("receipt_footer", 3, "يُطبع أسفل إيصالات نقطة البيع والمرتجعات بدل عبارة الشكر الافتراضية.")}
        {textArea("invoice_terms", 6, "تُطبع أسفل فواتير المبيعات وعروض الأسعار.")}
      </section>
    </form>
  );
};

export default CompanyProfilePage;
