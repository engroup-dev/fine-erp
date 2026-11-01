export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null;
  /** Decimal places for a number value (default 2). */
  decimals?: number;
}

const BOM = "\uFEFF";

function quote(field: string): string {
  return `"${field.replace(/"/g, '""')}"`;
}

/** Cells a spreadsheet would run as a formula (CSV injection); a leading ' keeps them text. */
const FORMULA_START = /^[=+\-@\t\r]/;
/** A plain signed number ("-1500.25") is data, not a formula — left as is so it stays numeric. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

function format(value: string | number | null, decimals = 2): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? value.toFixed(decimals) : "";
  return FORMULA_START.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => quote(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => quote(format(c.value(row), c.decimals))).join(",")),
  ];
  return BOM + lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

/**
 * Save a blob under `filename` — a browser download, or Electron's save dialog. The
 * object URL is released a minute later so a large file (W6-03 backups) is not cut off.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
