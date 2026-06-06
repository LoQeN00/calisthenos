# Płatność w onboardingu podopiecznego — design

> Status: zatwierdzony do planowania. Data: 2026-06-06.
> Proces: FEATURE (`kalisthenos-dev-flow`). Rozszerza feature płatności
> ([`2026-06-06-platnosci-stripe-design.md`](2026-06-06-platnosci-stripe-design.md)).

## Cel i kontekst

W obecnym flow płatności podopieczny musi sam odnaleźć stronę „Płatności" i
kliknąć „Subskrybuj" — odczuwane jako „kupowanie produktu", obce relacji
trener↔podopieczny. Przenosimy dodanie metody płatności do **onboardingu**: gdy
podopieczny dołącza z zaproszenia, po ustawieniu hasła od razu widzi krok „dodaj
kartę, aby aktywować abonament ustalony przez trenera".

**Twarde ograniczenie:** podopieczny i tak musi raz podać kartę i zgodę na
cykliczne obciążanie (SCA/PCI) — trener nie zapłaci za niego. Zmieniamy więc
tylko **moment i framing**, nie mechanikę (nadal Stripe Checkout).

## Decyzje produktowe (ustalone w brainstormie)

1. **Trener ustala kwotę przy tworzeniu zaproszenia** (opcjonalne pole). Kwota
   jedzie z zaproszeniem i przy rejestracji zakłada cennik podopiecznego.
2. **Krok płatności w onboardingu jest pomijalny** („Zrobię to później") — bez
   ryzyka utknięcia na wejściu. Przypomnienie zapewnia istniejący badge „płatność
   wymaga akcji" w nawigacji podopiecznego.
3. **Graceful degradation:** jeśli `STRIPE_SECRET_KEY` nie jest ustawiony, albo
   zaproszenie nie niesie kwoty — krok płatności **nie pojawia się**; onboarding
   działa jak dziś.
4. Mechanika płatności bez zmian (Stripe Checkout + Customer Portal + webhooki).

## Model danych (`app/lib/db/schema.ts`)

Tabela `invites` zyskuje kolumnę:

| kolumna | typ | uwagi |
|---|---|---|
| `monthly_amount_grosze` | integer NULL | kwota miesięczna ustawiona przez trenera przy zaproszeniu; NULL = bez płatności |

Bez nowych tabel — `coaching_subscriptions` już istnieje. Migracja: tylko dodanie
kolumny nullable (nieinteraktywne `db:generate`).

## Zmiany w przepływie

### Trener — tworzenie zaproszenia (`app/routes/trener/podopieczni._index.tsx`)

- `InviteSchema` zyskuje opcjonalne pole `monthlyAmount` (string z formularza →
  `parsePlnToGrosze` → `MonthlyAmountSchema`; puste = `null`). Niepoprawna,
  niepusta wartość → błąd walidacji.
- Modal „Zaproś podopiecznego" dostaje pole „Kwota miesięczna (zł) — opcjonalnie".
  Pole pokazujemy tylko, gdy `stripeApiConfigured()` (loader przekazuje flagę) —
  bez Stripe nie ma sensu pytać o kwotę.
- `createInvite` dostaje `monthlyAmountGrosze?: number | null` i zapisuje je na
  zaproszeniu.

### `app/lib/auth/invite.ts`

- `CreateInviteInput` zyskuje `monthlyAmountGrosze?: number | null`.
- `createInvite` zapisuje je w `invites.monthlyAmountGrosze`.
- `consumeInvite` bez zmian (zwraca usera; kwotę czyta trasa rejestracji z już
  pobranego wiersza zaproszenia).

### Rejestracja (`app/routes/zaproszenie.$token.tsx`)

Po `consumeInvite`:
- Jeśli `result.kind === "created"` **i** `invite.monthlyAmountGrosze != null`
  **i** `stripeApiConfigured()`:
  - `setMonthlyAmount(db, invite.trainerId, user.id, invite.monthlyAmountGrosze)`
    — zakłada wiersz `coaching_subscriptions` + Stripe Price. **Best-effort**:
    całość w `try/catch`; błąd Stripe/DB **nie** przerywa założenia konta (log +
    kontynuacja — trener ustawi kwotę później na stronie płatności).
  - redirect do `/podopieczny/platnosci?onboarding=1` (zamiast `/podopieczny`).
- W przeciwnym razie: redirect jak dziś (`/podopieczny` lub `/trener`).
- `kind === "replaced"` (ponowne konto): **bez** kroku płatności.

Kwota jest czytana z wiersza `invite` (już pobranego w akcji) — podopieczny nie
może jej podrobić formularzem.

### Onboardingowy krok płatności (`app/routes/podopieczny/platnosci.tsx`)

- Przy `?onboarding=1` (loader czyta search param) komponent pokazuje powitalny
  baner: „Witaj! Twój trener ustalił abonament **{fmtMoney(sub.amountGrosze)}**
  miesięcznie. Dodaj kartę, aby aktywować." + istniejący przycisk **Subskrybuj**
  + link **„Zrobię to później"** → `/podopieczny`.
- Gdy brak `sub`/kwoty (np. Stripe nie był skonfigurowany przy rejestracji) baner
  onboardingowy informuje neutralnie i pozwala przejść dalej.
- Reszta strony (status, historia) bez zmian.

## Edge'e

- Brak `STRIPE_SECRET_KEY`: `setMonthlyAmount` pominięte; redirect `/podopieczny`;
  kwota na zaproszeniu uśpiona (nieszkodliwa).
- Trener ustalił kwotę, ale konto Stripe bez `charges_enabled`: cennik się
  zakłada (Price na platformie), ale `createCheckoutSession` (przycisk Subskrybuj)
  pokaże „Trener nie ma aktywnych płatności." — podopieczny może pominąć i wrócić.
- Zaproszenie wygasłe/użyte/„replaced": bez zmian względem dziś.

## Bezpieczeństwo (uruchomi `/security-review`)

- Kwota pochodzi z zaufanego źródła (zaproszenie ustawione przez trenera), nie z
  formularza podopiecznego. `setMonthlyAmount` tenant-scope po `trainerId` z
  zaproszenia. `setMonthlyAmount` best-effort w rejestracji nie może wyciekać
  błędów Stripe do użytkownika ani blokować założenia konta. Brak nowych sekretów.

## Plan testów

- **Jednostkowe:** parsowanie kwoty (reuse `parsePlnToGrosze`/`MonthlyAmountSchema`
  — już pokryte). Ewentualny mały test parsera pola zaproszenia, jeśli powstanie
  helper.
- **Integracyjne (`*.itest.ts`, Docker — pisane, uruchamia właściciel):**
  zaproszenie z kwotą → po rejestracji istnieje wiersz `coaching_subscriptions`
  z tą kwotą i statusem `none` (Stripe mockowany); tenant-scope; zaproszenie bez
  kwoty → brak wiersza, redirect zwykły.

## Dokumentacja

- README: `app/lib/auth/README.md` (`createInvite` + pole kwoty), trasy
  trenera/podopiecznego (pole w zaproszeniu, onboarding na płatnościach),
  ewentualnie wzmianka w `CLAUDE.md`/specu płatności.

## Poza zakresem

Obowiązkowy gating płatności na wejściu, SetupIntent „karta raz, potem trener
steruje" (to był wariant C), zmiana kwoty per oczekujące zaproszenie po jego
utworzeniu.
