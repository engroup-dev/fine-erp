import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { companyApi, CompanyProfile, CompanyProfileUpdatePayload } from "../api/endpoints/company";
import { FineLogo } from "../assets/logo";
import { useAuthStore } from "../stores/authStore";
import { retryUnlessClientError } from "./useOperatingUnits";

const COMPANY_PROFILE_KEY = ["companyProfile"] as const;

/** The header every document printed before W6-02 — still used for any empty profile field. */
export const FALLBACK_COMPANY_NAME = "شركة فاين للصناعات والإسفنج";

/** W6-02: GET /company — the profile printed on document headers and receipts. */
export function useCompanyProfile() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: COMPANY_PROFILE_KEY,
    queryFn: companyApi.get,
    enabled: isAuthenticated,
    // The profile changes rarely; every print reads the cached copy.
    staleTime: 10 * 60 * 1000,
    retry: retryUnlessClientError,
  });
}

/** W6-02: PUT /company (company-wide owner or admin). */
export function useUpdateCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CompanyProfileUpdatePayload) => companyApi.update(payload),
    onSuccess: (profile) => {
      qc.setQueryData<CompanyProfile>(COMPANY_PROFILE_KEY, profile);
      qc.invalidateQueries({ queryKey: ["auditLog"] });
    },
  });
}

/** What a printed header and footer show, with the old hard-coded header for any empty field. */
export interface PrintProfile {
  /** The legal name, else the old hard-coded company name. */
  name: string;
  /** The profile logo (data URL), else the bundled Fine logo. */
  logo: string;
  /** The profile logo only — the receipts carried no logo before W6-02, so they print one only when set. */
  customLogo: string | null;
  taxNumber: string | null;
  commercialRegister: string | null;
  address: string | null;
  phone: string | null;
  /** Printed at the bottom of the 80mm receipts. */
  receiptFooter: string | null;
  /** Printed under invoices and quotations. */
  invoiceTerms: string | null;
}

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const toPrintProfile = (profile: CompanyProfile | undefined): PrintProfile => ({
  name: clean(profile?.legal_name) ?? FALLBACK_COMPANY_NAME,
  logo: clean(profile?.logo) ?? FineLogo,
  customLogo: clean(profile?.logo),
  taxNumber: clean(profile?.tax_number),
  commercialRegister: clean(profile?.commercial_register),
  address: clean(profile?.address),
  phone: clean(profile?.phone),
  receiptFooter: clean(profile?.receipt_footer),
  invoiceTerms: clean(profile?.invoice_terms),
});

/**
 * The one source every printed document (A4 PrintDocument and the 80mm receipts) reads its
 * header and footer from. While the profile loads, or if it fails, the old header prints.
 */
export function usePrintProfile(): PrintProfile {
  const { data } = useCompanyProfile();
  return useMemo(() => toPrintProfile(data), [data]);
}

/** The registration line under a printed header: tax number and commercial register. */
export const printRegistrationLine = (p: PrintProfile): string =>
  [p.taxNumber && `الرقم الضريبي: ${p.taxNumber}`, p.commercialRegister && `السجل التجاري: ${p.commercialRegister}`]
    .filter(Boolean)
    .join(" · ");

/** The contact line under a printed header: address and phone. */
export const printContactLine = (p: PrintProfile): string =>
  [p.address, p.phone && `هاتف: ${p.phone}`].filter(Boolean).join(" · ");
