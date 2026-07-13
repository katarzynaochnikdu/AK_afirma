import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductIndex } from "../src/domain/normalize";
import { buildSalesLines, aggregateMonthly, parseYearMonth } from "../src/domain/aggregate";
import type { ApiInvoice, ApiCorrective, ApiProduct } from "../src/afaktury/types";

const catalog = buildProductIndex([
  { id: 1, name: "Cien nad dolina", ean: "978-83-01-11111-1", productNumber: "SKU-1" },
  { id: 2, name: "Atlas map", ean: "9788301222222", productNumber: "SKU-2" },
] as ApiProduct[]);

test("parseYearMonth wyciaga rok i miesiac", () => {
  assert.deepEqual(parseYearMonth("2026-03-15"), { year: 2026, month: 3 });
  assert.equal(parseYearMonth(undefined), null);
  assert.equal(parseYearMonth("bzdura"), null);
});

test("kod produktu jest normalizowany (bez myslnikow, wielkie litery)", () => {
  const inv: ApiInvoice[] = [
    { hash: "A", dateSell: "2026-01-10", products: [{ amount: 3, netto: 10, product: 1 }] },
  ];
  const lines = buildSalesLines(inv, [], catalog, { field: "ean" });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].productCode, "9788301111111"); // myslniki usuniete
  assert.equal(lines[0].productName, "Cien nad dolina");
});

test("pozycja z nazwa ale bez ISBN/SKU jest liczona pod nazwa (fallback)", () => {
  const inv: ApiInvoice[] = [
    {
      hash: "B",
      dateSell: "2026-01-10",
      products: [
        { amount: 1, netto: 15, name: "Ksiazka spoza katalogu" }, // brak product/ean
        { amount: 2, netto: 20, product: { id: 2 } }, // klucz obcy jako {id}
      ],
    },
  ];
  const lines = buildSalesLines(inv, [], catalog, { field: "ean" });
  assert.equal(lines.length, 2);
  assert.equal(lines.find((l) => l.productName === "Ksiazka spoza katalogu")?.productCode, "Ksiazka spoza katalogu");
  assert.equal(lines.find((l) => l.productCode === "9788301222222")?.amount, 2);
});

test("pozycja bez nazwy i bez kodu jest pomijana", () => {
  const inv: ApiInvoice[] = [
    { hash: "B2", dateSell: "2026-01-10", products: [{ amount: 1, netto: 5 }] },
  ];
  assert.equal(buildSalesLines(inv, [], catalog, { field: "ean" }).length, 0);
});

test("korekty zmniejszaja sprzedaz (ujemny amount)", () => {
  const inv: ApiInvoice[] = [
    { hash: "C1", dateSell: "2026-02-05", products: [{ amount: 10, netto: 100, product: 1 }] },
  ];
  const cor: ApiCorrective[] = [
    { hash: "K1", dateSell: "2026-02-20", products: [{ amount: -3, netto: -30, product: 1 }] },
  ];
  const cells = aggregateMonthly(buildSalesLines(inv, cor, catalog, { field: "ean" }));
  assert.equal(cells.length, 1);
  assert.equal(cells[0].qty, 7); // 10 - 3
  assert.equal(cells[0].netto, 70);
});

test("agregacja grupuje po (kod, rok-miesiac)", () => {
  const inv: ApiInvoice[] = [
    { hash: "D1", dateSell: "2026-03-01", products: [{ amount: 5, netto: 50, product: 1 }] },
    { hash: "D2", dateSell: "2026-03-28", products: [{ amount: 2, netto: 20, product: 1 }] },
    { hash: "D3", dateSell: "2026-04-02", products: [{ amount: 4, netto: 40, product: 1 }] },
  ];
  const cells = aggregateMonthly(buildSalesLines(inv, [], catalog, { field: "ean" }));
  const march = cells.find((c) => c.month === 3);
  const april = cells.find((c) => c.month === 4);
  assert.equal(march?.qty, 7);
  assert.equal(april?.qty, 4);
});
