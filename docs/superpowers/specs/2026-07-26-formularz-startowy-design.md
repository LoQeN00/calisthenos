# Formularz startowy — onboarding podopiecznego (design)

Data: 2026-07-26
Status: zatwierdzony do implementacji

## Problem

Trener zakłada podopiecznemu konto i od razu ma ułożyć mu plan — ale nie wie, na
czym ten człowiek stoi. Ile podciągnięć wyciąga? Ile sekund utrzyma podpór? Dziś
te liczby żyją w rozmowie na pierwszym treningu albo nigdzie, więc pierwszy plan
jest strzałem w ciemno i koryguje się go dopiero po kilku sesjach. Aplikacja
pozna prawdziwy poziom podopiecznego dopiero wtedy, gdy ten zaloguje pierwsze
treningi — czyli już po tym, jak plan powstał.

## Cel

Pozwolić trenerowi **opcjonalnie** doczepić do zaproszenia krótki formularz:
kilka ćwiczeń z jego biblioteki + notatka. Podopieczny wypełnia go zaraz po
założeniu konta — i musi to zrobić, zanim wejdzie do aplikacji. Trener dostaje
komplet liczb, zanim usiądzie do planu.

## Non-goals

- Brak prośby o formularz dla **istniejącego** podopiecznego — tylko przy
  zaproszeniu. (Model danych tego nie blokuje; to świadome odłożenie zakresu.)
- Brak edycji formularza po wygenerowaniu linku (wymagałaby listy oczekujących
  zaproszeń, której panel dziś nie ma).
- Brak nagrań wideo w formularzu — onboarding ma trwać minutę, nie kwadrans, a
  podopieczny jest w tym momencie zablokowany przed wejściem do aplikacji.
- Wyniki **nie** wpinają się w „Progresję" ani „Umiejętności". Deklaracja z
  formularza nie jest zalogowaną serią; wmieszana w wykresy kazałaby im kłamać.
- Brak przypomnień e-mail/push. Sygnałem jest sam blokujący ekran.
- Brak historii wypełnień — jeden formularz, jedno wypełnienie.

## Decyzje

| Decyzja | Wybór | Dlaczego |
|---|---|---|
| Moment doczepienia | tylko przy tworzeniu zaproszenia | najmniej powierzchni i stanów brzegowych; „poproś istniejącego" to mała dokładka później |
| Co wpisuje podopieczny | liczba + opcjonalny komentarz per ćwiczenie + jedna notatka ogólna | sama liczba nie mówi, w jakich warunkach powstała („z gumą", „technika kulała") |
| Jednostka | z ćwiczenia (`REPS`/`SEC`), **snapshot** na pozycji formularza | trener może po wysłaniu linku przełączyć ćwiczenie z REPS na SEC — bez snapshotu „35" zmieniłoby znaczenie |
| Nazwa ćwiczenia | czytana joinem, **bez** snapshotu | zmiana nazwy to zwykle korekta literówki; żywa nazwa jest prawdziwsza niż zamrożona |
| Blokada | twarda: bez wypełnienia podopieczny nie wchodzi do aplikacji | tego wprost chce trener; miękka prośba zostaje zignorowana |
| Kolejność bramek | najpierw płatność, potem formularz | „Aktywuj subskrypcję" jest drzwiami do aplikacji, formularz jest już środkiem relacji |
| Miejsce ekranu podopiecznego | osobna trasa **poza** layoutem | dokładnie jak `/podopieczny/aktywuj` — bramka w layoucie odsyłająca do trasy wewnątrz layoutu to pętla redirectów |
| Widok trenera | osobna trasa + plakietka na karcie podopiecznego | `podopieczni.$traineeId.tsx` ma już 613 linii; tabela 8 ćwiczeń zepchnęłaby plan i historię w dół |
| Status | `completed_at NULL` = czeka | nowy pgEnum kosztowałby test parzystości i migrację typu za jeden bit informacji |
| Limit ćwiczeń | 1–12 | poniżej 1 formularz jest pusty; powyżej ~12 onboarding przestaje być krótki |

## Model danych

Dwie nowe tabele w `app/lib/db/schema.ts`. Bez nowych enumów — `exercise_unit`
już istnieje, status niesie `completed_at`.

### `onboarding_forms`

| Kolumna | Typ | Reguła |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `trainer_id` | uuid NOT NULL → `users.id` ON DELETE CASCADE | denormalizacja tenant-scope, jak wszędzie |
| `invite_id` | uuid NOT NULL → `invites.id` ON DELETE CASCADE | formularz powstaje razem z zaproszeniem |
| `trainee_id` | uuid NULL → `users.id` ON DELETE CASCADE | NULL do czasu przyjęcia zaproszenia; stemplowane w `consumeInvite` |
| `trainer_note` | text NULL | ≤1000 znaków; notatka trenera pokazywana podopiecznemu nad formularzem |
| `trainee_note` | text NULL | ≤1000 znaków; ogólna uwaga podopiecznego |
| `completed_at` | timestamptz NULL | NULL = czeka na wypełnienie |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Indeksy:
- `onboarding_forms_invite_uniq` UNIQUE na `(invite_id)` — jedno zaproszenie, jeden formularz,
- `onboarding_forms_trainee_pending_uniq` UNIQUE na `(trainee_id)` WHERE `completed_at IS NULL` —
  najwyżej jeden czekający formularz na podopiecznego. Wiersze przed przyjęciem
  zaproszenia mają `trainee_id NULL`, a w Postgresie NULL-e w indeksie unikalnym
  są rozróżnialne, więc nie kolidują ze sobą,
- `onboarding_forms_trainer_idx` na `(trainer_id)`,
- `onboarding_forms_trainee_idx` na `(trainee_id)` — bramka odpytuje po tej kolumnie przy każdym wejściu.

### `onboarding_form_items`

| Kolumna | Typ | Reguła |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `form_id` | uuid NOT NULL → `onboarding_forms.id` ON DELETE CASCADE | |
| `exercise_id` | uuid NOT NULL → `exercises.id` ON DELETE CASCADE | ćwiczenia są archiwizowane, nie kasowane — CASCADE zadziała tylko przy usuwaniu trenera |
| `ordinal` | integer NOT NULL | kolejność wybrana przez trenera |
| `unit` | `exercise_unit` NOT NULL | **snapshot** z chwili tworzenia formularza |
| `value` | integer NULL | NULL = jeszcze nieodpowiedziane; 0 to prawidłowa odpowiedź („ani razu") |
| `comment` | text NULL | ≤200 znaków |

Indeksy i ograniczenia:
- `onboarding_form_items_form_ordinal_uniq` UNIQUE na `(form_id, ordinal)`,
- `onboarding_form_items_form_exercise_uniq` UNIQUE na `(form_id, exercise_id)` — to samo ćwiczenie nie może wejść dwa razy,
- CHECK `value IS NULL OR (value >= 0 AND value <= 10000)`.

Migracja: edycja `schema.ts` → `npm run db:generate` (uruchamia właściciel w
TTY). Dwie nowe tabele to czysty `CREATE TABLE` — bez pytań o rename/drop.

## Cykl życia formularza

```
[trener generuje zaproszenie z formularzem]
        │  jedna transakcja: invites + onboarding_forms + items
        ▼
onboarding_forms(trainee_id = NULL, completed_at = NULL)
        │  consumeInvite() — ta sama transakcja co tworzenie konta
        ▼
onboarding_forms(trainee_id = <konto>, completed_at = NULL)   ← bramka blokuje
        │  podopieczny wysyła odpowiedzi
        ▼
onboarding_forms(completed_at = now())                        ← trener widzi wyniki
```

Zaproszenie, które nigdy nie zostało użyte, zostawia formularz z `trainee_id
NULL` — wygasa razem z zaproszeniem i nikomu nie przeszkadza.

## Moduły

| Plik | Rola |
|---|---|
| `app/lib/onboarding-form-types.ts` | Czysta warstwa (bez DB, cel testów jednostkowych): Zod `OnboardingTemplateSchema` (1–12 identyfikatorów ćwiczeń, notatka ≤1000 → `null` gdy pusta), `OnboardingAnswersSchema` (wynik 0–10000 int, komentarz ≤200), `answerLabel(unit, value)` → „12 powtórzeń" / „35 s" z polską odmianą przez `pluralizePl`, stała `MAX_ONBOARDING_EXERCISES = 12`. |
| `app/lib/onboarding-forms.ts` | Repozytorium tenant-scope: `createOnboardingForm`, `attachFormToTrainee`, `hasPendingOnboarding`, `getPendingFormForTrainee`, `submitOnboardingForm`, `getFormForTrainer`, `getFormStatusForTrainee`, `OnboardingFormError`. |

Reguły, które muszą siedzieć w repo, nie w trasach:

- `createOnboardingForm` sprawdza, że **każde** `exerciseId` należy do tego
  trenera i nie jest zarchiwizowane. Bez tego trener wstrzyknąłby do formularza
  cudze ćwiczenie przez podmianę pola formularza.
- `submitOnboardingForm` trzyma warunek `completed_at IS NULL` **w `WHERE`**, nie
  w kodzie po odczycie — inaczej podwójne kliknięcie „Gotowe" nadpisuje wynik.
- `getFormForTrainer` filtruje po `trainer_id`; brak dopasowania → **404**, nie 403.
- `getPendingFormForTrainee` / `submitOnboardingForm` filtrują po `trainee_id`
  z sesji — identyfikator formularza nigdy nie przychodzi z formularza HTML.

## Trasy

### Trener

| Trasa | Zmiana |
|---|---|
| `/trener/podopieczni` (`podopieczni._index.tsx`) | W modalu zaproszenia zwinięta sekcja „Formularz startowy (opcjonalnie)": przełącznik, szukajka + checkboxy ćwiczeń z biblioteki (max 12), pole notatki. Loader dociąga aktywne ćwiczenia (`id`, `name`, `unit`). Akcja: `createInvite` **+** `createOnboardingForm` w jednej transakcji. |
| `/trener/podopieczni/:traineeId` | Plakietka „Formularz startowy · czeka" / „wypełniony 26.07" linkująca do widoku wyników. Renderowana tylko wtedy, gdy formularz istnieje. |
| `/trener/podopieczni/:traineeId/formularz` **(nowa)** | Wyniki: notatka trenera, tabela ćwiczenie / wynik / komentarz, notatka podopiecznego, data wypełnienia. Gdy jeszcze nie wypełniony — stan „czeka" z listą ćwiczeń, o które poproszono. |

`createInvite` przyjmuje już typ `Db`, który obejmuje także transakcję — więc
sygnatura się nie zmienia, wystarczy, że trasa opakuje oba zapisy w
`db.transaction` i poda `tx`. Inaczej dałoby się wygenerować i wysłać link do
zaproszenia, któremu formularz nie doszedł.

### Podopieczny

| Trasa | Zmiana |
|---|---|
| `/podopieczny/formularz` **(nowa, POZA layoutem)** | Pełnoekranowa karta w idiomie `/podopieczny/aktywuj`: notatka trenera, lista 1–12 ćwiczeń (liczba + komentarz), notatka ogólna, „Gotowe" → `/podopieczny`. Loader: brak czekającego formularza → redirect na `/podopieczny`. |
| `/podopieczny/*` (`_layout.tsx`) | Druga bramka, **za** istniejącą bramką płatności: czeka formularz → `redirect("/podopieczny/formularz")`. |
| `/podopieczny/wrapped/:ym` | Ta sama bramka — druga „produktowa" trasa poza layoutem. |
| `/upload/wideo` | Ta sama bramka (dodana po przeglądzie bezpieczeństwa). Trasa zasobowa powtarza już bramkę płatności, bo podopieczny bez dostępu nie zapisze treningu, a każde wgrane nagranie byłoby sierotą zajmującą wolumen. Podopieczny z niewypełnionym formularzem jest w dokładnie tej samej sytuacji, więc bramka onboardingu stoi tam zaraz za płatnościową. |

Trasa `/podopieczny/formularz` **sama** sprawdza dostęp płatniczy i odsyła na
`/podopieczny/aktywuj`, gdy płatność jest wymagana. Bez tego wejście z linku
omijałoby ustaloną kolejność bramek.

Wpisy w `app/routes.ts`: dwie nowe trasy. Trasa podopiecznego trafia obok
`aktywuj`, czyli **poza** `layout(...)`.

### Sprzątanie po drodze

Logika bramki płatności jest dziś rozlana w loaderze layoutu (dwa zapytania +
dwa predykaty). Nowa trasa musiałaby ją skopiować, więc wyciągam ją do
`hasTraineeAppAccess(db, user)` w **nowym** module `app/lib/stripe/gate.ts` i
reużywam w obu miejscach. Osobny plik, bo `access.ts` jest dziś czysty (same
predykaty, zero DB) i chcę, żeby taki został — a `subscriptions.ts` nie może
zależeć od bramki, skoro bramka zależy od niego. Layout dalej potrzebuje samego
wiersza subskrypcji do odznaki „Płatności", więc helper zwraca też `sub` — bez
trzeciego zapytania.

Po przeglądzie końcowym okazało się, że samo dodanie helpera nie domknęło sprawy:
ten sam czterokrokowy przepis żył jeszcze w `podopieczny/aktywuj.tsx` i
`upload.wideo.tsx`. Obie trasy przeszły na `hasTraineeAppAccess`, bo `aktywuj.tsx`
jest **celem redirectu** z tej bramki — rozjazd warunków akurat tam daje pętlę
przekierowań, a nie zwykły błąd.

`/podopieczny/wrapped/:ym` nie ma dziś bramki płatności i tego **nie zmieniamy** —
dokładamy tam wyłącznie bramkę formularza, żeby zmiana nie przemyciła przy okazji
nowego ograniczenia dostępu.

## Bezpieczeństwo

Zmiana dotyka zaproszeń, tworzenia konta i `trainer_id`, więc idzie przez
`/security-review`. Punkty do sprawdzenia:

- Podopieczny wypełnia wyłącznie **swój** czekający formularz; identyfikator
  bierzemy z sesji, nie z pola `<input>`.
- Trener widzi wyłącznie formularz swojego podopiecznego — inaczej 404.
- Ćwiczenia w formularzu muszą należeć do trenera, który go tworzy.
- Bramka nie może dać się obejść przez trasę poza layoutem (`wrapped`) ani przez
  wejście wprost na `/podopieczny/formularz` przy niezapłaconej subskrypcji.
- Podwójne wysłanie formularza nie nadpisuje zapisanych odpowiedzi.
- Trasa jest uwierzytelniona i jednorazowa, więc nie dokładamy rate-limitu.

## Testy

**Jednostkowe** (`app/lib/onboarding-form-types.test.ts`, pisane test-first):

- 0 wybranych ćwiczeń → błąd; 13 → błąd; duplikat identyfikatora → błąd.
- Wynik ujemny, ułamkowy i >10000 → błąd; 0 → poprawny.
- Komentarz >200 znaków → błąd; pusta notatka → `null`, nie `""`.
- `answerLabel`: „1 powtórzenie", „3 powtórzenia", „12 powtórzeń", „35 s".

**Integracyjne** (`tests/onboarding-forms.itest.ts` — pisze Claude, uruchamia
właściciel pod Dockerem):

- Zaproszenie z formularzem → `consumeInvite` przypina formularz do nowego konta.
- Podopieczny z czekającym formularzem jest odsyłany na `/podopieczny/formularz`.
- Wysłanie odpowiedzi zapisuje wartości i odblokowuje aplikację.
- Drugie wysłanie nie nadpisuje zapisanych odpowiedzi.
- Obcy trener pytający o formularz → 404.
- Zaproszenie **bez** formularza → flow rejestracji bez zmian, bramka nie odpala.
- `deleteTraineeFully` usuwa formularz i pozycje (kaskada nie blokuje kasowania).

## Stany brzegowe

| Sytuacja | Zachowanie |
|---|---|
| Trener nie ma ćwiczeń w bibliotece | Sekcja formularza wyłączona, komunikat + link do biblioteki. |
| Ćwiczenie zarchiwizowane po wysłaniu linku | Pozycja zostaje w formularzu; nazwa z joina, jednostka ze snapshotu. |
| Zaproszenie nigdy nieużyte | Formularz z `trainee_id NULL` wygasa razem z zaproszeniem. |
| Zaproszenie podmieniające konto (`replacesUserId`) | Dziś bez UI, więc nie dostaje formularza. Gdyby kiedyś dostało, unikalny indeks „jeden czekający na podopiecznego" zgłosi kolizję głośno, zamiast po cichu podwoić bramkę. |
| Podopieczny nie chce wypełnić | Może się wylogować — link „Wyloguj" na ekranie formularza, jak na `/podopieczny/aktywuj`. |
| Trener usuwa podopiecznego | Kaskada po `trainee_id` sprząta formularz; brak blobów do posprzątania. |

## Koszt, którego nie ukrywamy

Bramka to jedno dodatkowe zapytanie przy każdym wejściu podopiecznego do
aplikacji — indeksowane po `trainee_id`, obok sześciu, które loader layoutu robi
już dziś. Lista podopiecznych trenera dociąga w loaderze bibliotekę ćwiczeń
(`id`, `name`, `unit`); przy 200 ćwiczeniach to około 10 KB na wejście. Obie
rzeczy są świadomym wyborem prostoty nad mikro-optymalizacją; alternatywą byłby
osobny fetcher zasobowy dla listy ćwiczeń, którego dziś nie potrzebujemy.

## Kryteria akceptacji

1. Trener może wygenerować zaproszenie **bez** formularza — flow wygląda i działa
   dokładnie jak dotąd.
2. Trener może dorzucić do zaproszenia 1–12 ćwiczeń ze swojej biblioteki i notatkę.
3. Podopieczny po założeniu konta z takiego zaproszenia trafia na formularz i nie
   dostanie się do żadnej trasy `/podopieczny/*` (ani do Wrapped), zanim go nie wyśle.
4. Gdy trener ustawił też kwotę miesięczną, podopieczny widzi najpierw ekran
   płatności, a formularz dopiero po aktywacji.
5. Po wysłaniu formularza podopieczny wchodzi do aplikacji i już nigdy nie
   zobaczy tego ekranu.
6. Trener widzi wyniki (liczby, komentarze, notatkę) na karcie podopiecznego pod
   plakietką „Formularz startowy".
7. Wszystkie bramki „done" zielone: `npm test`, `npm run typecheck`,
   `npm run lint`, `npm run build`, `/code-review`, `/security-review`.
