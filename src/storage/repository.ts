import type { DB } from "./db";
import { openDb } from "./db";
import type { SalesLine, MonthlyCell } from "../domain/types";

export interface ReportFilter {
  from?: string; // 'YYYY-MM'
  to?: string; // 'YYYY-MM'
  productCode?: string;
}

export interface ProductRef {
  code: string;
  name: string;
}

/** Warstwa dostepu do lokalnego cache sprzedazy. */
export class SalesRepository {
  private db: DB;

  constructor(dbPath: string) {
    this.db = openDb(dbPath);
  }

  /** Zastepuje wszystkie pozycje danego dokumentu (idempotentny upsert po hash). */
  replaceDocumentLines(docHash: string, lines: SalesLine[]): void {
    const del = this.db.prepare("DELETE FROM sales_lines WHERE doc_hash = ?");
    const ins = this.db.prepare(
      `INSERT INTO sales_lines
        (doc_hash, doc_type, date, year, month, product_code, product_name, amount, netto)
       VALUES (@docHash, @docType, @date, @year, @month, @productCode, @productName, @amount, @netto)`
    );
    const tx = this.db.transaction((rows: SalesLine[]) => {
      del.run(docHash);
      for (const r of rows) ins.run(r);
    });
    tx(lines);
  }

  /** Wstawia partie pozycji, grupujac po dokumencie (uzywane przy pelnym imporcie). */
  replaceLinesByDocument(lines: SalesLine[]): void {
    const byDoc = new Map<string, SalesLine[]>();
    for (const l of lines) {
      const arr = byDoc.get(l.docHash) || [];
      arr.push(l);
      byDoc.set(l.docHash, arr);
    }
    for (const [hash, rows] of byDoc) this.replaceDocumentLines(hash, rows);
  }

  clearAll(): void {
    this.db.exec("DELETE FROM sales_lines;");
  }

  private static ym(v: string): number {
    // 'YYYY-MM' -> liczba porownywalna YYYYMM
    const [y, m] = v.split("-");
    return Number(y) * 100 + Number(m);
  }

  /** Zagregowany raport: kod produktu x miesiac (z sumowaniem korekt). */
  monthlyReport(filter: ReportFilter = {}): MonthlyCell[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.from) {
      where.push("(year * 100 + month) >= @from");
      params.from = SalesRepository.ym(filter.from);
    }
    if (filter.to) {
      where.push("(year * 100 + month) <= @to");
      params.to = SalesRepository.ym(filter.to);
    }
    if (filter.productCode) {
      where.push("product_code = @code");
      params.code = filter.productCode;
    }
    const sql = `
      SELECT product_code AS productCode,
             MAX(product_name) AS productName,
             year, month,
             SUM(amount) AS qty,
             SUM(netto)  AS netto
      FROM sales_lines
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY product_code, year, month
      ORDER BY year, month, qty DESC, product_code`;
    return this.db.prepare(sql).all(params) as MonthlyCell[];
  }

  /** Lista rozpoznanych pozycji (do filtra w dashboardzie). */
  products(): ProductRef[] {
    return this.db
      .prepare(
        `SELECT product_code AS code, MAX(product_name) AS name
         FROM sales_lines
         WHERE product_code <> ''
         GROUP BY product_code
         ORDER BY name, code`
      )
      .all() as ProductRef[];
  }

  /** Lista miesiecy obecnych w danych ('YYYY-MM'). */
  months(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT year, month FROM sales_lines ORDER BY year, month`
      )
      .all() as { year: number; month: number }[];
    return rows.map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`);
  }

  count(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM sales_lines").get() as { n: number }).n;
  }

  getSyncState(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM sync_state WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  setSyncState(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO sync_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }
}
