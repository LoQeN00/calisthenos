# Obowiązkowa płatność = dostęp (gating) — design

> Status: do akceptacji → zatwierdzony. Data: 2026-06-06. Proces: FEATURE.
> **Nadpisuje** decyzję „status tylko widoczny, bez gatingu" z wcześniejszych
> speców płatności (świadomie). Rozszerza onboarding płatności + redesign.

## Cel

Podopieczny ma dostęp do aplikacji **tylko gdy ma opłaconą subskrypcję** u swojego
trenera. Płatność nie jest opcjonalna: po rejestracji z zaproszenia trafia na
ekran aktywacji i bez opłacenia nie wchodzi do aplikacji. Gating jest **ciągły** —
jeśli subskrypcja później wygaśnie, dostęp znika.

## Decyzje (ustalone)

1. **Gating ciągły:** dostęp wymaga aktywnej subskrypcji przez cały czas, nie tylko
   przy starcie.
2. **Grace na `past_due`:** statusy dające dostęp = **{active, paused, past_due}**.
   `past_due` (okno dunningu) zachowuje dostęp — pojedyncza nieudana płatność nie
   wyrzuca od razu; dostęp znika gdy subskrypcja realnie wygaśnie (`canceled`/`unpaid`).
3. **Gating tylko gdy płatność możliwa:** działa wyłącznie, gdy Stripe
   skonfigurowany **i** trener `chargesEnabled` **i** ustalona kwota (`stripePriceId`).
   Inaczej — pełny dostęp (nie zamykamy podopiecznego w pułapce nie z jego winy).
4. **Pauza zachowuje dostęp** (celowe zamrożenie przez trenera, nie zaległość).

## Predykat dostępu (czysty, testowalny)

Nowy moduł `app/lib/stripe/access.ts` (bez DB):

```ts
import type { SubscriptionStatus } from "~/lib/stripe/status";

export const ACCESS_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active", "paused", "past_due",
]);

/** Czy płatność jest realnie możliwa (więc gating ma sens). */
export function paymentRequired(a: {
  stripeConfigured: boolean;
  chargesEnabled: boolean;
  hasPrice: boolean;
}): boolean {
  return a.stripeConfigured && a.chargesEnabled && a.hasPrice;
}

/** Czy podopieczny ma dostęp do aplikacji. */
export function hasAppAccess(a: {
  paymentRequired: boolean;
  status: SubscriptionStatus | null;
}): boolean {
  if (!a.paymentRequired) return true;
  return a.status != null && ACCESS_STATUSES.has(a.status);
}
```

## Gating — `app/routes/podopieczny/_layout.tsx` (loader)

Layout obejmuje wszystkie `/podopieczny/*` (poza `wrapped.$ym` i nową `aktywuj`,
które są poza layoutem). W loaderze:

1. `requireUser` trainee.
2. Załaduj `sub = getSubscriptionForPair(trainerId, user.id)` i
   `conn = getConnectionRow(trainerId)`.
3. `const required = paymentRequired({ stripeConfigured: stripeApiConfigured(), chargesEnabled: !!conn?.chargesEnabled, hasPrice: !!sub?.stripePriceId });`
4. `const access = hasAppAccess({ paymentRequired: required, status: sub?.status ?? null });`
5. `if (!access) throw redirect("/podopieczny/aktywuj");`
6. Reszta loadera (liczniki nawigacji, badge) bez zmian.

Brak pętli redirectów: `aktywuj` jest **poza** tym layoutem.

## Ekran aktywacji — `app/routes/podopieczny/aktywuj.tsx` (NOWA, poza layoutem)

Pełnoekranowy (jak `wrapped.$ym`), bez sidenavu.

- **loader:** `requireUser` trainee; załaduj `sub`, `conn`, nazwę trenera. Policz
  `required`/`access` tym samym predykatem. **Jeśli `access` (lub `!required`) →
  `redirect("/podopieczny")`** (nie ma po co tu być). Inaczej zwróć dane do ekranu.
- **action:** `subscribe` → `createCheckoutSession(...)` → `redirect(url)` (łap
  `SubscriptionError` → `{error}`). (Wylogowanie to istniejąca trasa `/wyloguj`.)
- **komponent:** brand + „Aktywuj subskrypcję, aby uzyskać dostęp" + blok jawności
  (Prowadzenie u **{trener}**, **{kwota}**/mc, auto-odnawianie, anulujesz w panelu)
  + przycisk **„Opłać i aktywuj"** (Form POST `subscribe`) + link **„Wyloguj"**
  (`/wyloguj`) + obsługa `?canceled=1` (baner „Płatność anulowana — spróbuj ponownie").
  Po sukcesie Checkout wraca na `/podopieczny/platnosci?ok=1` (już z dostępem).

## Rejestracja — `app/routes/zaproszenie.$token.tsx`

Po `consumeInvite` (created): nadal best-effort `setMonthlyAmount` (gdy kwota+Stripe),
ale redirect upraszczamy do **`/podopieczny`** — gating w layoutcie sam przekieruje
na `/aktywuj`, gdy płatność wymagana. (Znika osobny `?onboarding=1`.)

## routes.ts

Dodaj `route("podopieczny/aktywuj", "routes/podopieczny/aktywuj.tsx")` w bloku
`prefix("podopieczny", [...])` **poza** `layout(...)` (obok `wrapped/:ym`).

## Co zostaje

`past_due` baner + Portal, pauza/wznów, badge (przydatny w grace), strona
`/podopieczny/platnosci` jako zarządzanie dla opłaconych. Dunning (Smart Retries)
i jego stan końcowy `cancel` — konfiguracja panelu Stripe (handoff). Gdy subskrypcja
wygaśnie (`canceled`), kolejna nawigacja → `/aktywuj` (re-subskrypcja).

## Bezpieczeństwo (`/security-review`)

Gating po `user.id`/`user.trainerId`; ekran aktywacji tworzy Checkout tylko dla
własnej pary; brak pętli redirectów (aktywuj poza layoutem); `/wyloguj` zawsze
dostępne (poza layoutem). Brak nowych sekretów, brak migracji. Trasy trenera
nietknięte.

## Testy

- **Jednostkowe (TDD):** `access.ts` — `paymentRequired` (kombinacje flag),
  `hasAppAccess` (każdy status: active/paused/past_due → true; none/incomplete/
  canceled/unpaid → false gdy required; zawsze true gdy !required).
- **Integracyjne (Docker — pisane):** layout loader gatuje (brak active → redirect)
  i przepuszcza (active/paused/past_due); brak konfiguracji trenera → przepuszcza.
  (Reuse harnessu; mock Stripe.)

## Dokumentacja

`app/lib/stripe/README.md` (`access.ts`), `app/routes/podopieczny/README.md`
(`aktywuj.tsx` + gating w `_layout`), root `README.md` (model „dostęp = opłacona
subskrypcja", grace na past_due, brak gatingu gdy trener nieskonfigurowany),
ewentualnie wzmianka w `CLAUDE.md`.

## Poza zakresem

`wrapped` poza gatingiem (historyczne); win-back przy wygaśnięciu; e-mail.
