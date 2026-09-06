# Reszta `app/lib` na kontrakcie BE — plan wykonania w trzech falach

> **Dla agentów:** ten plan NIE jest wykonywany krok po kroku przez `subagent-driven-development`.
> Decyzją Właściciela (03.09.2026) segmenty jednej fali idą **równolegle**, każdy przez osobnego
> agenta w **trybie lekkim** (§2). Checkboxy są per segment, nie per krok. Agent czyta §1–§5
> w całości oraz brief swojego segmentu; briefy innych segmentów czyta tylko po to, żeby wiedzieć,
> czego NIE dotykać.

**Cel:** wszystkie moduły `app/lib`, które dziś stoją na Drizzle, przechodzą na klienta kontraktu
`@kalisthenos/api-client`, po czym z FE znika baza, Stripe i bramka `no-direct-db`.

**Architektura:** bez zmian wobec specu — trasy wołają moduły `app/lib/*`, moduły wołają klienta
(`api: Api`) na tej samej pozycji, na której brały `db: Db`. Zakres tenanta niesie token, egzekwuje
BE. Jedna dawna funkcja z parametrem „kto pyta" staje się dwiema, gdy kontrakt rozdziela trasy
`/v1/me/*` i `/v1/trainees/{id}/*` (precedens: `workouts.ts`).

**Stack:** React Router v7 (SSR, `v8_middleware`), `@kalisthenos/api-client` 0.3.0 (hey-api,
`throwOnError`), Vitest z podstawionym `fetch`, Biome.

**Spec:** [`../specs/2026-08-29-integracja-fe-be-design.md`](../specs/2026-08-29-integracja-fe-be-design.md)
§4 (architektura docelowa), §8 (Etap 2, kroki 3–7), §10 (testy), Załącznik A (mapowanie).
Warstwa klienta: [`../specs/2026-08-31-warstwa-klienta-api-fe-design.md`](../specs/2026-08-31-warstwa-klienta-api-fe-design.md).

---

## 1. Global Constraints

Z specu, dosłownie:

- **„Ustalenia po stronie BE są nadrzędne. Gdziekolwiek FE robi coś inaczej — nazwy, reguły,
  kształt kontraktu — zmienia się FE."**
- **„Integracja nie dokłada ani nie zmienia funkcji; jedynym świadomym ubytkiem są płatności."**
  Widoczny ubytek, którego kontrakt nie pokrywa, idzie na listę luk (§7), nie w obejście
  z N wywołaniami i nie w cichą utratę.
- Kontrakt błędu: **„`{ error: { code, message, details } }`, gdzie `message` jest już po polsku
  i dla użytkownika, a `code` stabilny dla logiki."** `403 ONBOARDING_FORM_PENDING` →
  `redirect("/podopieczny/formularz")`, `404` zostaje `404` (`toRouteResponse` w `api/errors.ts`).
- **„Rola przestaje być pojedyncza"** — `AuthUser.roles` jest listą; `requireUser(context, { role })`
  jest synchroniczne, bez sieci.
- Pliki: **„FE nie proxuje bajtów, tylko wstawia ten adres do `<img>`/`<video>`"** — adres z BE
  jest ŚCIEŻKĄ, origin dokłada `publicFileUrl` z `api/client.ts` **w module**, nie w trasie.
- Testy: **„testy modułów `app/lib` przeciw podstawionemu klientowi"** — wzorzec
  `app/lib/plans.test.ts` (`createApiClient` z podstawionym `fetch`, pomocnicze `klient(reguly)`
  i `json(status, cialo)`).

Z `CLAUDE.md` FE i pamięci projektu:

- **Git i Docker prowadzi Właściciel.** Żadnych komend gita — także odczytu.
- **Dokumentacja jest częścią „gotowe":** zmiana modułu → wiersz w `app/lib/README.md`; zmiana
  trasy → wiersz w `app/routes/<rola>/README.md`; usunięty plik → usunięty wiersz.
- UI po polsku, identyfikatory po angielsku. Komentarze w kodzie po polsku, w stylu istniejących
  modułów (mówią **dlaczego**, nie co).
- Moduł na `api: Api` **nie ma** `trainerId`/`traineeId` w sygnaturze jako filtra tenanta
  (`app/lib/README.md`, pierwszy akapit). `traineeId` zostaje wyłącznie tam, gdzie kontrakt
  ma go w ścieżce (`/v1/trainees/{traineeId}/…`).

## 2. Tryb lekki — obowiązuje każdego agenta bez wyjątku

Maszyna Właściciela zamarza pod komendami FE (dwukrotnie 02.09). Dlatego:

- Agent **nie uruchamia żadnej komendy powłoki**. Nie `npm run typecheck`, nie `npm run lint`,
  nie `npx vitest …` (także pojedynczego pliku), nie `npm run build`, nie `npx biome …`,
  nie `npm install`, nie `git …`, nie `ls`. Narzędzie Bash jest dla agenta **niedostępne
  z wyboru** — do czytania służą Read/Grep/Glob, do pisania Edit/Write.
- Testy **pisze**, ale ich **nie uruchamia**. Jedyny przebieg `npx vitest run <plik>
  --no-file-parallelism` na segment robi koordynator po powrocie agentów, sekwencyjnie.
- `npm run typecheck`, `npm run lint`, `npm run build` — wyłącznie Właściciel, na checkpoincie
  po fali. Agent pisze kod tak, jakby `tsc --strict` miał go przeczytać jutro: sprawdza typy
  DTO w `types.gen.d.ts`, nie zgaduje nazw pól.

## 3. Stan wyjściowy (03.09.2026, gałąź `be-integration`)

Na kontrakcie w całości: `auth/index.ts` (przez `api/`), `categories.ts`, `exercises.ts`,
`plans.ts`, `workouts.ts`, `views.ts`. W połowie: `trainees.ts` (tylko `listClientsForTrainer`),
`file-uploads.ts` (demo i nagrania serii; `body_photo` na dysku), `wrapped.ts` (tylko
`latestWrappedMonth`).

Na Drizzle — przedmiot tego planu:

| Moduł | LOC | Eksporty | Tras | Segment |
|---|---|---|---|---|
| `skills.ts` | 568 | 16 | 6 | S1 |
| `skill-progression.ts` | 331 | 4 | 2 | S1 |
| `skill-tree.ts` | 128 | 2 | 2 | S1 |
| `progression.ts` | 281 | 4 | 8 | S1 |
| `feature-requests.ts` | 339 | 9 | 5 | S2 |
| `onboarding-forms.ts` | 362 | 7 | 6 | S2 |
| `auth/invite.ts` (tylko tworzenie zaproszenia) | 191 | 5 | 1 | S2 |
| `auth/users.ts` (tylko wywołanie w `formularz.tsx`) | 23 | 2 | 3 | S2 |
| `consultations.ts` | 643 | 19 | 8 | S3 |
| `consultation-schedules.ts` | 209 | 6 | 1 | S3 |
| `google/sync.ts`, `google/calendar.ts` | 253 + ~140 | 6 + 6 | 6 | S3 (znikają) |
| `consultation-{types,status,recurrence}.ts` (tylko `import type` ze schematu) | 255 | 14 | 5 | S3 |
| `google/connections.ts`, `google/oauth.ts`, `google/crypto.ts` | ~300 | 12 | 2 | **zostają** (luka LK1, §7) |
| `file-uploads.ts` (dokończenie), `body-photos.ts`, `files.ts`, `storage/*`, `orphan-files.ts` | ~900 | — | 9 | S4 |
| `trainees.ts` (dokończenie), `stats.ts`, `wrapped.ts` (dokończenie) | ~1770 | — | 16 | S5 |
| `stripe/*`, `payments.ts`, `db/*`, `tests/*.itest.ts`, bramka | — | — | — | S6 |

Kontrakt (pakiet 0.3.0, `node_modules/@kalisthenos/api-client/dist/generated/`): 82 trasy,
98 funkcji SDK. Nazwy funkcji SDK to `<kontroler>Controller<Metoda>`; ścieżka i parametry każdej
są w `types.gen.d.ts` jako `<Nazwa>Data` (`url`, `path`, `query`, `body`), odpowiedź jako
`<Nazwa>Responses`. Opisy tras (`summary`) są w docblokach `sdk.gen.d.ts`. Semantyka pól: BE
`docs/03-modele-odczytu.md` i `docs/04-kontrakt-api.md` w `../calisthenos-be/docs/` — tylko do
czytania.

## 4. Fale i segmenty

| Fala | Segmenty | Dlaczego razem / dlaczego teraz |
|---|---|---|
| **1** | S1 umiejętności i rozwój · S2 zgłoszenia i formularz startowy · S3 konsultacje i kalendarz | rozłączne pliki, żaden nie importuje modułu innego segmentu fali |
| **2** | S4 pliki i sylwetka → S5 podopieczni, statystyki, wrapped | `trainees.ts` importuje `file-uploads.ts`; `podopieczni.$traineeId.tsx` jest punktem zbiegu S2, S3, S5 |
| **3** | S6 sprzątanie | czysto subtrakcyjne; dopiero gdy żaden moduł nie importuje `~/lib/db` |

Kolejność wewnątrz fali 1 jest dowolna — agenci biegną naraz. Fala 2 dopiero po integracji
fali 1 (§6) i checkpoincie Właściciela.

## 5. Reguły wspólne dla briefów

### 5.1 Własność plików

Każdy segment ma listę plików **na własność** (wolno Edit i Write, wolno usunąć) i listę plików
**wspólnych** (wolno WYŁĄCZNIE Edit, wyłącznie w liniach wołających moduły tego segmentu, po
ponownym Read tuż przed edycją; nigdy Write, nigdy usuwanie). Wszystko, czego nie ma na żadnej
z list, jest **zakazane** — w szczególności:

`app/lib/api/*`, `app/lib/db/*`, `app/lib/env.ts`, `app/lib/views.ts`, `app/root.tsx`,
`app/routes.ts` (poza jawnie wymienionym usunięciem trasy), `package.json`, `vitest.config.ts`,
`app/lib/trainees.ts`, `app/lib/stats.ts`, `app/lib/body-photos.ts`, `app/lib/file-uploads.ts`,
`app/lib/wrapped.ts`, `app/lib/stripe/*`, `app/lib/payments.ts`, `CLAUDE.md`, `README.md` w
korzeniu.

Gdy agent potrzebuje pomocnika, którego nie ma w `api/` (np. innego mapowania błędu), pisze go
**lokalnie w swoim module** i wpisuje do raportu jako kandydata do `api/`. Gdy `views.ts` nie ma
pola, którego potrzebuje — luka do raportu, nie edycja `views.ts`.

W plikach wspólnych obowiązuje jeszcze jedno: **nie usuwaj `db` ani wywołań do modułów spoza
swojego segmentu, nawet jeśli po Twojej zmianie wyglądają na zbędne.** Trasa w stanie mieszanym
(część wywołań na `api`, część na `db`) jest stanem oczekiwanym do końca fali 2.

### 5.2 Wzorzec przepięcia modułu

1. **Sygnatury zostają tam, gdzie mogą.** `db: Db` → `api: Api` na tej samej pozycji, znikają
   `trainerId`/`traineeId` używane jako filtr tenanta. Nazwa funkcji zostaje, chyba że kontrakt
   rozdziela role (wtedy para `loadMy…`/`loadTrainee…`, jak w `workouts.ts`) albo funkcja znika,
   bo jej pracę robi BE (liczniki, pre-checki, synchronizacja).
2. **Jedno wywołanie na ekran.** Gdy kontrakt oddaje stronę z `total`/`counts`, funkcje liczące
   znikają. Gdy ekran składał wynik z kilku funkcji, a BE ma dla niego jeden widok
   (`development`, `overview`, `nav`), moduł oddaje ten widok, a trasa czyta pola.
3. **Typy z kontraktu, nie własne kopie.** Re-eksportuj typ DTO (`import type … from
   "@kalisthenos/api-client"`) zamiast przepisywać interfejs. Własny typ zostaje tylko wtedy, gdy
   moduł naprawdę coś przelicza (np. `toLoggingEntries`).
4. **Błędy wąsko.** Klasa błędu modułu (`SkillError`, `ConsultationError`, …) z `userMessage`
   z koperty BE, mapowana z konkretnych statusów/kodów (`400`/`404`/`409`, po `error.code`, gdy
   kod jest znaczący); każdy inny `ApiError` leci dalej. `Promise<… | null>` mapuje `404` przez
   `orNull`. W trasie: `if (e instanceof <ModułError>) return { error: e.userMessage }; if (e
   instanceof ApiError) throw toRouteResponse(e); throw e;` — jak w `biblioteka.$exerciseId.tsx`.
5. **Ciało żądania składane jawnie pole po polu** — BE odrzuca pola spoza DTO (`400`), a typy
   strukturalne tego nie zgłoszą (lekcja `toSavePlanDto`).
6. **Adresy plików** (`demoUrl`, `videoUrl`, `photoUrl`) przez `publicFileUrl` w module.
7. **Liczniki nawigacji:** obszar USUWA z layoutu swoją funkcję liczącą i bierze pole z już
   pobranego `nav` (`TrainerNavView`: `trainees`, `activeExercises`, `plans`,
   `newFeatureRequests`; `TraineeNavView`: `activePlanSessions`, `workoutLogs`, `bodyPhotos`,
   `pendingConsultations`, `featureRequests`).
8. **Martwe eksporty znikają** — po Grep po całym `app/` (bez `.test.ts`) i po `tests/`.
9. **Sortowania i filtry:** jeśli nazwy z URL-a są identyczne z kontraktem — bez słownika
   (`plans.ts`); jeśli różne — słownik `CONTRACT_SORT` w module (`exercises.ts`). Nie dokładaj
   słownika „dla symetrii".

### 5.3 Testy (pisane, nie uruchamiane)

Plik `app/lib/<moduł>.test.ts` obok modułu, wzorzec `plans.test.ts`. Każda funkcja publiczna ma
co najmniej: jeden przypadek „żądanie idzie w dobre miejsce z dobrymi parametrami/ciałem"
(asercja na `req.method`, `new URL(req.url).pathname`/`.search`, `await req.json()`) i jeden
przypadek mapowania błędu (właściwy status → klasa błędu modułu z `userMessage` z koperty; obcy
status → `ApiError` przelatuje). Opisy `it(...)` po polsku, w stylu istniejących. Istniejące
testy czystych modułów (`consultation-*.test.ts`, `skill-*-math.test.ts`,
`feature-request-types.test.ts`, `onboarding-form-types.test.ts`) mają nadal przechodzić —
jeśli zmieniasz typ, na którym stoją, poprawiasz je w tym samym ruchu.

Stary test `tests/<moduł>.itest.ts` (testcontainers) modułu przeniesionego w całości na kontrakt
**usuwasz** wraz z wierszem w `tests/README.md` (precedens: ćwiczenia, plany, dziennik; spec §10).
Jeśli plik testuje też funkcje, które zostają na Drizzle (np. `auth-repo.itest.ts` a
`consumeInvite`), usuwasz tylko przypadki funkcji przepiętych.

### 5.4 Raport agenta

Agent kończy zapisem raportu do
`C:\Users\Mateusz\AppData\Local\Temp\claude\D--praca-calishenos-fullstack\5abd6bbe-d7b9-4551-b1ff-8767c67c7c30\scratchpad\wave1\<segment>.md`
(Write; katalog może nie istnieć — Write go założy) i zwraca tę samą treść jako odpowiedź:

```
# Raport <segment>
## Mapowanie: moduł → funkcja (stara sygnatura) → funkcja (nowa) → funkcja SDK / ścieżka
## Pliki własne: zmienione / utworzone / usunięte
## Pliki wspólne: plik → które linie i po co (dosłownie, żeby koordynator umiał to sprawdzić)
## Testy: pliki, liczba przypadków (NIE uruchamiane)
## README: które wiersze
## Luki (L<segment>-n): widoczny ubytek wobec kontraktu — co, dla kogo, propozycja
   (dodatek po stronie BE / decyzja FE), NIE obejście
## Decyzje podjęte samodzielnie i wątpliwości
## Co w moich modułach zostało na Drizzle i dlaczego (docelowo: nic poza wymienionym w briefie)
```

---

## Fala 1

### Segment S1 — umiejętności i rozwój

**Moduły na własność:** `app/lib/skills.ts`, `app/lib/skill-progression.ts`,
`app/lib/skill-tree.ts`, `app/lib/progression.ts` oraz ich `*.test.ts` (do utworzenia).
Czyste moduły `skill-progression-math.ts`, `skill-tree-math.ts`, `skill-pyramid*.ts`,
`skill-tier.ts`, `skill-types.ts`, `progression-math.ts` — wolno dotknąć tylko, gdy typ wejściowy
zmienia kształt; ich testy muszą przejść.

**Trasy na własność** (`app/routes/…`): `trener/umiejetnosci._index.tsx`,
`trener/umiejetnosci.nowa.tsx`, `trener/umiejetnosci.$skillId.tsx`,
`trener/podopieczni.$traineeId.rozwoj._index.tsx`,
`trener/podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx`,
`trener/podopieczni.$traineeId.rozwoj.cwiczenie.$exerciseId.tsx`,
`trener/podopieczni.$traineeId.rozwoj.porownanie.tsx`, `podopieczny/rozwoj._index.tsx`,
`podopieczny/rozwoj.umiejetnosc.$skillId.tsx`, `podopieczny/rozwoj.cwiczenie.$exerciseId.tsx`,
`podopieczny/rozwoj.porownanie.tsx`. (`podopieczny/umiejetnosci*.tsx` to przekierowania 301 —
nie ruszać.)

**Pliki wspólne (Edit, tylko własne wiersze):** `app/lib/README.md`,
`app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `tests/README.md`.

**Mapowanie do wykonania:**

| Funkcja FE (dziś) | Funkcja SDK | Uwagi |
|---|---|---|
| `listSkillsForTrainer(db, trainerId)` | `skillsControllerList` | `SkillListRow` → typ z kontraktu; sortowanie/filtr tieru zostają w trasie, jeśli kontrakt ich nie ma |
| `getSkillWithVariations(db, trainerId, skillId)` | `skillsControllerById` | szczegół niesie też listy pomocnicze edytora (spec, Zał. A: `listAssignableExercises`, `listAssignablePrerequisites`, `listConflictingPrerequisites`, `listPrerequisitesForSkill` **są w `GET /v1/skills/{id}`**) — te cztery funkcje znikają, trasa czyta pola szczegółu; `\| null` przez `orNull` |
| `createSkill`, `updateSkill`, `archiveSkill` | `skillsControllerCreate`, `…Update`, `…Archive` | `SkillError` wąsko z `409` (cykl, tier prereka, wariant) |
| `addVariation`, `removeVariation`, `reorderVariations` | `skillsControllerCreateVariation`, `…DeleteVariation`, `…PutOrder` | |
| `addPrerequisite`, `removePrerequisite` | `skillsControllerCreatePrerequisite`, `…DeletePrerequisite` | docblok: „409 przy cyklu oraz przy prerekwizycie o wyższym stopniu" — FE nie sprawdza tego przed wysłaniem |
| `findSkillForExercise`, `listExerciseSkillMap`, `listAssignedSkillIds`, `getSkillTreeForTrainer` | — | sprawdź importerów; to, co ma zero wywołań w `app/`, usuń; `listExerciseSkillMap` dla ekranu rozwoju bierze się z widoku `development` |
| `getSkillTreeForTrainee(db, trainerId, traineeId)` | `traineeDevelopmentControllerOwn` / `traineeDevelopmentByTrainerControllerForTrainee` | pole `tree` widoku rozwoju (spec: „drzewo umiejętności i lista ćwiczeń z progresją → `GET /v1/me/development`") |
| `listProgressionExercises(db, traineeId, …)` | j.w. | „pozostałe ćwiczenia" tego samego widoku — ekran `rozwoj._index` to **jedno** wywołanie |
| `getSkillMapForTrainee(db, trainerId, traineeId)` | `mySkillProgressControllerMine` (własny) / `traineeSkillProgressControllerForTrainee` (trener) | para funkcji; historia jest w mapie (docblok) |
| `setStartingLevel`, `recordAdvancement` | `traineeSkillProgressControllerStart`, `…Advance` | „409 bez poziomu startowego oraz przy awansie na poziom bieżący" |
| `getExerciseProgression(db, traineeId, exerciseId, range)` | `traineeProgressionControllerProgression` (własna, `/v1/me/progression/{exerciseId}`) / `trainerProgressionControllerProgression` (`/v1/trainees/{id}/progression/{exerciseId}`) | para; sprawdź `url` w `…Data`, bo nazwy kontrolerów mylą („trainee…" = własna) |
| `getProgressionComparison` | `traineeProgressionControllerCompare` / `trainerProgressionControllerCompare` | para |
| `todayIso` | — | czysta, zostaje |
| re-eksport `findTraineeOfTrainer` z `progression.ts` | — | usuń re-eksport; cztery trasy trenera importują go stąd — przepnij ich import na `~/lib/trainees` i **zostaw wywołanie na `db`** (S5 je zastąpi) |

**Podejrzana luka do zbadania na początku:** oba endpointy mapy umiejętności mówią w docbloku
„**bez sugestii awansu**", a `skill-progression.ts` liczy dziś `suggestAdvancement` z sygnałów
progresji (`getExerciseProgress`, `getEasierAtSameReps` ze `stats.ts`). Sprawdź w
`types.gen.d.ts`, czy DTO mapy niesie sygnały (liczba sesji, RPE na bieżącym wariancie). Jeśli
nie — sugestia awansu to **luka L S1-1**: nie licz jej z N wywołań progresji; ekran traci
sugestię, raport opisuje, jakich pól brakuje. `skill-progression.ts` przestaje importować
`stats.ts` w każdym wariancie.

- [x] **S1 wykonane** (03.09.2026), domknięte 04.09. Cztery moduły, cztery pliki testów, jedenaście tras, dwa komponenty. Raportu agent nie zdążył napisać (limit sesji) i **nie zdążył usunąć pięciu testów integracyjnych** swoich modułów — `tsc` pokazał to 202 błędami w `tests/{skills,skill-tree,skill-tier,rozwoj,progression-tenant-scope}.itest.ts`. Koordynator je usunął (§5.3: moduł w całości na kontrakcie traci swój itest) i poprawił import w `statystyki-redystrybucja.itest.ts`, który brał `findTraineeOfTrainer` ze zniesionego re-eksportu w `progression.ts`.

### Segment S2 — zgłoszenia i formularz startowy

**Moduły na własność:** `app/lib/feature-requests.ts`, `app/lib/onboarding-forms.ts` i ich
`*.test.ts` (do utworzenia); `app/lib/auth/invite.ts` **tylko** `createInvite` i
`createInviteWithOnboarding` (reszta — `consumeInvite`, `findInviteByToken`, `hashToken` —
zostaje na Drizzle do S6); `app/lib/auth/index.ts` (re-eksporty). `app/lib/auth/users.ts`
**nie ruszać** — tylko wywołanie `findDisplayName` w `formularz.tsx` przechodzi na
`user.trainerName` z `AuthUser`.

**Trasy na własność:** `podopieczny/pomysly.tsx`, `trener/pomysly._index.tsx`,
`trener/pomysly.$requestId.tsx`, `podopieczny/formularz.tsx` (wywołania onboardingu i
`findDisplayName`; **bramka `stripe/gate` zostaje**), `trener/podopieczni.$traineeId.formularz.tsx`
(tylko `getFormForTrainer`; wywołania `trainees` zostają na `db`).

**Pliki wspólne (Edit, tylko własne wiersze):** `podopieczny/_layout.tsx` (linie
`countForTrainee` i `hasPendingOnboarding`), `trener/_layout.tsx` (linia `countNewForTrainer`),
`podopieczny/wrapped.$ym.tsx` (linia `hasPendingOnboarding`), `trener/podopieczni._index.tsx`
(akcja tworząca zaproszenie: `createInviteWithOnboarding`, `OnboardingFormError`; loader listy
zostaje), `trener/podopieczni.$traineeId.tsx` (linia `getFormStatusForTrainee`),
`app/lib/README.md`, `app/lib/auth/README.md`, `app/routes/trener/README.md`,
`app/routes/podopieczny/README.md`, `tests/README.md`.

**Mapowanie do wykonania:**

| Funkcja FE (dziś) | Funkcja SDK | Uwagi |
|---|---|---|
| `listForTrainee(db, traineeId, {sort})`, `countForTrainee` | `myFeatureRequestsControllerList` | strona z `total`; licznik znika, layout bierze `nav.featureRequests` |
| `createFeatureRequest`, `deleteFeatureRequest` | `myFeatureRequestsControllerCreate`, `…Remove` | `FeatureRequestError` wąsko (`409` przy kasowaniu nie-`new`) |
| `listForTrainer(db, trainerId, {q, sort, status, page})`, `countForTrainer` | `featureRequestsControllerList` | sprawdź zbiór `sort` w `…Data` — słownik tylko, gdy nazwy się różnią |
| `getForTrainer`, `respondToFeatureRequest` | `featureRequestsControllerGet`, `…Respond` | docblok `Respond`: „pusta treść kasuje odpowiedź i datę" — FE nie stempluje nic samo |
| `countNewForTrainer` | — | znika; `trener/_layout.tsx` bierze `nav.newFeatureRequests` |
| `hasPendingOnboarding(db, userId)` | `myOnboardingFormControllerPending` + `orNull` | patrz „bramka" niżej |
| `getPendingFormForTrainee`, `submitOnboardingForm` | `myOnboardingFormControllerPending`, `…Submit` | `OnboardingFormError` wąsko (`409` drugie wysłanie, `400` niekomplet) |
| `getFormForTrainer(db, trainerId, traineeId)`, `getFormStatusForTrainee` | `traineeOnboardingFormControllerForTrainer` | jedno wywołanie; status (brak/oczekuje/wypełniony) wyprowadź z odpowiedzi/`404` — sprawdź DTO |
| `createOnboardingForm`, `attachFormToTrainee` | — | znikają: formularz jedzie w ciele `invitesControllerCreate` (`onboardingForm`), doczepienie robi BE przy przyjęciu |
| `createInvite(db, …)`, `createInviteWithOnboarding(db, …)` | `invitesControllerCreate` | jedna funkcja na `api` z opcjonalnym `onboardingForm`; zwraca to, co niesie DTO odpowiedzi (token/adres) — sprawdź, z czego trasa buduje odnośnik zaproszenia |

**Bramka formularza startowego — decyzja dla tego segmentu.** BE ma bramkę globalną: każda trasa
podopiecznego poza białą listą odpowiada `403 ONBOARDING_FORM_PENDING`, a `toRouteResponse`
zamienia to na `redirect("/podopieczny/formularz")`. `GET /v1/me/onboarding-form` jest na białej
liście (inaczej formularza nie dałoby się pobrać). Zostaw **jawne** `hasPendingOnboarding(api)`
(jedno `GET`, `404` → `false`) w obu miejscach, które dziś je wołają — layout i `wrapped.$ym.tsx`
— w tej samej kolejności co dziś (przed `nav`). Powód: `wrapped.$ym.tsx` do fali 2 nie ma
żadnego innego wywołania kontraktu, które by bramkę odpaliło, a layout ma ją odpalać ZANIM
policzy cokolwiek. Dodatkowo w layoucie owiń `loadTraineeNavigation` w `try/catch` z
`toRouteResponse` — to siatka na wypadek, gdyby biała lista BE kiedyś się zmieniła.

- [x] **S2 wykonane** (03.09.2026). Dwa moduły plus zaproszenia, trzy pliki testów, pięć tras własnych i pięć wspólnych, dwa itesty usunięte, trzeci przycięty. Raportu agent nie zdążył napisać (limit sesji).

### Segment S3 — konsultacje i kalendarz

**Moduły na własność:** `app/lib/consultations.ts`, `app/lib/consultation-schedules.ts`
i ich `*.test.ts` (do utworzenia); `app/lib/consultation-types.ts`, `consultation-status.ts`,
`consultation-recurrence.ts` (**tylko** przepięcie `import type` ze schematu Drizzle na typy
kontraktu; ich testy mają przejść); `app/lib/google/sync.ts` i `app/lib/google/calendar.ts`
(**do usunięcia**); `app/lib/google/README.md`.

**NIE ruszać:** `app/lib/google/connections.ts`, `google/oauth.ts`, `google/crypto.ts`,
`trener/integracje.google.tsx`, `trener/integracje.google.callback.tsx`. Powód: luka LK1 (§7) —
przepływ „Połącz z Google" nie da się przepiąć bez decyzji ponad tym planem. Jedyny wyjątek:
`isGoogleSyncActive` z `google/sync.ts` **przenieś** do `google/connections.ts` bez zmiany
zachowania (stoi na `db` i konfiguracji), skoro `sync.ts` znika.

**Trasy na własność:** `podopieczny/konsultacje._index.tsx`,
`podopieczny/konsultacje.$konsultacjaId.tsx`, `trener/konsultacje.tsx`,
`trener/podopieczni.$traineeId.konsultacje._index.tsx`,
`trener/podopieczni.$traineeId.konsultacje.nowa.tsx`,
`trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx` (w trzech ostatnich wywołania
`findTraineeOfTrainer` z `~/lib/trainees` **zostają na `db`**).

**Pliki wspólne (Edit, tylko własne wiersze):** `podopieczny/_layout.tsx` (linia
`countPendingForTrainee` → `nav.pendingConsultations`), `trener/podopieczni.$traineeId.tsx`
(linie `countPendingForTrainee`, `nextUpcomingForTrainee`, `syncCancelAllForPair`),
`app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`,
`tests/README.md`.

**Mapowanie do wykonania:**

| Funkcja FE (dziś) | Funkcja SDK | Uwagi |
|---|---|---|
| `listOccurrencesForTrainee(db, traineeId, from, to)` | `consultationsControllerList` (`query: { from, to }`) | docblok: „trener widzi wszystkich podopiecznych, podopieczny własne. Odwołane pomijane" |
| `listTrainerOccurrencesInRange(db, trainerId, from, to)` | j.w. | `TrainerCalendarItem` → `ConsultationView`; nazwa podopiecznego jest w widoku |
| `listOccurrencesForTrainer(db, trainerId, traineeId, from, to)` | j.w. + filtr po `traineeId` **w module** | jedno wywołanie, nie N |
| `countPendingForTrainee` | — | layout: `nav.pendingConsultations`; przegląd trenera (`podopieczni.$traineeId.tsx`): wyprowadź z listy od dziś, jednym wywołaniem, albo zgłoś lukę, jeśli `TraineeOverviewView` powinien to nieść |
| `nextUpcomingForTrainee` | z listy od dziś, pierwszy nieodwołany | jedno wywołanie |
| `getConsultationDetail` | `consultationsControllerGet` | `\| null` przez `orNull` |
| `createAdhocConsultation` | `consultationsControllerCreate` | uwaga z `libs/consultations/CLAUDE.md` BE: **`title` nie istnieje w `/v1`** — pole formularza, jeśli je ma, nie idzie do ciała |
| `documentConsultation`, `setActionItemStatus` | `consultationsControllerDocument`, `…SetActionItemStatus` | „podmienia dotychczasowe" — wolno powtórzyć |
| `rescheduleOccurrence`, `cancelOccurrence`, `respondToOccurrence`, `deleteConsultation` | `…Reschedule`, `…Cancel`, `…Respond`, `…Remove` | `ConsultationError` wąsko z `409` (udokumentowany, przejście niedozwolone) |
| `getActiveSchedule`, `upsertSchedule`, `deactivateSchedule` | `consultationSchedulesControllerGet`, `…Save`, `…Disable` | `Get`: „para bez cyklu daje pustą wartość" — odpowiedź jest **opakowana** (`schedule: … \| null`), nie `404` |
| `ensureOccurrences`, `HORIZON_DAYS` | — | znikają: materializację robi BE (zapis harmonogramu i praca cykliczna workera) |
| `defaultTitle` | — | zostaje tylko, jeśli ma wywołanie poza usuwanym kodem |
| `getSyncRow`, `listUnsyncedForSync`, `listSyncedForRepair`, `setGoogleEventId`, `listGoogleEventIdsForPair`, `listCancelledGoogleEventIds`, `ConsultationSyncRow`, `GoogleEventRef` | — | znikają razem z `google/sync.ts` |
| `syncUpsertOne`, `syncCancelOne`, `syncCancelStaleSchedule` (wołane po mutacjach w trasach) | — | znikają: BE synchronizuje przez outbox po każdej mutacji |
| `syncBackfillPair(db, trainerId, traineeId)` | `consultationSyncControllerRun` (`POST /v1/trainees/{traineeId}/consultation-sync`) | `ConsultationSyncResult` (`connected`, `attempted`, `synced`); przy wyłączonej integracji `200` z `connected: false` — nie błąd |
| `syncCancelAllForPair` w `podopieczni.$traineeId.tsx` | — | usuń wywołanie; kasowanie podopiecznego zostaje w tej fali na `deleteTraineeFully(db…)` (S5 przepnie je na `DELETE /v1/trainees/{id}`, które sprząta kalendarz samo — ADR-0035 BE). Do fali 2 kasowanie na Drizzle nie zdejmuje zdarzeń z Google — wpisz to do raportu jako stan przejściowy |

**Typy czystych modułów:** `consultation-types.ts`, `consultation-status.ts`,
`consultation-recurrence.ts` importują typy ze schematu Drizzle (status terminu, reguła cyklu).
Przepnij je na typy z `@kalisthenos/api-client` (np. status z `ConsultationView['status']`),
zachowując eksportowane nazwy, żeby komponenty i testy nie zauważyły zmiany.

- [x] **S3 wykonane** (04.09.2026) — **w dwóch rękach.** Agent zrobił moduły (`consultations.ts`, `consultation-schedules.ts`, typy czystych modułów), dwa pliki testów i trasy podopiecznego, po czym limit sesji uciął go w połowie: `google/sync.ts` i `google/calendar.ts` zostały wypatroszone do `export {}` zamiast usunięcia, trzy trasy trenera nadal je importowały, a `canTraineeRespond` — wołane przez obie trasy podopiecznego i pokryte testem — nie zostało dopisane do modułu. Domknął to koordynator: usunięcie trzech plików Google wraz z itestami, `canTraineeRespond` w `consultations.ts`, przepięcie `podopieczni.$traineeId.konsultacje.{_index,nowa,$konsultacjaId}.tsx` i linii konsultacji w `podopieczni.$traineeId.tsx` oraz `podopieczny/_layout.tsx`, cztery pliki README.

---

## Fala 2 (briefy do doprecyzowania po raportach fali 1)

### Segment S4 — pliki i sylwetka

**Moduły na własność:** `app/lib/body-photos.ts` (+ nowy `body-photos.test.ts`), `app/lib/file-uploads.ts`
(dokończenie + `file-uploads.test.ts`), `app/lib/files.ts` (**do usunięcia**), `app/lib/orphan-files.ts`
(**do usunięcia**), `app/lib/storage/README.md`. W `app/lib/stats.ts` wolno **wyłącznie** wyciąć
`getSideBySidePhotoPairs` i typ `SideBySidePhotoPair` — reszta pliku należy do S5.

**Trasy na własność:** `app/routes/files.$fileId.tsx` (**do usunięcia**, wraz z wpisem
`route("files/:fileId", …)` w `app/routes.ts`), `app/routes/podopieczny/sylwetka.tsx`,
`app/routes/trener/podopieczni.$traineeId.sylwetka.tsx` (w drugiej `findTraineeOfTrainer`
zostaje na `db`), `app/root.tsx` (**tylko** dwie linie `maybeSweepOrphanSetVideos`).

**Pliki wspólne (Edit, własne wiersze):** `app/routes/podopieczny/_layout.tsx` (linia
`countBodyPhotosForTrainee` → `nav.bodyPhotos`), `app/lib/README.md`, `app/routes/README.md`
(jeśli wymienia trasę plików), `app/routes/podopieczny/README.md`, `app/routes/trener/README.md`,
`tests/README.md`, `CLAUDE.md` (**wyjątek dla tego segmentu** — akapit „Pliki: dwie ścieżki, bo
migracja jest w toku" przestaje być prawdziwy; popraw go, nic więcej w tym pliku).

**Mapowanie do wykonania**

| Funkcja FE (dziś) | Funkcja SDK / los | Uwagi |
|---|---|---|
| `uploadFile(db, …)`, `UploadCleanupQueue`, `iterateFileChunks` | znikają | zapis na dysk kończy się razem z trzecią ścieżką wysyłki |
| trzecia ścieżka wysyłki: `body_photo` | `filesControllerBodyPhoto` + `filesControllerConfirm` przez istniejące `uploadThroughContract` | dopisz `uploadBodyPhoto(api, file)` obok `uploadExerciseDemo`/`uploadSetVideo` — wzorzec gotowy, trzy linie |
| `findFileById`, `deleteFile`, `deleteFileRow` | znikają | odczyt pliku obsługuje BE trasą podpisaną |
| `deleteFileBlob` i `app/lib/storage/*` | **ZOSTAJĄ** | `trainees.ts` woła je w kaskadzie `deleteTraineeFully`, która stoi na Drizzle do S5; znikną razem z nią |
| `listBodyPhotosForTrainee(db, traineeId, opts)` | `bodyPhotosControllerMine` (własne) / `traineeBodyPhotosControllerForTrainee` (trener) | **para funkcji**, jak w `workouts.ts`. Strona kontraktu: `page`, `sort` = `taken_on_desc\|taken_on_asc`; `BodyPhotoDto` niesie `photoUrl` jako ŚCIEŻKĘ → origin przez `publicFileUrl` **w module** |
| `countBodyPhotosForTrainee` | znika | strona niesie `total`, a layout bierze `nav.bodyPhotos` |
| `addBodyPhoto(db, input)` | `filesControllerBodyPhoto` → `confirm` → `bodyPhotosControllerCreate` | sekwencja jak przy demo ćwiczenia; ciało `CreateBodyPhotoDto` = `fileId`, `view`, `takenOn`, `note?` |
| `deleteBodyPhoto(db, id, traineeId)` | `bodyPhotosControllerRemove` (`/v1/me/body-photos/{id}`) | tylko własne zdjęcie — trener nie kasuje cudzych; sprzątanie bloba robi BE |
| `getSideBySidePhotoPairs(db, traineeId)` ze `stats.ts` | **czysta funkcja nad listą**, przeniesiona do `body-photos.ts` | spec, Zał. A: „parowanie zdjęć po widoku i dacie liczy się w FE z listy; to prezentacja, nie dane". Potrzebuje WSZYSTKICH zdjęć, a kontrakt stronicuje — dołóż `listAllBodyPhotos*`, które sklejają strony (precedens: `listActiveExercisesForTrainer` w `exercises.ts`) |
| `signFileUrl`, `verifyFileUrl`, `fileUrlExp`, `*Path`, `extForMime`, `newFileId`, `ALLOWED_*_MIME` | znikają wraz z `files.ts` | adres podpisuje BE (ADR-0023), FE wstawia go do `<img>` |
| `sweepOrphanSetVideos`, `maybeSweepOrphanSetVideos` | znikają | sprzątanie sierot robi worker BE |

**Trzy rzeczy, na które uważać**

1. **`maxUploadBytesFor` zostaje** — `loguj.$sessionId.tsx` i trasy biblioteki czytają z niego limit
   do pola wysyłki, a `upload.wideo.tsx` jest cienką trasą zasobową dla XHR z paskiem postępu
   i **nie znika w tym segmencie**.
2. **Zdjęcie sylwetki wysyła się dwufazowo**, więc nieudany zapis wiersza zostawia plik bez
   właściciela — sprząta go zamiatacz BE po 24 h karencji. Nie odtwarzaj `UploadCleanupQueue`.
3. **Cena z §4 specu:** BE musi być publicznie osiągalny dla przeglądarki, bo `<img>` idzie
   wprost do niego (`API_PUBLIC_URL`).

- [x] **S4 wykonane** (04.09.2026). Trzecia ścieżka wysyłki na kontrakcie (`uploadBodyPhoto`), zdjęcia sylwetki w całości, parowanie „przed i po" przeniesione ze `stats.ts` do `body-photos.ts` jako funkcja czysta nad sklejonymi stronami. Usunięte: `files.ts` z testem, `orphan-files.ts`, trasa `files/$fileId` z wpisem w `app/routes.ts`, `tests/orphan-sweeper.itest.ts`. `deleteFileBlob` i `storage/*` zostają do S5 (woła je kaskada `deleteTraineeFully`). Agent oddał raport; koordynator skasował wskazane pliki, naprawił CSP (niżej) i posprzątał odwołania do usuniętych plików w `vite.config.ts`, `healthz.tsx`, `no-direct-db.test.ts` i obu README.

  **Koordynator naprawił przy okazji rzecz starszą niż ten segment:** `CSP_DIRECTIVES` w `app/root.tsx` deklarowało `img-src 'self'` i `media-src 'self'`, więc przeglądarka blokowała KAŻDY plik podany adresem BE. Dotyczyło to demo ćwiczeń i nagrań serii od pierwszej fali, nie tylko zdjęć — objaw cichy (puste `<img>` wygląda jak brak pliku), bo testy nie renderują polityki. Dyrektywy liczy dziś `cspDirectives()` z originu `API_PUBLIC_URL`.

### Segment S5 — podopieczni, statystyki, wrapped

**Moduły na własność:** `app/lib/trainees.ts` (+ `trainees.test.ts`, dziś testuje wyłącznie
`listClientsForTrainer`), `app/lib/stats.ts` (+ nowy `stats.test.ts`), `app/lib/wrapped.ts`
(+ `wrapped.test.ts`), `app/lib/file-uploads.ts` — **tylko** usunięcie `deleteFileBlob`
i importu `getStorage`, gdy zniknie kaskada, `app/lib/storage/*` (**do usunięcia**, razem
z `local-volume.test.ts` i `README.md` katalogu).

**Trasy na własność:** `trener/podopieczni.$traineeId.tsx`, `trener/plany.nowy.tsx`,
`trener/podopieczni.$traineeId.log.$logId.tsx`, `trener/podopieczni.$traineeId.formularz.tsx`
(tylko `assertTraineeOwnedBy`/`findTraineeOfTrainer`), `trener/podopieczni.$traineeId.sylwetka.tsx`,
`trener/podopieczni.$traineeId.rozwoj.{_index,umiejetnosc.$skillId,cwiczenie.$exerciseId,porownanie}.tsx`,
`trener/podopieczni.$traineeId.konsultacje.{_index,nowa,$konsultacjaId}.tsx` (w każdej z nich
**tylko** linia `findTraineeOfTrainer`), `podopieczny/wrapped.$ym.tsx`, `podopieczny/_index.tsx`.
**`trener/podopieczni.$traineeId.platnosci.tsx` zostaje nietknięta** — cała jest Stripe'em (S6).

**Pliki wspólne (Edit, własne wiersze):** `trener/_layout.tsx` (linia `countTraineesOfTrainer`
→ `nav.trainees`), `app/lib/README.md`, `app/routes/trener/README.md`,
`app/routes/podopieczny/README.md`, `tests/README.md`.

**Mapowanie do wykonania**

| Funkcja FE (dziś) | Funkcja SDK / los | Uwagi |
|---|---|---|
| `deleteTraineeFully(db, trainerId, traineeId)` → `{displayName, deletedFiles}` | `traineesControllerRemove` → `204` bez treści | kasuje przez granice kontekstów wraz z plikami i odwzorowaniami kalendarza (ADR-0035 po stronie BE). Nazwę do komunikatu po przekierowaniu trasa MA już z nagłówka — nie bierze jej z odpowiedzi. `TraineeDeleteError` wąsko z `404`/`409` |
| `countTraineesOfTrainer` | znika | `TrainerNavView.trainees` w `trener/_layout.tsx` |
| `listTraineesOfTrainer` (picker planu) | `traineeListControllerQuery`, **sklejone strony** | precedens: `listActiveExercisesForTrainer`. Picker potrzebuje kompletu, a lista jest stronicowana |
| `assertTraineeOwnedBy` | znika | każda trasa `/v1/trainees/{id}/…` oddaje `404` na cudzego — FE nie pre-sprawdza |
| `getHealthStats`, `getPlateauExercises`, `getTagDistribution`, `getVideoCoverage`, `getBodyPhotoCoverage`, `getActivePlanSessionUsage`, `getCurrentPlanTotals` | **jedno** `traineeOverviewControllerQuery` | `TraineeOverviewView` = `{ activePlan, draftPlan, health, plateau, tags, videoCoverage, bodyPhotoCoverage }`. Siedem zapytań → jedno wywołanie; `stats.ts` traci siedem funkcji i ich typy na rzecz jednej `loadTraineeOverview(api, traineeId)` |
| `getExerciseProgress`, `getEasierAtSameReps` | **znikają, martwe** | jedyny wołający (`skill-progression.ts`) przestał je importować w S1; sprawdź Grepem i usuń wraz z typami `ExerciseProgress`/`EasierExercise` |
| `getActivityHeatmap(db, traineeId, 12)` | **BRAK w kontrakcie** → luka | `TraineeOverviewView` nie ma mapy aktywności; `TraineeHomeView.heatmap` jest widokiem WŁASNYM podopiecznego, nie trenera patrzącego na podopiecznego. Nie składaj jej z dziennika — zgłoś lukę i zdejmij kafelek z ekranu |
| `getMonthlyWrapped(db, userId, year, month)` | `wrappedControllerSummary` (`GET /v1/me/wrapped/{ym}`) | `WrappedSummaryView` pokrywa **wszystko**: sumy, `topExercise`, `prs`, `heaviestDay`, `archetype`, `vsPrevious`. Cała arytmetyka z `wrapped.ts` (ok. 400 linii) znika. **Uwaga:** generator typuje `path.ym` jako `Array<string>` — sprawdź, co naprawdę przyjmuje wywołanie, i zgłoś, jeśli to artefakt |
| archetypy: `ArchetypeKey`, `Archetype` i polskie opisy | **zostają w FE** | kontrakt niesie `key`, `emoji` i dwie liczby; etykieta i opis po polsku to prezentacja. Zamień mapę na słownik `key` → tekst |
| `latestWrappedMonth`, `parseYM`, `formatYM`, `monthLabel`, `isPastMonth` | bez zmian | czyste, już na liście z kontraktu |
| `deleteFileBlob` + `app/lib/storage/*` | **znikają razem z kaskadą** | to ostatni wywołujący; po usunięciu `deleteTraineeFully` na Drizzle katalog magazynu nie ma po co istnieć |

**Decyzja, którą trzeba podjąć na początku, bo dotyka dziewięciu tras**

`findTraineeOfTrainer` i `getTraineeOfTrainer` służą dziś dwóm rzeczom naraz: bramce „cudzy → 404"
i **nazwie podopiecznego do nagłówka**. Bramkę przejmuje BE, ale nazwy **nie ma skąd wziąć jednym
wywołaniem** — kontrakt nie ma `GET /v1/trainees/{id}`. Zanim cokolwiek napiszesz, sprawdź
w `types.gen.d.ts`, które widoki, po które trasa i tak sięga, niosą już nazwę
(`ConsultationView.trainee`, `PlanListItem.traineeName`, szczegół treningu, formularz startowy,
widok rozwoju). Tam, gdzie żaden nie niesie, dołóż w `trainees.ts` jedną funkcję
`findTraineeRef(api, traineeId)` opartą na sklejonych stronach listy — i **zgłoś to jako lukę**,
bo to obejście, nie rozwiązanie. Nie powielaj tego zapytania w każdej trasie osobno.

- [x] **S5 wykonane** (04.09.2026). `trainees.ts` 273→137 linii, `stats.ts` 812→78 (siedem funkcji zastąpiło JEDNO `loadTraineeOverview`), `wrapped.ts` 650→195 (cała arytmetyka miesiąca po stronie BE; w FE zostały polskie etykiety archetypów i czyste helpery). Trzynaście tras, trzy pliki testów (33 przypadki). Usunięte: `app/lib/storage/` w całości, `tests/trainees-repo.itest.ts`, `tests/statystyki-redystrybucja.itest.ts`. **Trzynaście osieroconych importów `db` usuniętych przez agenta od razu** — pułapka z §6 pkt 2a zadziałała jako reguła, nie jako dochodzenie po fakcie.

  Dwa świadome odstępstwa od briefu, oba wymuszone przez `tsc`: `podopieczni.$traineeId.platnosci.tsx` (importowała dwie funkcje, które brief kazał usunąć — zmienione trzy linie, warstwa Stripe nietknięta) oraz `app/components/trainee-health.tsx` (stoi na siedmiu typach ze `stats.ts`, które zmieniły nazwy wraz z kontraktem).

  **Luka L S3-2 zamknięta:** `DELETE /v1/trainees/{id}` zdejmuje odwzorowania kalendarza (ADR-0035), więc usunięcie podopiecznego znów sprząta jego terminy.

## Fala 3

### Segment S6 — sprzątanie

**Brief doprecyzowany 05.09.2026 przez koordynatora** — akapit z 03.09 opisywał zakres z grubsza
i w trzech miejscach się mylił. Poprawki niżej są zmierzone, nie wywnioskowane.

**Warunek wejścia — grep z akapitu pierwotnego go NIE sprawdza.** `~/lib/db` nie łapie importów
względnych, a tak właśnie sięgają po bazę oba moduły tożsamości (`auth/invite.ts`, `auth/users.ts`
biorą `../db/client`). Właściwe sprawdzenie:

```bash
grep -rn "lib/db\|\.\./db/\|drizzle-orm" app scripts tests --include=*.ts --include=*.tsx | grep -v "^app/lib/db/"
```

Stan na 05.09: 22 pliki — pięć Stripe'a i `payments.ts`, dwa tożsamości, osiem tras, `scripts/seed.ts`,
siedem `tests/*.itest.ts`, plus **cztery pliki biorące ze schematu wyłącznie typ** (trzy komponenty
zdjęć i `feature-request-types.test.ts`). Ani jednego trafienia w kalendarzu — LK1 zamknięta.

**Trzy rzeczy, których akapit pierwotny nie wiedział:**

1. **`money.ts` ZOSTAJE.** Warunek „jeśli bez wywołań" nie zachodzi: `POST /v1/invites` przyjmuje
   `monthlyAmountGrosze`, a formularz zaproszenia (`podopieczni._index.tsx`) go wysyła przez
   `parsePlnToGrosze`/`MonthlyAmountSchema`. Umiera z modułu wyłącznie `fmtMoney` — czytały go
   trzy kasowane trasy i nikt więcej.
2. **Naruszenie przyszłej bramki już w drzewie.** `zaproszenie.$token.tsx` woła
   `invitesControllerPreview` **wprost z SDK** (spadek po kroku 2 Etapu 2). Cztery inne trasy biorą
   z pakietu `import type` — to jest dozwolone i bramka ma to przepuszczać, dokładnie jak stara
   przepuszczała `import type` ze schematu.
3. **Do listy plików dochodzą:** `Dockerfile` (CMD to `db:migrate && db:seed && start`),
   `vitest.config.ts` (wpis `tests/**/*.itest.ts`), `app/lib/env.ts` (`DATABASE_URL`, cztery
   `STRIPE_*`, a także `SESSION_SECRET`, `FILE_SIGNING_SECRET` i `DATA_DIR` — po S4 i kroku 2
   nie mają ani jednego czytelnika) oraz `railway.toml`, który te zmienne dokumentuje.

**Kolejność — pięć grup, każda zostawia drzewo w stanie dającym się zbudować:**

**G1 — bramka szwu (pierwsza, bo jest testem, nie sprzątaniem).** Nowy `app/routes/no-direct-api.test.ts`:
trasa nie importuje `~/lib/api/client` ani **wartości** z `@kalisthenos/api-client` (`import type`
wolno). Bramka pada na `zaproszenie.$token.tsx` → podgląd zaproszenia przenosi się do
`auth/invite.ts` jako `previewInvite(api, token)` → bramka przechodzi. Stary `no-direct-db.test.ts`
zostaje nietknięty do G5: dopóki baza jest w drzewie, ma czego pilnować.

**G2 — płatności (D1).** Usunięcie: `app/lib/stripe/` w całości, `payments.ts`, pięć tras
(`podopieczny/aktywuj.tsx`, `podopieczny/platnosci.tsx`, `trener/podopieczni.$traineeId.platnosci.tsx`,
`trener/integracje.stripe.tsx`, `webhooks.stripe.tsx`) wraz z wpisami w `app/routes.ts`, trzy
`tests/stripe-*.itest.ts`, `fmtMoney` z `money.ts` i jego przypadki testowe, `STRIPE_*` wraz
z `stripeConfigured`/`stripeApiConfigured` z `env.ts`, `stripe` z `package.json`.
Odpięcie bramki `hasTraineeAppAccess` w `podopieczny/_layout.tsx` (razem z `redirect("/podopieczny/aktywuj")`),
`formularz.tsx` (dwa wywołania) i `upload.wideo.tsx`. **Odnośniki też są ubytkiem:** pozycja
„Płatności" w nawigacji podopiecznego (`_layout.tsx`) i przycisk płatności na ekranie podopiecznego
u trenera (`podopieczni.$traineeId.tsx`), skąd znika także wywołanie `cleanupSubscriptionForTrainee`.

**G3 — tożsamość.** `auth/invite.ts` schodzi do powierzchni kontraktowej (`createInvite`,
`previewInvite` z G1, `InviteError`, typy); znikają `hashToken`, `findInviteByToken`, `consumeInvite`.
`auth/users.ts` i `auth/password.ts` znikają w całości — **żadna z ich funkcji nie ma już
wywołującego** (`findDisplayName` czytały tylko dwie trasy kasowane w G2; `formularz.tsx` bierze
nazwę trenera z `MeDto.coach.displayName`). Do tego `auth/index.ts` (re-eksporty), `auth/invite.test.ts`
(przycięcie), `scripts/seed.ts`, `tests/auth-repo.itest.ts`, skrypt `db:seed` i `@node-rs/argon2`
z `package.json` — hasła liczy BE.

**G4 — baza.** Najpierw przetypowanie czterech plików, które biorą ze schematu sam typ: trzy
komponenty zdjęć na `BodyPhotoView` z `~/lib/body-photos` (moduł eksportuje go już z DTO kontraktu),
`feature-request-types.test.ts` z enumów Drizzle na unię z kontraktu. Dopiero potem usunięcie:
`app/lib/db/` (klient, schemat, dziewiętnaście migracji, README), `drizzle.config.ts`, trzy
pozostałe itesty, `vitest.config.ts` (wpis `tests/`), `tests/README.md` (przepisany na jedno zdanie
o Playwrighcie ze spec §10, nie skasowany — `playwright.config.ts` nadal celuje w `tests/e2e`),
`package.json` (`db:*`, `test:itest`, `drizzle-orm`, `drizzle-kit`, `postgres`,
`@testcontainers/postgresql`), `env.ts` (`DATABASE_URL`, `SESSION_SECRET`, `FILE_SIGNING_SECRET`,
`DATA_DIR`), `docker-compose.yml` (był wyłącznie Postgresem), `docker-entrypoint.sh` (chownował
wolumen pod `DATA_DIR`, którego nie ma), `Dockerfile` (CMD, kopie źródeł dla drizzle-kit i tsx,
punkt montowania) i `railway.toml` (lista zmiennych, wolumen, nota o `citext`).
**Edycja `package.json` bez `npm install`** — instalację robi Właściciel.

**G5 — stara bramka i dokumentacja.** `no-direct-db.test.ts` znika (pilnował importu ze schematu,
którego nie ma; jego rolę przejęła bramka z G1). Dalej: `CLAUDE.md`, `README.md`, `.env.example`,
`app/lib/README.md`, `app/lib/auth/README.md`, `app/routes/*/README.md`, `scripts/README.md`.

**Pułapka bez odwrotu, do powiedzenia Właścicielowi przed G4:** usunięcie `app/lib/db/schema.ts`
i migracji odbiera FE zdolność wygenerowania migracji dwudziestej — co jest celem — ale zostawia
jedyną kopię historii Drizzle w `calisthenos-be/docs/legacy-drizzle/`. Przed skasowaniem
porównać oba drzewa bajt po bajcie; różnica znaczy, że archiwum BE nie jest tym, za co się podaje.

**Testy:** S6 jest subtraktywny, więc nowych testów modułów nie ma — jedyny nowy plik to bramka
z G1. Testy odwołujące się do usuwanych rzeczy przycina ta sama grupa, która usuwa. Jeden przebieg
`npx vitest run app --no-file-parallelism` na końcu, u koordynatora; pełne bramki u Właściciela.

- [x] **S6 wykonane** (05.09.2026), pięć grup w kolejności z briefu. Bramka szwu `no-direct-api.test.ts` powstała pierwsza i **zapaliła się na czerwono na `zaproszenie.$token.tsx`**, które wołało `invitesControllerPreview` wprost z SDK — podgląd zaproszenia przeniesiony do `auth/invite.ts` jako `previewInvite` (`| null` na `404`, reguła D3). Płatności: pięć tras, `app/lib/stripe/`, `payments.ts`, cztery itesty, `fmtMoney`, `STRIPE_*` z `env.ts` i dwa odnośniki nawigacyjne. Tożsamość: `users.ts`, `password.ts`, drizzle'owa połowa `invite.ts`, `scripts/seed.ts`, `auth-repo.itest.ts` — **żadna z tych funkcji nie miała już wywołującego**. Baza: `app/lib/db/` (19 migracji, `meta/`), `drizzle.config.ts`, dwa ostatnie itesty, `docker-compose.yml`, `docker-entrypoint.sh`, siedem zależności z `package.json`, cztery zmienne z `env.ts`; przetypowane cztery pliki biorące ze schematu sam typ (trzy komponenty na `BodyPhotoView` z `~/lib/body-photos`, parzystość zgłoszeń z enumów Drizzle na unię kontraktu — dziś pilnuje jej `tsc`, nie runtime). Na koniec `no-direct-db.test.ts` i dokumentacja: `CLAUDE.md`, `README.md`, `.env.example`, `Dockerfile`, `railway.toml`, siedem README katalogów. Weryfikacja koordynatora: `npx vitest run app` — **57 plików, 632 testy, zielone**. Trzy rzeczy zostają Właścicielowi: `npm install` (siedem zależności mniej), pełne bramki i commit.

---

## 6. Integracja po fali (koordynator)

1. Przeczytać trzy raporty; sprawdzić sekcje „Pliki wspólne" pod kątem kolizji (ten sam wiersz
   dotknięty dwa razy).
2. `git diff --stat` (odczyt) — czy zmienione pliki mieszczą się w sumie list własności.
2a. **Osierocone importy `db` — bramka, której nie ma nigdzie indziej.** Trasa, z której zniknęło
   ostatnie użycie `db`, ale został import, przechodzi `tsc` bez słowa i **wywraca build**:
   `app/lib/db/client.ts` tworzy połączenie w zasięgu modułu, więc Rollup nie może go wyciąć
   mimo nieużywanej nazwy — sterownik postgres ląduje w bundlu przeglądarki i przewraca się na
   `perf_hooks`. Komunikat nie wskazuje winnej trasy. Sprawdzenie:
   ```bash
   for f in $(grep -rl 'from "~/lib/db/client"' app --include=*.ts --include=*.tsx | grep -v "\.test\."); do
     n=$(grep -v '^import' "$f" | grep -c 'db'); [ "$n" = "0" ] && echo "NIEUZYWANY: $f";
   done
   ```
   Dotyczy tak samo `stripe/client` i `storage/*` — każdego modułu serwerowego z efektem ubocznym.
   Zdarzyło się po fali 1 (`podopieczni._index.tsx`), a fale 2 i 3 zdejmują `db` z kilkunastu tras.
3. Na każdy segment **jeden** `npx vitest run app/lib/<moduł>.test.ts --no-file-parallelism`
   (plus testy czystych modułów, których typy zmieniono), sekwencyjnie; naprawy w tym samym
   przebiegu, bez powtórek „na wszelki wypadek".
4. `npx biome format --write <plik>` na dotkniętych plikach, pojedynczo.
5. Spójność `app/lib/README.md` (pierwszy akapit, tabela) i `app/routes/*/README.md`.
6. Uzupełnić §7 lukami z raportów; doprecyzować briefy fali 2.
7. **Checkpoint Właściciela:** `npm run typecheck`, `npm run lint`, `npm run build`, commit
   (per segment przez pathspec albo jeden na falę — decyzja Właściciela).

## 7. Luki

| Id | Co | Skąd | Propozycja |
|---|---|---|---|
| ~~**LK1**~~ **ZAMKNIĘTA** | ~~**„Połącz z Google" nie da się przepiąć na kontrakt przy FE wołającym BE serwer-do-serwera.** `POST /v1/calendar/connection/authorize` ustawia w odpowiedzi ciastko z nonce'em (`HttpOnly`, `SameSite=Lax`, host BE), a `GET …/callback` — trasa publiczna, na którą Google odsyła przeglądarkę — wpuszcza zgodę tylko, gdy skrót z tego ciastka zgadza się ze `state`. Ciastko z odpowiedzi na wywołanie serwer-do-serwera ląduje u serwera FE, nie w przeglądarce; przekazane dalej przez FE byłoby ciastkiem hosta FE, którego przeglądarka do hosta BE nie wyśle. W dev na `localhost` działałoby przypadkiem (ciastka ignorują port).~~ | plan, przed falą 1 (`calendar.controller.ts` BE, `authorize`/`callback`) | Zamknięta specem [`2026-09-04-zgoda-google-przez-dwa-hosty-design.md`](../specs/2026-09-04-zgoda-google-przez-dwa-hosty-design.md) i ADR-0036 po stronie BE (`docs/adr/0036-domena-ciastka-nonce-przy-dwoch-hostach.md` w `calisthenos-be`) — ciastko z nonce'em dostaje domenę nadrzędną z konfiguracji BE (`CALENDAR_COOKIE_DOMAIN`), więc przeglądarka wraca prosto na callback BE, a FE (`app/lib/calendar.ts`) przekazuje dalej tylko jeden nagłówek `Set-Cookie` z odpowiedzi rozpoczynającej zgodę (`authorize`) |
| **L S1-1** | **Sugestia awansu znika z ekranu umiejętności.** Oba endpointy mapy deklarują w docbloku „bez sugestii awansu", a DTO nie niesie ŻADNEGO z sygnałów, na których stała `suggestAdvancement`: liczby sesji na bieżącym wariancie, statusu progresji, „łatwiej przy tych samych powtórzeniach", stagnacji i ostatniego RPE. | S1, potwierdzone w `types.gen.d.ts` | dodatek po stronie BE: pięć pól przy pozycji mapy albo osobny blok `suggestion`. Do tego czasu ekran pokazuje poziom i historię bez podpowiedzi — moduł świadomie NIE składa jej z N wywołań progresji |
| **L S2-1** | **BE i FE nie zgadzają się co do adresu zaproszenia.** `POST /v1/invites` zwraca `url` zbudowany jako `{APP_PUBLIC_URL}/join/{token}`, a FE przyjmuje zaproszenia pod `/zaproszenie/:token`. Trasa składa więc odnośnik z samego `token`, ignorując `url` z kontraktu. | S2 | jedna z dwóch stron ustępuje: BE bierze wzorzec adresu z konfiguracji albo FE dokłada trasę `/join/:token`. Póki co odnośnik jest poprawny, ale pole kontraktu leży nieużywane — czyli obietnica bez pokrycia |
| **L S3-1** | **Historia terminów starsza niż rok przestaje być widoczna.** Kontrakt wymaga zakresu zamkniętego z obu stron (`from`/`to`), a dawna lista pary zakresu nie miała. Moduł przyjął okno `LIST_WINDOW_DAYS` = rok wstecz i rok w przód. | S3 | do decyzji: okno wystarczy, czy lista pary ma dostać stronicowanie po stronie BE. Dziś nikt nie zgłosił potrzeby — to ubytek widoczny, nie cichy |
| **L S5-1** | **Mapa aktywności zniknęła z przeglądu klienta.** `TraineeOverviewView` jej nie niesie, a `docs/03` („Klient — przegląd") mówi o niej wprost „jeszcze nie zbudowane". `TraineeHomeView.heatmap` jest widokiem WŁASNYM podopiecznego, nie trenera patrzącego na podopiecznego. | S5 | dodatek BE: `heatmap` w `TraineeOverviewView` — BE liczy ją już dla pulpitu podopiecznego. Kafelek zdjęty świadomie, BEZ składania z dziennika; komponent wraca jednym importem |
| **L S5-2** | **Nazwy podopiecznego nie da się wziąć jednym żądaniem.** Kontrakt nie ma `GET /v1/trainees/{id}`, a z jedenastu widoków, po które trasy trenera i tak sięgają, nazwę niesie **jeden** (szczegół terminu). Dziesięć tras płaci za nagłówek kompletem stron `GET /v1/trainees` — przy 90 podopiecznych trzy żądania na ekran. Ta sama luka zabrała datę dołączenia z podtytułu przeglądu. | S5, każdy ekran `/trener/podopieczni/:id/*` | dodatek BE: `GET /v1/trainees/{traineeId}` → `TraineeRef` + `joinedOn`, `404` dla cudzego. Obejście stoi w JEDNYM miejscu (`findTraineeRef`), więc zamiana nie ruszy ani jednej trasy |
| **L S5-3** | **`ActivePlanUsageView.totals` nie ma liczby sesji na planie.** FE sumuje `doneCount` z tej samej odpowiedzi — bez dodatkowego żądania, ale to inna wielkość: pomija log wskazujący na sesję spoza listy. | S5 | dodatek BE: `sessions` w `PlanTotals` albo `sessionsOnPlan` przy `ActivePlanUsageView` |
| **L S5-4** | **`path.ym` w `GET /v1/me/wrapped/{ym}` typowane jako `Array<string>`**, choć ścieżka ma jeden segment. Serializator (`styl simple`) zwija jednoelementową tablicę do gołego `2026-08`, więc wywołanie działa — ale kontrakt obiecuje kształt, którego trasa nie przyjmuje. | S5, każdy klient | artefakt generatora po stronie BE; opakowanie `[ym]` stoi w jednym miejscu, test pilnuje dzisiejszego zachowania |
| **L S4-1** | **Nazwa pobieranego zdjęcia traci rozszerzenie.** `BodyPhotoDto` nie niesie typu zawartości, a podgląd używał go tylko do nazwy pliku przy pobraniu — dziś każde zdjęcie proponuje się jako `.jpg`, także PNG i WebP. Zawartość jest poprawna, kłamie sama nazwa. | S4 | dodatek BE: `mimeType` przy `BodyPhotoDto` (BE go zna, oddaje w `UploadResultDto`) albo `Content-Disposition` przy pobraniu |
| **L S4-2** | **`BodyPhotoGalleryPage.pairs` jest obietnicą bez pokrycia.** Kontrakt ma gotowe pary „przed i po", ale niosą wyłącznie pary PEŁNE — nie znają ujęcia z jednym zdjęciem ani ujęcia pustego, a ekran rysuje oba, i nie mają `daysBetween`. FE liczy więc parowanie sam, a pole kontraktu leży nieużywane (bliźniak L S2-1). | S4 | albo `pairs` znika z kontraktu, albo dostaje ZAWSZE trzy pozycje (`view`, `before\|null`, `after\|null`, `daysBetween`) |
| **L S4-3** | **Ekran porównania kosztuje komplet stron.** Parowanie potrzebuje wszystkich zdjęć, a lista jest stronicowana po 60 bez parametru „wszystko": przy 600 zdjęciach to jedenaście żądań u podopiecznego. | S4 | rozwiązuje się razem z L S4-2: poprawione `pairs` w odpowiedzi listy dają jedno żądanie na ekran. Świadomie BEZ obejścia po stronie FE |
| **L S3-3** | **„Okres omówiony" znika z ekranu terminu.** Szczegół pokazywał zakres `periodFrom`–`periodTo`; kontrakt tych pól nie niesie. Po stronie BE kolumny są spadkiem po aplikacji fullstackowej, `docs/04` o nich milczy i nic do nich nie zapisuje — wystawienie wymaga rozstrzygnięcia, co znaczą. | S3, wykryte przez `tsc` po fali 1 | decyzja produktowa: albo pole wraca do kontraktu z jasnym znaczeniem, albo blok znika na stałe. Dziś zniknął z ekranu, komentarz w trasie mówi dlaczego |
| ~~**L S3-2**~~ **ZAMKNIĘTA w S5** | ~~Usunięcie podopiecznego nie zdejmuje jego terminów z kalendarza trenera.~~ `syncCancelAllForPair` zniknęło razem z `google/sync.ts`, a kasowanie stoi jeszcze na Drizzle (`deleteTraineeFully`). | S3, stan przejściowy | znika sam w S5: `DELETE /v1/trainees/{id}` kasuje przez granice kontekstów wraz z odwzorowaniami kalendarza (ADR-0035 po stronie BE) |
