/** Typy domenowe — niezalezne od ksztaltu API afaktury.pl. */

export type DocType = "invoice" | "corrective";

/** Pojedyncza pozycja sprzedazy sprowadzona do wspolnej postaci. */
export interface SalesLine {
  docHash: string;
  docType: DocType;
  date: string; // YYYY-MM-DD (data sprzedazy, fallback: data utworzenia)
  year: number;
  month: number; // 1-12
  productCode: string; // kanoniczny kod (ISBN/EAN lub SKU); "" gdy nierozpoznany
  productName: string;
  amount: number; // ilosc; UJEMNA dla korekt/zwrotow
  netto: number;
}

/** Zagregowana sprzedaz jednej pozycji w jednym miesiacu. */
export interface MonthlyCell {
  productCode: string;
  productName: string;
  year: number;
  month: number;
  qty: number; // suma amount (netto ilosciowe, po korektach)
  netto: number;
}
