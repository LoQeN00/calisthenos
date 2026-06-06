# System płatności (subskrypcje przez Stripe Connect) — design

> Status: zatwierdzony do planowania. Data: 2026-06-06.
> Proces: FEATURE (`kalisthenos-dev-flow`). Następny krok: plan implementacji
> (`superpowers:writing-plans`).

## Cel i kontekst

Podopieczny płaci trenerowi cykliczną, **miesięczną** opłatę za prowadzenie.
Trener ustala kwotę, jaką płaci dany podopieczny. Płatność ma być **realnie
procesowana** (faktyczny przepływ środków), a nie tylko ewidencjonowana.

Wpisuje się w istniejący model trener↔podopieczny (multi-tenant przez
`trainer_id`/`trainee_id`). Dziś z aplikacji korzysta jeden trener, ale system
ma być **gotowy na wielu trenerów** (marketplace) — każdy trener przyjmuje
płatności od swoich podopiecznych. Dlatego model danych i przepływ pieniędzy
projektujemy od razu pod wielu sprzedawców, żeby nie przepisywać przy skalowaniu.

## Decyzje produktowe (ustalone w brainstormie)

1. **Realne procesowanie**, nie ewidencja.
2. **Procesor: Stripe.** Natywne subskrypcje (Stripe Billing), Connect dla
   marketplace, w PLN obsługuje karty/BLIK/Przelewy24, najlepsze SDK/dokumentacja.
3. **Marketplace od razu — Stripe Connect (Express).** Każdy trener (też obecny)
   ma własne *connected account*; pieniądze trafiają wprost do niego. Model
   danych: połączenie płatnicze **per trener** (wzór `google_calendar_connections`).
4. **Przepływ: destination charges.** Customer i Price żyją na koncie **platformy**;
   subskrypcja tworzona na platformie z `transfer_data[destination]` = connected
   account trenera. (Wzorzec rekomendowany przez Stripe dla Express + zarządzania
   fakturami/zwrotami po stronie platformy.)
5. **Cykl: subskrypcja z auto-obciążaniem kartą** (Stripe Billing). Auto-recurring
   realnie tylko karta; BLIK/P24 nie wchodzą do automatu (świadome ograniczenie MVP).
6. **UI: Stripe-hosted.** Subskrypcja przez **Stripe Checkout** (`mode: subscription`),
   zarządzanie (zmiana karty, anulowanie, faktury) przez **Customer Portal**.
   My utrzymujemy **lustro statusu** w naszej bazie, aktualizowane **webhookami**.
   Zaleta: brak danych karty u nas (PCI-light), Stripe obsługuje SCA/3DS i dunning.
7. **Status tylko widoczny — bez gatingu.** Brak/zaległość subskrypcji jest
   widoczny dla trenera i podopiecznego, ale **nie blokuje** żadnych funkcji.
8. **Prowizja platformy: 0 teraz.** `application_fee_percent` zostaje jako pole
   konfiguracyjne gotowe do włączenia później; nie budujemy rozliczeń platformy.
9. **Waluta: PLN** (kwota trzymana w **groszach** jako `integer`).
10. **Zmiana kwoty** przez trenera → nowy Stripe Price, zastosowanie **od
    następnego cyklu** (bez proracji). Gdy podopieczny jeszcze nie subskrybuje —
    kwota jest tylko zapisana i użyta przy starcie subskrypcji.
11. **Anulowanie / zmiana karty:** podopieczny przez Customer Portal. Trener może
    dodatkowo **zakończyć subskrypcję** ze swojej strony (akcja `cancel`).
12. **Poza MVP:** zwroty (trener robi w panelu Stripe), trial, kupony, proracja,
    wiele subskrypcji na parę, prowizja platformy, twardy/miękki gating.

### Założenia o relacji

Podopieczny ma dokładnie jednego trenera (`users.trainer_id`), więc istnieje
**co najwyżej jedna** relacja płatnicza na parę trener+podopieczny i co najwyżej
jedna subskrypcja na podopiecznego.

## Model danych (`app/lib/db/schema.ts`)

Schemat = źródło prawdy; po edycji `npm run db:generate` tworzy migrację (plików
w `migrations/` nie edytujemy ręcznie; generowanie jest interaktywne — odpala
właściciel w TTY). Wszystkie tabele niosą `trainer_id` (tenant-scope).

### Enum

`subscription_status`: `['none', 'incomplete', 'active', 'past_due', 'canceled',
'unpaid', 'paused']` — odzwierciedla statusy subskrypcji Stripe, których używamy,
plus `none` (brak subskrypcji — sama ustalona kwota). Webhook mapuje status
Stripe **defensywnie**: nieznana wartość → najbliższy bezpieczny status (logujemy),
żeby dodanie nowego statusu po stronie Stripe nie wywróciło zapisu.

### Tabela `stripe_connections` (per trener)

Wzorowana na `google_calendar_connections` (PK = `trainer_id`).

| kolumna | typ | uwagi |
|---|---|---|
| `trainer_id` | uuid PK → `users.id` (onDelete cascade) | jedno połączenie na trenera |
| `stripe_account_id` | text NN | `acct_…` (nie jest sekretem — bez szyfrowania) |
| `charges_enabled` | boolean NN default false | z `account.updated` |
| `payouts_enabled` | boolean NN default false | z `account.updated` |
| `details_submitted` | boolean NN default false | onboarding zakończony |
| `country` | text NULL | z konta Stripe |
| `default_currency` | text NULL | z konta Stripe |
| `connected_at` | timestamptz NN defaultNow | |
| `updated_at` | timestamptz NN defaultNow | |

Brak tokenów do szyfrowania (inaczej niż Google OAuth) — Connect używa klucza
platformy + nagłówka `Stripe-Account` przy operacjach na koncie połączonym.

### Tabela `coaching_subscriptions` (jedna na parę)

| kolumna | typ | uwagi |
|---|---|---|
| `id` | uuid PK (defaultRandom) | |
| `trainer_id` | uuid NN → `users.id` (onDelete cascade) | tenant-scope |
| `trainee_id` | uuid NN → `users.id` (onDelete cascade) | |
| `amount_grosze` | integer NN | kwota miesięczna ustawiona przez trenera (źródło prawdy), w groszach |
| `currency` | text NN default `'pln'` | |
| `stripe_customer_id` | text NULL | customer podopiecznego na koncie platformy (tworzony leniwie) |
| `stripe_subscription_id` | text NULL | id subskrypcji Stripe (po starcie) |
| `stripe_price_id` | text NULL | bieżący Price zsynchronizowany do Stripe |
| `status` | `subscription_status` NN default `'none'` | lustro statusu z webhooków |
| `current_period_end` | timestamptz NULL | koniec opłaconego okresu |
| `cancel_at_period_end` | boolean NN default false | |
| `created_at` | timestamptz NN defaultNow | |
| `updated_at` | timestamptz NN defaultNow | |

- UNIQUE `(trainer_id, trainee_id)` — jedna relacja płatnicza na parę.
- UNIQUE (partial) na `stripe_subscription_id` WHERE not null — sanity.
- Indeks `(trainee_id)` i `(trainer_id, status)` do list/statusów.
- CHECK `amount_grosze >= 0` (i minimum egzekwowane w Zod, patrz `money.ts`).

### Tabela `subscription_payments` (księga, zasilana webhookami)

| kolumna | typ | uwagi |
|---|---|---|
| `id` | uuid PK (defaultRandom) | |
| `trainer_id` | uuid NN → `users.id` (onDelete cascade) | tenant-scope |
| `trainee_id` | uuid NN → `users.id` (onDelete cascade) | |
| `stripe_invoice_id` | text NN | UNIQUE — **idempotencja** webhooka |
| `amount_grosze` | integer NN | kwota faktury |
| `currency` | text NN default `'pln'` | |
| `status` | text NN | `paid` / `open` / `failed` / `void` … (z faktury Stripe) |
| `paid_at` | timestamptz NULL | gdy opłacona |
| `period_start` | timestamptz NULL | okres rozliczeniowy z faktury |
| `period_end` | timestamptz NULL | |
| `hosted_invoice_url` | text NULL | link do faktury Stripe |
| `created_at` | timestamptz NN defaultNow | |

- UNIQUE `stripe_invoice_id` — drugie przyjście tego samego eventu = upsert/no-op.
- Indeks `(trainee_id, created_at desc)` do historii.

## Konfiguracja (`app/lib/env.ts`, `.env.example`)

Nowe **opcjonalne** klucze (Zod) + predykat `stripeConfigured()` (jak
`googleConfigured()`):

- `STRIPE_SECRET_KEY` — klucz platformy.
- `STRIPE_WEBHOOK_SECRET` — sekret podpisu endpointu webhooka.
- `STRIPE_CONNECT_WEBHOOK_SECRET` — **jeśli** eventy Connect (`account.updated`)
  wymagają osobnego endpointu; jeśli skonfigurujemy jeden endpoint nasłuchujący
  także eventów Connect, używamy jednego sekretu. Decyzja do potwierdzenia w
  planie (Stripe: przy destination charges eventy `invoice.*`/
  `customer.subscription.*` są eventami **platformy**, a `account.updated`
  połączonego konta jest eventem **Connect**).

Bazowy URL aplikacji do `return_url`/`refresh_url`/`success_url`/`cancel_url`
reużywamy z istniejącego mechanizmu env (ten sam, którego używają podpisane URL-e
i zaproszenia). Klucz publiczny Stripe **niepotrzebny** — Checkout i Portal to
redirecty inicjowane serwerowo (akcja → URL Stripe → `redirect()`).

## Warstwa domenowa

### Nowy katalog `app/lib/stripe/` (+ `README.md`)

| Plik | Rola / kluczowe eksporty |
|---|---|
| `client.ts` | Leniwy klient Stripe z env (`getStripe()`), przypięta `apiVersion`. |
| `connections.ts` | Tenant-scope `trainerId`: `getConnection`, `upsertConnection`, `createExpressAccount`, `createAccountLink` (onboarding), `applyAccountUpdate` (z `account.updated`). |
| `subscriptions.ts` | Repo + orkiestracja Stripe: `getSubscriptionForPair(trainerId, traineeId)`, `setMonthlyAmount(trainerId, traineeId, amountGrosze)` (twórz/aktualizuj Price; podmień item gdy aktywna), `ensureCustomer(traineeId)`, `createCheckoutSession(...)` (mode `subscription`, `subscription_data.transfer_data.destination` = konto trenera, `application_fee_percent`=0), `createPortalSession(...)`, `cancelSubscription(...)`, settery statusu używane przez webhook. Tenant-scope wbudowany. |
| `webhook.ts` | `verifyAndParse(rawBody, sig, secret)` (`constructEvent`) + `handleEvent(event, db)` (dispatch po typie). |
| `status.ts` | **Czyste** mapowanie status Stripe → polska etykieta + ton (wzór `consultation-status.ts`): `subscriptionPresentation`, mapy tonów. Cel testów jednostkowych. |

### `app/lib/payments.ts`

Księga płatności (tenant-scope): `recordInvoice(...)` (upsert po
`stripe_invoice_id`), `listPaymentsForTrainee(traineeId, …)`,
`listPaymentsForPair(trainerId, traineeId, …)`.

### `app/lib/money.ts`

**Czyste**, cel testów jednostkowych: `fmtMoney(grosze, 'pln')` (format PL),
parsowanie/zaokrąglanie PLN→grosze, Zod `MonthlyAmountSchema` (min/max, liczba
całkowita PLN → grosze).

## Trasy (`app/routes.ts` + pliki w `app/routes/`)

### Trener

| Plik | URL | Co robi |
|---|---|---|
| `trener/integracje.stripe.tsx` | `/trener/integracje/stripe` | Status połączenia Stripe; „Połącz ze Stripe" (Express account + Account Link → redirect), obsługa powrotu/refresh onboardingu; „Rozłącz" (opcjonalnie). Analogiczne do `integracje.google.tsx`. Wymaga `stripeConfigured()`. |
| `trener/podopieczni.$traineeId.platnosci.tsx` | `…/platnosci` | Ustaw miesięczną kwotę (`set-amount`), status subskrypcji podopiecznego, historia płatności (`listPaymentsForPair`), opcjonalne „Zakończ subskrypcję" (`cancel`). Tenant-scope przez `assertTraineeOwnedBy` → 404. |

### Podopieczny

| Plik | URL | Co robi |
|---|---|---|
| `podopieczny/platnosci.tsx` | `/podopieczny/platnosci` | Moja kwota + status, „Subskrybuj/Zapłać" (`subscribe` → Checkout → redirect), „Zarządzaj płatnościami" (`portal` → Customer Portal → redirect), historia (`listPaymentsForTrainee`). Return: `?ok=1` / `?canceled=1`. |

### Webhook (poza layoutami, jak `files/$fileId`)

| Plik | URL | Co robi |
|---|---|---|
| `webhooks.stripe.tsx` | `webhooks/stripe` | Tylko `action` (POST), **bez sesji** (autoryzacja podpisem). `await request.text()` → surowy body, `constructEvent`, dispatch (`webhook.handleEvent`), aktualizacja DB. Szybkie `200`. |

**Obsługiwane eventy:**
- `account.updated` → `applyAccountUpdate` (flagi `charges/payouts/details`).
- `checkout.session.completed` → powiązanie `stripe_customer_id`/
  `stripe_subscription_id` z parą (z metadanych sesji).
- `customer.subscription.updated` / `.deleted` → status, `current_period_end`,
  `cancel_at_period_end`.
- `invoice.paid` (lub `invoice.payment_succeeded`) → wpis w księdze (`paid`).
- `invoice.payment_failed` → wpis/aktualizacja w księdze (`failed`); status pary
  zaktualizuje też `customer.subscription.updated` (`past_due`).

**Idempotencja:** księga po UNIQUE `stripe_invoice_id`; aktualizacje statusu są
idempotentne (ostatni stan wygrywa). Powiązanie pary↔Stripe trzymamy w
`metadata` sesji/subskrypcji (`trainerId`, `traineeId`) i/lub przez
`stripe_customer_id`.

### Nawigacja

W `_layout` trenera i podopiecznego dopisujemy pozycję „Płatności". Opcjonalny
badge u podopiecznego, gdy `status` = `past_due` lub `none` (akcja wymagana).

## Bezpieczeństwo (uruchomi `/security-review`)

- Nowe sekrety wyłącznie w env; nigdy nie logujemy kluczy.
- **Weryfikacja podpisu webhooka** na surowym body (`constructEvent`); odrzucenie
  przy złym podpisie (400). Endpoint bez sesji — to jedyna trasa „publiczna".
- **Brak danych karty** u nas (zaleta Checkout/Portal) — mniejsza powierzchnia PCI.
- Tenant-scope na wszystkich nowych tabelach; brak dostępu → **404**.
- Autoryzacja akcji: podopieczny działa tylko na **swojej** subskrypcji; trener
  tylko na **swoich** podopiecznych (`assertTraineeOwnedBy`).
- Sesje Checkout/Portal tworzone wyłącznie dla właściwego `customer`/pary —
  podopieczny nie może otworzyć portalu innego klienta.
- Onboarding Connect (Account Link) dostępny tylko dla właściciela danego konta
  trenera.
- Webhook idempotentny (brak podwójnego księgowania).

## Plan testów

### Jednostkowe (`*.test.ts`, Vitest, w pętli — TDD)

- `money.ts`: `fmtMoney`, parsowanie PLN→grosze, `MonthlyAmountSchema` (granice).
- `stripe/status.ts`: mapowanie statusów Stripe → etykieta/ton, w tym defensywne
  mapowanie nieznanego statusu.
- Czysta część dispatchu webhooka: event Stripe → **zamierzona** zmiana (np.
  „active”, „past_due”, wpis faktury) jako czysta funkcja na obiekcie eventu
  (bez DB), żeby przetestować logikę mapowania bez testcontainers.

### Integracyjne (`*.itest.ts`, testcontainers — PISZ, uruchamia właściciel)

Krytyczne przepływy (tenant-scope + pieniądze):
- Tenant-scope repo `coaching_subscriptions` i `subscription_payments` (obcy
  trener/podopieczny → brak wyników / 404).
- **Idempotencja webhooka**: ten sam `invoice.paid` dwa razy → jeden wpis w księdze.
- `setMonthlyAmount`: zmiana kwoty aktualizuje `amount_grosze` i (gdy aktywna)
  ścieżkę Price; gdy brak subskrypcji — tylko zapis kwoty.

Stripe w testach **mockujemy** (klient za interfejsem `getStripe()`), żeby itesty
nie wołały sieci.

## Dokumentacja (część „done")

- Nowy `app/lib/stripe/README.md` (opis plików katalogu).
- Wpisy w `app/lib/README.md` (`payments.ts`, `money.ts`) + podkatalog `stripe/`.
- Mapa w `CLAUDE.md` (nowy katalog `app/lib/stripe/`, ew. wzmianka o stacku Stripe).
- Wiersze w `app/routes/trener/README.md` i `app/routes/podopieczny/README.md`
  (+ webhook w `app/routes/README.md`).
- Root `README.md`: env `STRIPE_*`, lokalny webhook (Stripe CLI `stripe listen`),
  posture bezpieczeństwa. `.env.example`: nowe klucze.

## Etapy implementacji (zarys — szczegóły w planie)

1. Schemat + enum + env + klient Stripe + dokumentacja stub.
2. `money.ts` + `stripe/status.ts` (TDD).
3. Połączenie Connect: `connections.ts` + trasa `integracje.stripe.tsx` +
   `account.updated`.
4. Cennik: `coaching_subscriptions` + `setMonthlyAmount` + UI trenera
   (`podopieczni.$traineeId.platnosci.tsx`).
5. Subskrypcja: `subscriptions.ts` (Checkout + Portal) + UI podopiecznego
   (`platnosci.tsx`).
6. Webhooki: `webhook.ts` + trasa `webhooks.stripe.tsx` + księga (`payments.ts`).
7. Statusy/historia w obu panelach + nawigacja + badge.
8. Bramki: testy, typecheck, lint, build, `/code-review` per task,
   `/security-review`, handoff.

## Poza zakresem (świadomie)

Zwroty w aplikacji, trial, kupony/rabaty, proracja przy zmianie kwoty, prowizja
platformy (>0), gating dostępu, automatyczne płatności BLIK/Przelewy24,
powiadomienia e-mail spoza Stripe, wiele subskrypcji/usług na parę.
