# Panel prezesa — zarządzanie ambasadorami (plasterek #4c) — design spec

**Status:** Draft — do przeglądu właściciela
**Data:** 2026-06-08
**Epik:** „Platforma marki" — `marka → ambasadorzy (trenerzy) → podopieczni`.
**Plasterek:** obszar **C** wizji panelu prezesa (po #4a „katalog marki"). Kolejne
obszary wizji poza zakresem: A (analityka sieci), D (regiony), E (branding),
#5 (prowizja Stripe + white-label), #6 (Wrapped/odznaki).

---

## 1. Cel i zakres

Dziś konta trenerów powstają **wyłącznie przez seed** — nie ma ścieżki dodania
ambasadora z poziomu produktu, ani widoku sieci trenerów dla prezesa. Tabela
`invites` jest zaszyta pod podopiecznych (`trainer_id` zapraszającego + tworzy
`role:"trainee"`). Ten plasterek daje prezesowi zarządzanie ambasadorami.

### W zakresie (#4c)
- **Lista ambasadorów** (trenerzy w organizacji prezesa): imię/e-mail, region,
  data dołączenia, liczba aktywnych podopiecznych, status (aktywny/wstrzymany);
  sort/szukajka/filtr statusu (URL params, `<ListControls>`), paginacja.
- **Profil ambasadora (rozszerzony):** tożsamość + status + metryki: aktywni
  podopieczni, logi treningowe 7/30 dni, **MRR** (suma `monthly_amount_grosze`
  aktywnych subskrypcji jego par). Akcje: dezaktywuj / reaktywuj.
- **Zapraszanie ambasadora:** link self-onboarding (jak u podopiecznego) —
  prezes podaje imię, opcjonalny e-mail, **region** (z regionów org); trener sam
  ustawia e-mail i hasło przez `zaproszenie/:token`. Prezes nie dotyka haseł.
- **Dezaktywacja/reaktywacja:** miękka blokada przez `users.archived_at` →
  blokuje logowanie trenera + **wstrzymuje jego podopiecznych** (ekran „konto
  wstrzymane") + **best-effort pauzuje ich subskrypcje Stripe** (reaktywacja
  wznawia).
- Aktywacja pozycji „Ambasadorzy" w sidenav `/marka` (dziś „wkrótce").

### Poza zakresem (#4c) — świadome cięcia
- Analityka sieci zbiorcza (A), regiony CRUD (D), branding (E).
- Reassignment podopiecznych do innego ambasadora (osobny plasterek).
- Edycja profilu trenera przez prezesa (poza dezaktywacją).
- Retencja jako metryka (niejednoznaczna) — pomijamy; profil pokazuje aktywni
  podopieczni + logi 7/30d + MRR.

### Kryteria sukcesu
1. Prezes zaprasza ambasadora → link → trener zakłada konto (`role:"trainer"`,
   `organization_id` = org prezesa, `region_id` = wybrany, `trainer_id` NULL).
2. Nowy ambasador loguje się i widzi `/trener` (działa jak istniejący trener).
3. Lista i profil pokazują trenerów **tylko** organizacji prezesa; trener spoza
   org → 404.
4. Dezaktywacja: trener nie może się zalogować (i jego sesja przestaje działać);
   jego podopieczni lądują na „wstrzymane"; ich aktywne subskrypcje są spauzowane.
   Reaktywacja odwraca wszystko.
5. **Istniejące zaproszenia podopiecznych działają bez zmian** po migracji
   (backfill `target_role='trainee'`).
6. Bramki zielone; `/code-review` per task; `/security-review` (auth + rola +
   tenant-scope + dezaktywacja + zaproszenia).

---

## 2. Model danych — uogólnienie `invites` (`app/lib/db/schema.ts`)

Dziś: `invites.trainer_id` NOT NULL (cascade), `display_name`, `email` (citext,
nullable), `token_hash`, `expires_at`, `consumed_at`, `consumed_by_user`,
`replaces_user_id`, `monthly_amount_grosze`, `created_at`; indeksy
`invites_token_hash_uniq`, `invites_trainer_idx`.

### Zmiany
- Nowy enum `invite_target_role` = `['trainee','trainer']` (NOWY enum — brak
  problemu 55P04, bo nie rozszerzamy istniejącego).
- `invites.target_role` `invite_target_role` NOT NULL, **DEFAULT `'trainee'`**
  (backfill istniejących wierszy bez ręcznego UPDATE).
- `invites.trainer_id` → **nullable** (usuń `.notNull()`; pozostaje cascade).
- nowe kolumny (nullable): `organization_id` → `organizations.id` (restrict),
  `region_id` → `regions.id` (restrict), `invited_by_user_id` → `users.id`
  (restrict).
- CHECK `invites_target_check`:
  ```
  (target_role = 'trainee' AND trainer_id IS NOT NULL) OR
  (target_role = 'trainer' AND invited_by_user_id IS NOT NULL
     AND organization_id IS NOT NULL AND trainer_id IS NULL)
  ```
- Indeks na `organization_id`: **pomijamy w #4c** (lista wystawionych zaproszeń per org nie jest w zakresie — zaproszenie generuje link i tyle). Dosypiemy, gdy powstanie widok „oczekujące zaproszenia".

> Uwaga migracyjna: `DEFAULT 'trainee'` + `target_role NOT NULL` na zapełnionej
> tabeli jest bezpieczne (istniejące wiersze dostają default). `trainer_id`
> rozluźnienie NOT NULL niedestrukcyjne. CHECK spełniony przez istniejące wiersze
> (mają `trainer_id`). Generuje właściciel w TTY (`db:generate` interaktywne).

---

## 3. Auth i zaproszenia (`app/lib/auth/`)

### `createInvite` (`auth/invite.ts`)
`CreateInviteInput` rozszerzony o `targetRole: "trainee" | "trainer"` oraz
`organizationId?`, `regionId?`, `invitedByUserId?`. `trainerId` staje się
opcjonalny. Wstawia odpowiednie kolumny wg roli. Ścieżka podopiecznego
(domyślny `targetRole:"trainee"`, `trainerId` wymagany) — bez zmiany zachowania.

### `consumeInvite` (`auth/invite.ts`)
Rozgałęzienie po `invite.targetRole`:
- `'trainee'` (jak dziś): tworzy `role:"trainee"`, `trainer_id = invite.trainer_id`.
- `'trainer'`: tworzy `role:"trainer"`, `organization_id = invite.organization_id`,
  `region_id = invite.region_id`, `trainer_id = NULL`, `joinedOn = today`.
  (Inwariant trenera: `trainer_id NULL` + org+region — patrz tenancy #1.)
Atomowość (`SELECT … FOR UPDATE`) i `replacesUserId` bez zmian. Ścieżka
`replaces` dotyczy tylko podopiecznych (re-zaproszenie) — dla trenera nieużywana.

### Rejestracja zarchiwizowanych — blokada logowania (`auth/index.ts`)
`getOptionalUser` (lub `requireUser`) traktuje użytkownika z **własnym**
`archived_at != NULL` jak niezalogowanego: zwraca `null` / `requireUser` przekierowuje
na `/login`. Dotyczy **wszystkich ról** jednolicie. Skutki:
- Dezaktywowany trener (własny `archived_at`) → zablokowany login, martwa sesja.
- **Podopieczny dezaktywowanego trenera ma własny `archived_at = NULL`** → loguje
  się normalnie, ale jest gated w layoucie (patrz §5). To celowe: ma zobaczyć
  „wstrzymane", nie być wylogowany.

`readSession` musi dociągać `archived_at` (jeśli jeszcze nie). Czysta logika
predykatu (np. `isActiveUser(user)`/wbudowana w getOptionalUser) — testowalna.

---

## 4. Trasy i powłoka

`app/routes.ts` — pod `marka/`:

| Plik | URL | Eksporty | Rola |
|---|---|---|---|
| `marka/ambasadorzy._index.tsx` | `/marka/ambasadorzy` | loader, default | Lista ambasadorów org (`<ListControls>` sort/szukajka/filtr statusu, paginacja) + „Zaproś ambasadora". |
| `marka/ambasadorzy.nowy.tsx` | `/marka/ambasadorzy/nowy` | loader, action, default | Formularz zaproszenia (imię, e-mail opcj., region z listy regionów org); akcja `inviteAmbassador` → zwraca link (14 dni), `<CopyButton>`. |
| `marka/ambasadorzy.$trainerId.tsx` | `/marka/ambasadorzy/:trainerId` | loader, action, default | Profil + metryki; akcje `deactivate`/`reactivate`. Tenant-scope → 404. |

- `_layout.tsx` marki: aktywuj pozycję „Ambasadorzy" (NavLink zamiast disabled),
  badge = liczba aktywnych ambasadorów (opcjonalnie).
- `routes/zaproszenie.$token.tsx` — gałąź trenera: gdy `invite.target_role='trainer'`,
  formularz/komunikaty „dołącz jako trener marki"; po konsumpcji redirect na
  `/trener` (zamiast `/podopieczny`). `defaultPathForRole` już zwraca `/trener`
  dla trenera — reużyj. Rate-limit jak dziś.

**i18n:** rozszerzenie namespace `marka` (`ambasadorzy.*`) + ewentualne klucze w
`common`/zaproszenia dla gałęzi trenera — pl + fr, parytet kluczy. **Klucze
pojedyncze z `{{count}}`** (bez sufiksów `_one/_few/_other` — konwencja projektu).

**UI/UX:** warstwa wizualna przez `frontend-design:frontend-design`; lustro
`trener/podopieczni._index.tsx` (lista + akcja zaproszenia + link) i karty
profilu. Polski UI, design-system.

---

## 5. Dezaktywacja — gate podopiecznego + ekran „wstrzymane"

### Repo `app/lib/ambassadors.ts` (org-scoped — `organizationId` prezesa)
- `listAmbassadors(db, organizationId, controls?)` → trenerzy org (status z
  `archived_at`, liczba aktywnych podopiecznych).
- `getAmbassadorProfile(db, organizationId, trainerId)` → null gdy trener spoza
  org (→ 404); tożsamość + metryki:
  - aktywni podopieczni: count `users` role trainee, `trainer_id = X`,
    `archived_at IS NULL`.
  - logi 7/30d: count `workout_logs` (`trainer_id = X`, data w oknie).
  - MRR: suma `coaching_subscriptions.monthly_amount_grosze` gdzie
    `trainer_id = X` i `status = 'active'` (tylko realnie naliczające; `past_due`/
    `paused` wykluczone — MRR to bieżący, pewny przychód miesięczny).
- `inviteAmbassador(db, { organizationId, invitedByUserId, regionId, displayName, email })`
  → `createInvite` z `targetRole:"trainer"`. Waliduje, że `regionId` należy do org.
- `deactivateAmbassador(db, organizationId, trainerId)`:
  1. Weryfikuje, że trener należy do org (inaczej `AmbassadorError`/404).
  2. `UPDATE users SET archived_at = now()` (scope org).
  3. **Poza transakcją**, best-effort: dla każdej pary tego trenera z aktywną
     subskrypcją → `pauseSubscription` (stripe/subscriptions). Błędy logowane,
     nie blokują. No-op gdy Stripe nieskonfigurowany.
- `reactivateAmbassador(db, organizationId, trainerId)`: `archived_at = NULL` +
  best-effort `resumeSubscription` dla spauzowanych par.
- `AmbassadorError` (komunikaty PL).

### Gate w `podopieczny/_layout.tsx`
Po `requireUser(trainee)`, **przed** bramką płatności: jeśli trener podopiecznego
(`user.trainerId`) ma `archived_at != NULL` → `throw redirect("/podopieczny/wstrzymane")`.
Wstrzymanie = wyprowadzone z trenera (brak osobnej flagi na podopiecznym).

### Nowa trasa `podopieczny/wstrzymane.tsx` (POZA layoutem)
Pełnoekranowy ekran „Konto wstrzymane" (styl `auth-shell`/`aktywuj`): wyjaśnienie
+ „Wyloguj". Loader: jeśli trener NIE jest zarchiwizowany → redirect `/podopieczny`
(by ekran nie wisiał po reaktywacji). Poza layoutem — inaczej pętla redirectów
(jak `aktywuj`).

---

## 6. Plan testów

### Jednostkowe (`*.test.ts`, Vitest — test-first, uruchamiane)
- Zod formularza zaproszenia ambasadora: region wymagany, e-mail opcjonalny/format,
  imię min 1.
- Czysty guard kształtu invite (`target_role` trener vs podopieczny → wymagane pola)
  — jeśli wydzielony do czystej funkcji (preferowane).
- `defaultPathForRole` — już pokryte (trener→/trener).
- Czyste helpery metryk, jeśli powstaną (np. składanie MRR z wierszy).

### Integracyjne (`*.itest.ts`, testcontainers — PISANE, uruchamia właściciel)
Krytyczne przepływy (auth + tenant-scope + dezaktywacja):
- Zaproszenie trenera → konsumpcja → konto `trainer` w org+region, `trainer_id NULL`;
  login → `/trener`.
- Istniejące zaproszenie podopiecznego nadal działa (backfill `target_role`).
- Dezaktywacja: trener po `archived_at` nie przechodzi `getOptionalUser` (login
  zablokowany); jego podopieczny trafia na `/podopieczny/wstrzymane`; (mock Stripe)
  pauza wywołana. Reaktywacja odwraca.
- Izolacja: prezes org A dostaje 404 na profilu/dezaktywacji trenera org B;
  `listAmbassadors` zwraca tylko trenerów org prezesa.
- CHECK `invites_target_check`: odrzuca trener-invite bez org/invited_by; trainee-invite
  bez trainer_id.

### Bramki
`npm test` + `typecheck` + `lint` + `build`; `/code-review` per task;
`/security-review` (auth/rola/tenant-scope/dezaktywacja/zaproszenia). Itesty:
zaraportować, właściciel uruchamia pod Dockerem.

---

## 7. Migracja, env, dokumentacja

- **Migracja:** `db:generate` po edycji `schema.ts` (`invites`: enum
  `invite_target_role`, `target_role` z default, nullable `trainer_id`, nowe FK,
  CHECK). **Interaktywne** — właściciel w TTY („create column"). Potem `db:migrate`.
- **Env / seed:** brak nowych zmiennych; seed bez zmian (opcjonalnie można w
  przyszłości doseedować drugiego ambasadora — poza zakresem).
- **Dokumentacja (część „done"):** `app/lib/README.md` (nowy `ambassadors.ts`;
  zmiany w `auth/invite.ts`/`auth/index.ts`), `app/lib/auth/README.md` (uogólnione
  zaproszenia + blokada zarchiwizowanych), `app/lib/db/README.md` (`invites`),
  `app/routes/README.md` + `app/routes/marka/README.md` (nowe trasy ambasadorów),
  `app/routes/podopieczny/README.md` (`wstrzymane`), `CLAUDE.md` (mapa).

---

## 8. Handoff (granica gita)
Po implementacji: lista plików, proponowany commit, nota o `db:generate`/`db:migrate`
(zmiana `invites`; interaktywne), brak env, komendy itestów pod Dockerem, ścieżka
ręcznej weryfikacji (prezes zaprasza ambasadora → konsumpcja linku → login trenera;
dezaktywacja → podopieczny widzi „wstrzymane" + subskrypcja spauzowana → reaktywacja).
Git/migrate/deploy prowadzi właściciel.

---

## 9. Ryzyka i decyzje
| Ryzyko / decyzja | Rozstrzygnięcie |
|---|---|
| Uogólnienie `invites` vs osobna tabela | Uogólnienie (jedna machineria tokenu/konsumpcji; trasa `zaproszenie/:token` reużyta). |
| Blokada zarchiwizowanych dotyka wszystkich ról | Pożądane: dezaktywowany trener blokowany; podopieczny (własny archived_at NULL) gated, nie wylogowany. |
| Billing wstrzymanego podopiecznego | Auto-pauza subskrypcji przy dezaktywacji (best-effort, poza tx), wznowienie przy reaktywacji. |
| Pętla redirectów na „wstrzymane" | Trasa poza layoutem (jak `aktywuj`); loader odbija aktywnych z powrotem. |
| `target_role` jako enum w migracji | NOWY enum (nie rozszerzamy `user_role`) → brak 55P04; `DEFAULT 'trainee'` backfilluje. |
| MRR z subskrypcji | Suma `monthly_amount_grosze` subskrypcji par trenera ze `status = 'active'` (past_due/paused wykluczone). |
