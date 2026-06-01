# kalisthenos — Umiejętności: progresja przez warianty (design spec)

**Status:** Draft — do przeglądu właściciela
**Autor:** Mateusz Kozłowski (z Claude)
**Data:** 2026-06-01
**Powiązane:** [`2026-05-23-kalisthenos-fullstack-v1-design.md`](2026-05-23-kalisthenos-fullstack-v1-design.md) (§16: „Public exercise library", „Periodization templates" — pokrewne, poza zakresem tu)

---

## 0. Kontekst i decyzje wejściowe

Sesja innowacyjna (research + ideacja) ustaliła kierunek strategiczny i zakres
pierwszego speca. Decyzje, na których ten dokument stoi:

- **Ambicja:** budujemy **wyróżnik produktowy dla wielu trenerów kalisteniki**,
  nie tylko pod parę Adam↔Mateusz.
- **Wybrany kierunek #1:** model progresji przez warianty (drabiny umiejętności).
  Kierunki „przegląd techniki" i „pętla komunikacji" zostają na kolejne specy.
- **Model danych:** osobny byt „umiejętność" + uporządkowane warianty mapujące się
  na istniejące `exercises` (wariant A‑1 z brainstormu). Żadnych zmian w historii
  logów/planów.
- **Bramki awansu:** **bez konfigurowalnych progów.** Wariant niesie tylko poziom
  (`ordinal`).
- **Sugestia awansu:** **sygnałowa** (na bazie istniejących agregacji w `stats.ts`),
  **awans zawsze ręczny** (decyzja trenera, jedno kliknięcie).
- **Relacja z planem:** **rozprzęgnięta** — awans aktualizuje poziom i mapę, ale
  nie edytuje automatycznie aktywnego planu; sugestia/awans deep‑linkuje do edytora.
- **Widoczność:** podopieczny widzi **read‑only** swoją mapę umiejętności; awansować
  może wyłącznie trener.

### Dlaczego to jest wyróżnik

Generyczne platformy coachingowe (TrueCoach, Trainerize, Everfit) mają relację
trener↔podopieczny, ale model danych jest **wagowy** („ćwiczenie + ciężar ×
powtórzenia"). Apki kalisteniczne (The Movement Athlete, Caliverse, Simple
Calisthenics) mają **model progresji przez dźwignię** (tuck → advanced tuck →
straddle → full), ale są self‑serve algorytmami **bez trenera w pętli**. Nikt nie
jest jednocześnie jednym i drugim. W kalistenice **obciążeniem jest to, *który
wariant* się wykonuje** — i to jest dziś u nas niereprezentowane: każdy wariant to
osobne, niepowiązane `exercise`.

---

## 1. Cel i nie‑cele

### Cel
Wprowadzić **umiejętność** jako uporządkowaną drabinę wariantów, pokazać trenerowi
i podopiecznemu **gdzie podopieczny jest** na każdej drabinie, dać trenerowi
**ręczny awans/cofnięcie** z historią oraz **sygnałową sugestię** „rozważ awans"
opartą o dane, które już liczymy.

### Nie‑cele (świadome cięcia w tym specu)
- Konfigurowalne progi/bramki awansu (target sets/reps/sek/RPE per wariant).
- Drzewo prerekwizytów (DAG) między umiejętnościami (np. „muscle‑up wymaga 10
  podciągnięć + false grip").
- Mastery 0–100% (model ciągły zamiast dyskretnych poziomów).
- Auto‑podmiana pozycji aktywnego planu przy awansie.
- Wspólna/międzytrenerska biblioteka umiejętności (fork).
- Przegląd techniki z wideo i pętla komunikacji (osobne kierunki / specy).

Każde z powyższych ma ścieżkę rozwoju w §12 (Roadmapa).

---

## 2. Słownik

- **Umiejętność (skill)** — nazwana drabina, np. *Front Lever*. Należy do trenera.
- **Wariant (skill variation)** — jeden szczebel drabiny, np. *Front Lever — advanced
  tuck*. Mapuje się 1:1 na istniejące `exercise`. Niesie tylko `ordinal` (poziom).
- **Aktualny poziom** — wariant, na którym podopieczny jest teraz. Wyliczany z
  historii zdarzeń awansu (nie trzymany jako mutowalne pole).
- **Awans / cofnięcie** — zdarzenie zmiany poziomu zapisane przez trenera.
- **Sugestia** — miękki nudge („rozważ awans/cofnięcie") z sygnałów; nie zmienia stanu.

---

## 3. Model danych

Trzy nowe tabele, wszystkie tenant‑scope przez `trainer_id`. Schemat to źródło
prawdy (`app/lib/db/schema.ts`); migracja przez `npm run db:generate` — bez ręcznej
edycji `migrations/`.

### 3.1 `skills`
```
skills (
  id           uuid PK default gen_random_uuid(),
  trainer_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  archived_at  timestamptz NULL,         -- soft‑archive (jak exercises)
  created_at   timestamptz NOT NULL DEFAULT now()
)
INDEX ON skills (trainer_id) WHERE archived_at IS NULL;
UNIQUE (trainer_id, name);               -- nazwa unikalna w obrębie trenera
```

### 3.2 `skill_variations`
```
skill_variations (
  id           uuid PK default gen_random_uuid(),
  skill_id     uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  exercise_id  uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  ordinal      int  NOT NULL,            -- poziom na drabinie, 1 = najłatwiejszy
  created_at   timestamptz NOT NULL DEFAULT now()
)
UNIQUE (skill_id, ordinal);
UNIQUE (skill_id, exercise_id);
UNIQUE (exercise_id);   -- ćwiczenie należy do CO NAJWYŻEJ jednej umiejętności
```
**`UNIQUE (exercise_id)`** wymusza regułę „jedno ćwiczenie = jeden wariant"
(prostota; upraszcza mapę i sugestię). `ON DELETE RESTRICT` na `exercise_id`:
ćwiczenie będące wariantem nie znika spod nogi — trener najpierw usuwa je z
umiejętności. Reorder = aktualizacja `ordinal` w miejscu (id wariantu stabilne).

### 3.3 `skill_advancements`
```
skill_advancements (
  id                uuid PK default gen_random_uuid(),
  trainer_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- denormalizacja (tenant‑scope, jak workout_logs)
  trainee_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id          uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  from_variation_id uuid NULL REFERENCES skill_variations(id) ON DELETE RESTRICT,  -- NULL = ustawienie poziomu startowego
  to_variation_id   uuid NOT NULL REFERENCES skill_variations(id) ON DELETE RESTRICT,
  advanced_on       date NOT NULL,
  advanced_by       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,  -- zawsze trener
  note              text NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
)
INDEX ON skill_advancements (trainee_id, skill_id, advanced_on DESC, created_at DESC);
INDEX ON skill_advancements (trainer_id, created_at DESC);
```

**Dlaczego zdarzenia, nie mutowalne „current_level":**
- Aktualny poziom = najświeższe zdarzenie per `(trainee, skill)` (sort po
  `advanced_on`, tie‑break `created_at`). Wyliczenie to czysta funkcja → testowalne.
- Historia awansów jest darmowa i zasili kierunek D (auto‑szkice: „awansował z tuck
  na advanced tuck 12.05") oraz timeline postępu.
- „Przypisanie umiejętności do podopiecznego" = pierwszego zdarzenie z
  `from_variation_id = NULL`. **Nie ma osobnej tabeli przypisań.** Mapa podopiecznego
  pokazuje umiejętności, które mają ≥1 zdarzenie dla niego.

**Niezmienniki (walidacja w warstwie repo + testy):**
- `to_variation_id` i `from_variation_id` (gdy ≠ NULL) należą do `skill_id`.
- `skill_id.trainer_id == trainer_id == trainee.trainer_id` (spójność tenanta).
- Awans/cofnięcie: `to` ma inny `ordinal` niż aktualny poziom; cofnięcie to po prostu
  `to.ordinal < aktualny.ordinal` (ta sama tabela, brak osobnego typu zdarzenia).

---

## 4. Autoring umiejętności (trener)

Dedykowana sekcja **„Umiejętności"** (sibling „Biblioteki"), z linkiem z Biblioteki.

- **Lista** `/trener/umiejetnosci` — karty umiejętności (nazwa, liczba wariantów),
  reużywa `ListControls` (sort nazwa/najnowsze, szukajka). Pusty stan + „Nowa
  umiejętność".
- **Edytor** `/trener/umiejetnosci/nowa` i `/trener/umiejetnosci/$skillId`:
  - nazwa, opis,
  - lista wariantów: dodaj istniejące ćwiczenie (picker z biblioteki, **tylko
    ćwiczenia bez przypisania** — bo `UNIQUE(exercise_id)`), ułóż kolejność
    (strzałki ↑/↓ wystarczą; bez drag&drop w v1), usuń wariant,
  - archiwizuj umiejętność.
- Wariant = istniejące ćwiczenie → demo, jednostka (REPS/SEC), logowanie i
  statystyki działają bez zmian.

Walidacja: umiejętność z 0 wariantów jest dozwolona jako szkic, ale nie da się
przypisać podopiecznemu (brak poziomu startowego). Ostrzeżenie w UI.

---

## 5. Mapa umiejętności + aktualny poziom

### 5.1 Trener — per podopieczny
`/trener/podopieczni/$traineeId/umiejetnosci` (sibling istniejącej `…/progresja`).

Dla każdej umiejętności trenera:
- jeśli **przypisana** (≥1 zdarzenie): drabina z zaznaczonym bieżącym poziomem
  (`tuck → advanced tuck [TU JESTEŚ] → single‑leg → straddle → full`), data
  ostatniego awansu, mini‑sparkline z bieżącego wariantu (reużycie `Sparkline`),
  **sugestia** (§7) jeśli jest, akcje **Awansuj / Cofnij o poziom**;
- jeśli **nieprzypisana**: akcja **„Ustaw poziom startowy"** (wybór wariantu).

### 5.2 Podopieczny — read‑only
`/podopieczny/umiejetnosci`. Te same drabiny i „TU JESTEŚ", bez akcji i bez
sugestii dla trenera. Motywujące, w duchu „Wrapped". (Czy pokazać podopiecznemu
nudge „blisko awansu" — **nie w tym specu**; potencjalnie demotywujące/mylące.)

---

## 6. Awans — zawsze ręczny + historia

Akcja trenera (POST na trasie mapy):
- **Ustaw poziom startowy** → zdarzenie `from = NULL, to = wybrany wariant`.
- **Awansuj** → `from = aktualny, to = wariant o `ordinal` wyżej` (domyślnie
  następny; opcjonalnie wybór konkretnego wariantu, gdy trener chce przeskok).
- **Cofnij o poziom** → `to.ordinal < aktualny.ordinal`.
- Opcjonalna `advanced_on` (domyślnie dziś) i `note`.

Historia widoczna na mapie (rozwijalna oś czasu zdarzeń per umiejętność). Nic nie
dzieje się automatycznie; brak edycji planu (§8).

---

## 7. Sugestia sygnałowa (bez progów)

Czysta funkcja `suggestAdvancement(signals): "advance" | "regress" | null`,
testowalna bez DB. **Wejście to sygnały, które już liczymy** dla bieżącego
wariantu (jego `exercise_id`):

- `status` z `statusFromSessions` / `getExerciseProgress` (`"up" | "flat" | "down" | "new"`),
- flaga „łatwiej przy tych samych powtórzeniach" z `getEasierAtSameReps`
  (RPE spadło przy tych samych powtórzeniach),
- flaga plateau z `getPlateauExercises` (utknięcie przy wysokim RPE),
- liczba sesji na bieżącym wariancie (guard, **stała implementacyjna ≥ 4**, nie pole
  trenera).

Reguły (heurystyka, brak konfigurowalnych progów):
- **`advance`** gdy: sesji ≥ 4 **i** (`status === "up"` **lub** „łatwiej przy tych
  samych powtórzeniach") **i** brak plateau **i** istnieje wyższy wariant.
- **`regress`** gdy: sesji ≥ 4 **i** `status === "down"` **i** ostatnie średnie
  RPE wysokie (utknięcie/zmaganie) **i** istnieje niższy wariant.
- **`null`** w pozostałych przypadkach.

To jest podpowiedź; trener decyduje (§6). Guard ≥ 4 i progi „wysokiego RPE"
zaszyte w kodzie i pokryte testami, **nie** wystawione trenerowi.

---

## 8. Relacja z planem treningowym

**Rozprzęgnięta.** Awans aktualizuje poziom + mapę, **nie** mutuje aktywnego planu
(plany są wersjonowane z regułą „jeden aktywny / jeden draft"; auto‑mutacja byłaby
ryzykowna). Z mapy (sugestia/awans) prowadzi **deep‑link do edytora planu**, gdzie
trener normalnie podmienia pozycję na ćwiczenie nowego wariantu. Auto‑podmiana
pozycji planu — roadmapa (§12).

---

## 9. Trasy, URL‑e i nawigacja

Każdą trasę dopisać do `app/routes.ts` (konwencja `segment.$param.tsx`).

| URL | Plik | Rola |
|---|---|---|
| `/trener/umiejetnosci` | `trener/umiejetnosci._index.tsx` | lista umiejętności |
| `/trener/umiejetnosci/nowa` | `trener/umiejetnosci.nowa.tsx` | tworzenie |
| `/trener/umiejetnosci/$skillId` | `trener/umiejetnosci.$skillId.tsx` | edytor wariantów |
| `/trener/podopieczni/$traineeId/umiejetnosci` | `trener/podopieczni.$traineeId.umiejetnosci.tsx` | mapa + awans (akcje) |
| `/podopieczny/umiejetnosci` | `podopieczny/umiejetnosci.tsx` | mapa read‑only |

Nawigacja: pozycja „Umiejętności" w menu trenera (obok „Biblioteka"/„Plany") i w
menu podopiecznego; zakładka „Umiejętności" w widoku podopiecznego u trenera (obok
„Progresja"/„Sylwetka"/„Konsultacje").

---

## 10. Autoryzacja i tenant‑scope

Zgodnie z `app/lib/authz.ts` i konwencją repo:
- Każda funkcja repo przyjmuje wymagany `trainerId` (i `traineeId` gdzie dotyczy)
  i filtruje po nim.
- Brak uprawnień → **404** (nie 403), by nie zdradzać istnienia zasobu.
- Trener: pełny dostęp do swoich umiejętności/wariantów/awansów i awansowania
  swoich podopiecznych. Trener A nie widzi/nie awansuje danych trenera B.
- Podopieczny: **read‑only** własna mapa; brak dostępu do autoringu i akcji awansu;
  brak dostępu do danych innych podopiecznych.
- `advanced_by` zawsze = zalogowany trener.

---

## 11. Warstwa kodu (gdzie co mieszka)

- `app/lib/db/schema.ts` — 3 nowe tabele + typy `$inferSelect/$inferInsert`.
- `app/lib/skills.ts` — repo umiejętności/wariantów: list/get, `createSkill`,
  `updateSkill`, `addVariation`, `removeVariation`, `reorderVariations`,
  `archiveSkill`, `SkillError`. Tenant‑scope przez `trainerId`.
- `app/lib/skill-progression.ts` — repo przypisań/awansów: `getSkillMapForTrainee`
  (umiejętności + aktualny poziom + historia), `recordAdvancement`,
  `setStartingLevel`, guard tenanta (→ null → 404).
- `app/lib/skill-progression-math.ts` — **czysta logika bez DB**:
  `currentLevelFromEvents(events)`, `suggestAdvancement(signals)`, walidacja
  niezmienników awansu. Test‑first.
- `app/lib/skill-types.ts` — schematy Zod formularzy (umiejętność, wariant, awans).
- Sygnały do sugestii: reużycie istniejących funkcji z `app/lib/stats.ts`
  (`getExerciseProgress`/`getEasierAtSameReps`/`getPlateauExercises`) lub
  `app/lib/progression.ts` (`statusFromSessions`). Bez duplikowania agregacji.

---

## 12. Testy (TDD)

**Unit (test‑first, Vitest, bez DB)** — `*.test.ts`:
- `currentLevelFromEvents`: pusty zbiór, jedno zdarzenie startowe, awans, cofnięcie,
  tie‑break po `created_at` przy tej samej dacie.
- `suggestAdvancement`: każda gałąź (`advance`/`regress`/`null`), guard < 4 sesji,
  brak wyższego/niższego wariantu, plateau blokujące awans.
- Niezmienniki awansu (wariant należy do skill, spójność tenanta, `to ≠ aktualny`).
- Schematy Zod formularzy (poprawne/niepoprawne wejścia, reorder).

**Integracyjne (`*.itest.ts`, testcontainers — uruchamia właściciel)**:
- Tenant‑scope: trener A nie widzi/nie awansuje umiejętności ani podopiecznego
  trenera B (→ 404) przez bezpośredni URL.
- Pełny cykl: utwórz umiejętność → dodaj/uporządkuj warianty → ustaw poziom
  startowy → awansuj → cofnij → historia poprawna; aktualny poziom = ostatnie
  zdarzenie.
- `UNIQUE(exercise_id)`: nie da się dodać tego samego ćwiczenia do dwóch
  umiejętności.
- `ON DELETE RESTRICT`: nie da się usunąć wariantu/ćwiczenia, do którego odnosi się
  awans.
- Read‑only podopiecznego: brak akcji awansu (404/forbidden na POST).

Bramki „done": `npm test` + `npm run typecheck` + `npm run lint` + `npm run build`,
`/code-review` per task, oraz `/security-review` (dotyka tenant‑scope/autoryzacji).

---

## 13. Migracja danych i seed

- Migracja schematu: `npm run db:generate` (nowy plik w `migrations/`).
- Brak migracji istniejących danych — logi/plany/ćwiczenia bez zmian.
- Seed (opcjonalnie, dla dogfoodingu): jedna przykładowa umiejętność *Front Lever*
  z wariantami zmapowanymi na istniejące ćwiczenia trenera, jeśli istnieją.
  Idempotentnie, w `scripts/seed.ts`. Nie blokujące dla speca.

---

## 14. Dokumentacja do aktualizacji (część „done")

Zgodnie z zasadą utrzymania dokumentacji w `CLAUDE.md`:
- `app/lib/README.md` — dopisać `skills.ts`, `skill-progression.ts`,
  `skill-progression-math.ts`, `skill-types.ts`.
- `app/routes/README.md`, `app/routes/trener/README.md`,
  `app/routes/podopieczny/README.md` — dopisać nowe trasy.
- `app/lib/db/README.md` — wzmianka o nowych tabelach (schemat = źródło prawdy).
- `CLAUDE.md` — jeśli dochodzi nowy katalog/sekcja nawigacji „Umiejętności".

---

## 15. Roadmapa (świadomie odłożone)

- **Bramki konfigurowalne** — trener definiuje próg per wariant (sets/reps/sek/RPE);
  sugestia odpala po jego spełnieniu.
- **Auto‑podmiana pozycji planu** przy awansie (tworzenie draftu nowej wersji).
- **Drzewo prerekwizytów (DAG)** + odblokowywanie umiejętności.
- **Mastery 0–100%** zamiast/obok dyskretnych poziomów.
- **Wspólna biblioteka umiejętności** (fork między trenerami) — łączy się z
  „Public exercise library" z §16 spec V1.
- **Nudge dla podopiecznego** „blisko awansu" (po walidacji, że motywuje a nie myli).
- Zasilenie kierunku **D** (auto‑szkice): historia awansów w podsumowaniach.

---

## 16. Ryzyka i otwarte kwestie

| Ryzyko | Mitygacja |
|---|---|
| `UNIQUE(exercise_id)` okaże się zbyt sztywne (to samo ćwiczenie w 2 drabinach) | Świadome uproszczenie v1; zdjęcie ograniczenia to tylko migracja, bez utraty danych. Walidujemy na realnym użyciu. |
| Sygnały sugestii bywają mylące przy małej liczbie sesji | Guard ≥ 4 sesje; sugestia jest miękka i niezobowiązująca; awans i tak ręczny. |
| Rozprzęgnięcie od planu = trener musi pamiętać o podmianie ćwiczenia | Deep‑link do edytora przy awansie; auto‑podmiana w roadmapie. |
| Reorder wariantów po awansach miesza „poziom" | `ordinal` mutowalny, id wariantu stabilne; historia trzyma referencję wariantu (RESTRICT), więc znaczenie zdarzeń się nie zmienia. |
| Kolizja nazewnicza „Progresja" vs „Umiejętności" | Świadomie rozdzielone: „Progresja" = szereg czasowy, „Umiejętności" = drabiny wariantów. |

---

## 17. Kryteria akceptacji

1. Trener tworzy umiejętność, dodaje istniejące ćwiczenia jako warianty i ustala ich
   kolejność; nie może dodać ćwiczenia już przypisanego do innej umiejętności.
2. Trener ustawia poziom startowy podopiecznego, awansuje go i cofa; historia
   zdarzeń jest poprawna, a „aktualny poziom" = ostatnie zdarzenie.
3. Mapa trenera pokazuje dla każdej umiejętności drabinę z „TU JESTEŚ", datę
   ostatniego awansu i — gdy sygnały spełnione — sugestię „rozważ awans/cofnięcie".
4. Sugestia jest wyłącznie informacyjna; żaden awans nie dzieje się automatycznie i
   żadna pozycja planu nie zmienia się automatycznie.
5. Podopieczny widzi swoją mapę read‑only i nie może wywołać żadnej akcji awansu.
6. Trener A nie ma dostępu (404) do umiejętności ani awansów trenera B przez
   bezpośredni URL — potwierdzone testem integracyjnym.
7. Bramki „done" zielone: `npm test`, `npm run typecheck`, `npm run lint`,
   `npm run build`, `/code-review`, `/security-review`.
