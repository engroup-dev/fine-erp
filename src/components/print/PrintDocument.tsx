import React from "react";
import { Printer } from "lucide-react";
import { printContactLine, printRegistrationLine, usePrintProfile } from "../../hooks/useCompanyProfile";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from "../ui/Dialog";
import { formatDateTime, formatNumber } from "../../lib/utils/format";

/**
 * The A4 paper every sales document prints on — invoice, quotation, delivery
 * note, cutter job sheet. On screen it previews inside a white sheet; when
 * printing, the .print-area rules isolate it from the app behind.
 *
 * W6-02: the header (logo, legal name, tax / commercial register, address,
 * phone) comes from the company profile, falling back to the bundled logo and
 * the old hard-coded name for empty fields.
 */

interface PrintDocumentProps {
  /** Document title, e.g. "فاتورة مبيعات". */
  title: string;
  number: string;
  date?: string | null;
  /** Selling / issuing unit. */
  issuer?: string | null;
  /** Label + value pairs under the header (client, phone, payment…). */
  meta?: { label: string; value: React.ReactNode }[];
  /** Signature boxes at the bottom (e.g. "المستلم", "أمين المخزن"). */
  signatures?: string[];
  footerNote?: string;
  /** W6-02: print the company's invoice terms (when set) above the footer — invoices and quotations. */
  showInvoiceTerms?: boolean;
  children: React.ReactNode;
}

export const PrintDocument: React.FC<PrintDocumentProps> = ({
  title,
  number,
  date,
  issuer,
  meta = [],
  signatures = [],
  footerNote,
  showInvoiceTerms = false,
  children,
}) => {
  const profile = usePrintProfile();
  const registration = printRegistrationLine(profile);
  const contact = printContactLine(profile);
  const terms = showInvoiceTerms ? profile.invoiceTerms : null;

  return (
    <div dir="rtl" className="print-area print-document bg-white text-black text-[12px] leading-relaxed p-8 space-y-5">
      <header className="flex items-start justify-between border-b-2 border-black pb-4">
        <div className="flex items-center gap-3">
          <img src={profile.logo} alt="" className="h-12 w-auto max-w-[140px] object-contain" />
          <div>
            <div className="text-base font-bold">{profile.name}</div>
            {issuer && <div className="text-[11px] text-gray-600">{issuer}</div>}
            {registration && <div className="text-[10px] text-gray-600">{registration}</div>}
            {contact && <div className="text-[10px] text-gray-600">{contact}</div>}
          </div>
        </div>
        <div className="text-end">
          <div className="text-lg font-bold">{title}</div>
          <div className="font-mono text-[12px]">{number}</div>
          {date && <div className="text-[11px] text-gray-600">{formatDateTime(date)}</div>}
        </div>
      </header>

      {meta.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5">
          {meta.map((m) => (
            <div key={m.label} className="flex gap-2">
              <dt className="text-gray-600 shrink-0">{m.label}:</dt>
              <dd className="font-semibold">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {children}

      {signatures.length > 0 && (
        <div className="grid gap-8 pt-10" style={{ gridTemplateColumns: `repeat(${signatures.length}, minmax(0, 1fr))` }}>
          {signatures.map((s) => (
            <div key={s} className="border-t border-black pt-1 text-center text-[11px]">
              {s}
            </div>
          ))}
        </div>
      )}

      {terms && (
        <div className="border-t border-gray-300 pt-2 text-[10px] text-gray-700">
          <div className="font-bold">الشروط والأحكام</div>
          <p className="whitespace-pre-line">{terms}</p>
        </div>
      )}

      {footerNote && <p className="pt-2 text-center text-[10px] text-gray-500">{footerNote}</p>}
    </div>
  );
};

/** A bordered table that prints cleanly (no app tokens, black on white). */
export const PrintTable: React.FC<{ head: React.ReactNode[]; children: React.ReactNode }> = ({ head, children }) => (
  <table className="w-full border-collapse text-[12px]">
    <thead>
      <tr className="bg-gray-100">
        {head.map((h, i) => (
          <th key={i} className="border border-gray-400 px-2 py-1.5 text-start font-bold">
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>{children}</tbody>
  </table>
);

export const Cell: React.FC<{ children?: React.ReactNode; className?: string; colSpan?: number }> = ({ children, className = "", colSpan }) => (
  <td colSpan={colSpan} className={`border border-gray-400 px-2 py-1 align-top ${className}`}>
    {children}
  </td>
);

export const money = (value: number | string | null | undefined): string => `${formatNumber(Number(value ?? 0))} د.ل`;

interface PrintDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  isLoading?: boolean;
  error?: string | null;
  children: React.ReactNode;
}

/** Preview a document and print it (or Save as PDF from the print dialog). */
export const PrintDialog: React.FC<PrintDialogProps> = ({ open, onClose, title, isLoading, error, children }) => (
  <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent size="3xl">
      <DialogHeader className="print:hidden">
        <DialogTitle>{title}</DialogTitle>
        <DialogClose />
      </DialogHeader>
      <DialogBody className="bg-app-fill-f1 print:bg-white print:p-0">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-app-label-secondary">جارٍ تجهيز المستند…</div>
        ) : error ? (
          <div className="py-16 text-center text-xs text-app-status-danger">{error}</div>
        ) : (
          <div className="mx-auto max-w-[210mm] shadow-sm print:shadow-none">{children}</div>
        )}
      </DialogBody>
      <DialogFooter className="print:hidden">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-semibold text-app-label-secondary hover:bg-app-fill-f1 rounded-xl"
        >
          إغلاق
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={isLoading || Boolean(error)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-app-accent hover:opacity-90 rounded-xl disabled:opacity-50"
        >
          <Printer className="h-4 w-4" />
          طباعة / PDF
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
