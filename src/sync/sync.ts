import type { ProductCodeField } from "../config";
import type { AfakturyClient } from "../afaktury/client";
import type { ApiInvoice, ApiCorrective, ListParams } from "../afaktury/types";
import type { SalesRepository } from "../storage/repository";
import { buildProductIndex } from "../domain/normalize";
import { buildSalesLines } from "../domain/aggregate";
import { generateMockDataset } from "./mock";

export interface SyncSummary {
  documents: number;
  lines: number;
  source: "mock" | "api";
}

type Logger = (msg: string) => void;
const noop: Logger = () => {};

/** Wypelnia baze danymi przykladowymi (bez API). */
export function syncFromMock(
  repo: SalesRepository,
  field: ProductCodeField,
  log: Logger = noop
): SyncSummary {
  const { products, invoices, correctives } = generateMockDataset();
  log(`Mock: ${products.length} produktow, ${invoices.length} faktur, ${correctives.length} korekt`);
  const catalog = buildProductIndex(products);
  const lines = buildSalesLines(invoices, correctives, catalog, { field });
  repo.clearAll();
  repo.replaceLinesByDocument(lines);
  log(`Zapisano ${lines.length} pozycji sprzedazy.`);
  return { documents: invoices.length + correctives.length, lines: lines.length, source: "mock" };
}

/**
 * Prawdziwa synchronizacja z API afaktury.pl.
 * Kolejnosc: katalog produktow -> faktury (z doladowaniem pozycji) -> korekty.
 */
export async function syncFromApi(
  repo: SalesRepository,
  client: AfakturyClient,
  opts: { field: ProductCodeField; dateBegin?: string; dateEnd?: string },
  log: Logger = noop
): Promise<SyncSummary> {
  // 1) katalog produktow (do rozwiazywania kodu pozycji)
  log("Pobieram katalog produktow...");
  const products = [];
  for await (const p of client.paginate((page, count) =>
    client.productListPage({ page, count })
  )) {
    products.push(p);
  }
  const catalog = buildProductIndex(products);
  log(`Katalog: ${products.length} produktow.`);

  const listFilter: ListParams = {};
  if (opts.dateBegin) listFilter.dateBegin = opts.dateBegin;
  if (opts.dateEnd) listFilter.dateEnd = opts.dateEnd;

  let documents = 0;
  let lines = 0;

  // 2) faktury — doladuj pozycje gdy /list ich nie zawiera
  log("Pobieram faktury...");
  for await (const header of client.paginate((page, count) =>
    client.invoiceListPage({ ...listFilter, page, count })
  )) {
    const full: ApiInvoice =
      header.products && header.products.length > 0
        ? header
        : await client.invoice(header.hash);
    const docLines = buildSalesLines([full], [], catalog, { field: opts.field });
    repo.replaceDocumentLines(full.hash, docLines);
    documents++;
    lines += docLines.length;
  }
  log(`Faktury: ${documents} dokumentow.`);

  // 3) korekty
  log("Pobieram korekty...");
  for await (const header of client.paginate((page, count) =>
    client.correctiveListPage({ ...listFilter, page, count })
  )) {
    const full: ApiCorrective =
      header.products && header.products.length > 0
        ? header
        : await client.corrective(header.hash);
    const docLines = buildSalesLines([], [full], catalog, { field: opts.field });
    repo.replaceDocumentLines(full.hash, docLines);
    documents++;
    lines += docLines.length;
  }

  repo.setSyncState("lastSync", new Date().toISOString());
  if (opts.dateEnd) repo.setSyncState("lastSyncDateEnd", opts.dateEnd);
  log(`Gotowe. Dokumentow: ${documents}, pozycji: ${lines}.`);
  return { documents, lines, source: "api" };
}
