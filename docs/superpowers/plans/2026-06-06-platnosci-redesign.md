# Płatności redesign (P0+P1) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Pauza/wznów subskrypcji, jawny blok płatności + framing trenera, baner past_due, komunikat zmiany ceny — bez zmiany architektury (platforma=MoR). Dunning/Smart-Retries i prawo = handoff (panel Stripe / prawnik).

**Tech:** RR7, Drizzle+PG, Stripe (zainstalowany), Vitest, Biome. Bez migracji (enum `paused` już jest).

Spec: [`../specs/2026-06-06-platnosci-redesign-design.md`](../specs/2026-06-06-platnosci-redesign-design.md). Research: [`../2026-06-06-platnosci-research-best-practices.md`](../2026-06-06-platnosci-research-best-practices.md).

## Zasady (dev-flow)
Nigdy git/`npm install`/`db:migrate`/docker; review per task; handoff na końcu. Dozwolone: `npm run typecheck|lint|build`, `npm run test:unit -- <wzorzec>`, `npx biome format --write <plik>`. itesty pisane, nieuruchamiane.

---

## Task RD-1: pause/resume + paused-mapping (lib + webhook) + itest

**Files:** Modify `app/lib/stripe/subscriptions.ts`, `app/lib/stripe/webhook.ts`, `app/lib/stripe/webhook.test.ts`; Create `tests/stripe-pause.itest.ts` (WRITE, nie uruchamiać).

- [ ] **Step 1 — subscriptions.ts: pauza/wznów.** Dodaj (tenant-scope; wzór `cancelSubscription`):
```ts
/** Wstrzymuje pobieranie płatności (pauza). behavior 'void' — brak obciążeń i długu w pauzie. */
export async function pauseSubscription(db: Db, trainerId: string, traineeId: string): Promise<void> {
  const row = await getSubscriptionForPair(db, trainerId, traineeId);
  if (!row?.stripeSubscriptionId) throw new SubscriptionError("Brak aktywnej subskrypcji.");
  await getStripe().subscriptions.update(row.stripeSubscriptionId, {
    pause_collection: { behavior: "void" },
  });
  await db.update(schema.coachingSubscriptions)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, row.id));
}

/** Wznawia pobieranie płatności (czyści pauzę). */
export async function resumeSubscription(db: Db, trainerId: string, traineeId: string): Promise<void> {
  const row = await getSubscriptionForPair(db, trainerId, traineeId);
  if (!row?.stripeSubscriptionId) throw new SubscriptionError("Brak subskrypcji do wznowienia.");
  await getStripe().subscriptions.update(row.stripeSubscriptionId, { pause_collection: "" });
  await db.update(schema.coachingSubscriptions)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, row.id));
}
```
Zweryfikuj context7, że SDK przyjmuje `pause_collection: ""` do czyszczenia (alternatywnie `null`). Dostosuj jeśli typy wymagają innej wartości.

- [ ] **Step 2 — subscriptions.ts: applySubscriptionUpdate(+paused).** Zmień sygnaturę na `{ stripeSubscriptionId, stripeStatus, currentPeriodEnd, cancelAtPeriodEnd, paused }` i ustaw `status: paused ? "paused" : mapStripeStatus(args.stripeStatus)`. (Caller webhook poda `paused`.)

- [ ] **Step 3 — subscriptions.ts: framing trenera w nazwie produktu.** W `setMonthlyAmount` (tworzenie Price) ustaw `product_data: { name: \`Prowadzenie treningowe — ${trainerName}\` }`. Pobierz `trainerName` z `users.displayName` po `trainerId` (jedno zapytanie). Jeśli brak — fallback do dotychczasowej nazwy „Prowadzenie treningowe".

- [ ] **Step 4 — webhook.ts: paused w mapEvent (TDD).** Najpierw test: w `webhook.test.ts` dodaj przypadek `customer.subscription.updated` z `pause_collection: { behavior: "void" }` → oczekiwany `Change` (subscription) zawiera `paused: true`; oraz bez pole → `paused: false`. Uruchom `npm run test:unit -- webhook` (FAIL). Potem w `mapEvent` (gałąź subscription) dodaj do zwracanego obiektu `paused: (sub as any).pause_collection != null` (użyj właściwego typu `Stripe.Subscription`, pole `pause_collection`). W `Change` (subscription) dodaj `paused: boolean`. W `applyChange` przekaż `paused` do `applySubscriptionUpdate`. Test → PASS.

- [ ] **Step 5 — itest `tests/stripe-pause.itest.ts` (WRITE, nie uruchamiać).** Wzór `tests/stripe-subscriptions.itest.ts` (mock `~/lib/stripe/client`, fake `subscriptions.update`). Seeduj parę z `stripeSubscriptionId`. Testy: `pauseSubscription` → wiersz `status='paused'` + `subscriptions.update` wywołane z `pause_collection.behavior='void'`; `resumeSubscription` → `status='active'`; `applySubscriptionUpdate({paused:true,...})` → `status='paused'`; tenant-scope (obcy trener → SubscriptionError/brak). Komentarz „Uruchamia właściciel pod Dockerem". 

- [ ] **Step 6:** `npm run typecheck`, `npm run lint`, `npm run test:unit` (zielono), format. Review + `/security-review` (tenant-scope, pieniądze).

---

## Task RD-2: UI płatności — disclosure, pauza, past_due, framing, badge

**Files:** Modify `app/routes/trener/podopieczni.$traineeId.platnosci.tsx`, `app/routes/podopieczny/platnosci.tsx`, `app/routes/podopieczny/_layout.tsx`.

- [ ] **Step 1 — podopieczny/platnosci.tsx: blok jawności + framing.** Loader: dołącz nazwę trenera (pobierz `users.displayName` po `user.trainerId`). Komponent: nad przyciskiem „Subskrybuj" pokaż kartę jawności (gdy jest cena/`sub`): „Prowadzenie treningowe u **{trener}**", „Teraz: **{fmtMoney(amount)}**", „Następnie **{fmtMoney(amount)}** miesięcznie", „Pierwsze odnowienie: **{fmtDate(currentPeriodEnd)}**" gdy znane, „Subskrypcja odnawia się automatycznie — anulujesz w każdej chwili poniżej." UI po polsku, klasy `.card`/`.muted`.
- [ ] **Step 2 — podopieczny/platnosci.tsx: pauza/wznów + past_due.** Akcje `pause`/`resume` (intent w action → `pauseSubscription`/`resumeSubscription`, łap `SubscriptionError`→`{error}`). Przycisk „Wstrzymaj subskrypcję" gdy status `active`/`past_due`; „Wznów subskrypcję" gdy `paused`. Gdy `past_due`: baner `.alert` „Ostatnia płatność się nie powiodła — zaktualizuj metodę płatności." + istniejący przycisk „Zarządzaj płatnościami" (Portal). Bez blokowania innych funkcji.
- [ ] **Step 3 — trener/podopieczni.$traineeId.platnosci.tsx: pauza/wznów + komunikat ceny.** Akcje `pause`/`resume` (jak wyżej, po `assertTraineeOwnedBy`). Przyciski „Wstrzymaj"/„Wznów" wg statusu. Po `set-amount` gdy subskrypcja aktywna pokaż w `success` dopisek „Nowa kwota zacznie obowiązywać od następnego odnowienia." (albo osobny komunikat). Pokaż nazwę trenera/podopiecznego spójnie.
- [ ] **Step 4 — podopieczny/_layout.tsx: badge bez paused.** W loaderze layoutu zmień warunek badge: „wymaga akcji" dla `past_due`/`unpaid`/`none`(z ceną) — usuń `paused` z tego zbioru (pauza jest celowa). (Sprawdź aktualny warunek i skoryguj.)
- [ ] **Step 5:** `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:unit` (zielono), format. Review + `/security-review` (tenant-scope obu akcji; brak gatingu; redirecty Portal scoped).

> UI/UX: jeśli warstwa wizualna wymaga dopracowania ponad spójność z istniejącymi `.card/.alert/.btn`, użyj `frontend-design:frontend-design`. Mobile-first dla panelu podopiecznego.

---

## Task RD-3: docs + bramki końcowe + handoff

**Files:** `app/lib/stripe/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `README.md` (root).

- [ ] **Step 1 — docs.** `stripe/README.md`: `pauseSubscription`/`resumeSubscription`, `applySubscriptionUpdate(paused)`, mapowanie `pause_collection→paused`, framing nazwy produktu. Trasy: disclosure/pauza/past_due w wierszach platnosci. root `README.md`: sekcja „Płatności" — dopisz konfigurację panelu Stripe (Smart Retries 8/2 tyg. + stan końcowy cancel; Customer Portal: aktualizacja karty; opcjonalne e-maile Stripe) oraz notę o SCA (Checkout wymusza 3DS; nie zapisujemy karty po cichu) i notę prawną (VAT/e-faktury + powiadomienia o odnowieniu — do potwierdzenia z księgową).
- [ ] **Step 2 — bramki (dowód):** `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run build` — zielone.
- [ ] **Step 3 — `/code-review` całości + `/security-review`.**
- [ ] **Step 4 — handoff:** pliki, proponowany commit, **brak migracji**, itesty do uruchomienia (`npm run test:itest`), **konfiguracja panelu Stripe** (Smart Retries 8/2 tyg.→cancel, Customer Portal, e-maile), **noty prawne** (VAT/e-faktury, powiadomienia), ścieżka ręcznej weryfikacji (subskrybuj kartą `4242…` → wstrzymaj → status „Wstrzymana" + brak obciążeń → wznów; symuluj nieudaną płatność testową kartą odrzucaną → past_due baner + Portal).

## Self-review (spójność ze spec)
- pauza/wznów (`void`) + tenant-scope → RD-1/RD-2. ✅
- paused-mapping z webhooka (pause_collection) + test → RD-1. ✅
- applySubscriptionUpdate(paused) → RD-1. ✅
- framing trenera (copy + nazwa produktu Stripe) → RD-1/RD-2. ✅
- blok jawności/zgody (transparentność EU; zgodę zbiera Checkout) → RD-2. ✅
- past_due baner + Portal, bez gatingu → RD-2. ✅
- zmiana ceny: komunikat „od następnego odnowienia", proration none (już jest) → RD-2. ✅
- badge bez paused → RD-2. ✅
- SCA: weryfikacja+doc (Checkout, brak cichego zapisu) → RD-3. ✅
- dunning/Smart-Retries + VAT = handoff (panel/prawo) → RD-3. ✅
- bez zmian schematu/migracji. ✅
