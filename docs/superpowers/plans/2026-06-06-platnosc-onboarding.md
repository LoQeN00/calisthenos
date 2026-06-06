# Płatność w onboardingu — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Trener ustala miesięczną kwotę przy zaproszeniu; po rejestracji podopieczny trafia na pomijalny krok „dodaj kartę, aby aktywować abonament", a cennik zakłada się automatycznie.

**Architecture:** Kwota jedzie na `invites.monthly_amount_grosze`. Rejestracja (`zaproszenie.$token`) po `consumeInvite` (best-effort, gdy Stripe skonfigurowany) woła `setMonthlyAmount` i przekierowuje na `/podopieczny/platnosci?onboarding=1`. Graceful bez Stripe/kwoty.

**Tech Stack:** RR7, Drizzle+PG, Stripe (zainstalowany), Zod, Vitest, Biome.

Spec: [`../specs/2026-06-06-platnosc-onboarding-design.md`](../specs/2026-06-06-platnosc-onboarding-design.md).

## Zasady (kalisthenos-dev-flow)
- Nigdy git/`npm install`/`db:migrate`/docker; review per task; handoff na końcu.
- Dozwolone: `npm run typecheck|lint|build`, `npm run test:unit -- <wzorzec>`, `npm run db:generate`, `npx biome format --write <plik>`. itesty pisane, nieuruchamiane.

---

## Task OB-1: schema `invites.monthly_amount_grosze`

**Files:** Modify `app/lib/db/schema.ts`; Create migration via `db:generate`.

- [ ] **Step 1:** W definicji tabeli `invites` (sekcja Sessions + Invites) dodaj kolumnę po `replacesUserId`:
```ts
    monthlyAmountGrosze: integer("monthly_amount_grosze"),
```
(`integer` jest już importowany.)
- [ ] **Step 2:** `npm run db:generate` → nowa migracja `ALTER TABLE "invites" ADD COLUMN "monthly_amount_grosze" integer;` (nullable → nieinteraktywne). Nie edytuj SQL.
- [ ] **Step 3:** `npm run typecheck` (zielono), `npm run lint` (zielono), `npx biome format --write app/lib/db/schema.ts`.
- [ ] **Step 4:** Review (`/code-review`). Handoff: migracja do `db:migrate`.

---

## Task OB-2: `createInvite` + formularz zaproszenia z kwotą

**Files:** Modify `app/lib/auth/invite.ts`, `app/routes/trener/podopieczni._index.tsx`.

- [ ] **Step 1:** `app/lib/auth/invite.ts` — w `CreateInviteInput` dodaj `monthlyAmountGrosze?: number | null;`. W `createInvite` w `.values({...})` dodaj `monthlyAmountGrosze: input.monthlyAmountGrosze ?? null,`.
- [ ] **Step 2:** `podopieczni._index.tsx` — import `parsePlnToGrosze`, `MonthlyAmountSchema` z `~/lib/money` i `stripeApiConfigured` z `~/lib/env`. Loader: dodaj do zwracanego obiektu `stripeAvailable: stripeApiConfigured()`.
- [ ] **Step 3:** Akcja — po walidacji `InviteSchema` (zostaw bez zmian) odczytaj kwotę osobno (opcjonalną):
```ts
const amountRaw = String(fd.get("monthlyAmount") ?? "").trim();
let monthlyAmountGrosze: number | null = null;
if (amountRaw !== "") {
  const g = parsePlnToGrosze(amountRaw);
  const parsedAmt = g === null ? null : MonthlyAmountSchema.safeParse(g);
  if (!parsedAmt || !parsedAmt.success) {
    return { error: "Kwota miesięczna jest nieprawidłowa (min. 2 zł)." };
  }
  monthlyAmountGrosze = parsedAmt.data;
}
```
Przekaż `monthlyAmountGrosze` do `createInvite({ ..., monthlyAmountGrosze })`.
- [ ] **Step 4:** Formularz w modalu zaproszenia — dodaj pole tylko gdy `stripeAvailable` (z loadera): input `name="monthlyAmount"` typu text/decimal, label „Kwota miesięczna (zł) — opcjonalnie", krótki helper „Podopieczny doda kartę przy dołączaniu.". UI po polsku, klasy `.field`/`.input` jak reszta formularza.
- [ ] **Step 5:** `npm run typecheck`, `npm run lint`, `npm run test:unit` (zielono), `npx biome format --write` dotknięte pliki.
- [ ] **Step 6:** Review + (dotyka zaproszeń/`trainer_id`) `/security-review`.

---

## Task OB-3: rejestracja → `setMonthlyAmount` + onboarding na płatnościach

**Files:** Modify `app/routes/zaproszenie.$token.tsx`, `app/routes/podopieczny/platnosci.tsx`; Create `tests/onboarding-payment.itest.ts` (WRITE, nie uruchamiać).

- [ ] **Step 1:** `zaproszenie.$token.tsx` — import `stripeApiConfigured` z `~/lib/env` i `setMonthlyAmount` z `~/lib/stripe/subscriptions`. Po udanym `consumeInvite` (mamy już `result` i `invite`):
```ts
let redirectTo = user.role === "trainer" ? "/trener" : "/podopieczny";
if (result.kind === "created" && invite.monthlyAmountGrosze != null && stripeApiConfigured()) {
  try {
    await setMonthlyAmount(db, invite.trainerId, user.id, invite.monthlyAmountGrosze);
    redirectTo = "/podopieczny/platnosci?onboarding=1";
  } catch (err) {
    // Best-effort: nie blokuj założenia konta. Trener ustawi kwotę później.
    console.error("[onboarding] setMonthlyAmount failed", err);
  }
}
return redirect(redirectTo, { headers: { "Set-Cookie": buildSetCookie(id, expiresAt) } });
```
(Zastąp dotychczasowy `return redirect(...)`.)
- [ ] **Step 2:** `podopieczny/platnosci.tsx` — loader: dołącz `onboarding: new URL(request.url).searchParams.get("onboarding") === "1"` do zwracanych danych. Komponent: gdy `onboarding`, wyświetl na górze powitalny baner (klasa `.alert` lub `.card`): „Witaj! Twój trener ustalił abonament {fmtMoney(sub.amountGrosze)} miesięcznie. Dodaj kartę, aby aktywować." (gdy `sub` istnieje; inaczej neutralny tekst) + link `<Link to="/podopieczny">Zrobię to później</Link>`. Przy braku `sub`/kwoty baner mówi neutralnie i też daje „Zrobię to później".
- [ ] **Step 3:** itest `tests/onboarding-payment.itest.ts` (mock `~/lib/stripe/client` jak w pozostałych itestach): utwórz trenera + zaproszenie z `monthlyAmountGrosze`; wywołaj `consumeInvite` + `setMonthlyAmount(trainerId, newUserId, amount)`; asercja: istnieje wiersz `coaching_subscriptions` (pair trainer+trainee) z `amountGrosze` = kwota, `status='none'`. Drugi przypadek: zaproszenie bez kwoty → po `consumeInvite` brak wiersza. Komentarz „Uruchamia właściciel pod Dockerem". Nie uruchamiaj.
- [ ] **Step 4:** `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:unit` (zielono), format dotkniętych plików.
- [ ] **Step 5:** Review + `/security-review` (best-effort izolacja, brak wycieku błędów, tenant-scope).

---

## Task OB-4: dokumentacja + bramki końcowe + handoff

**Files:** `app/lib/auth/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, ewentualnie `CLAUDE.md`/spec płatności.

- [ ] **Step 1:** `auth/README.md` — `invite.ts`: dopisz, że `createInvite` przyjmuje opcjonalne `monthlyAmountGrosze` (kolumna `invites.monthly_amount_grosze`).
- [ ] **Step 2:** `trener/README.md` — wiersz `podopieczni._index.tsx`: zaproszenie ma opcjonalne pole kwoty (gdy Stripe skonfigurowany). `podopieczny/README.md` — `platnosci.tsx`: tryb onboardingowy `?onboarding=1`.
- [ ] **Step 3:** Bramki: `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run build` — wszystkie zielone (dowód).
- [ ] **Step 4:** `/code-review` na całości zmiany + `/security-review`.
- [ ] **Step 5:** Handoff: lista plików, proponowany commit, nota o migracji (`db:migrate`), itest do uruchomienia (`npm run test:itest`), ścieżka ręcznej weryfikacji (zaproś z kwotą → otwórz link → ustaw hasło → ląduje na onboardingu płatności → Subskrybuj/Pomiń).

## Self-review (spójność ze spec)
- Kwota na invites + migracja → OB-1. ✅
- createInvite + formularz + flaga stripe → OB-2. ✅
- rejestracja best-effort + redirect + onboarding banner + skip → OB-3. ✅
- itest tenant-scope/założenie cennika → OB-3. ✅
- docs → OB-4. ✅
- graceful bez Stripe (stripeApiConfigured guard) → OB-2/OB-3. ✅
- replaced → bez płatności (kind === "created" guard) → OB-3. ✅
