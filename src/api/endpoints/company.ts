import apiClient from "../client";

/**
 * W6-02: the company profile printed on document headers and receipts
 * (CompanyController::payload). GET /company is open to every signed-in user;
 * PUT /company needs a company-wide owner or admin (403 COMPANY_PROFILE_FORBIDDEN).
 */
export interface CompanyProfile {
  id: string;
  /** Trading name (required, at most 255). */
  name: string;
  legal_name: string | null;
  tax_number: string | null;
  commercial_register: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** A base64 PNG/JPEG/WebP data URL of at most 200 KB, or null. */
  logo: string | null;
  receipt_footer: string | null;
  invoice_terms: string | null;
  updated_at: string | null;
}

/** Any subset of the editable fields; null clears a field (name cannot be cleared). */
export type CompanyProfileUpdatePayload = Partial<Omit<CompanyProfile, "id" | "updated_at">>;

/** The largest logo data URL the server accepts, prefix included (LogoDataUrl::MAX_BYTES). */
export const COMPANY_LOGO_MAX_BYTES = 200 * 1024;

export const companyApi = {
  get: async (): Promise<CompanyProfile> => (await apiClient.get<CompanyProfile>("/company")).data,
  update: async (payload: CompanyProfileUpdatePayload): Promise<CompanyProfile> =>
    (await apiClient.put<CompanyProfile>("/company", payload)).data,
};
