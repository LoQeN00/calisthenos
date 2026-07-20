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
| ORM / DB | **Drizzle ORM** + **PostgreSQL 16** |
| Auth | Własna, sesje w cookie (`__Host-`), hasła **Argon2id** (`@node-rs/argon2`) |
| Pliki | Wolumen na dysku przez interfejs `FileStorage` (lokalnie / Railway volume), URL-e podpisywane HMAC |
| Płatności | **Stripe Connect** (Express) — subskrypcje (Checkout/Customer Portal, destination charges na konto trenera) + webhook z weryfikacją podpisu; opcjonalne (działa bez kluczy), brak danych kart u nas |
| PWA | `vite-plugin-pwa` (cache statyków, instalowalność; brak offline-sync) |
| Wykresy | **visx** (SVG, SSR-friendly, tree-shakeable) |
| Walidacja | **Zod** |
| Lint/format | **Biome** (`npm run lint` / `npm run format`) |
| Bundler | Vite (wbudowany w RR7) |
| Hosting | **Railway** (app + Postgres + Volume); lokalnie Postgres w Dockerze |
| Menedżer pakietów | **npm** (lockfile `package-lock.json`) |

---

## Mapa projektu (spis treści)

Każdy wpis linkuje do `README.md` danego katalogu — tam jest opis plików.

### Aplikacja (`app/`) → [`app/README.md`](app/README.md)
- [`app/routes/`](app/routes/README.md) — trasy RR7 (loadery/akcje/komponenty)
  - [`app/routes/trener/`](app/routes/trener/README.md) — widoki trenera (`/trener/*`)
  - [`app/routes/podopieczny/`](app/routes/podopieczny/README.md) — widoki podopiecznego (`/podopieczny/*`)
  - [`app/routes/marka/`](app/routes/marka/README.md) — widoki prezesa marki (`/marka/*`, rola `brand_admin`): powłoka + autorstwo katalogu marki (ćwiczenia, umiejętności, drzewo) + zarządzanie ambasadorami (trenerzy org: lista, profil, zaproszenie, dezaktywacja/reaktywacja); Regiony/Ustawienia „wkrótce"
- [`app/components/`](app/components/README.md) — współdzielone komponenty UI
- [`app/lib/`](app/lib/README.md) — logika domenowa i infrastruktura
  - [`app/lib/auth/`](app/lib/auth/README.md) — sesje, hasła, cookie, zaproszenia
  - [`app/lib/db/`](app/lib/db/README.md) — klient Drizzle, schemat, migracje
    - [`app/lib/db/migrations/`](app/lib/db/migrations/README.md) — migracje SQL (generowane)
  - [`app/lib/google/`](app/lib/google/README.md) — OAuth2 + Google Calendar/Meet sync (wychodząca, best-effort, opcjonalna)
  - [`app/lib/stripe/`](app/lib/stripe/README.md) — płatności Stripe Connect (klient, połączenia konta, status subskrypcji; opcjonalna)
  - [`app/lib/storage/`](app/lib/storage/README.md) — interfejs `FileStorage` + impl. lokalna
  - `app/lib/brand-catalog.ts` — repozytorium katalogu markowego dla prezesa (`brand_admin`): CRUD markowych ćwiczeń/umiejętności/wariantów/prerekwizytów + drzewo DAG; scope do `organizationId`; reużywa `skill-tree-math`; `skills.ts` trenera nienaruszone
  - `app/lib/ambassadors.ts` — repozytorium ambasadorów (trenerzy org) dla prezesa: lista z metrykami, profil, zaproszenie (→ `invite.ts`), dezaktywacja/reaktywacja + best-effort pauza subskrypcji; org-scoped
  - `app/lib/ambassador-types.ts` — `AmbassadorInviteSchema` (Zod): walidacja danych zaproszenia ambasadora
- [`app/styles/`](app/styles/README.md) — globalne tokeny CSS
- [`app/i18n/`](app/i18n/README.md) — konfiguracja i18next, `pickLang`, `resources`, typowanie `CustomTypeOptions`
- [`app/locales/`](app/locales/README.md) — słowniki JSON (`pl/`, `fr/`) + test parzystości kluczy

### Pozostałe katalogi
- [`scripts/`](scripts/README.md) — skrypty operacyjne (seed)
- [`public/`](public/README.md) — assety statyczne (ikona, manifest, fonty)
  - [`public/fonts/`](public/fonts/README.md) — self-hostowane woff2
- [`design-system/`](design-system/README.md) — system designu (brand, tokeny, podgląd)
  - [`design-system/assets/`](design-system/assets/README.md) — logo, ikony
  - [`design-system/fonts/`](design-system/fonts/README.md) — źródłowe woff2
  - [`design-system/preview/`](design-system/preview/README.md) — statyczne karty podglądu
- [`docs/`](docs/README.md) — dokumentacja, plany, logi
  - [`docs/ddd/`](docs/ddd/README.md) — metodyka DDD: pełne flow analizy strategicznej (generyczny playbook — 8 kroków, techniki, context mapping)
    - [`docs/ddd/kalisthenos/`](docs/ddd/kalisthenos/README.md) — konkretne wyniki analizy strategicznej DDD dla kalisthenos (brownfield, kroki 1–7), prowadzone fazami; indeks + tablica statusu + plan/runbook faz
  - [`docs/superpowers/`](docs/superpowers/README.md) — spec, plany, logi build/deploy
    - [`docs/superpowers/plans/`](docs/superpowers/plans/README.md)
    - [`docs/superpowers/specs/`](docs/superpowers/specs/README.md)
- [`prototype/`](prototype/README.md) — oryginalny prototyp React+Babel (tylko referencja)
- [`tests/`](tests/README.md) — testy integracyjne `*.itest.ts` (testcontainers, uruchamia właściciel)

### Konfiguracja w root (bez README — pliki samoopisowe)
`package.json`, `tsconfig.json`, `vite.config.ts`, `react-router.config.ts`,
`drizzle.config.ts`, `biome.json`, `vitest.config.ts`, `playwright.config.ts`,
`Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`, `railway.toml`,
`.env.example`.

### Poza zakresem README (generowane / vendored / runtime)
`node_modules/`, `.react-router/` (typy generowane przez RR7), `build/`,
`app/lib/db/migrations/meta/` (snapshoty Drizzle Kit), `data/` (uploady runtime,
w `.gitignore`), `design-system/_src/` (rozpakowany prototyp, read-only).

---

## Kluczowe konwencje (czytaj zanim zaczniesz kodować)

- **Multi-tenant przez `trainer_id`.** Każda tabela domenowa nosi `trainer_id`.
  Funkcje repozytorium w `app/lib/*.ts` przyjmują wymagany `trainerId`/`traineeId`
  i filtrują po nim. Brak autoryzacji → **404** (nie 403), by nie zdradzać
  istnienia zasobu. Szczegóły: [`app/lib/README.md`](app/lib/README.md),
  `app/lib/authz.ts`.
- **Trasy = plik + wpis w `app/routes.ts`.** Nazewnictwo plików:
  `segment.$param.tsx`, `_index.tsx`, `_layout.tsx`. Dodając trasę, dopisz ją do
  `app/routes.ts`. Mapa URL→plik: [`app/routes/README.md`](app/routes/README.md).
- **Loadery czytają, akcje mutują.** Brak osobnego API — dane lecą przez
  loadery/akcje RR7. Mutacje plikowe to `multipart/form-data`.
- **Pliki tylko przez `FileStorage` + podpisane URL-e.** Nigdy nie serwuj ścieżek
  z dysku wprost; używaj `signFileUrl`/`verifyFileUrl` (`app/lib/files.ts`) i
  trasy `files/$fileId`. Upload zawsze przez `uploadFile` z walidacją magic-bytes.
- **Schemat to źródło prawdy.** Zmiana modelu danych = edycja
  `app/lib/db/schema.ts`, potem `npm run db:generate` (nowa migracja) — **nigdy
  ręcznie nie edytuj plików w `migrations/`**.
- **Efektywny katalog (ćwiczenia/umiejętności) = markowe ∪ własne.** Wiersz katalogu
  jest albo markowy (`trainer_id NULL`, `organization_id`), albo trenerski
  (`trainer_id`, `organization_id NULL`); CHECK `*_owner_check` pilnuje dokładnie
  jednego właściciela. Trener WIDZI markowe pozycje swojej organizacji + własne, ale
  ZAPISUJE tylko na własnych — markowe są read-only. „Dostosuj" robi fork
  copy-on-write na własność trenera (`origin_id` → oryginał; `forkExercise`/`forkSkill`
  w `app/lib/catalog.ts`, czyste helpery w `catalog-math.ts`). Markowe demo ćwiczeń
  jest widoczne w obrębie organizacji (`fileIsBrandDemoInOrg`). Funkcje katalogu
  przyjmują `{ trainerId, organizationId }`; podopieczny dziedziczy org trenera
  (`resolveCatalogOrgId`).
- **UI po polsku.** Cała warstwa produktu jest polskojęzyczna; angielskie zostają
  tylko nazwy ćwiczeń (Pull-up, Front Lever…). Brand `kalisthenos` zawsze małą
  literą. Zasady języka/tonu/wizualne: [`design-system/README.md`](design-system/README.md).
- **npm, nie pnpm.** `npm install`, `npm run <skrypt>`, `npx`.
- **TDD jest normą.** Logikę testowalną bez DB piszemy test-first (`*.test.ts`,
  Vitest, `npm test`). Testy integracyjne (`*.itest.ts`, testcontainers) piszemy
  dla krytycznych przepływów (auth, publish planu, zapis logu, tenant-scope) i
  uruchamia je właściciel (Docker). Szczegóły: „Proces AI-developmentu" niżej.
- **Review per task.** Po każdym kroku implementacji robimy przegląd
  (`/code-review` / `superpowers:requesting-code-review`) przed kolejnym — nie
  jeden przegląd na końcu.
- **Sortowanie/filtrowanie list jest server-side przez URL params.** Używaj
  `app/lib/list-params.ts` (`parseListControls`, `buildControlHref`) i komponentu
  `app/components/list-controls.tsx` (`<ListControls>`). Przy dodawaniu nowej listy
  z sort/filter/szukajką — reużyj tych dwóch modułów, nie twórz własnych mechanizmów.
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
  | `npm run db:generate` | wygenerowanie migracji z `schema.ts` (bez DB) |
  | `npx vitest run <wzorzec>` | testy jednostkowe (NIE `npm test` — to watch) |
  | `npx biome format --write <plik>` | formatowanie dotkniętego pliku |

  Do czytania plików/wyników używaj narzędzi Read/Grep/Glob, **nie** `cat`/`tail`/
  `grep` w Bash. `npm run db:migrate`, git i docker — wyłącznie właściciel.

Komendy (`dev`, `build`, `db:migrate`, `db:seed`, `lint`, `format`…) i ich opis:
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
dokumentację i best practices używanych bibliotek (React Router v7, Drizzle, Zod,
postgres-js, vite-plugin-pwa…) — w brainstormie, planie i implementacji.

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
