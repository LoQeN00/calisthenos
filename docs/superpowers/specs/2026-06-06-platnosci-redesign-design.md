# Płatności — redesign na poziom „best-in-class" (P0+P1) — design

> Status: do akceptacji. Data: 2026-06-06. Proces: FEATURE.
> Podstawa: [`../2026-06-06-platnosci-research-best-practices.md`](../2026-06-06-platnosci-research-best-practices.md).
> Rozszerza: feature płatności + onboarding płatności.

## Cel

Doprowadzić cykl życia subskrypcji do poziomu liderów (Everfit/Trainerize/Stripe
best practices), bez przebudowy architektury (Express + destination charges +
Checkout pozostają — potwierdzone jako poprawne). Płatność ma „należeć" do trenera
w odczuciu (framing), być transparentna i zgodna z EU, oraz pokrywać dunning,
pauzę i zmianę ceny.

## Decyzje (ustalone z właścicielem)

- **Merchant-of-record: platforma** (NIE ustawiamy `on_behalf_of`). „Osobistość"
  osiągamy przez **copy** (nazwa trenera na ekranach i w nazwie produktu Stripe),
  nie przez przełączanie MoR. Branding/deskryptor pozostają platformy.
- **Zakres: P0 + P1.**
- **Dunning: bez gatingu** — Smart Retries + przypomnienia in-app; po wyczerpaniu
  prób subskrypcja `canceled` (relacja/dane zostają). Pełny dostęp w czasie
  zaległości (spójne z „status tylko widoczny").
- **Pauza: trener i podopieczny** mogą wstrzymać/wznowić.
- **Przypomnienia: in-app teraz** (badge + banery); e-mail = osobna iteracja.
- **Zmiana ceny: od następnego odnowienia, bez proracji** (mniej tarcia, unika
  ponownego 3DS), z wyprzedzającym komunikatem.

## Podział pracy: kod vs panel Stripe vs prawo

**Kod (ten spec):** blok disclosure/zgody, framing trenera, pauza/wznów, obsługa
`paused` w webhooku/statusie, baner „zaktualizuj płatność" przy `past_due`,
komunikat o zmianie ceny, weryfikacja SCA.

**Panel Stripe (właściciel — handoff):** Smart Retries `8 prób / 2 tyg.`, stan
końcowy `cancel`; opcjonalnie wbudowane e-maile Stripe o nieudanej płatności;
Customer Portal z włączoną aktualizacją metody płatności.

**Prawo (właściciel/prawnik — handoff):** VAT/e-faktury w PL jako MoR; wymagane
powiadomienia o nadchodzącym obciążeniu.

## Zmiany w kodzie

### Brak zmian schematu / migracji

Mirror-enum `subscription_status` ma już `paused`. Pauzę reprezentujemy w naszym
mirrorze (`status='paused'`) wyliczanym z `pause_collection` w webhooku — Stripe
**nie** zmienia `subscription.status` przy `pause_collection` (potwierdzone w docs).

### `app/lib/stripe/subscriptions.ts`

- `pauseSubscription(db, trainerId, traineeId)`: `subscriptions.update(subId,
  { pause_collection: { behavior: "void" } })`. `void` = brak obciążeń i długu w
  czasie pauzy. Guard: brak subskrypcji → `SubscriptionError`. Lokalnie ustaw
  `status='paused'` defensywnie (webhook potwierdzi).
- `resumeSubscription(db, trainerId, traineeId)`: `subscriptions.update(subId,
  { pause_collection: "" })` (czyści pauzę). Lokalnie `status='active'` defensywnie.
- `applySubscriptionUpdate(...)` zyskuje parametr `paused: boolean`; ustawia
  `status: paused ? "paused" : mapStripeStatus(stripeStatus)`.
- `createCheckoutSession` / `setMonthlyAmount`: nazwa produktu Stripe Price/line
  item = `"Prowadzenie treningowe — {trenerDisplayName}"` (pobierz nazwę trenera).
  Dzięki temu paragon/Portal pokazują, za co i u kogo — mimo MoR=platforma.

### `app/lib/stripe/webhook.ts`

- W gałęzi `customer.subscription.updated/deleted` w `mapEvent` odczytaj
  `sub.pause_collection` i dołóż do `Change` (subscription) pole
  `paused: sub.pause_collection != null`. `applyChange` przekazuje je do
  `applySubscriptionUpdate`. (Czysty `mapEvent` testowalny — dodać przypadek
  testowy: pause_collection ustawione → paused true.)

### Trasy płatności (trener `podopieczni.$traineeId.platnosci.tsx` + podopieczny `platnosci.tsx`)

- **Blok disclosure/zgody** (przed „Subskrybuj"): „Prowadzenie treningowe u
  **{Trener}**", „Teraz zapłacisz **{fmtMoney}**", „Następnie **{fmtMoney}**
  miesięcznie", „Pierwsze odnowienie: **{data}**" (gdy znana), „Subskrypcja
  odnawia się automatycznie. Możesz anulować w każdej chwili w panelu płatności."
  Zgodę formalną zbiera sam Checkout Stripe (redirect) — nasz blok to jawność
  przed kliknięciem. (Pokrywa wymóg transparentności EU.)
- **Pauza/wznów**: akcje `pause`/`resume` (Form POST) — przycisk „Wstrzymaj
  subskrypcję" gdy `active`/`past_due`, „Wznów" gdy `paused`. Po obu stronach
  (trener: po `assertTraineeOwnedBy`; podopieczny: scope po `user.id`/`trainerId`).
- **`past_due`**: wyraźny baner „Ostatnia płatność się nie powiodła — zaktualizuj
  metodę płatności" + przycisk „Zarządzaj płatnościami" (Customer Portal, gdzie
  podmienia kartę). Bez blokady funkcji.
- **Zmiana ceny (trener)**: przy „Zapisz kwotę" komunikat „Nowa kwota zacznie
  obowiązywać od następnego odnowienia." (jeśli subskrypcja aktywna).
- **Status `paused`**: prezentacja „Wstrzymana" (już w `status.ts`).

### `app/routes/podopieczny/_layout.tsx`

- Badge „płatność wymaga akcji" liczony dla `past_due`/`unpaid`/`none`(z ceną) —
  **bez** `paused` (pauza jest celowa, nie wymaga akcji). (Korekta istniejącej
  logiki badge.)

### SCA — weryfikacja (bez zmian w kodzie, jeśli używamy Checkout)

Subskrypcja powstaje przez Stripe Checkout, który natywnie wymusza 3DS na
pierwszej płatności i ustanawia zgodę/mandate na odnowienia. **Nie** zapisujemy
karty „po cichu" (nie ma SetupIntentu poza Checkout). Krok onboardingu używa
Checkoutu → SCA spełnione. Do udokumentowania w README + handoff; gdyby kiedyś
pojawił się własny zapis karty (SetupIntent), musi iść z 3DS.

## Testy

- **Jednostkowe:** `mapEvent` — `customer.subscription.updated` z `pause_collection`
  → `paused: true` (oraz bez → false). `status.ts` `paused` → „Wstrzymana" (jest).
- **Integracyjne (`*.itest.ts`, Docker — pisane, właściciel uruchamia):**
  `pauseSubscription`/`resumeSubscription` ustawiają/czyszczą stan (Stripe
  mockowany), `applySubscriptionUpdate(paused:true)` → `status='paused'`;
  tenant-scope.

## Bezpieczeństwo (`/security-review`)

Tenant-scope na pauzie/wznowieniu (trener tylko swoi, podopieczny tylko swoja
subskrypcja). Brak nowych sekretów. Webhook bez zmian w modelu podpisu. Disclosure
nie ujawnia danych wrażliwych. Pauza `void` nie tworzy długu.

## Dokumentacja

`app/lib/stripe/README.md` (pause/resume, paused-mapping, framing), trasy
trenera/podopiecznego (disclosure, pauza, past_due baner), `README.md` root +
handoff: konfiguracja Smart Retries i Customer Portal w panelu Stripe, nota o SCA,
nota prawna VAT.

## Poza zakresem (świadomie)

`on_behalf_of`/zmiana MoR; e-mail (osobna iteracja); win-back/retencja przy
anulowaniu; trial; kupony; VAT/e-faktury (prawo); `keep_as_draft` pauza (używamy
`void`).
