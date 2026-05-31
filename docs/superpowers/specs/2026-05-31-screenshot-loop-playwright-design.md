# Spec — screenshot-loop na Playwright

> Data: 2026-05-31 · Ścieżka procesu: FEATURE (narzędzie deweloperskie) ·
> Status: zatwierdzony design, do rozpisania planu.

## Problem i cel

Claude Code nie „widzi" UI. Żeby iterować nad warstwą wizualną aplikacji (RR7,
komponenty sprzężone z danymi loaderów), potrzebna jest pętla zwrotna: wyrenderuj
realną trasę → zrzuć screenshot → odczytaj → popraw. Storybook tego nie daje bez
pipeline'u zrzutów i wymaga mockowania routera; w tym repo mamy już Playwright,
więc budujemy lekkie, dedykowane narzędzie deweloperskie oparte o realne trasy.

**Cel:** skrypt, który loguje się jako seedowany trener, nawiguje do
zdefiniowanych tras na viewportach desktop + mobile i zapisuje screenshoty do
folderu, który Claude odczytuje. Plus możliwość zrzutu pojedynczej trasy na
żądanie podczas iteracji.

**Poza zakresem (YAGNI):** harness izolowanych komponentów, mockowanie danych,
regresja wizualna z porównaniem (Chromatic/diff), seedowanie danych pod zrzuty,
logowanie wielu ról (na razie tylko trener — seed nie tworzy podopiecznego).

## Model uruchomienia (podział ról)

- **Właściciel:** podnosi Postgres w Dockerze + `npm run db:migrate` +
  `npm run db:seed` (jednorazowo). Trzyma bazę w działaniu.
- **Claude:** w tle odpala `npm run dev` (czysty node, nie Docker) i uruchamia
  `npm run shots`; odczytuje wynikowe PNG-i toolem `Read`.

Stan dev-bazy jest po stronie właściciela — świeży seed pokaże głównie *empty
states* (pusta biblioteka, brak podopiecznych); to nie jest odpowiedzialność
narzędzia.

## Decyzja architektoniczna

Samodzielny skrypt Node + `playwright` (podejście A), **bez** test-runnera.
Czysty podział: narzędzie dev (uruchamia Claude) jest odrębne od testów e2e
(`tests/e2e`, uruchamia właściciel pod Dockerem). Importujemy `chromium` z już
zainstalowanego `@playwright/test` — **zero nowych zależności**.

Odrzucone:
- **B (spec w `@playwright/test`):** miesza narzędzie dev z testami e2e, niewygodny
  do zrzutu pojedynczej trasy.
- **C (render statycznego HTML/SSR):** traci wierność; wybrano realne trasy.

## Pliki

| Plik | Rola |
| --- | --- |
| `scripts/shots.ts` | Orchestrator: przeglądarka, auth, pętla zrzutów, raport. Importuje `chromium` z `@playwright/test`. |
| `scripts/shots-lib.ts` | Czyste funkcje (bez I/O): parser argów, slug z ścieżki, filtr manifestu. |
| `scripts/shots.manifest.ts` | Lista docelowych tras: `{ path: string; role: "trainer" \| "trainee" }`. |
| `scripts/shots-lib.test.ts` | Testy jednostkowe czystych funkcji (Vitest). |
| `screenshots/` | Output PNG (gitignore). Stan auth w `screenshots/.auth/trainer.json` (gitignore). |

Zmiany w istniejących plikach:
- `package.json` — skrypt `"shots": "tsx --env-file-if-exists=.env scripts/shots.ts"`.
- `vitest.config.ts` — dopisać `scripts/**/*.test.ts` do `include` (helper tooling
  zostaje w `scripts/`, a jego test wchodzi w bramkę `npm test`). `npm run test:unit`
  pozostaje skopowany do `app/` celowo.
- `.gitignore` — dodać `screenshots/`.

## Konfiguracja / env

Zero nowych zmiennych — reużywamy istniejące:
- `BASE_URL` (domyślnie `http://localhost:3000`) — adres dev servera.
- `SEED_TRAINER_EMAIL`, `SEED_TRAINER_PASSWORD` — dane logowania (te same, których
  używa `db:seed`).

Viewporty: **desktop** 1440×900, **mobile** profil `devices["Pixel 7"]` (spójnie z
`playwright.config.ts`).

## Przepływ

### Auth
1. Jeśli `screenshots/.auth/trainer.json` istnieje → reużyj jako `storageState`.
2. Inaczej: nowy kontekst → `goto BASE_URL + "/login"` → wypełnij `email`/`password`
   z env → submit → poczekaj na redirect z `/login` → zapisz `storageState` do
   pliku.
3. Jeśli przy zrzucie trasa wyląduje z powrotem na `/login` (sesja wygasła) →
   jednorazowe ponowne logowanie i powtórzenie tej trasy.

### Zrzut
Dla każdej docelowej trasy × każdego viewportu:
- nowy kontekst ze `storageState` + viewport,
- `page.goto(BASE_URL + path, { waitUntil: "networkidle" })`,
- `page.screenshot({ path: "screenshots/<slug>__<desktop|mobile>.png", fullPage: true })`.

Na końcu skrypt wypisuje listę zapisanych plików (żeby Claude wiedział, co odczytać).

## Kontrakt wywołania

- `npm run shots` → cały manifest (filtr `role: "trainer"` w MVP), oba viewporty.
- `npm run shots -- /trener/biblioteka [/inna/trasa]` → tylko podane ścieżki, oba
  viewporty. To główna pętla iteracji nad pojedynczym widokiem.

## Obsługa błędów

- **Serwer nieosiągalny na `BASE_URL`** → czytelny komunikat: uruchom `npm run dev`
  i sprawdź, czy Postgres działa. Wyjście z kodem ≠ 0.
- **Brak `SEED_TRAINER_EMAIL`/`SEED_TRAINER_PASSWORD`** → komunikat z nazwami
  zmiennych. Wyjście z kodem ≠ 0.
- **Pojedyncza trasa redirectuje/erroruje** → warning + zrzut tego, co jest; nie
  przerywaj całego przebiegu. Redirect na `/login` = problem sesji (wywołaj
  re-auth); redirect gdzie indziej = trasa za inną rolą (zalogowano notkę).
- **Trasy `role: "trainee"`** → w MVP pomijane z notką „wymaga zaproszonego
  podopiecznego" (seed loguje tylko trenera).

## Testy

- **Jednostkowe** (`scripts/shots-lib.test.ts`, TDD, bez Dockera): slug z ścieżki,
  parser argów (pełny przebieg vs lista ścieżek), filtr manifestu po roli.
  Uruchamia `npm test`.
- Samego `shots.ts` (przeglądarka + serwer) **nie** pokrywamy testem — to narzędzie
  dev, nie ścieżka produktu, i wymaga działającego stacku.

## Dokumentacja (część „done")

- `scripts/README.md` — dopisać `shots.ts`, `shots-lib.ts`, `shots.manifest.ts`.
- Root `README.md` — `npm run shots` w „Useful commands" + opis pętli (właściciel:
  Postgres up; Claude: dev + shots).
- `CLAUDE.md` — wzmianka w „Proces AI-developmentu", że iteracja UI ma pętlę
  wizualną (`npm run shots`).

## Bramki „done"

`npm test` · `npm run typecheck` · `npm run lint` · `npm run build` ·
dokumentacja zaktualizowana · `/code-review`. `/security-review` **nie** dotyczy
(brak zmian w auth/`trainer_id`/podpisanych URL/uploadzie — skrypt jedynie loguje
się istniejącą ścieżką jako narzędzie dev). Handoff na granicy gita.
