# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status:** projekt zakładany od zera — repozytorium jest jeszcze puste (brak kodu, brak `package.json`).
> Ten plik to **wytyczne startowe**, oparte na faktycznej dokumentacji API afaktury.pl
> (https://afaktury.pl/api,0,60/ oraz strony per-moduł). Sekcje `⚠️ ZWERYFIKUJ` wymagają potwierdzenia
> realnym wywołaniem API (konto Prestige) — nie zakładaj ich w implementacji, dopóki nie zobaczysz odpowiedzi.

## Cel biznesowy

Klientem jest **wydawnictwo**. Właściciel chce wiedzieć **ile sztuk konkretnej pozycji sprzedano w danym
miesiącu**. Źródłem prawdy o sprzedaży są **faktury** wystawiane w systemie **afaktury.pl**.

Cała wartość projektu sprowadza się do jednego przekształcenia:

```
faktury + korekty (afaktury.pl)  →  pozycje  →  agregacja: kod produktu × miesiąc = liczba sztuk (netto)
```

Wynik prezentowany jako **dashboard** (Node.js / TypeScript) z filtrowaniem po miesiącu i pozycji.

Konsekwencje dla każdej decyzji projektowej:
- **Pozycja dokumentu (`InvoiceProduct` / `CorrectiveProduct`) jest jednostką danych**, nie faktura.
  Liczy się linia: *powiązanie z produktem, ilość (`amount`), data dokumentu*.
- **Kod produktu wydawnictwa** to najpewniej **ISBN**, który w afaktury.pl siedzi w polu `ean` katalogu
  `Product` (EAN-13 == ISBN-13). Alternatywnie `productNumber` (wewnętrzny SKU). Patrz „Pułapki domenowe".

## API afaktury.pl — fakty potwierdzone z dokumentacji

**Transport i format:** REST-owe, **JSON** (nie XML — wcześniejsze materiały marketingowe były mylące).
Bazowy URL: **`https://afaktury.pl/api/<moduł>`** (w przykładach w docsach host jest zaślepką `https://faktura/…`
— realny host to `afaktury.pl`). Nagłówki `Content-Type: application/json`, `Accept: application/json`.

**Autoryzacja — nagłówki HTTP** (dwa warianty; użyj pary id+klucz):
```
afakturyId: <id konta>
afakturyKey: <klucz>
```
lub pojedynczy `afakturyToken: <token>`. Klucz jest w panelu: **Ustawienia → Klucz API** (plan **Prestige**).
W kodzie ładowane ze zmiennych środowiskowych `AFAKTURY_ID`, `AFAKTURY_KEY` z `.env` poza gitem —
**nigdy** wartości w repo ani w logach. (W panelu klienta te pola bywają podpisane `afaktura_id_konta` /
`afaktura_klucz` — to te same sekrety.)

**Wzorzec operacji (jednolity dla każdego modułu):**
| Operacja | Metoda | URL | Klucz w żądaniu |
|---|---|---|---|
| Pobierz obiekt | GET | `/api/<moduł>` | `hash` (dokumenty) lub `id` (słowniki) |
| Lista + filtry | GET | `/api/<moduł>/list` | patrz filtry niżej |
| Dodaj | POST | `/api/<moduł>` | pełny obiekt |
| Aktualizuj | PUT | `/api/<moduł>` | `hash`/`id` + pola |
| Usuń | DELETE | `/api/<moduł>` | `hash`/`id` |

**Dane żądania GET** przekazywane jako JSON w parametrze query `data` (`?data=<urlencoded JSON>`), nie w ciele.

**⚠️ Cloudflare (zweryfikowane na żywo!):** endpoint API stoi za Cloudflare z ochroną antybotową.
- **Wymagany przeglądarkowy `User-Agent`** — bez niego zawsze HTTP 403 „Just a moment..." (challenge).
  Klient (`src/afaktury/client.ts`) wysyła UA Chrome + `Accept-Language`.
- **Challenge eskaluje pod obciążeniem:** pierwsze żądania z tego samego IP przechodzą (HTTP 200), ale po
  kilkunastu szybkich zapytaniach Cloudflare zaczyna blokować wszystko (403). To **nie** błąd klucza.
  Dlatego klient: throttluje (≥500 ms/żądanie), ponawia challenge z backoffem, a po serii porażek rzuca
  czytelny błąd. **Ryzyko:** sync stronicujący wiele faktur może zostać zablokowany — patrz `⚠️ ZWERYFIKUJ` niżej.

**Koperta odpowiedzi (ROZSTRZYGNIĘTE na żywo — odczyt prawdziwej faktury):**
```json
sukces: {"result": true, "errors": [], "messages": ["Objects read"], "return": [ ...rekordy... ], "pages": N, "additional": {"yearmin","yearmax"}}
błąd:   {"result": false, "errors": ["Invalid authentication"], "messages": []}
```
- **Rekordy są pod kluczem `return`** (NIE `result` — to tylko flaga bool). Klient wyłuskuje je w `unwrap()`.
- **Błędy przychodzą jako HTTP 200** z `result:false` — nie polegaj na kodzie HTTP, czytaj `result`/`errors`.
- **Pozycje `products` są zagnieżdżone w `/invoice/list`** — N+1 (GET per hash) niepotrzebne (fallback zostaje).
- **Klucze obce to obiekty `{id:N}`** (np. `product:{id:null}`, `vat:{id:7}`, `client:{id:...}`), a **liczby
  bywają stringami** (`amount:"1.00000"`, `netto:"100.00"`). Kod to obsługuje: `refId()` + `Number()`.
- `messages[].token` to CSRF do zapisów, **nie** kursor odczytu (jako `afakturyToken` daje „Invalid authentication").
- `additional.yearmin:"1970"` = brak dokumentów danego typu (wartość domyślna pustego konta).
- **Kod pozycji bez ISBN/SKU:** gdy `product.id`, `ean` i katalog puste, agregacja grupuje po **nazwie**
  pozycji (`resolveProduct` — fallback), żeby nie gubić sprzedaży wpisanej z ręki.

**Filtry `/api/invoice/list`** (to rozwiązuje synchronizację przyrostową i raport miesięczny):
`page`, `count` (paginacja) · `dateBegin`+`dateEnd` **albo** `year`+`month` · `product` (fraza) ·
`sortItem`, `sortDir` · `payedKind`, `client`, `currency`, `payKind`. → miesiąc raportu = `year`+`month`,
sync przyrostowy = `dateBegin`/`dateEnd` po dacie.

## Moduły istotne dla projektu (reszta ~90 modułów nieistotna)

- **`Invoice`** — faktura VAT. Kluczowe pola: `hash` (identyfikator do GET/PUT/DELETE, **nie** numeryczne `id`),
  `number`, `dateCreate` (utworzenia), **`dateSell` (data sprzedaży)**, `netto`/`vat`/`brutto`,
  `client`, oraz **`products`: Array(`InvoiceProduct`) — pozycje są zagnieżdżone w obiekcie faktury**.
- **`InvoiceProduct`** — pozycja faktury. Pola m.in.: `name`, `amount` (**ilość**), `netto`/`brutto`, `vat`,
  `unit`, `rebate`, **`product`** (id → katalog `Product`), często też `ean` bezpośrednio na pozycji.
- **`Product`** — katalog produktów. Kod pozycji: **`ean` (ISBN dla książek)**, `productNumber` (SKU),
  `pkwiu`; plus `name`, `category` (`cat`), `producer`. Lista: `/api/product/list`.
- **`Corrective`** / **`CorrectiveProduct`** — faktury korygujące (zwroty/korekty). W `CorrectiveProduct`
  pole `amount` może być **ujemne** (zakres −2³¹…2³¹) — to jak system koduje zmniejszenie sprzedaży.
  **Trzeba je zsumować razem z pozycjami faktur, inaczej wynik jest zawyżony.**

`⚠️ ZWERYFIKUJ` które typy dokumentów wydawnictwo faktycznie wystawia — poza `Invoice` sprzedaż może być też
w `Bill` (Rachunek), `Invoicenovat` (bez VAT), `Invoicemargin` (marża), `Invoicerr` (RR). Proforma/Offer/Order
to **nie** sprzedaż — pomiń. Zacznij od `Invoice`+`Corrective`, dołóż resztę po potwierdzeniu z klientem.

## Architektura docelowa (warstwy)

Twardy rozdział warstw — nie mieszaj wywołań HTTP z logiką dashboardu:

1. **Klient API afaktury** — jedyne miejsce znające URL-e, nagłówki i kształt JSON afaktury.pl. Obsługuje
   paginację (`/list` strona po stronie), rate-limit i mapuje odpowiedzi **od razu na typy domenowe**.
2. **Warstwa domenowa / agregacja** — czysta logika, bez I/O: normalizacja kodów produktów, złożenie pozycji
   faktur i korekt, grupowanie po `(kodProduktu, rok-miesiąc)`, sumowanie `amount` (korekty ujemne). Testowalna.
3. **Składowanie (cache) — konieczne, nie opcjonalne.** API jest płatne i limitowane, więc dashboard **nie**
   odpytuje afaktury.pl na każde kliknięcie. Synchronizujemy dokumenty do lokalnego magazynu
   (**SQLite** domyślnie — jedno wydawnictwo) i dashboard czyta z magazynu. Sync przyrostowy po `dateSell`
   przez `dateBegin`/`dateEnd`; zapamiętuj `hash` żeby wykrywać zmiany/duplikaty.
4. **Backend dashboardu** — serwuje zagregowane dane z magazynu (nie z API na żywo).
5. **Frontend** — tabela kod × miesiąc + wykresy, filtry po miesiącu i pozycji.

**Zweryfikowane na żywo (prawdziwy klucz, konto testowe z 1 fakturą):** auth ✅, Cloudflare z UA ✅,
koperta `return` ✅, `products` w liście ✅, cały tor API→sync→SQLite→raport ✅ (raport zwrócił pozycję).

**`⚠️ ZOSTAJE do sprawdzenia na koncie z realnym wolumenem:**
1. **Cloudflare pod obciążeniem** — główne ryzyko. Konto testowe miało 1 fakturę; przy syncu setek/tysięcy
   (paginacja) zmierz, czy IP nie dostaje challenge. Jeśli blokuje: zwolnij tempo, zaufane IP, whitelist API.
2. **Paginacja** — potwierdź działanie `page`/`count` i `pages` na >1 stronie (testowe konto miało `pages:1`).
3. Realny **rate-limit** planu Prestige.
4. Czy wydawnictwo używa katalogu `Product` (wtedy kod = ISBN z `ean`), czy wpisuje pozycje z ręki
   (wtedy grupowanie po nazwie — patrz fallback). Oraz czy sprzedaż bywa pod innym typem niż `Invoice`.

## Pułapki domenowe (decydują o poprawności liczb)

- **Korekty/zwroty** (`Corrective`) muszą pomniejszać sprzedaż — sumuj `amount` faktur i korekt razem.
- **Data miesiąca**: dla „ile sprzedano w miesiącu" właściwa jest zwykle **`dateSell`** (data sprzedaży),
  nie `dateCreate`. Potwierdź z klientem i trzymaj jedną definicję w całym projekcie.
- **Powiązanie pozycji z kodem**: pozycja ma `product` (id) i bywa `ean`/`name`. Kanoniczny kod bierz z
  `Product.ean`/`productNumber`; `name` (tekst wolny) traktuj tylko jako fallback — potrafi się różnić.
- **Pozycje bez produktu** (wysyłka, usługi) — odfiltruj, żeby nie trafiły do raportu sprzedaży pozycji.
- **`amount` to Float** — ilości mogą nie być całkowite; nie zakładaj integerów.

## Komendy

| Komenda | Opis |
|---|---|
| `npm run dev` | Dashboard w trybie watch — http://localhost:3000 (auto-seed danymi mock przy pustej bazie) |
| `npm run sync -- --from 2025-01-01 --to 2026-06-30` | Synchronizacja z API afaktury.pl (wymaga `.env`) |
| `npm run seed` | Wymuszenie danych przykładowych (mock) |
| `npm test` | Testy warstwy domenowej (`node:test` przez tsx) |
| `npx tsx --test test/aggregate.test.ts` | Pojedynczy plik testowy |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` / `npm start` | Kompilacja do `dist/` i uruchomienie |

Bez `.env` wszystko działa na **danych przykładowych** (badge „DANE PRZYKŁADOWE"); po uzupełnieniu
`AFAKTURY_ID`/`AFAKTURY_KEY` przełącza się na prawdziwe API.

## Struktura kodu

- `src/afaktury/` — klient API (jedyne miejsce znające JSON/nagłówki afaktury.pl) + typy odpowiedzi.
- `src/domain/` — czysta logika bez I/O: `normalize.ts` (kanoniczny kod pozycji), `aggregate.ts`
  (mapowanie faktur+korekt na pozycje i agregacja kod × miesiąc). **Tu żyje poprawność liczb — pokryte testami.**
- `src/storage/` — SQLite (`db.ts` schemat, `repository.ts` upsert po `doc_hash` + zapytania raportowe).
- `src/sync/` — orkiestracja: `sync.ts` (real + mock), `mock.ts` (deterministyczne dane demo), `cli.ts`.
- `src/server/` — Express: `/api/report|products|months|status|sync` + statyczny dashboard.
- `public/` — dashboard (vanilla JS, wykres SVG bez zależności).

## Konwencje pracy

- **TypeScript** (`strict`, CommonJS + tsx). Kod i typy po angielsku; komentarze/UI po polsku (domena jest polska).
- Sekrety w `.env` (już w `.gitignore`) — nigdy w repo ani w logach.
- Warstwa domenowa bez zależności sieciowych — testy na przykładowych obiektach API.
- Upsert sprzedaży jest idempotentny po `doc_hash` (ponowny sync tej samej faktury nie dubluje pozycji).
