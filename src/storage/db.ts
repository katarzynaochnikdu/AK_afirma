import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sales_lines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_hash      TEXT NOT NULL,
  doc_type      TEXT NOT NULL,          -- 'invoice' | 'corrective'
  date          TEXT NOT NULL,          -- YYYY-MM-DD
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,       -- 1-12
  product_code  TEXT NOT NULL,
  product_name  TEXT NOT NULL DEFAULT '',
  amount        REAL NOT NULL,          -- ilosc (ujemna dla korekt)
  netto         REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sales_doc   ON sales_lines(doc_hash);
CREATE INDEX IF NOT EXISTS idx_sales_ym    ON sales_lines(year, month);
CREATE INDEX IF NOT EXISTS idx_sales_code  ON sales_lines(product_code);

CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Otwiera baze, tworzy katalog i schemat jesli trzeba. */
export function openDb(dbPath: string): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}
