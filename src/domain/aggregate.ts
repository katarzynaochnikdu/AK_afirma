import type { ProductCodeField } from "../config";
import type {
  ApiInvoice,
  ApiCorrective,
  ApiInvoiceProduct,
  ApiCorrectiveProduct,
} from "../afaktury/types";
import type { ProductIndex } from "./normalize";
import { resolveProduct } from "./normalize";
import type { SalesLine, MonthlyCell, DocType } from "./types";

/** Wyciaga (year, month) z daty YYYY-MM-DD; null gdy brak/niepoprawna. */
export function parseYearMonth(date: string | undefined): { year: number; month: number } | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})/.exec(date);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

interface MapOptions {
  field: ProductCodeField;
  /** Pomijaj pozycje bez rozpoznanego kodu (wysylka/usluga). Domyslnie true. */
  dropUncoded?: boolean;
}

function lineFromProduct(
  doc: { hash: string; dateSell?: string; dateCreate?: string },
  p: ApiInvoiceProduct | ApiCorrectiveProduct,
  docType: DocType,
  catalog: ProductIndex,
  opts: MapOptions
): SalesLine | null {
  const date = doc.dateSell || doc.dateCreate;
  const ym = parseYearMonth(date);
  if (!ym) return null;

  const { code, name } = resolveProduct(p, catalog, opts.field);
  if (!code && opts.dropUncoded !== false) return null;

  return {
    docHash: doc.hash,
    docType,
    date: date as string,
    year: ym.year,
    month: ym.month,
    productCode: code,
    productName: name,
    amount: Number(p.amount) || 0,
    netto: Number(p.netto) || 0,
  };
}

/** Sprowadza faktury i korekty do plaskiej listy pozycji sprzedazy. */
export function buildSalesLines(
  invoices: ApiInvoice[],
  correctives: ApiCorrective[],
  catalog: ProductIndex,
  opts: MapOptions
): SalesLine[] {
  const lines: SalesLine[] = [];
  for (const inv of invoices) {
    for (const p of inv.products || []) {
      const line = lineFromProduct(inv, p, "invoice", catalog, opts);
      if (line) lines.push(line);
    }
  }
  for (const cor of correctives) {
    for (const p of cor.products || []) {
      const line = lineFromProduct(cor, p, "corrective", catalog, opts);
      if (line) lines.push(line);
    }
  }
  return lines;
}

const cellKey = (code: string, year: number, month: number) => `${code}|${year}|${month}`;

/** Agreguje pozycje do komorek (kod produktu x miesiac), sumujac ilosc i netto. */
export function aggregateMonthly(lines: SalesLine[]): MonthlyCell[] {
  const map = new Map<string, MonthlyCell>();
  for (const l of lines) {
    if (!l.productCode) continue;
    const key = cellKey(l.productCode, l.year, l.month);
    const cell = map.get(key);
    if (cell) {
      cell.qty += l.amount;
      cell.netto += l.netto;
      if (!cell.productName && l.productName) cell.productName = l.productName;
    } else {
      map.set(key, {
        productCode: l.productCode,
        productName: l.productName,
        year: l.year,
        month: l.month,
        qty: l.amount,
        netto: l.netto,
      });
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      a.year - b.year ||
      a.month - b.month ||
      b.qty - a.qty ||
      a.productCode.localeCompare(b.productCode)
  );
}
