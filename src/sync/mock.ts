import type { ApiProduct, ApiInvoice, ApiCorrective } from "../afaktury/types";

/**
 * Generator danych przykladowych dla wydawnictwa — pozwala uruchomic i zobaczyc
 * dzialajacy dashboard BEZ klucza API. Dane sa deterministyczne (seed), wiec
 * `npm run seed` daje zawsze ten sam wynik.
 */

// Prosty deterministyczny PRNG (mulberry32)
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Title {
  id: number;
  isbn: string;
  name: string;
  price: number;
  popularity: number; // wzgledna sprzedaz
}

const TITLES: Title[] = [
  { id: 1, isbn: "978-83-01-11111-1", name: "Cien nad doliną", price: 39.9, popularity: 1.0 },
  { id: 2, isbn: "978-83-01-22222-2", name: "Atlas zapomnianych map", price: 59.0, popularity: 0.7 },
  { id: 3, isbn: "978-83-01-33333-3", name: "Kuchnia po nordycku", price: 49.5, popularity: 0.9 },
  { id: 4, isbn: "978-83-01-44444-4", name: "Programowanie dla dzieci", price: 34.0, popularity: 0.6 },
  { id: 5, isbn: "978-83-01-55555-5", name: "Ostatni pociąg", price: 42.0, popularity: 0.8 },
  { id: 6, isbn: "978-83-01-66666-6", name: "Zielnik miejski", price: 55.0, popularity: 0.4 },
  { id: 7, isbn: "978-83-01-77777-7", name: "Fizyka codzienności", price: 47.0, popularity: 0.5 },
  { id: 8, isbn: "978-83-01-88888-8", name: "Bajki na dobranoc", price: 29.9, popularity: 1.2 },
];

// Miesiace demo: 2025-08 .. 2026-06
const MONTHS: Array<{ year: number; month: number }> = [];
for (let i = 8; i <= 12; i++) MONTHS.push({ year: 2025, month: i });
for (let i = 1; i <= 6; i++) MONTHS.push({ year: 2026, month: i });

export interface MockDataset {
  products: ApiProduct[];
  invoices: ApiInvoice[];
  correctives: ApiCorrective[];
}

export function generateMockDataset(): MockDataset {
  const rand = rng(20260713);
  const products: ApiProduct[] = TITLES.map((t) => ({
    id: t.id,
    name: t.name,
    ean: t.isbn,
    productNumber: `SKU-${t.id}`,
  }));

  const invoices: ApiInvoice[] = [];
  const correctives: ApiCorrective[] = [];
  let inv = 0;
  let cor = 0;

  for (const { year, month } of MONTHS) {
    const mm = String(month).padStart(2, "0");
    // sezonowosc: grudzien i maj mocniejsze
    const season = month === 12 ? 1.8 : month === 5 ? 1.3 : 1.0;

    // kilka faktur w miesiacu, kazda z losowym zestawem tytulow
    const invoiceCount = 6 + Math.floor(rand() * 6);
    for (let k = 0; k < invoiceCount; k++) {
      const day = String(1 + Math.floor(rand() * 27)).padStart(2, "0");
      const nProducts = 1 + Math.floor(rand() * 4);
      const chosen = [...TITLES].sort(() => rand() - 0.5).slice(0, nProducts);
      const products_ = chosen.map((t) => {
        const qty = Math.max(1, Math.round(rand() * 8 * t.popularity * season));
        return {
          name: t.name,
          amount: qty,
          netto: +(t.price / 1.05).toFixed(2),
          brutto: t.price,
          product: t.id,
          ean: t.isbn,
        };
      });
      invoices.push({
        hash: `INV-${year}${mm}-${String(++inv).padStart(4, "0")}`,
        number: `${inv}/${mm}/${year}`,
        dateCreate: `${year}-${mm}-${day}`,
        dateSell: `${year}-${mm}-${day}`,
        products: products_,
      });
    }

    // sporadyczne zwroty (korekta z ujemna iloscia)
    if (rand() < 0.5) {
      const t = TITLES[Math.floor(rand() * TITLES.length)];
      const day = String(1 + Math.floor(rand() * 27)).padStart(2, "0");
      correctives.push({
        hash: `COR-${year}${mm}-${String(++cor).padStart(4, "0")}`,
        number: `K/${cor}/${mm}/${year}`,
        dateCreate: `${year}-${mm}-${day}`,
        dateSell: `${year}-${mm}-${day}`,
        products: [
          {
            name: t.name,
            amount: -(1 + Math.floor(rand() * 3)), // zwrot
            netto: -(+(t.price / 1.05).toFixed(2)),
            brutto: -t.price,
            product: t.id,
            ean: t.isbn,
          },
        ],
      });
    }
  }

  return { products, invoices, correctives };
}
