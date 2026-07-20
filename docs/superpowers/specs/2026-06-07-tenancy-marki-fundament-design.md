# Fundament tenancy marki (plasterek #1) — design spec

**Status:** Draft — do przeglądu właściciela
**Data:** 2026-06-07
**Epik:** „Platforma marki" — przekształcenie dwupoziomowej aplikacji
(`trener → podopieczny`) w platformę globalnej marki kalistenicznej
(`marka → ambasadorzy → podopieczni`).
**Plasterek:** #1 z 6. Kolejne (poza zakresem tego specu): #2 i18n + multi-currency,
#3 globalne ścieżki umiejętności (skille tylko od marki), #4 panel prezesa,
#5 prowizja marki w Stripe + white-label, #6 udostępnialny Wrapped/odznaki.

---

## 1. Cel i zakres

### Cel
Dołożyć **trzeci poziom hierarchii nad trenerami** — organizację (markę) i region
(kraj) — oraz nową rolę `brand_admin` (prezes) stojącą nad wszystkimi trenerami.
To czysty **fundament danych + auth**: model, migracja istniejących danych i
logowanie prezesa do minimalnego placeholdera. Cała analityka/dashboard prezesa to
osobny plasterek (#4).

### W zakresie (#1)
- Tabele `organizations` (singleton na start) i `regions` (pełnoprawny byt: Polska,
  Francja…) z polami `currency` + `locale` (same pola, bez mechanizmu i18n/walut).
- Rola `brand_admin` w enumie `user_role`; wpięcie w auth (logowanie, guard roli,
  przekierowanie po zalogowaniu, `AuthUser`).
- Kolumny `organization_id` + `region_id` na `users`.
- Minimalny obszar `/marka`: layout + placeholder „Panel marki — wkrótce".
- Migracja DDL ze `schema.ts` + idempotentny **seed** backfillujący organizację,
  region PL i konto prezesa, oraz przypisujący istniejącego trenera i podopiecznego.

### Poza zakresem (#1) — świadome cięcia
- Dashboard/analityka prezesa, widok sieci ambasadorów (→ #4).
- Mechanizm i18n i wielowalutowość — przechowujemy tylko pola `locale`/`currency`
  (→ #2).
- Przeniesienie skilli na poziom marki (→ #3); model ma to **umożliwiać**, ale nie
  implementujemy.
- `organization_id` na tabelach domenowych (exercises, plans, logs…). Org jest
  wyprowadzalna przez `trainer_id → trainer.organization_id`; denormalizację
  dosypiemy dopiero w plasterku, który tego potrzebuje (#4/#5).
- Twarde `NOT NULL` na `users.organization_id`/`region_id` — odłożony hardening
  (patrz §3).
- Generator zaproszeń `brand_admin` (→ później, gdy prezes ma sam zapraszać).

### Kryteria sukcesu
1. Prezes (`brand_admin`) loguje się i ląduje na `/marka` (placeholder).
2. `brand_admin` **nie ma** dostępu do `/trener`, `/podopieczny` ani żadnego zasobu
   podopiecznego (404 / przekierowanie) — zweryfikowane testem integracyjnym.
3. Istniejący trener i podopieczny działają bez zmian po migracji; ich tenant-scope
   po `trainer_id` jest nienaruszony.
4. Seed jest idempotentny: dwukrotne uruchomienie nie tworzy duplikatów.
5. Bramki zielone (`npm test`, `typecheck`, `lint`, `build`), `/code-review`,
   `/security-review` (dotyka auth + roli + tenant-scope).

---

## 2. Hierarchia docelowa

```
organizations (marka)            ← branding, prowizja, globalne skille — przyszłe plasterki
   └─ regions (PL, FR)           ← currency (pln/eur), locale (pl-PL/fr-FR)
        └─ users[role=trainer]   ← ambasador (organization_id + region_id)
             └─ users[role=trainee]  ← podopieczny (organization_id; region dziedziczony z trenera)

users[role=brand_admin]          ← prezes: organization_id, region_id NULL (globalny), trainer_id NULL
```

Wariant przyjęty w brainstormie: **A** — region jako osobna tabela, „derive don't
denormalize" (tabele domenowe bez `organization_id`).

---

## 3. Schemat (`app/lib/db/schema.ts`)

### `organizations` (nowa, minimalna)
| kolumna | typ | uwagi |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `name` | text NOT NULL | nazwa marki |
| `created_at` | timestamptz NOT NULL | `defaultNow()` |

### `regions` (nowa, pełnoprawny byt)
| kolumna | typ | uwagi |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `organization_id` | uuid NOT NULL → `organizations.id` | `onDelete: restrict` |
| `name` | text NOT NULL | „Polska", „France" |
| `country` | text NOT NULL | ISO-3166 alpha-2 (`PL`, `FR`) |
| `currency` | text NOT NULL | małymi literami (`pln`/`eur`) — spójnie z `coaching_subscriptions.currency` i Stripe |
| `locale` | text NOT NULL | BCP-47 (`pl-PL`/`fr-FR`) — pasuje do `Intl` i do #2 |
| `created_at` | timestamptz NOT NULL | `defaultNow()` |

- `uniqueIndex("regions_org_country_uniq")` na `(organization_id, country)`.
- `index("regions_org_idx")` na `organization_id`.

### Zmiany w `users`
- enum `user_role`: `["trainer","trainee"]` → `["trainer","trainee","brand_admin"]`.
- nowe kolumny (**nullable na poziomie DB**):
  - `organization_id` uuid → `organizations.id` (`onDelete: restrict`)
  - `region_id` uuid → `regions.id` (`onDelete: restrict`)
- CHECK `users_role_check` — wyłącznie o `trainer_id` (nie o org/region). **Nie**
  odwołuje się wprost do `'brand_admin'`, bo migracja dodająca tę wartość enuma
  i używająca jej w tej samej transakcji failuje (Postgres 55P04). `role <> 'trainee'`
  pokrywa trainer + brand_admin (oba: `trainer_id IS NULL`) — semantyka identyczna:
  ```
  (role =  'trainee' AND trainer_id IS NOT NULL) OR
  (role <> 'trainee' AND trainer_id IS NULL)
  ```

### Docelowy kształt wierszy (inwariant egzekwowany w aplikacji + teście, nie w DB)
- `brand_admin`: `organization_id` ✔, `region_id` NULL, `trainer_id` NULL
- `trainer`: `organization_id` ✔, `region_id` ✔, `trainer_id` NULL
- `trainee`: `organization_id` ✔, `region_id` NULL (dziedziczy z trenera), `trainer_id` ✔
- Inwariant powiązań: `trainee.organization_id == trainer.organization_id` (jak
  istniejący `workout_logs.trainer_id == trainee.trainer_id`).

### Dlaczego org/region nullable, a nie twardy `NOT NULL`/CHECK
Tabela `users` jest zapełniona. `NOT NULL`/CHECK na org weryfikują się natychmiast
przy `db:migrate`, a backfill robimy w **seedzie** (po migracji) — twarde `NOT NULL`
wymagałoby dwóch rund generate/migrate wokół seeda. Inwariant pilnujemy w warstwie
aplikacji + teście integracyjnym (precedens: spec V1 §5.7). Zacieśnienie do
`NOT NULL` = **odłożony hardening** (gdy dane będą znane-czyste, np. w #4).

---

## 4. Auth i autoryzacja

### `AuthUser` (`app/lib/auth`)
Dodaj `organizationId: string | null` oraz `regionId: string | null`. Zapytanie
czytające sesję (`auth/session.ts` → `readSession`) musi dociągnąć te kolumny z
wiersza użytkownika.

### `requireUser` / guard roli
`requireUser(request, db, { role })` obsługuje teraz `"brand_admin"` jak każdą inną
wartość roli (bez zmian w mechanice — wartość enuma się rozszerza).

### Przekierowanie po zalogowaniu (`/` index + `/login`)
Logika „dokąd po zalogowaniu" rozszerzona o `brand_admin → /marka`. **Wydziel czystą
funkcję** `defaultPathForRole(role): string` (np. w `app/lib/auth` lub
`app/lib/routing.ts`) — testowalna jednostkowo, jedno źródło prawdy dla `_index.tsx`
i `login.tsx`.

### `authz.ts` — BEZ ZMIAN w tym plasterku
`brand_admin` nie pasuje do `ownsTrainerScope` (rola ≠ trainer → sprawdza
`user.trainerId === trainerId` → `null === trainerId` → `false`). To **pożądane**:
prezes nie ma dostępu do żadnego zasobu domenowego trenera/podopiecznego w #1.
Sieciowy odczyt prezesa (org-scoped) dochodzi w #4. Brak zmian = brak ryzyka
poszerzenia dostępu.

### Obszar `/marka` (minimalny)
- `app/routes/marka/_layout.tsx` — `requireUser(..., { role: "brand_admin" })`,
  prosty topbar + `<Outlet/>` (mobile-friendly, polski, design-system).
- `app/routes/marka/_index.tsx` — placeholder „Panel marki — wkrótce".
- Wpis w `app/routes.ts`.
- `brand_admin` wchodzący na `/trener` lub `/podopieczny` jest odbity (ich layouty
  wymagają roli trainer/trainee).

---

## 5. Migracja i seed

### Kolejność (prowadzi właściciel — git/docker/migrate po jego stronie)
1. Edycja `schema.ts` (tabele + kolumny + wartość enuma + CHECK).
2. `npm run db:generate` — **interaktywne** (drizzle-kit pyta o kolumny); właściciel
   w TTY wybiera „create column". Powstaje migracja DDL. Plików w `migrations/`
   nie edytujemy ręcznie.
3. `npm run db:migrate` — nakłada DDL.
4. `npm run db:seed` — backfill (poniżej).

### Seed (`scripts/seed.ts`) — idempotentny
- **Organizacja**: utwórz, jeśli nie istnieje (singleton; nazwa z `BRAND_NAME`).
  Gdy nie ma jeszcze żadnej organizacji i `BRAND_NAME` jest pusty, seed kończy się
  czytelnym błędem (nazwa marki to świadoma decyzja właściciela, nie zgadujemy).
  Idempotencja po istnieniu pojedynczego wiersza organizacji.
- **Region PL**: `name="Polska"`, `country="PL"`, `currency="pln"`,
  `locale="pl-PL"`, pod organizacją. Idempotencja po `(organization_id, country)`.
- **Istniejący trener(zy)**: ustaw `organization_id` = org, `region_id` = PL.
- **Istniejący podopieczny(-ni)**: ustaw `organization_id` = org, `region_id` = NULL.
- **Konto prezesa** (`brand_admin`): utwórz, jeśli email nie istnieje. Email z
  `BRAND_ADMIN_EMAIL`, hasło z `BRAND_ADMIN_PASSWORD` (hash przez
  `auth/password.ts:hashPassword`), `organization_id` = org, `region_id`/`trainer_id`
  = NULL. Hasło startowe do zmiany przy pierwszym logowaniu.
- Dwukrotne uruchomienie → brak duplikatów (organizacji, regionu, prezesa).

### Nowe zmienne środowiskowe (`app/lib/env.ts` + `.env.example`)
- `BRAND_ADMIN_EMAIL` — email konta prezesa (seed).
- `BRAND_ADMIN_PASSWORD` — startowe hasło prezesa (seed).
- `BRAND_NAME` — nazwa organizacji (seed; opcjonalna, z sensownym domyślnym).
Walidowane w `env.ts` jako **opcjonalne** (seed jest narzędziem operacyjnym; brak
nie wywala aplikacji). Dopisz do `.env.example` i opisu env w root `README.md`.

---

## 6. Wpływ na repo, trasy i dokumentację

- **Repozytoria filtrujące po `trainer_id`**: bez zmian. Tenant-scope nietknięty.
- **Nowy moduł `app/lib/organizations.ts`** (preferowany nad logiką inline w
  seedzie — testowalny i reużywalny przez #4): `ensureOrganization`, `ensureRegion`,
  `assignUserToOrgRegion`, `ensureBrandAdmin`. Czyste walidatory (np. `RegionInput`
  Zod) w osobnym pliku pod testy jednostkowe.
- **`app/routes.ts`**: dodać `/marka` (layout + index).
- **Dokumentacja (część „done"):**
  - `app/lib/db/README.md` — nowe tabele `organizations`, `regions`, zmiany w `users`.
  - `app/routes/README.md` — nowy obszar `/marka`.
  - nowy `app/routes/marka/README.md`.
  - `scripts/README.md` — rozszerzony seed + nowe env.
  - `.env.example` + root `README.md` (sekcja env).
  - `CLAUDE.md` — mapa projektu (nowy katalog tras `/marka`; ewentualny
    `app/lib/organizations.ts`).

---

## 7. Plan testów

### Jednostkowe (`*.test.ts`, Vitest, bez DB — pisane test-first i uruchamiane)
- `defaultPathForRole`: `brand_admin → /marka`, `trainer → /trener`,
  `trainee → /podopieczny`.
- `authz`: `canRead`/`ownsTrainerScope` zwracają `false` dla `brand_admin` wobec
  dowolnego zasobu domenowego (utrwalenie obecnego zachowania jako kontraktu).
- Walidator regionu (jeśli wydzielony): `currency ∈ {pln,eur}`,
  `locale ∈ {pl-PL,fr-FR}`, `country` = 2 litery.

### Integracyjne (`*.itest.ts`, testcontainers — PISANE, uruchamia właściciel)
Krytyczny przepływ: **auth + tenant-scope**.
- Seed: po uruchomieniu istnieją org + region PL + prezes; trener/podopieczny
  przypisani; **drugie uruchomienie nie duplikuje** (idempotencja).
- Login prezesa → `/marka`; **brak** dostępu do `/trener`, `/podopieczny` oraz do
  zasobu konkretnego podopiecznego (404/redirect).
- Trener i podopieczny zachowują dotychczasowy scope po migracji.
- CHECK roli: odrzuca `brand_admin` z `trainer_id`, `trainee` bez `trainer_id`,
  `trainer` z `trainer_id`.

### Bramki
`npm test` + `typecheck` + `lint` + `build`; `/code-review` per task;
`/security-review` (auth/rola/tenant-scope). Testy integracyjne: zaraportować i
poprosić właściciela o uruchomienie pod Dockerem.

---

## 8. Handoff (granica gita)
Po implementacji: lista zmienionych plików, proponowany komunikat commita, notatka
o `db:generate`/`db:migrate`/`db:seed`, nowe env (`BRAND_ADMIN_EMAIL`,
`BRAND_ADMIN_PASSWORD`, `BRAND_NAME`), komendy testów integracyjnych do odpalenia,
ścieżka ręcznej weryfikacji (login prezesa → `/marka`; próba wejścia na `/trener`).
Git/migrate/seed/deploy prowadzi właściciel.

---

## 9. Ryzyka i decyzje
| Ryzyko / decyzja | Rozstrzygnięcie |
|---|---|
| `NOT NULL` na org/region przy zapełnionej tabeli | Nullable + inwariant w aplikacji/teście; twardy NOT NULL = odłożony hardening |
| `db:generate` interaktywne | Właściciel w TTY wybiera „create column"; migracji nie edytujemy ręcznie |
| Poszerzenie dostępu przez nową rolę | `authz.ts` bez zmian; `brand_admin` nie ma dostępu domenowego w #1 |
| Region jako string vs byt | Tabela `regions` — gotowość na regionalnego managera/branding bez migracji |
| Denormalizacja `organization_id` wszędzie | Odrzucona w #1 (przedwczesna); derive przez `trainer_id` |
| Spójność `currency`/`locale` z resztą | `currency` małymi literami (jak Stripe/`coaching_subscriptions`); `locale` BCP-47 (jak `Intl`) |
