# i18n (pl/fr) + multi-currency (PLN/EUR) — design spec

**Status:** Draft — do przeglądu właściciela
**Data:** 2026-06-07
**Epik:** „Platforma marki" — plasterek #2.
**Zależy od:** #1 (tenancy: `regions.currency`/`regions.locale`, `AuthUser.organizationId/regionId`).

---

## 1. Cel i zakres

### Cel
Umiędzynarodowić aplikację: **pełne tłumaczenie UI** (polski + francuski) oraz
formatowanie **waluty, dat i liczb zależne od regionu/locale**. Fundament ma
skalować się na kolejne języki marki (TMS, wielu tłumaczy/AI), nie tylko pl/fr.

### W zakresie
- Mechanizm i18n: `i18next` + `react-i18next` + `remix-i18next` (RR7 framework mode).
- Resolucja aktywnego locale per żądanie (reguły w §4) + utrwalenie w cookie `lng`.
- Refaktor `money.ts` i `format.ts` na `Intl` sterowane `(locale, currency)`.
- Refaktor funkcji-etykiet w `lib/` tak, by **zwracały klucze**, nie polski tekst.
- Słowniki `pl` + `fr` z namespacingiem per obszar; **typowane** klucze `t`.
- Seed regionu **FR** (France/FR/eur/fr-FR) + opcjonalne demo-konto FR.
- **Pełna ekstrakcja stringów** całego UI (jeden spec — decyzja właściciela), w
  planie rozbita na taski per obszar.
- Testy: jednostkowe (czysta resolucja locale, money/Intl, etykiety-klucze,
  parzystość kluczy pl/fr) + integracyjny (resolucja locale per rola/kontekst).

### Poza zakresem
- Routing locale w URL (`/pl/...`, `/fr/...`) — możliwe później (SEO/linki).
- Integracja z TMS (Lokalise/Crowdin) — format JSON jest TMS-ready, ale samej
  integracji nie robimy.
- Kolejne języki poza pl/fr (struktura ma je przyjąć bez przebudowy).
- Per-user override języka (kolumna `users.locale`) — odrzucone w brainstormie;
  locale wynika z regionu / kontekstu.
- Zmiana nazwy kolumny `coaching_subscriptions.amount_grosze` / `monthly_amount_grosze`
  (DB z #1) — zostaje; traktujemy ją jako „minor units" niezależnie od waluty.
- RR route-middleware — używamy klasycznego server-helpera (§2).

### Kryteria sukcesu
1. Trener/podopieczny w regionie PL widzą polski + PLN; w regionie FR — francuski + EUR.
2. Strona logowania i zaproszenia respektują reguły z §4 (zaproszenie → język regionu
   zapraszającego trenera; login/brand_admin → Accept-Language + fallback `pl`).
3. Brak twardych, widocznych dla użytkownika polskich stringów w UI (weryfikowane
   przeglądem per obszar + checklistą).
4. `<html lang>` dynamiczny; brak hydration-mismatch.
5. Bramki zielone; testy parzystości kluczy pl/fr przechodzą.

---

## 2. Architektura i integracja

**Styl:** klasyczny server-helper `remix-i18next` (bez RR route-middleware).

- `app/i18n/config.ts` — wspólna konfiguracja: `SUPPORTED_LANGS = ["pl", "fr"]`,
  `FALLBACK_LANG = "pl"`, `DEFAULT_NS = "common"`, lista namespace'ów,
  mapowanie `langToIntlLocale = { pl: "pl-PL", fr: "fr-FR" }`.
- `app/i18n/resources.ts` — import słowników JSON do obiektu `resources`
  (`{ pl: { common: {...}, ... }, fr: {...} }`); bundlowane (bez fs-backend) —
  działa i na serwerze, i na kliencie. (Layout TMS-ready: pliki JSON per ns/lang.)
- `app/i18n.server.ts` — instancja `RemixI18Next` z regułami detekcji (§4) i
  `localeCookie` (`lng`, HttpOnly, SameSite=Lax, Secure w prod).
- `app/entry.server.tsx` — per-request: `getLocale(request)` → `createInstance()`
  → `init({ lng, ns, resources })` → render w `I18nextProvider`. (Idiom remix-i18next.)
- `app/entry.client.tsx` — inicjalizacja klienta i18next z `resources` i `lng`
  odczytanym z `<html lang>` (hydratacja zgodna, bo locale deterministyczne z serwera).
- `app/root.tsx` — root `loader` zwraca `{ locale }` (+ `Set-Cookie: lng`);
  `Layout` ustawia `<html lang={i18n.language}>` przez `useTranslation()` (kanoniczny
  wzorzec remix-i18next). Provider i18n owija drzewo (z `entry.{server,client}.tsx`).

**Język i18next vs locale Intl:** i18next operuje na kodzie języka (`pl`/`fr`);
formatowanie `Intl` używa pełnego tagu BCP-47 (`pl-PL`/`fr-FR`) z `regions.locale`
lub z `langToIntlLocale`. `regions.locale` (#1) trzyma BCP-47; `lang = locale.split("-")[0]`.

**Przepływ tłumaczeń:**
- Komponenty: `const { t } = useTranslation("<ns>")` → `t("klucz", { params })`.
  Liczba mnoga/interpolacja: wbudowane w i18next.
- Etykiety serwerowe: funkcje w `lib/` zwracają `labelKey` (+ dane), komponent woła
  `t(labelKey)` — patrz §5.

---

## 3. Struktura plików i format komunikatów

```
app/i18n/
  config.ts            # SUPPORTED_LANGS, FALLBACK_LANG, namespaces, langToIntlLocale
  resources.ts         # import JSON → resources object + typowanie modułu i18next
app/i18n.server.ts     # RemixI18Next (detekcja + cookie)
app/locales/
  pl/
    common.json        # nawigacja, przyciski, wspólne
    auth.json          # login, zaproszenie
    trener.json
    podopieczny.json
    marka.json
    konsultacje.json
    platnosci.json
    rozwoj.json
    wrapped.json
    ...                # namespace per obszar (dokładany przyrostowo w planie)
  fr/  (lustrzane klucze)
```

- **Format:** JSON klucz→string, składnia i18next/ICU dla liczby mnogiej i
  interpolacji (`"sesje": "{{count}} sesja"` z wariantami plural). TMS-ready.
- **Namespacing:** per obszar produktu; `common` ładowany zawsze.
- **Typowanie:** `declare module "i18next"` z `resources: typeof resources.pl`
  (pl = źródło prawdy typów) → `t("klucz")` wykrywa nieistniejące klucze na `typecheck`.
- **Parzystość:** test jednostkowy sprawdza, że zestaw kluczy `fr` == `pl` dla
  każdego namespace (brak zgubionego tłumaczenia).

---

## 4. Resolucja locale

Czysta funkcja decyzyjna + cienka warstwa I/O:

- **`pickLang(input)`** — CZYSTA (`app/i18n/pick-lang.ts`), bez DB/Date:
  wejście `{ regionLocale?: string|null; inviteTrainerRegionLocale?: string|null; acceptLanguage?: string|null }`
  → zwraca `"pl" | "fr"` wg priorytetu:
  1. `regionLocale` (zalogowany user z regionem) →
  2. `inviteTrainerRegionLocale` (trasa `/zaproszenie/:token`) →
  3. `acceptLanguage` (dopasowanie do SUPPORTED) →
  4. `FALLBACK_LANG` (`pl`).
  Testowalna jednostkowo dla wszystkich gałęzi.
- **`resolveLang(request)`** — I/O (`app/i18n.server.ts`, wpięte w `findLocale`
  resolver `remix-i18next`): czyta sesję → usera → region (trener: własny;
  podopieczny: region trenera; brand_admin: brak → niżej); dla `/zaproszenie/:token`
  ładuje invite → trenera → region; w ostateczności `Accept-Language`. Składa
  wejście i woła `pickLang`. Wynik zapisywany w cookie `lng`.
- **Zasada nadrzędności:** dla zalogowanych z regionem **DB region wygrywa** z
  cookie (re-resolucja per żądanie); cookie służy ciągłości dla anonimowych.
- Sprzężenie i18n↔auth/DB jest świadome i udokumentowane (resolver robi lookup sesji).

---

## 5. Money / format dat / etykiety serwerowe

### `app/lib/money.ts`
- `fmtMoney(minorUnits: number, locale: string, currency: string): string`
  → `new Intl.NumberFormat(locale, { style: "currency", currency }).format(minorUnits / 100)`.
- `parseMoneyToMinor(input: string): number | null` — bez zmian semantyki
  (akceptuje „," i „."); nazwa uogólniona z `parsePlnToGrosze`.
- `MonthlyAmountSchema` — zostaje (walidacja całkowitych minor-units, min/max);
  niezależna od waluty.
- **Stripe nietknięty:** grosze/minor-units, `currency` per `coaching_subscriptions`,
  destination charges bez zmian. `fmtMoney` dostaje `currency` z subskrypcji/regionu.

### `app/lib/format.ts`
- `fmtDate`/pochodne przyjmują `locale` → `Intl.DateTimeFormat(locale, …)`.
  Domyślny fallback `pl-PL` zachowany dla wywołań bez locale (przejściowo).

### Etykiety serwerowe → klucze (czyste, testowalne)
Refaktorujemy tak, by **nie zwracały polskiego tekstu**, lecz `labelKey` (+ dane):
- `app/lib/stripe/status.ts`: `subscriptionPresentation(status)` → `{ labelKey, tone }`;
  `invoiceStatusLabel(status)` → `labelKey`.
- `app/lib/consultation-status.ts`: `consultationPresentation(...)` → `{ labelKey, tone }`.
- `app/lib/wrapped.ts`, `app/lib/list-params.ts`: etykiety (np. opcje sortowania,
  nazwy miesięcy) → klucze lub `Intl` (miesiące przez `Intl.DateTimeFormat`).
- Komponent woła `t(labelKey)`. Klucze trafiają do odpowiednich namespace'ów.
- Testy jednostkowe tych funkcji sprawdzają zwracane klucze/tony (czysto, bez i18n).

---

## 6. Ekstrakcja stringów — konwencja i zakres

- **Konwencja:** każdy obszar = namespace; w komponencie `useTranslation("<ns>")`,
  twarde stringi → `t("<klucz>")`; klucze opisowe (`historia.empty`, `loguj.save`).
  Zmiany czysto-stringowe nie wymagają nowego designu, ale każdą trasę dotykającą
  warstwy wizualnej prowadzimy zgodnie z design-systemem (frontend-design jeśli
  zmienia się układ — tu zwykle nie).
- **Zakres (jeden spec, pełne pokrycie):** plan rozbije ekstrakcję na taski per obszar:
  `common`/nawigacja, `auth` (login+zaproszenie — **plasterek dowodowy end-to-end**),
  `podopieczny` (pulpit, sesje, loguj, historia, rozwoj, sylwetka, konsultacje,
  platnosci, wrapped, aktywuj), `trener` (pulpit, biblioteka, plany, umiejetnosci,
  podopieczni i poddrzewa, konsultacje, integracje, platnosci), `marka`.
- **Definicja „pokryte":** brak widocznych dla użytkownika twardych polskich
  stringów w danym obszarze (weryfikacja: przegląd + `grep` per obszar w bramce tasku).
  Nazwy ćwiczeń (Pull-up, Front Lever…) pozostają nietłumaczone (zgodnie z CLAUDE.md).

---

## 7. Seed FR + testy

### Seed
- `scripts/seed.ts`: dodać idempotentnie region **FR** (`France`, `FR`, `eur`, `fr-FR`)
  pod organizacją (obok PL). Opcjonalne demo-konto trenera FR sterowane env
  (`SEED_FR_*`) — przydatne do pokazania francuskiego na żywo; domyślnie pomijane.
- `.env.example` + `scripts/README.md` zaktualizowane.

### Testy
- **Jednostkowe (`*.test.ts`, bez DB):**
  - `pickLang` — wszystkie gałęzie (region / invite / Accept-Language / fallback).
  - `money` — `fmtMoney` dla (`pln`,`pl-PL`) i (`eur`,`fr-FR`); `parseMoneyToMinor`.
  - etykiety-klucze (stripe/consultation/list-params) — zwracają poprawne klucze/tony.
  - **parzystość kluczy** pl vs fr per namespace.
- **Integracyjny (`*.itest.ts`, testcontainers — PISANY, uruchamia właściciel):**
  - `resolveLang(request)` end-to-end: trener PL→pl, trener FR→fr, podopieczny
    dziedziczy region trenera, brand_admin→Accept-Language, zaproszenie→region
    zapraszającego trenera, anonim→Accept-Language/fallback.

### Bramki
`npm run test:unit` + `typecheck` + `lint` + `build`; `/code-review`;
`/security-review` warunkowo (resolver czyta sesję — dotyka auth → tak).
Integracyjne: zaraportować, uruchamia właściciel.

---

## 8. Handoff (granica gita)
Nowe zależności (`i18next`, `react-i18next`, `remix-i18next`) → `npm install`
(właściciel); ewentualny seed FR (`db:seed` z env); testy integracyjne pod Dockerem;
ręczna weryfikacja: przełączenie regionu trenera PL↔FR zmienia język i walutę.

---

## 9. Ryzyka i decyzje
| Ryzyko / decyzja | Rozstrzygnięcie |
|---|---|
| SSR i18n w RR7 (hydration mismatch) | Klasyczny `remix-i18next` server-helper; locale deterministyczne z root loadera |
| RR route-middleware (nowy koncept) | Odrzucone; klasyczny helper, zero flag |
| Sprzężenie i18n↔auth (resolver czyta sesję/DB) | Świadome; udokumentowane; logika decyzji wydzielona do czystego `pickLang` |
| „grosze" PLN-centryczne | Traktujemy jako minor-units; nazwy DB bez zmian; `fmtMoney` bierze `currency` |
| Zgubione tłumaczenia przy pełnej ekstrakcji | Typowane klucze (`typecheck`) + test parzystości pl/fr + przegląd per obszar |
| Skala (wiele języków potem) | Format JSON/namespace TMS-ready; dodanie języka = nowy katalog locales |
| Wielkość planu (pełne pokrycie) | Plan rozbity na taski per obszar; fundament + obszar dowodowy (auth) najpierw |
