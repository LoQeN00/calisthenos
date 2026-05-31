# Spec: sortowanie i filtrowanie na wszystkich listach

**Data:** 2026-05-31
**Status:** projekt do akceptacji
**Typ:** feature (przekrojowy)

## Cel

Dodać spójne **sortowanie, filtrowanie i (gdzie sensowne) wyszukiwanie** na każdej
liście danych w systemie — w obu panelach (trener, podopieczny) — używając
jednego, współdzielonego mechanizmu, zgodnego z istniejącym wzorcem
server-side / URL search params (biblioteka, plany).

## Decyzje (zatwierdzone w brainstormie)

1. **Zakres:** wszystkie listy danych. Pomijamy „Sesje" (drzewo aktywnego planu,
   nie płaska lista) oraz widoki szczegółu/porównania.
2. **Mechanizm:** server-side, sterowany **URL search params**. Loader czyta i
   filtruje/sortuje; UI to `<Form method="get">` + `<Link>`. Linkowalne,
   odświeżalne, działa bez JS, gra z paginacją.
3. **Szukajka:** dodajemy tam, gdzie ma sens (Podopieczni, Historia, Logi,
   Konsultacje), spójnie z istniejącą szukajką w Bibliotece.
4. **UI:** wspólny pasek — szukajka (jeśli jest) + dropdown „Sortuj wg…" +
   chipy filtrów.
5. **Progresja:** **ujednolicić** istniejący client-side sort/filtr do
   server-side URL params + wspólny komponent. Tryb „Porównaj" pozostaje stanem
   klienta.

## Architektura

Dwie nowe jednostki + rozszerzenie istniejących funkcji repo.

### a) `app/lib/list-params.ts` — czysta logika (TDD)

Parsowanie i **walidacja** stanu kontrolek z `URLSearchParams` względem
per-listowej specyfikacji. Nie ufamy URL-owi: nieznane/błędne wartości →
wartość domyślna.

```ts
export interface SortOption { key: string; label: string }
export interface FilterOption { value: string; label: string }
export interface FilterGroup {
  param: string;            // nazwa parametru URL, np. "status", "tag"
  label: string;            // etykieta (a11y / nagłówek grupy)
  options: FilterOption[];  // może być budowane dynamicznie z danych
  defaultValue: string;     // zwykle "all"
}
export interface ListControlsSpec {
  sortOptions: SortOption[];
  defaultSort: string;
  filterGroups: FilterGroup[];
  searchable: boolean;
}
export interface ListControlsState {
  sort: string;
  filters: Record<string, string>; // param -> wartość (zwalidowana)
  q: string;                        // przycięte; "" gdy brak lub !searchable
}

export function parseListControls(
  sp: URLSearchParams,
  spec: ListControlsSpec,
): ListControlsState;
```

Reguły walidacji:
- `sort` spoza `sortOptions` → `defaultSort`.
- `filters[param]` spoza `options` danej grupy → `defaultValue` grupy.
- `q` → `trim()`; gdy `!searchable` → `""`.
- Parametr `page` **nie** jest tu obsługiwany (zostaje przy `parsePage`).

> Funkcja jest czysta i testowalna bez DB — to główny cel testów test-first.
> **Mapowanie `sort.key → kolumna/ORDER BY` zostaje w warstwie repo/loaderze**
> (nie da się serializować w spec). Spec zna tylko klucze i etykiety —
> do renderu UI i walidacji.

### b) `app/components/list-controls.tsx` — UI

Jeden komponent renderujący pasek na podstawie `ListControlsSpec` + bieżącego
`ListControlsState`:

- **Szukajka** (gdy `searchable`): `<input type="search" name="q">` w
  `<Form method="get">`, auto-submit 300 ms po zaprzestaniu pisania
  (`useSubmit` + `replace: true`) — dokładnie jak w `biblioteka._index.tsx`.
  `<noscript>` przycisk „Szukaj" jako fallback.
- **Sort**: `<select name="sort">` w tym samym `<Form>`, auto-submit `onChange`.
  Natywny select działa bez JS po dodaniu `<noscript>` submit.
- **Filtry**: chipy jako `<Link>` (po jednej grupie chipów na `FilterGroup`),
  budujące nowy querystring z zachowaniem pozostałych parametrów.
- **Reset paginacji:** każda zmiana sortu/filtra/szukajki **usuwa `page`** z
  URL (powrót na stronę 1). Realizowane przez: formularz GET zawiera tylko
  `q`+`sort`+ukryte aktualne filtry (bez `page`), a chipy-`<Link>` budują
  params z `params.delete("page")`.

Helper budowy hrefów (z `app/lib/list-params.ts` lub lokalny w komponencie):
ustaw/usuń jeden parametr, usuń `page`, zwróć querystring zachowując resztę.

Styl: zgodny z design-systemem i istniejącymi chipami (`btn btn-sm` /
`btn btn-sm btn-dark` dla aktywnego). Standaryzujemy wygląd — w tym
ujednolicamy obecne chipy progresji (dziś `accent-soft`) do wspólnego stylu.

### c) Warstwa repo — rozszerzenie istniejących funkcji

Każda funkcja listująca i **licząca** dostaje opcjonalny opis sortu/filtra/szukajki
w `opts` (tenant-scope `trainerId`/`traineeId` zostaje pierwszym argumentem).
`count*` stosuje **te same** warunki WHERE co `list*`, by total i liczba stron
się zgadzały.

Dotknięte moduły:
- `app/lib/workouts.ts`: `listLogsForTrainee` / `countLogsForTrainee` (+ wariant
  dla widoku trenera, jeśli osobny), `listClientsForTrainer` /
  `countClientsForTrainer`.
- `app/lib/consultations.ts`: `listConsultationsForTrainee` (+ licznik, jeśli
  wejdzie paginacja; dziś limit 200 — patrz niżej).
- `app/lib/body-photos.ts`: `listBodyPhotosForTrainee` (sort kierunek).
- Inline SQL w `biblioteka._index.tsx` i `plany._index.tsx` — rozszerzenie
  istniejących `conditions`/`orderBy`.
- `progresja`: bez zmian SQL — filtr/sort w loaderze na już pobranych wierszach
  (`sortProgressionRows` + filtr po tagach).

## Specyfikacja per lista

Domyślny sort **pogrubiony**. „Szukaj po…" = nowe pole, jeśli nie zaznaczono
„(jest)".

| Lista | Plik | Szukaj po | Sort | Filtry |
|---|---|---|---|---|
| Biblioteka | `trener/biblioteka._index.tsx` | nazwie *(jest)* | **nazwa A–Z**, nazwa Z–A, najnowsze, najstarsze | kategoria *(jest)*; jednostka REPS/SEC |
| Plany | `trener/plany._index.tsx` | nazwie planu / podopiecznego | **najnowsze**, najstarsze, nazwa A–Z, ostatnio opublikowane | status all/active/draft *(jest)* |
| Podopieczni | `trener/podopieczni._index.tsx` | nazwisku / emailu | **nazwisko A–Z**, nazwisko Z–A, ostatnia sesja, najwięcej sesji, najnowszy | z aktywnym planem / bez |
| Logi (trener) | `trener/podopieczni.$traineeId.tsx` | nazwie sesji | **data ↓**, data ↑, najtrudniejsze, najłatwiejsze | z wideo / bez |
| Historia | `podopieczny/historia._index.tsx` | nazwie sesji | **data ↓**, data ↑, najtrudniejsze, najłatwiejsze, najwięcej serii | z wideo / bez |
| Sylwetka | `podopieczny/sylwetka.tsx` | — | **najnowsze**, najstarsze | — |
| Konsultacje (trener) | `trener/podopieczni.$traineeId.konsultacje._index.tsx` | tytule | **data ↓**, data ↑, najwięcej otwartych | z otwartymi / wszystkie |
| Konsultacje (podopieczny) | `podopieczny/konsultacje._index.tsx` | tytule | **data ↓**, data ↑, najwięcej otwartych | z otwartymi / wszystkie |
| Progresja (podopieczny) | `podopieczny/progresja._index.tsx` | — | **Ostatnio trenowane**, Wymaga uwagi | tag *(jest, dynamiczne)* |
| Progresja (trener) | `trener/podopieczni.$traineeId.progresja._index.tsx` | — | **Wymaga uwagi**, Ostatnio trenowane | tag *(jest, dynamiczne)* |

## Złożoności / ryzyka do odnotowania

- **Sort klientów po sesjach/dacie sesji** (`listClientsForTrainer`): dziś
  agregaty (totalSessions, lastSession) liczone są *po* paginacji users. Sort
  po nich wymaga podzapytania `LEFT JOIN` agregatu **przed** `limit/offset`.
  Osobny task + test poprawności.
- **Konsultacje** mają dziś twardy limit 200 bez paginacji. Filtr/sort działają
  w obrębie tego limitu. Nie wprowadzamy paginacji w tej iteracji (poza
  zakresem) — odnotować w dokumentacji listy.
- **Progresja**: brak paginacji — filtr/sort w loaderze na pełnym zbiorze. To
  akceptowalne (zbiór ograniczony liczbą trenowanych ćwiczeń).

## Obsługa błędów / edge-case'y

- Nieznany `sort`/`filter` → cichy fallback do domyślnego (parser).
- Zmiana sortu/filtra/szukajki → reset `page` do 1.
- `Pagination` zachowuje wszystkie pozostałe parametry — bez zmian.
- Pusty wynik → istniejące stany „Nic nie znaleziono" / „Brak ćwiczeń w tej
  kategorii".

## Testy

- **TDD (jednostkowe, bez DB):** `app/lib/list-params.test.ts` —
  `parseListControls`: poprawne wartości, fallbacki przy złych/nieznanych,
  `q.trim()`, `!searchable → ""`, helper budowy hrefa (set/delete + reset page).
  Plus ewentualne czyste funkcje sortu, których jeszcze nie ma
  (`sortProgressionRows` już testowany w `progression-math.test.ts`).
- **Integracyjne (`*.itest.ts`, PISZĘ — uruchamia właściciel pod Dockerem):**
  - tenant-scope: filtr/sort/szukajka nie przeciekają między trenerami /
    podopiecznymi (rozszerzenie istniejącego wzorca itest).
  - poprawność sortu klientów po liczbie/dacie sesji (SQL przed paginacją).

## Bramki „done"

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` ·
dokumentacja (README katalogów + ew. `CLAUDE.md`) · `/code-review` per task ·
`/security-review` (zmiana dotyka konstrukcji zapytań tenant-scope).

## Poza zakresem

- Paginacja Konsultacji.
- Filtrowanie/sortowanie widoków szczegółu i porównania (progresja `:id`,
  `porownanie`, wrapped, edytor planu, drzewo sesji).
- Zapamiętywanie preferencji sortu między sesjami (localStorage/DB).
