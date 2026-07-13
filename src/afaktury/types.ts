/**
 * Typy odpowiedzi API afaktury.pl (podzbior pol istotny dla raportu sprzedazy).
 * Zrodlo: https://afaktury.pl/api,0,60/ (moduly Invoice, InvoiceProduct, Product,
 * Corrective, CorrectiveProduct). Pelny obiekt ma znacznie wiecej pol — tu tylko to,
 * czego uzywa agregacja. Pola oznaczone `?` bywaja nieobecne w odpowiedziach listowych.
 */

/** Klucz obcy w API afaktury.pl bywa obiektem {id} albo goła liczbą. */
export type ApiRef = { id: number | null } | number | null;

/** Liczby przychodzą z API jako stringi (np. "1.00000") lub liczby. */
export type ApiNumber = number | string;

/** Pozycja faktury (InvoiceProduct) — zagniezdzona w obiekcie Invoice (klucz `return`). */
export interface ApiInvoiceProduct {
  name?: string;
  amount: ApiNumber; // ilosc
  netto?: ApiNumber;
  brutto?: ApiNumber;
  /** Powiazanie z katalogiem Product: {id} (id bywa null dla pozycji wpisanej z reki). */
  product?: ApiRef;
  /** EAN/ISBN bywa podany bezposrednio na pozycji. */
  ean?: string;
}

/** Faktura (Invoice). `hash` to identyfikator do GET/PUT/DELETE. */
export interface ApiInvoice {
  hash: string;
  number?: string;
  dateCreate?: string; // YYYY-MM-DD
  dateSell?: string; // YYYY-MM-DD — data sprzedazy (uzywana do miesiaca)
  netto?: ApiNumber;
  brutto?: ApiNumber;
  client?: ApiRef;
  /** Pozycje — zagniezdzone w odpowiedzi /list (potwierdzone na zywo). */
  products?: ApiInvoiceProduct[];
}

/** Pozycja korekty (CorrectiveProduct) — `amount` moze byc UJEMNE. */
export interface ApiCorrectiveProduct {
  name?: string;
  amount: ApiNumber; // moze byc ujemne (zwrot / zmniejszenie)
  netto?: ApiNumber;
  brutto?: ApiNumber;
  product?: ApiRef;
  ean?: string;
}

/** Faktura korygujaca (Corrective). */
export interface ApiCorrective {
  hash: string;
  number?: string;
  dateCreate?: string;
  dateSell?: string;
  products?: ApiCorrectiveProduct[];
}

/** Produkt z katalogu (Product). */
export interface ApiProduct {
  id: number;
  name?: string;
  ean?: string; // EAN-13 / ISBN
  productNumber?: string; // SKU
  pkwiu?: string;
}

/** Parametry filtrujace GET /api/<modul>/list. */
export interface ListParams {
  page?: number;
  count?: number;
  dateBegin?: string; // YYYY-MM-DD
  dateEnd?: string; // YYYY-MM-DD
  year?: number;
  month?: number;
  product?: string;
  sortItem?: number;
  sortDir?: "a" | "d";
}
