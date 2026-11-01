import React from "react";
import { PrintDocument, PrintTable, Cell, money, PrintDialog } from "./PrintDocument";
import {
  DeliveryNote,
  Invoice,
  PAYMENT_METHOD_LABEL,
  Quotation,
  formatSizeCm,
} from "../../api/endpoints/sales";
import { useDeliveryNote, useInvoice, useQuotation } from "../../hooks/useSales";
import { apiErrorPayload } from "../../api/endpoints/production";
import { formatDate, formatNumber } from "../../lib/utils/format";

const qty = (value: number | string) => formatNumber(Number(value));

/** The client's invoice: a bundle is one line with its name, like any item. */
export const SaleInvoiceDocument: React.FC<{ invoice: Invoice }> = ({ invoice }) => {
  const buyerLabel =
    invoice.buyer?.trim() ||
    invoice.walk_in_name?.trim() ||
    (invoice.buyer_type === "walk_in" ? "زبون عام" : "—");
  const buyerPhone =
    invoice.buyer_phone?.trim() ||
    invoice.walk_in_phone?.trim() ||
    "—";
  const hasLineDiscount = invoice.lines.some((l) => Number(l.discount_amount || 0) > 0);
  const lineDiscountsSum = invoice.lines.reduce((s, l) => s + Number(l.discount_amount || 0), 0);
  const invoiceDiscount = Number(invoice.invoice_discount || 0);
  const totalDiscount = lineDiscountsSum + invoiceDiscount;
  const grossAmount =
    invoice.gross_amount !== undefined && invoice.gross_amount !== null
      ? Number(invoice.gross_amount)
      : Number(invoice.total_amount) + totalDiscount;
  const hasAnyDiscount = totalDiscount > 0;
  const labelColSpan = hasLineDiscount ? 5 : 4;

  return (
    <PrintDocument
      title="فاتورة مبيعات"
      number={invoice.invoice_number}
      date={invoice.date}
      issuer={invoice.seller}
      meta={[
        { label: "العميل", value: buyerLabel },
        { label: "الهاتف", value: buyerPhone },
        { label: "رقم البيع", value: <span className="font-mono">{invoice.sale_number}</span> },
        {
          label: "طريقة الدفع",
          value: invoice.payment_method
            ? `${PAYMENT_METHOD_LABEL[invoice.payment_method] ?? invoice.payment_method}${invoice.cash_account ? ` — ${invoice.cash_account}` : ""}`
            : "تحويل داخلي بسعر التكلفة",
        },
      ]}
      signatures={["توقيع البائع", "توقيع العميل"]}
      footerNote="شكراً لتعاملكم معنا — البضاعة المباعة تخضع لسياسة الاستبدال والضمان"
      showInvoiceTerms
    >
      <PrintTable
        head={
          hasLineDiscount
            ? ["#", "البيان", "الكمية", "سعر الوحدة", "الخصم", "الإجمالي"]
            : ["#", "البيان", "الكمية", "سعر الوحدة", "الإجمالي"]
        }
      >
        {invoice.lines.map((line, i) => {
          const size = formatSizeCm(line.length_m, line.width_m, line.height_m);
          const lineDiscount = Number(line.discount_amount || 0);
          const lineNet =
            line.line_total !== undefined && line.line_total !== null
              ? Number(line.line_total)
              : Number(line.quantity) * Number(line.unit_price) - lineDiscount;
          return (
            <tr key={i}>
              <Cell className="w-8 text-center">{i + 1}</Cell>
              <Cell>
                <div className="font-semibold">{line.description}</div>
                <div className="text-[10px] text-gray-600">
                  {[line.sku, size, line.lot_number ? `لوت ${line.lot_number}` : null].filter(Boolean).join(" · ")}
                </div>
              </Cell>
              <Cell className="w-16 text-center font-mono">{qty(line.quantity)}</Cell>
              <Cell className="w-28 text-end font-mono">{money(line.unit_price)}</Cell>
              {hasLineDiscount && (
                <Cell className="w-24 text-end font-mono">{lineDiscount > 0 ? money(lineDiscount) : "—"}</Cell>
              )}
              <Cell className="w-28 text-end font-mono font-bold">{money(lineNet)}</Cell>
            </tr>
          );
        })}
        {hasAnyDiscount ? (
          <>
            <tr>
              <Cell colSpan={labelColSpan} className="text-end">المجموع</Cell>
              <Cell className="text-end font-mono">{money(grossAmount)}</Cell>
            </tr>
            <tr>
              <Cell colSpan={labelColSpan} className="text-end">الخصم</Cell>
              <Cell className="text-end font-mono">{money(totalDiscount)}</Cell>
            </tr>
            <tr>
              <Cell colSpan={labelColSpan} className="text-end font-bold">الصافي</Cell>
              <Cell className="text-end font-mono font-bold">{money(invoice.total_amount)}</Cell>
            </tr>
          </>
        ) : (
          <tr>
            <Cell colSpan={labelColSpan} className="text-end font-bold">الإجمالي</Cell>
            <Cell className="text-end font-mono font-bold">{money(invoice.total_amount)}</Cell>
          </tr>
        )}
        <tr>
          <Cell colSpan={labelColSpan} className="text-end">المدفوع</Cell>
          <Cell className="text-end font-mono">{money(invoice.amount_paid)}</Cell>
        </tr>
        {invoice.outstanding > 0 && (
          <tr>
            <Cell colSpan={labelColSpan} className="text-end font-bold">المتبقي على العميل</Cell>
            <Cell className="text-end font-mono font-bold">{money(invoice.outstanding)}</Cell>
          </tr>
        )}
      </PrintTable>
    </PrintDocument>
  );
};

/** A priced preview the client takes home. */
export const QuotationDocument: React.FC<{ quotation: Quotation }> = ({ quotation }) => {
  const lines = quotation.lines ?? [];
  const hasLineDiscount = lines.some((l) => Number(l.discount_amount || 0) > 0);
  const lineDiscountsSum = lines.reduce((s, l) => s + Number(l.discount_amount || 0), 0);
  const invoiceDiscount = Number(quotation.invoice_discount || 0);
  const totalDiscount = lineDiscountsSum + invoiceDiscount;
  const grossAmount =
    quotation.gross_amount !== undefined && quotation.gross_amount !== null
      ? Number(quotation.gross_amount)
      : Number(quotation.total_amount) + totalDiscount;
  const hasAnyDiscount = totalDiscount > 0;
  const labelColSpan = hasLineDiscount ? 5 : 4;

  return (
    <PrintDocument
      title="عرض سعر"
      number={quotation.quotation_number}
      date={quotation.created_at}
      issuer={quotation.operating_unit?.name}
      meta={[
        { label: "العميل", value: quotation.client?.entity?.name ?? "—" },
        { label: "الهاتف", value: quotation.client?.entity?.primary_contact?.phone ?? "—" },
        { label: "صالح حتى", value: formatDate(quotation.valid_until) },
        { label: "أعدّه", value: quotation.created_by?.name ?? "—" },
      ]}
      footerNote="هذا عرض سعر وليس فاتورة — الأسعار سارية حتى التاريخ المذكور أعلاه"
      showInvoiceTerms
    >
      <PrintTable
        head={
          hasLineDiscount
            ? ["#", "البيان", "الكمية", "سعر الوحدة", "الخصم", "الإجمالي"]
            : ["#", "البيان", "الكمية", "سعر الوحدة", "الإجمالي"]
        }
      >
        {lines.map((line, i) => {
          const size = formatSizeCm(line.length_m, line.width_m, line.height_m);
          const lineDiscount = Number(line.discount_amount || 0);
          const lineNet = Number(line.quantity) * Number(line.unit_price) - lineDiscount;
          return (
            <tr key={line.id}>
              <Cell className="w-8 text-center">{i + 1}</Cell>
              <Cell>
                <div className="font-semibold">{line.description ?? line.bundle?.name ?? line.inventory_item?.name}</div>
                {size && <div className="text-[10px] text-gray-600">{size}</div>}
              </Cell>
              <Cell className="w-16 text-center font-mono">{qty(line.quantity)}</Cell>
              <Cell className="w-28 text-end font-mono">{money(line.unit_price)}</Cell>
              {hasLineDiscount && (
                <Cell className="w-24 text-end font-mono">{lineDiscount > 0 ? money(lineDiscount) : "—"}</Cell>
              )}
              <Cell className="w-28 text-end font-mono font-bold">{money(lineNet)}</Cell>
            </tr>
          );
        })}
        {hasAnyDiscount ? (
          <>
            <tr>
              <Cell colSpan={labelColSpan} className="text-end">المجموع</Cell>
              <Cell className="text-end font-mono">{money(grossAmount)}</Cell>
            </tr>
            <tr>
              <Cell colSpan={labelColSpan} className="text-end">الخصم</Cell>
              <Cell className="text-end font-mono">{money(totalDiscount)}</Cell>
            </tr>
            <tr>
              <Cell colSpan={labelColSpan} className="text-end font-bold">الصافي</Cell>
              <Cell className="text-end font-mono font-bold">{money(quotation.total_amount)}</Cell>
            </tr>
          </>
        ) : (
          <tr>
            <Cell colSpan={labelColSpan} className="text-end font-bold">الإجمالي</Cell>
            <Cell className="text-end font-mono font-bold">{money(quotation.total_amount)}</Cell>
          </tr>
        )}
      </PrintTable>
      {quotation.notes && <p className="text-[11px]">ملاحظات: {quotation.notes}</p>}
    </PrintDocument>
  );
};

/**
 * Receiving note — no prices. Each bundle is opened into its pieces with their
 * sizes and a box to tick, so the client counts what they take home.
 */
export const DeliveryNoteDocument: React.FC<{ note: DeliveryNote }> = ({ note }) => {
  let row = 0;
  return (
    <PrintDocument
      title="إذن استلام بضاعة"
      number={note.document_number}
      date={note.date}
      issuer={note.seller}
      meta={[
        { label: "العميل", value: note.buyer ?? "—" },
        { label: "الهاتف", value: note.buyer_phone ?? "—" },
        ...(note.delivery_address ? [{ label: "عنوان التوصيل", value: note.delivery_address }] : []),
        { label: "رقم البيع", value: <span className="font-mono">{note.sale_number}</span> },
      ]}
      signatures={["المستلم", "أمين المخزن", "المراجعة"]}
      footerNote="يرجى عدّ القطع ومطابقة المقاسات قبل التوقيع"
    >
      <PrintTable head={["#", "الصنف", "المقاس", "الكمية", "✓"]}>
        {note.lines.map((line, i) =>
          line.line_type === "bundle" ? (
            <React.Fragment key={i}>
              <tr className="bg-gray-50">
                <Cell colSpan={5} className="font-bold">
                  {line.description} {Number(line.quantity) !== 1 && <span className="font-mono">× {qty(line.quantity)}</span>}
                </Cell>
              </tr>
              {line.pieces.length === 0 ? (
                <tr>
                  <Cell colSpan={5} className="text-center text-gray-500">لم تُحدَّد قطع الحزمة بعد</Cell>
                </tr>
              ) : (
                line.pieces.map((piece) => (
                  <tr key={piece.id}>
                    <Cell className="w-8 text-center">{++row}</Cell>
                    <Cell>
                      {piece.item}
                      {piece.notes && <div className="text-[10px] text-gray-600">{piece.notes}</div>}
                    </Cell>
                    <Cell className="font-mono">{formatSizeCm(piece.length_m, piece.width_m, piece.height_m) ?? "—"}</Cell>
                    <Cell className="w-16 text-center font-mono font-bold">{qty(piece.quantity)}</Cell>
                    <Cell className="w-10" />
                  </tr>
                ))
              )}
            </React.Fragment>
          ) : (
            <tr key={i}>
              <Cell className="w-8 text-center">{++row}</Cell>
              <Cell>
                {line.description}
                {line.lot_number && <div className="text-[10px] text-gray-600">لوت {line.lot_number}</div>}
              </Cell>
              <Cell className="font-mono">{formatSizeCm(line.length_m, line.width_m, line.height_m) ?? "—"}</Cell>
              <Cell className="w-16 text-center font-mono font-bold">{qty(line.quantity)}</Cell>
              <Cell className="w-10" />
            </tr>
          ),
        )}
      </PrintTable>
    </PrintDocument>
  );
};

const errorOf = (err: unknown) => (err ? apiErrorPayload(err)?.message ?? "تعذّر تحميل المستند." : null);

export const SaleInvoiceDialog: React.FC<{ saleId: string | null; onClose: () => void }> = ({ saleId, onClose }) => {
  const { data, isLoading, error } = useInvoice(saleId ?? undefined, Boolean(saleId));
  return (
    <PrintDialog open={Boolean(saleId)} onClose={onClose} title="فاتورة المبيعات" isLoading={isLoading} error={errorOf(error)}>
      {data && <SaleInvoiceDocument invoice={data} />}
    </PrintDialog>
  );
};

export const DeliveryNoteDialog: React.FC<{ saleId: string | null; onClose: () => void }> = ({ saleId, onClose }) => {
  const { data, isLoading, error } = useDeliveryNote(saleId ?? undefined, Boolean(saleId));
  return (
    <PrintDialog open={Boolean(saleId)} onClose={onClose} title="إذن الاستلام (بدون أسعار)" isLoading={isLoading} error={errorOf(error)}>
      {data && <DeliveryNoteDocument note={data} />}
    </PrintDialog>
  );
};

export const QuotationPrintDialog: React.FC<{ quotationId: string | null; onClose: () => void }> = ({ quotationId, onClose }) => {
  const { data, isLoading, error } = useQuotation(quotationId);
  return (
    <PrintDialog open={Boolean(quotationId)} onClose={onClose} title="عرض السعر" isLoading={isLoading} error={errorOf(error)}>
      {data && <QuotationDocument quotation={data} />}
    </PrintDialog>
  );
};
