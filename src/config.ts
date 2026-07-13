import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

export type ProductCodeField = "ean" | "productNumber";

export interface AppConfig {
  afaktury: {
    baseUrl: string;
    /** Para id + klucz LUB pojedynczy token. */
    id?: string;
    key?: string;
    token?: string;
  };
  /** Czy mamy komplet danych do prawdziwych wywolan API. */
  hasCredentials: boolean;
  productCodeField: ProductCodeField;
  port: number;
  dbPath: string;
}

function readProductCodeField(): ProductCodeField {
  const v = (process.env.PRODUCT_CODE_FIELD || "ean").trim();
  return v === "productNumber" ? "productNumber" : "ean";
}

export function loadConfig(): AppConfig {
  // Akceptujemy zarowno nasze nazwy (AFAKTURY_*), jak i nazwy z panelu/srodowiska
  // uzytkownika (afaktura_id_konta / afaktura_klucz).
  const id =
    process.env.AFAKTURY_ID?.trim() || process.env.afaktura_id_konta?.trim() || undefined;
  const key =
    process.env.AFAKTURY_KEY?.trim() || process.env.afaktura_klucz?.trim() || undefined;
  const token =
    process.env.AFAKTURY_TOKEN?.trim() || process.env.afaktura_token?.trim() || undefined;
  const hasCredentials = Boolean(token || (id && key));

  return {
    afaktury: {
      baseUrl: (process.env.AFAKTURY_BASE_URL || "https://afaktury.pl/api").replace(/\/+$/, ""),
      id,
      key,
      token,
    },
    hasCredentials,
    productCodeField: readProductCodeField(),
    port: Number(process.env.PORT || 3000),
    dbPath: path.resolve(process.env.DB_PATH || "data/sprzedaz.sqlite"),
  };
}
