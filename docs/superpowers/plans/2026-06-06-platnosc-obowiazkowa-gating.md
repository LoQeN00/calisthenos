# Obowiązkowa płatność = dostęp (gating) — plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: [`../specs/2026-06-06-platnosc-obowiazkowa-gating-design.md`](../specs/2026-06-06-platnosc-obowiazkowa-gating-design.md).

**Goal:** Dostęp podopiecznego = aktywna subskrypcja (active/paused/past_due), gdy płatność możliwa; inaczej redirect na pełnoekranowy ekran aktywacji. Bez migracji.

Zasady dev-flow: nigdy git/install/migrate/docker; review per task; handoff. Dozwolone: typecheck/lint/build, `test:unit -- <wzorzec>`, `biome format`. itesty pisane, nieuruchamiane.

---

## GATE-1: czysty predykat `access.ts` (TDD) + gating w layoutcie

**Files:** Create `app/lib/stripe/access.ts`, `app/lib/stripe/access.test.ts`; Modify `app/routes/podopieczny/_layout.tsx`.

- [ ] **Step 1 (TDD):** Napisz `access.test.ts` dla:
  - `paymentRequired`: true tylko gdy `stripeConfigured && chargesEnabled && hasPrice`; false gdy którakolwiek false.
  - `hasAppAccess`: gdy `paymentRequired=false` → zawsze true (dla każdego statusu i null). Gdy `paymentRequired=true` → true dla `active`/`paused`/`past_due`; false dla `none`/`incomplete`/`canceled`/`unpaid`/null.
  Uruchom `npm run test:unit -- access` → FAIL.
- [ ] **Step 2:** Zaimplementuj `app/lib/stripe/access.ts` (kod w specu): `ACCESS_STATUSES`, `paymentRequired`, `hasAppAccess`. Importuj typ `SubscriptionStatus` z `~/lib/stripe/status`. Test → PASS.
- [ ] **Step 3:** `podopieczny/_layout.tsx` loader — po `requireUser` trainee, przed/obok liczenia nawigacji: załaduj `sub = getSubscriptionForPair(db, user.trainerId!, user.id)` i `conn = getConnectionRow(db, user.trainerId!)` (importy z `~/lib/stripe/subscriptions` i `~/lib/stripe/connections`; `stripeApiConfigured` z `~/lib/env`). Policz `required = paymentRequired({ stripeConfigured: stripeApiConfigured(), chargesEnabled: !!conn?.chargesEnabled, hasPrice: !!sub?.stripePriceId })` i `access = hasAppAccess({ paymentRequired: required, status: sub?.status ?? null })`. `if (!access) throw redirect("/podopieczny/aktywuj");`. Reszta loadera (badge `paymentsBadge` itd.) bez zmian — możesz reużyć już pobrany `sub` zamiast ponownego zapytania.
- [ ] **Step 4:** `npm run typecheck`/`lint`/`test:unit` zielone; format. Review + `/security-review`.

> Uwaga: `aktywuj` (GATE-2) jest POZA tym layoutem → brak pętli redirectów. Dopóki GATE-2 nie istnieje, redirect na `/podopieczny/aktywuj` da 404 — to OK do czasu GATE-2 (typecheck/test nie zależą od istnienia trasy).

---

## GATE-2: ekran aktywacji + routes + rejestracja

**Files:** Create `app/routes/podopieczny/aktywuj.tsx`; Modify `app/routes.ts`, `app/routes/zaproszenie.$token.tsx`.

- [ ] **Step 1:** `aktywuj.tsx`:
  - loader: `requireUser` trainee; `sub`/`conn`/trainerName; policz `required`/`access` (te same helpery). **Jeśli `access` → `throw redirect("/podopieczny")`** (nie ma po co tu być). Zwróć `{ trainerName, amountGrosze: sub?.amountGrosze ?? null }`.
  - action: `subscribe` → `createCheckoutSession(db, { trainerId, traineeId:user.id, traineeEmail:user.email, traineeName:user.displayName })` → `redirect(url)`; `catch SubscriptionError → { error }`.
  - default: pełnoekranowy (klasy jak `wrapped`/`auth-shell` jeśli pasują; inaczej prosty wyśrodkowany `.card`). Brand, „Aktywuj subskrypcję, aby uzyskać dostęp", blok jawności (Prowadzenie u {trainerName ?? 'Twojego trenera'}, {fmtMoney(amountGrosze)}/mc gdy znane, auto-odnawianie), przycisk „Opłać i aktywuj" (Form POST intent=subscribe, btn-primary btn-lg), baner `?canceled=1` „Płatność anulowana — spróbuj ponownie", link „Wyloguj" → `/wyloguj`. Mobile-first, PL.
- [ ] **Step 2:** `app/routes.ts` — dodaj `route("podopieczny/aktywuj", "routes/podopieczny/aktywuj.tsx")` w `prefix("podopieczny", [...])` POZA `layout(...)`, obok `route("wrapped/:ym", ...)`.
- [ ] **Step 3:** `zaproszenie.$token.tsx` — uprość: po created nadal best-effort `setMonthlyAmount` (gdy kwota+`stripeApiConfigured`), ale `redirectTo` zawsze `/podopieczny` (usuń `?onboarding=1`). Gating przekieruje na `/aktywuj`.
- [ ] **Step 4:** `npm run typecheck`/`lint`/`build`/`test:unit` zielone; format. Review + `/security-review` (brak pętli, tenant-scope, /wyloguj dostępne, Checkout scoped).

---

## GATE-3: docs + bramki + handoff

- [ ] **Step 1:** Docs: `app/lib/stripe/README.md` (`access.ts`), `app/routes/podopieczny/README.md` (`aktywuj.tsx` + gating w `_layout`, usunięcie `?onboarding=1`), root `README.md` (model „dostęp = opłacona subskrypcja", grace na past_due, brak gatingu gdy trener nieskonfigurowany). Zaktualizuj/odnotuj, że poprzedni onboarding `?onboarding=1` zastąpiony ekranem aktywacji.
- [ ] **Step 2:** Bramki (dowód): `npm run test:unit`, `typecheck`, `lint`, `build` — zielone.
- [ ] **Step 3:** `/code-review` całości + `/security-review`.
- [ ] **Step 4:** Handoff: pliki, proponowany commit, brak migracji, itesty do uruchomienia, ścieżka ręcznej weryfikacji (zaproś z kwotą → zarejestruj → ląduje na /aktywuj bez dostępu do menu → opłać kartą 4242 → wraca z dostępem; anuluj w Portalu → kolejna nawigacja → /aktywuj).

## Self-review (spójność ze spec)
- predykat access (TDD) → GATE-1. ✅
- gating w layoutcie (active/paused/past_due; tylko gdy required) → GATE-1. ✅
- ekran aktywacji poza layoutem (redirect-if-access, subscribe, wyloguj) → GATE-2. ✅
- routes poza layoutem (brak pętli) → GATE-2. ✅
- rejestracja → /podopieczny (gating decyduje) → GATE-2. ✅
- docs/handoff → GATE-3. ✅
- bez migracji; pauza zachowuje dostęp (paused ∈ ACCESS_STATUSES). ✅
