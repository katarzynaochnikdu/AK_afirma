import * as fs from "fs";
import * as path from "path";

/**
 * Generator danych demo dla statycznej strony (GitHub Pages, docs/data.js).
 * Samodzielny koncept "panelu wydawcy": autorzy -> ksiazki -> sprzedaz miesieczna
 * z rabatami i zwrotami + rozliczenia kwartalne tantiem. Dane FIKCYJNE,
 * deterministyczne (seed), niezalezne od integracji w src/.
 */

// Deterministyczny PRNG (mulberry32)
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

interface Author {
  id: number;
  name: string;
  mail: string;
  rate: number; // stawka tantiem od netto po rabatach
  slot: number; // kolor serii (1..5)
}

interface Book {
  code: string; // ISBN
  title: string;
  authorId: number;
  price: number; // cena netto egz.
  popularity: number;
  from?: string; // premiera 'YYYY-MM' (brak = od poczatku okresu)
}

const AUTHORS: Author[] = [
  { id: 1, name: "Maria Zawadzka", mail: "m.zawadzka@example.com", rate: 0.15, slot: 1 },
  { id: 2, name: "Jan Krajewski", mail: "j.krajewski@example.com", rate: 0.12, slot: 2 },
  { id: 3, name: "Anna Lipińska", mail: "a.lipinska@example.com", rate: 0.14, slot: 3 },
  { id: 4, name: "Tomasz Borowik", mail: "t.borowik@example.com", rate: 0.1, slot: 4 },
  { id: 5, name: "Ewa Malinowska", mail: "e.malinowska@example.com", rate: 0.15, slot: 5 },
];

const BOOKS: Book[] = [
  { code: "9788301111111", title: "Cień nad doliną", authorId: 1, price: 38.0, popularity: 1.0 },
  { code: "9788301555555", title: "Ostatni pociąg", authorId: 1, price: 40.0, popularity: 0.8 },
  { code: "9788301222222", title: "Atlas zapomnianych map", authorId: 2, price: 56.2, popularity: 0.55 },
  { code: "9788301777777", title: "Fizyka codzienności", authorId: 2, price: 44.8, popularity: 0.5 },
  { code: "9788301333333", title: "Kuchnia po nordycku", authorId: 3, price: 47.1, popularity: 0.85 },
  { code: "9788301666666", title: "Zielnik miejski", authorId: 3, price: 52.4, popularity: 0.4 },
  { code: "9788301444444", title: "Programowanie dla dzieci", authorId: 4, price: 32.4, popularity: 0.6 },
  { code: "9788301888888", title: "Bajki na dobranoc", authorId: 4, price: 28.5, popularity: 1.15 },
  { code: "9788301999999", title: "Listy z Prowansji", authorId: 5, price: 41.9, popularity: 0.7 },
  { code: "9788301000006", title: "Ogrody pamięci", authorId: 5, price: 45.7, popularity: 0.9, from: "2026-01" }, // premiera w trakcie
];

// 12 miesiecy = 4 pelne kwartaly: Q3'25..Q2'26
const MONTHS: string[] = [];
for (let m = 7; m <= 12; m++) MONTHS.push(`2025-${String(m).padStart(2, "0")}`);
for (let m = 1; m <= 6; m++) MONTHS.push(`2026-${String(m).padStart(2, "0")}`);

const QUARTERS = [
  { id: "2025-Q3", label: "III kwartał 2025", short: "Q3 2025", months: MONTHS.slice(0, 3) },
  { id: "2025-Q4", label: "IV kwartał 2025", short: "Q4 2025", months: MONTHS.slice(3, 6) },
  { id: "2026-Q1", label: "I kwartał 2026", short: "Q1 2026", months: MONTHS.slice(6, 9) },
  { id: "2026-Q2", label: "II kwartał 2026", short: "Q2 2026", months: MONTHS.slice(9, 12) },
];

// sezonowosc wydawnicza: szczyt przedswiateczny, dolek wakacyjny
const SEASON: Record<string, number> = {
  "07": 0.6, "08": 0.65, "09": 0.9, "10": 1.05, "11": 1.35, "12": 1.9,
  "01": 0.85, "02": 0.8, "03": 0.95, "04": 1.0, "05": 1.25, "06": 0.9,
};

function main() {
  const rand = rng(20260714);
  const round2 = (n: number) => Math.round(n * 100) / 100;

  interface Cell {
    code: string;
    ym: string;
    sold: number; // egz. sprzedane
    ret: number; // egz. zwrocone
    gross: number; // netto przed rabatami (od egz. netto)
    rebate: number; // kwota udzielonych rabatow
    netto: number; // netto po rabatach
  }
  const cells: Cell[] = [];

  for (const book of BOOKS) {
    for (const ym of MONTHS) {
      if (book.from && ym < book.from) continue; // przed premiera
      const mm = ym.slice(5);
      let season = SEASON[mm];
      // efekt premiery: pierwszy i drugi miesiac mocniejsze
      if (book.from) {
        const idx = MONTHS.indexOf(ym) - MONTHS.indexOf(book.from);
        if (idx === 0) season *= 2.2;
        else if (idx === 1) season *= 1.5;
      }
      const base = 26 * book.popularity * season;
      const sold = Math.max(2, Math.round(base * (0.75 + rand() * 0.5)));
      const ret = rand() < 0.28 ? Math.max(1, Math.round(sold * rand() * 0.08)) : 0;
      const qty = sold - ret;
      const gross = qty * book.price;
      // rabaty dystrybucyjne: czesc naklad idzie kanalem hurtowym
      const rebatePct = [0, 0.05, 0.1, 0.2, 0.35][Math.floor(rand() * 5 * 0.999)];
      const wholesaleShare = 0.3 + rand() * 0.5; // jaka czesc sprzedazy objeta rabatem
      const rebate = gross * rebatePct * wholesaleShare;
      cells.push({
        code: book.code,
        ym,
        sold,
        ret,
        gross: round2(gross),
        rebate: round2(rebate),
        netto: round2(gross - rebate),
      });
    }
  }

  const data = {
    generated: "demo — dane fikcyjne",
    publisher: {
      name: "Wydawnictwo Horyzont",
      mail: "rozliczenia@wydawnictwo-horyzont.pl",
    },
    months: MONTHS,
    quarters: QUARTERS,
    authors: AUTHORS.map((a) => ({ ...a, rate: a.rate })),
    books: BOOKS.map(({ popularity, ...b }) => b),
    cells,
  };

  const outDir = path.resolve("docs");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "data.js"),
    `// Auto-generowane (npm run build:demo). Dane przykladowe (fikcyjne).\nwindow.DEMO_DATA = ${JSON.stringify(data)};\n`,
    "utf8"
  );

  // szybka kontrola sum
  const totQty = cells.reduce((s, c) => s + c.sold - c.ret, 0);
  const totNetto = cells.reduce((s, c) => s + c.netto, 0);
  const totRebate = cells.reduce((s, c) => s + c.rebate, 0);
  console.log(
    `docs/data.js: ${cells.length} komorek | egz. netto: ${totQty} | netto: ${totNetto.toFixed(2)} zl | rabaty: ${totRebate.toFixed(2)} zl (${((totRebate / (totNetto + totRebate)) * 100).toFixed(1)}%)`
  );
}
main();
