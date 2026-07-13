import type { AppConfig } from "../config";
import type {
  ApiInvoice,
  ApiCorrective,
  ApiProduct,
  ListParams,
} from "./types";

/**
 * Klient HTTP API afaktury.pl.
 *
 * Fakty z dokumentacji (https://afaktury.pl/api,0,60/):
 * - JSON REST, bazowy URL https://afaktury.pl/api/<modul> (modul malymi literami).
 * - Autoryzacja naglowkami: (afakturyId + afakturyKey) LUB afakturyToken.
 * - GET przekazuje parametry jako JSON w query `?data=<urlencoded JSON>`.
 * - Lista: GET /api/<modul>/list z paginacja (page, count) i filtrami dat.
 *
 * `⚠️ ZWERYFIKUJ` realnym wywolaniem: dokladny ksztalt koperty odpowiedzi (bare array
 * vs {data:[...]}) oraz czy /list zawiera zagniezdzone `products`. Klient jest napisany
 * tolerancyjnie na oba przypadki — patrz extractArray() i syncFullInvoices w warstwie sync.
 */
export class AfakturyClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  /** Minimalny odstep miedzy zadaniami (ms) — lagodny ruch ogranicza challenge Cloudflare. */
  private readonly minDelayMs = 500;
  private lastRequestAt = 0;

  constructor(cfg: AppConfig["afaktury"]) {
    this.baseUrl = cfg.baseUrl;
    this.headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      // WYMAGANE: API jest za Cloudflare — bez przegladarkowego User-Agent zwraca
      // 403 "Just a moment..." (challenge antybotowy). Potwierdzone probem na zywo.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept-Language": "pl-PL,pl;q=0.9",
    };
    if (cfg.token) {
      this.headers["afakturyToken"] = cfg.token;
    } else if (cfg.id && cfg.key) {
      this.headers["afakturyId"] = cfg.id;
      this.headers["afakturyKey"] = cfg.key;
    } else {
      throw new Error(
        "Brak danych autoryzacji afaktury.pl (ustaw AFAKTURY_ID+AFAKTURY_KEY lub AFAKTURY_TOKEN)."
      );
    }
  }

  private async throttle(): Promise<void> {
    const wait = this.minDelayMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  /**
   * GET z parametrami jako JSON w query `data`.
   * Ponawia z backoffem na: bledzie sieci, 429/5xx oraz challenge Cloudflare
   * (API bywa blokowane przez Cloudflare przy szybkim ruchu serwer-serwer).
   */
  private async get<T>(pathname: string, data: unknown): Promise<T> {
    const url = new URL(`${this.baseUrl}/${pathname}`);
    if (data !== undefined) url.searchParams.set("data", JSON.stringify(data));

    const maxRetries = 4;
    for (let attempt = 0; ; attempt++) {
      await this.throttle();
      let res: Response;
      try {
        res = await fetch(url, { method: "GET", headers: this.headers });
      } catch (err) {
        if (attempt < maxRetries) {
          await this.backoff(attempt);
          continue;
        }
        throw new Error(`Blad sieci przy GET ${pathname}: ${(err as Error).message}`);
      }

      const body = await res.text();
      const isChallenge =
        body.includes("Just a moment") || body.includes("challenge-platform");

      // Challenge Cloudflare lub 429/5xx -> ponow z rosnacym odstepem.
      if (isChallenge || res.status === 429 || res.status >= 500) {
        if (attempt < maxRetries) {
          await this.backoff(attempt, isChallenge);
          continue;
        }
        if (isChallenge) {
          throw new Error(
            `API afaktury.pl GET ${pathname}: uporczywie blokowane przez Cloudflare (challenge). ` +
              `To ochrona antybotowa afaktury.pl, nie blad klucza. Zwolnij tempo syncu ` +
              `lub skontaktuj sie z afaktury.pl w sprawie dostepu API (whitelist IP/klucza).`
          );
        }
        throw new Error(
          `API afaktury.pl GET ${pathname} -> HTTP ${res.status}: ${body.slice(0, 300)}`
        );
      }
      if (!res.ok) {
        throw new Error(
          `API afaktury.pl GET ${pathname} -> HTTP ${res.status}: ${body.slice(0, 500)}`
        );
      }
      return this.unwrap<T>(body, pathname);
    }
  }

  /** Rosnacy odstep miedzy ponowieniami (challenge dostaje dluzszy). */
  private async backoff(attempt: number, longer = false): Promise<void> {
    const base = longer ? 2000 : 700;
    await new Promise((r) => setTimeout(r, base * (attempt + 1)));
  }

  /**
   * Rozpakowuje koperte odpowiedzi afaktury.pl (potwierdzona na zywo):
   *   sukces: {"result": true, "errors": [], "messages": ["Objects read"], "return": [ ...rekordy... ]}
   *   blad:   {"result": false, "errors": ["Invalid authentication"], "messages": []}
   * UWAGA: bledy przychodza jako HTTP 200 — sprawdzamy tresc, nie status.
   * Dane sa pod kluczem `return` (NIE `result` — to tylko flaga bool).
   */
  private unwrap<T>(body: string, pathname: string): T {
    if (!body) return {} as T;
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`API afaktury.pl GET ${pathname}: odpowiedz nie jest JSON-em: ${body.slice(0, 200)}`);
    }
    if (json && typeof json === "object" && "result" in (json as object)) {
      const env = json as { result?: unknown; errors?: unknown[]; return?: unknown };
      const failed = env.result === false || (Array.isArray(env.errors) && env.errors.length > 0);
      if (failed) {
        const msg = Array.isArray(env.errors) && env.errors.length ? env.errors.join("; ") : "nieznany blad";
        throw new Error(`API afaktury.pl GET ${pathname}: ${msg}`);
      }
      // sukces: rekordy sa pod `return`
      if ("return" in env) return env.return as T;
    }
    return json as T;
  }

  /**
   * Wyjmuje tablice rekordow z odpowiedzi listy niezaleznie od koperty
   * (bare array, {data:[...]}, {list:[...]}, {items:[...]}, {rows:[...]}).
   */
  private extractArray<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (payload && typeof payload === "object") {
      for (const k of ["return", "data", "list", "items", "rows", "invoices"]) {
        const v = (payload as Record<string, unknown>)[k];
        if (Array.isArray(v)) return v as T[];
      }
    }
    return [];
  }

  /** GET pojedynczego obiektu — `return` bywa tablica jednoelementowa. */
  private first<T>(payload: unknown): T {
    return (Array.isArray(payload) ? payload[0] : payload) as T;
  }

  /** Jedna strona listy faktur. */
  async invoiceListPage(params: ListParams): Promise<ApiInvoice[]> {
    return this.extractArray<ApiInvoice>(await this.get("invoice/list", params));
  }

  /** Pojedyncza faktura po hash — zawiera pelne `products`. */
  async invoice(hash: string): Promise<ApiInvoice> {
    return this.first<ApiInvoice>(await this.get("invoice", { hash }));
  }

  /** Jedna strona listy korekt. */
  async correctiveListPage(params: ListParams): Promise<ApiCorrective[]> {
    return this.extractArray<ApiCorrective>(await this.get("corrective/list", params));
  }

  async corrective(hash: string): Promise<ApiCorrective> {
    return this.first<ApiCorrective>(await this.get("corrective", { hash }));
  }

  /** Jedna strona katalogu produktow. */
  async productListPage(params: ListParams): Promise<ApiProduct[]> {
    return this.extractArray<ApiProduct>(await this.get("product/list", params));
  }

  /**
   * Iteruje wszystkie strony danego zasobu az do pustej strony.
   * `fetchPage` dostaje numer strony i zwraca rekordy tej strony.
   */
  async *paginate<T>(
    fetchPage: (page: number, count: number) => Promise<T[]>,
    count = 100
  ): AsyncGenerator<T> {
    let page = 1;
    // zabezpieczenie przed nieskonczona petla
    const maxPages = 10_000;
    while (page <= maxPages) {
      const rows = await fetchPage(page, count);
      if (rows.length === 0) return;
      for (const row of rows) yield row;
      if (rows.length < count) return; // ostatnia (niepelna) strona
      page++;
    }
  }
}
