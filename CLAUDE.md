# CLAUDE.md — spis treści projektu kalisthenos

> Ten plik jest **mapą projektu** dla Claude Code i ludzi. Nie powiela treści —
> linkuje do `README.md` w poszczególnych katalogach, gdzie leży konkret. Każdy
> katalog źródłowy ma własny `README.md`: katalog-**liść** (bez podkatalogów)
> opisuje swoje pliki, katalog-**korzeń/gałąź** (z podkatalogami) jest indeksem
> linkującym do dzieci. Zasady utrzymania tej dokumentacji są na końcu pliku —
> **przeczytaj je przed każdą zmianą w repo.**

---

## Czym jest kalisthenos

Polskojęzyczna aplikacja webowa do współpracy **trener ↔ podopieczny** w
kalistenice. Trener prowadzi bibliotekę ćwiczeń, układa wersjonowane plany i
ogląda historię treningów oraz zdjęcia sylwetki podopiecznych. Podopieczny
loguje treningi seria-po-serii (z oceną trudności 1–10 i opcjonalnym wideo),
wrzuca zdjęcia sylwetki, przegląda statystyki i miesięczne podsumowania
("Wrapped"). UI podopiecznego jest mobile-first i instalowalny jako PWA; UI
trenera jest desktop-first.

Pełna specyfikacja produktu i decyzje architektoniczne:
[`docs/superpowers/specs/2026-05-23-kalisthenos-fullstack-v1-design.md`](docs/superpowers/specs/2026-05-23-kalisthenos-fullstack-v1-design.md).

Setup lokalny, deploy na Railway, lista komend i posture bezpieczeństwa:
[`README.md`](README.md) (root).

---

## Stack

| Warstwa | Wybór |
|---|---|
| Framework | **React Router v7** (framework mode, SSR, loadery/akcje na trasach) |
| Język | **TypeScript** (strict) |
| Dane | **Brak własnej bazy** — wszystko przez kontrakt `calisthenos-be` (`@kalisthenos/api-client`, pakiet z wersją). Drizzle i Postgres zniknęły z FE w segmencie S6 integracji; archiwum schematu i 19 migracji leży w `calisthenos-be/docs/legacy-drizzle/` |
| Auth | **Sesja na tokenach z BE** — para dostępowy/odświeżający w ciastku `__Host-kth_api`, rotacja i `GET /v1/me` w middlewarze ([`app/lib/api/`](app/lib/api/README.md)). Hasła i limit prób logowania są po stronie BE. |
| Pliki | **W całości w BE (R2)** — demo ćwiczeń, nagrania serii i zdjęcia sylwetki; wysyłka dwufazowa, odczyt po podpisanych adresach BE. FE nie ma już własnego magazynu; na wolumenie zostały bajty sprzed migracji, których nic nie sprząta |
| Płatności | **Brak** — Stripe Connect zniknął z FE w segmencie S6 integracji (D1 specu, ADR-0024 po stronie BE: model płatności jest nierozstrzygnięty). Zostało jedno pole: kwota ustaleń przy zaproszeniu (`monthlyAmountGrosze`), którą zapisuje BE. Powrót płatności to osobny projekt z własnym specem |
| PWA | `vite-plugin-pwa` (cache statyków, instalowalność; brak offline-sync) |
| Wykresy | **visx** (SVG, SSR-friendly, tree-shakeable) |
| Walidacja | **Zod** |
| Lint/format | **Biome** (`npm run lint` / `npm run format`) |
| Bundler | Vite (wbudowany w RR7) |
| Hosting | **Railway** — sama aplikacja: bez Postgresa i bez wolumenu (zdjęte z `railway.toml` w S6). Lokalnie potrzebny jest działający BE pod `API_URL`, nie Docker |
| Menedżer pakietów | **npm** (lockfile `package-lock.json`) |

---

## Mapa projektu (spis treści)

Każdy wpis linkuje do `README.md` danego katalogu — tam jest opis plików.

### Aplikacja (`app/`) → [`app/README.md`](app/README.md)
- [`app/routes/`](app/routes/README.md) — trasy RR7 (loadery/akcje/komponenty)
  - [`app/routes/trener/`](app/routes/trener/README.md) — widoki trenera (`/trener/*`)
  - [`app/routes/podopieczny/`](app/routes/podopieczny/README.md) — widoki podopiecznego (`/podopieczny/*`)
- [`app/components/`](app/components/README.md) — współdzielone komponenty UI
- [`app/lib/`](app/lib/README.md) — logika domenowa i infrastruktura
  - [`app/lib/api/`](app/lib/api/README.md) — klient backendu (`calisthenos-be`), sesja na tokenach, middleware rotacji
  - [`app/lib/auth/`](app/lib/auth/README.md) — zaproszenia trenera (wystawianie i podgląd przez kontrakt); sesje i hasła są w `api/` i w BE
- [`app/styles/`](app/styles/README.md) — globalne tokeny CSS

### Pozostałe katalogi
- [`scripts/`](scripts/README.md) — skrypty operacyjne (pętla zrzutów ekranu)
- [`public/`](public/README.md) — assety statyczne (ikona, manifest, fonty)
  - [`public/fonts/`](public/fonts/README.md) — self-hostowane woff2
- [`design-system/`](design-system/README.md) — system designu (brand, tokeny, podgląd)
  - [`design-system/assets/`](design-system/assets/README.md) — logo, ikony
  - [`design-system/fonts/`](design-system/fonts/README.md) — źródłowe woff2
  - [`design-system/preview/`](design-system/preview/README.md) — statyczne karty podglądu
- [`docs/`](docs/README.md) — dokumentacja, plany, logi
  - [`docs/backend/`](docs/backend/README.md) — materiały do budowy BE jako osobnej usługi (domena i kontrakt, bez technologii)
  - [`docs/superpowers/`](docs/superpowers/README.md) — spec, plany, logi build/deploy
    - [`docs/superpowers/plans/`](docs/superpowers/plans/README.md)
    - [`docs/superpowers/specs/`](docs/superpowers/specs/README.md)
- [`prototype/`](prototype/README.md) — oryginalny prototyp React+Babel (tylko referencja)
- [`tests/`](tests/README.md) — miejsce na testy Playwright przeciw prawdziwemu BE (`tests/e2e`, jeszcze puste); testy integracyjne na testcontainerach zniknęły w S6 razem z bazą

### Konfiguracja w root (bez README — pliki samoopisowe)
`package.json`, `tsconfig.json`, `vite.config.ts`, `react-router.config.ts`,
`biome.json`, `vitest.config.ts`, `playwright.config.ts`, `Dockerfile`,
`railway.toml`, `.env.example`.

### Poza zakresem README (generowane / vendored / runtime)
`node_modules/`, `.react-router/` (typy generowane przez RR7), `build/`,
`design-system/_src/` (rozpakowany prototyp, read-only).

---

## Kluczowe konwencje (czytaj zanim zaczniesz kodować)

- **Zakres tenanta niesie token, egzekwuje BE.** Moduły `app/lib/*.ts` biorą
  `api: Api` i **nie mają** argumentu `trainerId`/`traineeId` jako filtra —
  `traineeId` zostaje wyłącznie tam, gdzie kontrakt ma go w ścieżce
  (`/v1/trainees/{traineeId}/…`). Brak autoryzacji → **404** (nie 403), by nie
  zdradzać istnienia zasobu; obie strony trzymają tę samą zasadę. Szczegóły:
  [`app/lib/README.md`](app/lib/README.md), `app/lib/authz.ts`.
- **Trasy = plik + wpis w `app/routes.ts`.** Nazewnictwo plików:
  `segment.$param.tsx`, `_index.tsx`, `_layout.tsx`. Dodając trasę, dopisz ją do
  `app/routes.ts`. Mapa URL→plik: [`app/routes/README.md`](app/routes/README.md).
- **Loadery czytają, akcje mutują.** Brak osobnego API — dane lecą przez
  loadery/akcje RR7. Mutacje plikowe to `multipart/form-data`.
- **Pliki: jedna ścieżka — kontrakt BE.** Wszystkie trzy rodzaje (`exercise_demo`,
  `set_video`, `body_photo`) idą **wysyłką dwufazową** przez
  `uploadExerciseDemo`/`uploadSetVideo`/`uploadBodyPhoto` z `app/lib/file-uploads.ts`
  (`POST /v1/files/{rodzaj}` → `POST /v1/files/{id}/confirm`); typ sprawdza BE po
  ZAWARTOŚCI, nie FE po `file.type`, a plik, którego nic nie podpięło, zabiera
  zamiatacz BE po 24 h. Trasa `/upload/wideo` zostaje jako cienka trasa zasobowa
  dla XHR z paskiem postępu. **FE nie podpisuje, nie serwuje i nie zapisuje na
  dysk niczego** — odnośnik podpisuje BE i przychodzi jako ŚCIEŻKA, więc origin
  dokłada `publicFileUrl` z `app/lib/api/client.ts` (`API_PUBLIC_URL`) **w module**,
  nigdy w trasie ani w komponencie. Bajty sprzed migracji zostały na wolumenie
  FE i **nie sprząta ich już żaden kod** — `app/lib/storage/` zniknęło razem
  z kaskadą usuwania podopiecznego, którą przejął `DELETE /v1/trainees/{id}`
  (kasuje pliki po swojej stronie). Wolumen zniknął z `railway.toml` w S6 —
  jego zawartość jest do przeniesienia albo skasowania przy cutoverze.
- **Kontrakt to źródło prawdy.** Modelu danych nie ma już po tej stronie: zmiana
  zaczyna się w `calisthenos-be` (encja → migracja → OpenAPI → nowa wersja
  `@kalisthenos/api-client`), a FE podnosi wersję pakietu i dostosowuje moduły.
  Typy DTO **re-eksportuj z pakietu**, nie przepisuj.
- **UI po polsku.** Cała warstwa produktu jest polskojęzyczna; angielskie zostają
  tylko nazwy ćwiczeń (Pull-up, Front Lever…). Brand `kalisthenos` zawsze małą
  literą. Zasady języka/tonu/wizualne: [`design-system/README.md`](design-system/README.md).
- **npm, nie pnpm.** `npm install`, `npm run <skrypt>`, `npx`.
- **TDD jest normą.** Moduły `app/lib` testujemy test-first przeciw
  **podstawionemu klientowi** (`createApiClient` z podstawionym `fetch`;
  `*.test.ts`, Vitest). Testy integracyjne na testcontainerach zniknęły razem
  z bazą — przepływy wymagające sieci pokryje Playwright przeciw prawdziwemu BE
  (`tests/e2e`, jeszcze pusty). Szczegóły: „Proces AI-developmentu" niżej.
- **Review per task.** Po każdym kroku implementacji robimy przegląd
  (`/code-review` / `superpowers:requesting-code-review`) przed kolejnym — nie
  jeden przegląd na końcu.
- **Sortowanie/filtrowanie list jest server-side przez URL params.** Używaj
  `app/lib/list-params.ts` (`parseListControls`, `buildControlHref`) i komponentu
  `app/components/list-controls.tsx` (`<ListControls>`). Przy dodawaniu nowej listy
  z sort/filter/szukajką — reużyj tych dwóch modułów, nie twórz własnych mechanizmów.
- **Trasy nie wołają klienta bezpośrednio.** Loader/akcja bierze dane z modułu
  `app/lib/*`, a moduł rozmawia z BE. Zabroniony jest import WARTOŚCI
  z `~/lib/api/client` i z `@kalisthenos/api-client`; `import type` jest dozwolony,
  bo typ DTO znika przy kompilacji i niczego nie woła. Wolno brać resztę
  `~/lib/api/*` (`requireUser`, `ApiError`, `toRouteResponse`, ciastko sesji) —
  to infrastruktura żądania. Pilnuje tego `app/routes/no-direct-api.test.ts`,
  następca `no-direct-db.test.ts`: ten sam szew, zmieniła się druga strona.
- **Git i Docker prowadzi właściciel.** Nie uruchamiaj operacji git ani
  `docker compose up/down/build`; konfigurację możesz edytować.
- **Dozwolone komendy powłoki — TYLKO z poniższej listy i TYLKO pojedynczo.**
  Reguły `allow` w `.claude/settings.local.json` dopasowują pojedynczą komendę po
  prefiksie. **Nie łańcuchuj** (`;`, `&&`), **nie używaj potoków** (`| tail`,
  `| head`), **nie przekierowuj** (`>/dev/null`, `2>&1`) — każdy taki dodatek
  powoduje, że komenda przestaje pasować do allowlisty i wyskakuje okienko.
  Uruchamiaj każdą z osobna, w jednym wywołaniu narzędzia:

  | Komenda | Do czego |
  |---|---|
  | `npm run typecheck` | sprawdzenie typów (tsc) |
  | `npm run lint` | Biome lint |
  | `npm run build` | build SSR + klient |
  | `npx vitest run <wzorzec>` | testy jednostkowe (NIE `npm test` — to watch) |
  | `npx biome format --write <plik>` | formatowanie dotkniętego pliku |

  Do czytania plików/wyników używaj narzędzi Read/Grep/Glob, **nie** `cat`/`tail`/
  `grep` w Bash. `npm install`, git i docker — wyłącznie właściciel.

Komendy (`dev`, `build`, `lint`, `format`, `shots`…) i ich opis:
sekcja "Useful commands" w [`README.md`](README.md).

---

## Proces AI-developmentu (jak wchodzą zmiany)

Każda zmiana idzie powtarzalnym procesem zakodowanym jako skill
`kalisthenos-dev-flow` + commandy:

- **`/feature <opis>`** — nowy feature: brainstorm → spec → plan → implementacja
  TDD z review per task → bramki → handoff.
- **`/fix <opis>`** — bugfix/drobna zmiana: debug → fix → review → bramki →
  handoff.

Gdy zmiana dotyka **UI/UX** (nowy/zmieniony widok, komponent, layout,
stylowanie), implementację warstwy wizualnej prowadzi skill
`frontend-design:frontend-design` (zgodnie z [`design-system/README.md`](design-system/README.md)).

Do iteracji nad warstwą wizualną dostępna jest pętla zrzutów ekranu
`npm run shots` (skrypt `scripts/shots.ts`) — renderuje realne trasy na
viewportach desktop+mobile do `screenshots/`; wymaga działającego stacku.

Wszędzie, gdzie to możliwe, korzystamy z **MCP `context7`** po aktualną
dokumentację i best practices używanych bibliotek (React Router v7, Zod,
vite-plugin-pwa…) — w brainstormie, planie i implementacji.

Bramki „done": `npm test` + `npm run typecheck` + `npm run lint` +
`npm run build`, `/code-review`, oraz `/security-review` gdy zmiana dotyka
auth / `trainer_id` / podpisanych URL / uploadu. Claude nigdy nie dotyka gita ani
Dockera — proces kończy się handoffem (opis commita, migracji, testów do
odpalenia). Pełny opis:
[`docs/superpowers/specs/2026-05-31-ai-dev-process-design.md`](docs/superpowers/specs/2026-05-31-ai-dev-process-design.md).

---

## ⚠️ Zasada utrzymania dokumentacji (OBOWIĄZKOWA)

Dokumentacja jest częścią definicji "gotowe". **Przy każdej zmianie w repozytorium
zaktualizuj dokumentację w tym samym kroku**, według poniższych reguł:

1. **Zmieniłeś zawartość pliku/katalogu** (nowa funkcja, zmieniona sygnatura,
   nowa trasa, zmiana zachowania) → **zaktualizuj `README.md` tego katalogu**,
   jeśli opis przestał być prawdziwy.
2. **Dodałeś nowy plik** w katalogu, który ma `README.md` → **dopisz go** do tabeli
   plików w tym `README.md`.
3. **Dodałeś nowy katalog (źródłowy)** → **utwórz w nim `README.md`** w tej samej
   konwencji (liść = opis plików; korzeń = indeks linkujący do dzieci) i **dodaj
   wpis do mapy projektu w tym `CLAUDE.md`**.
4. **Usunąłeś plik/katalog** → usuń odpowiedni wpis z `README.md` (i z mapy w
   `CLAUDE.md`, jeśli to był katalog).
5. **Zmieniłeś coś przekrojowego** (stack, konwencja, komenda, struktura) →
   **zaktualizuj odpowiednią sekcję tego `CLAUDE.md`** oraz root [`README.md`](README.md),
   jeśli dotyczy setupu/deployu/komend.

Reguła kciuka: jeśli po Twojej zmianie ktoś czytający dany `README.md` lub ten
`CLAUDE.md` zostałby wprowadzony w błąd — popraw go zanim uznasz zadanie za
skończone. Nie twórz README w katalogach generowanych/vendored/runtime (lista
wyżej). Trzymaj wpisy zwięzłe i faktyczne — to ma być nawigacja, nie kopia kodu.
