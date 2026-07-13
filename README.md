# Sprzedaż pozycji — integracja z afaktury.pl

Dashboard pokazujący **ile sztuk każdej pozycji (tytułu) sprzedano w danym miesiącu**,
na podstawie faktur i korekt pobranych z systemu **afaktury.pl**. Klientem jest wydawnictwo,
więc kod pozycji to zwykle **ISBN** (pole `ean` w katalogu produktów afaktury.pl).

## Szybki start (bez klucza API — dane przykładowe)

```bash
npm install
npm run dev
```

Otwórz http://localhost:3000 — przy pustej bazie dashboard automatycznie wypełni się
**danymi przykładowymi** (8 tytułów, sprzedaż 2025-08 … 2026-06, kilka zwrotów).
Badge „DANE PRZYKŁADOWE" oznacza tryb bez połączenia z API.

## Podłączenie prawdziwych danych z afaktury.pl

1. Skopiuj `.env.example` do `.env` i uzupełnij klucz z panelu afaktury.pl
   (**Ustawienia → Klucz API**, wymaga planu **Prestige**):

   ```
   AFAKTURY_ID=...
   AFAKTURY_KEY=...
   ```

2. Pobierz dane (opcjonalnie zakres dat po dacie sprzedaży):

   ```bash
   npm run sync -- --from 2025-01-01 --to 2026-06-30
   ```

3. Uruchom dashboard: `npm run dev`. Badge zmieni się na „afaktury.pl (na żywo)".

Synchronizację można też wywołać przyciskiem **Odśwież dane** w dashboardzie
albo `POST /api/sync`.

## Skrypty

| Komenda | Opis |
|---|---|
| `npm run dev` | Dashboard w trybie watch (http://localhost:3000) |
| `npm run sync` | Synchronizacja z API afaktury.pl (wymaga `.env`) |
| `npm run seed` | Wymuszenie danych przykładowych |
| `npm test` | Testy warstwy domenowej (agregacja, korekty, normalizacja) |
| `npm run build` / `npm start` | Kompilacja TS i uruchomienie z `dist/` |
| `npm run typecheck` | Sprawdzenie typów bez emisji |

## Jak to działa (warstwy)

```
afaktury.pl API  ──►  klient (src/afaktury)  ──►  warstwa domenowa (src/domain)
                                                      normalizacja kodów + agregacja
                                                            │
                                     lokalny cache SQLite (src/storage)
                                                            │
                              serwer (src/server)  ──►  dashboard (public/)
```

- **Cache SQLite jest celowy**: API afaktury.pl jest płatne i limitowane, więc dashboard czyta
  z lokalnej bazy, a nie odpytuje API na każde kliknięcie. Synchronizacja jest przyrostowa po dacie.
- **Korekty/zwroty** (moduł `Corrective`, `amount` ujemne) są sumowane razem z fakturami —
  raport pokazuje sprzedaż netto.
- Szczegóły kontraktu API i decyzji projektowych: patrz [CLAUDE.md](CLAUDE.md).

## Wersja demonstracyjna (GitHub Pages)

W katalogu `docs/` jest **statyczna wersja dashboardu z danymi przykładowymi** — do pokazania klientowi
jak to wygląda, bez uruchamiania serwera. Dane są fikcyjne i „wkompilowane" w stronę (`docs/data.js`),
filtrowanie działa po stronie przeglądarki.

```bash
npm run build:demo   # regeneruje docs/data.js z danych mock
```

Publikacja: GitHub Pages ustawiony na branch `main`, katalog `/docs`. Po push aktualizacja jest automatyczna.

## Znane ryzyko: Cloudflare

Endpoint API afaktury.pl stoi za **Cloudflare** z ochroną antybotową (zweryfikowane na żywo).
Klient wysyła przeglądarkowy `User-Agent` i łagodnie throttluje, ale przy szybkim ruchu serwer-serwer
Cloudflare potrafi zablokować żądania (HTTP 403 „Just a moment..."). Jeśli sync się blokuje:
zwolnij tempo, uruchom go z zaufanego IP klienta, albo poproś afaktury.pl o dostęp API (whitelist).
Błąd jest wtedy czytelny („uporczywie blokowane przez Cloudflare") — to **nie** problem z kluczem.

## Do zweryfikowania po podłączeniu klucza

- **Czy realny sync przechodzi przez Cloudflare** (patrz wyżej) — najważniejsze.
- Czy `GET /api/invoice/list` zwraca zagnieżdżone `products`, czy trzeba dociągać każdą fakturę
  po `hash` (kod obsługuje oba przypadki, ale wpływa to na liczbę zapytań).
- Realny rate-limit planu Prestige.
- Które typy dokumentów wydawnictwo faktycznie wystawia poza `Invoice` (np. `Bill`, `Invoicenovat`).
