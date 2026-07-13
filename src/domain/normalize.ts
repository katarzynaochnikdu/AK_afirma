import type { ProductCodeField } from "../config";
import type { ApiProduct } from "../afaktury/types";

/**
 * Normalizacja kodu produktu do postaci kanonicznej.
 * ISBN/EAN: usun spacje i myslniki, wielkie litery (dla ISBN z 'X').
 */
export function normalizeCode(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/** Indeks katalogu produktow po ID dla szybkiego rozwiazywania kodu pozycji. */
export type ProductIndex = Map<number, ApiProduct>;

export function buildProductIndex(products: ApiProduct[]): ProductIndex {
  const idx: ProductIndex = new Map();
  for (const p of products) idx.set(p.id, p);
  return idx;
}

export interface ResolvedProduct {
  code: string;
  name: string;
}

/** Wyciaga liczbowe id z klucza obcego API (obiekt {id} albo gola liczba). */
function refId(ref: { id: number | null } | number | null | undefined): number | undefined {
  if (ref == null) return undefined;
  if (typeof ref === "number") return ref;
  return ref.id ?? undefined;
}

/**
 * Ustala kanoniczny kod i nazwe pozycji.
 * Priorytet kodu:
 *   1. wybrane pole (`ean` lub `productNumber`) z katalogu Product po id pozycji,
 *   2. `ean` podany bezposrednio na pozycji,
 *   3. drugie pole katalogu (fallback),
 *   4. NAZWA pozycji (fallback dla pozycji wpisanych z reki, bez ISBN/SKU),
 *   5. pusty -> pozycja calkiem bez identyfikacji (odfiltrowana).
 */
export function resolveProduct(
  line: { product?: { id: number | null } | number | null; ean?: string; name?: string },
  catalog: ProductIndex,
  field: ProductCodeField
): ResolvedProduct {
  const pid = refId(line.product);
  const cat = pid != null ? catalog.get(pid) : undefined;
  const secondaryField: ProductCodeField = field === "ean" ? "productNumber" : "ean";

  let code = normalizeCode(cat ? cat[field] : undefined);
  if (!code) code = normalizeCode(line.ean);
  if (!code && cat) code = normalizeCode(cat[secondaryField]);

  const name = (cat?.name || line.name || "").trim();
  // Fallback: gdy brak ISBN/SKU, grupuj po nazwie (lepsze niz gubienie pozycji).
  if (!code) code = name;
  return { code, name };
}
