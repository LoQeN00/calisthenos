# Przełącznik RPE (trudności) per ćwiczenie — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trener może per ćwiczenie wyłączyć zbieranie oceny trudności (RPE 1–10) przy logowaniu; ćwiczenia bez RPE nie pytają o trudność, a metryki zależne od RPE je pomijają.

**Architecture:** Nowa kolumna `exercises.tracks_rpe` (domyślnie `true`) steruje warstwą zapisu (UI biblioteki + logowanie + walidacja). `workout_set_logs.difficulty` staje się nullowalne; brak RPE = `NULL`. Warstwa odczytu (statystyki/progresja/wrapped) reprezentuje `avgRpe` jako `number | null` — SQL `AVG` z natury pomija `NULL`, więc „brak RPE” wypada z agregatów; UI chowa panele RPE gdy `null`. Dane historyczne pozostają nietknięte.

**Tech Stack:** React Router v7 (loadery/akcje), Drizzle ORM + PostgreSQL 16, Zod, Vitest (unit), testcontainers (`*.itest.ts`), Biome.

**Spec:** [`docs/superpowers/specs/2026-05-31-toggle-rpe-cwiczenia-design.md`](../specs/2026-05-31-toggle-rpe-cwiczenia-design.md)

**Reguły-fundamenty (z `kalisthenos-dev-flow`):** nigdy git; nigdy docker/`db:migrate`/itesty; npm; UI po polsku; aktualizuj README katalogu; review per task. `npm run db:generate` jest dozwolone (generuje pliki migracji, nie dotyka bazy).

**Konwencja avgRpe (używana w wielu taskach):**
- W SQL: `sql<number | null>\`AVG(${schema.workoutSetLogs.difficulty})::float\`` (BEZ `COALESCE(...,0)`).
- W JS: `avgRpe: r.avgRpe == null ? null : Number(r.avgRpe)`.
- `null` ⇔ w agregacie nie ma ani jednej ocenionej serii.

---

## Task 1: Schemat — flaga `tracks_rpe` + nullowalne `difficulty`

**Files:**
- Modify: `app/lib/db/schema.ts:134-153` (tabela `exercises`)
- Modify: `app/lib/db/schema.ts:321-340` (tabela `workoutSetLogs`)
- Generated: `app/lib/db/migrations/*.sql` (+ `meta/*`) przez `npm run db:generate`
- Modify: `app/lib/db/migrations/README.md` (dopisz nową migrację, jeśli README listuje pliki) i `app/lib/db/README.md` (jeśli opisuje kolumny)

- [ ] **Step 1: Dodaj kolumnę `tracksRpe` do `exercises`**

W `app/lib/db/schema.ts`, w definicji `exercises`, po polu `tags` (linia ~144) dodaj:

```ts
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    tracksRpe: boolean("tracks_rpe").notNull().default(true),
```

`boolean` jest już importowany (linia 8).

- [ ] **Step 2: Zmień `difficulty` na nullowalne i rozluźnij CHECK**

W definicji `workoutSetLogs` zamień pole `difficulty` (linia ~330) — usuń `.notNull()`:

```ts
    difficulty: integer("difficulty"),
```

oraz CHECK (linie ~335-338):

```ts
    difficultyCheck: check(
      "workout_set_logs_difficulty_check",
      sql`${t.difficulty} IS NULL OR ${t.difficulty} BETWEEN 1 AND 10`,
    ),
```

Typ `WorkoutSetLog.difficulty` (z `$inferSelect`) sam stanie się `number | null` — nie zmieniaj sekcji `// Types`.

- [ ] **Step 3: Wygeneruj migrację**

Run: `npm run db:generate`
Expected: powstaje nowy plik `app/lib/db/migrations/NNNN_*.sql` zawierający `ALTER TABLE "exercises" ADD COLUMN "tracks_rpe" boolean NOT NULL DEFAULT true;`, `ALTER TABLE "workout_set_logs" ALTER COLUMN "difficulty" DROP NOT NULL;` oraz drop+add constraintu `workout_set_logs_difficulty_check`. Polecenie kończy się bez błędu.

- [ ] **Step 4: Zajrzyj do wygenerowanego SQL i potwierdź**

Otwórz najnowszy plik w `app/lib/db/migrations/` i zweryfikuj, że zawiera trzy zmiany z kroku 3 i nic poza nimi. NIE edytuj go ręcznie. Jeśli czegoś brakuje — popraw `schema.ts` i ponownie `npm run db:generate`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (kolumna i typy spójne).

- [ ] **Step 6: Zaktualizuj README migracji/db**

Jeśli `app/lib/db/migrations/README.md` wymienia pliki migracji — dopisz nową. Jeśli `app/lib/db/README.md` opisuje kolumny `exercises`/`workout_set_logs` — dopisz `tracks_rpe` i nullowalność `difficulty`.

- [ ] **Step 7: Handoff-note (do końcowego handoffu, nie commit)**

Zanotuj: „Owner: `npm run db:migrate` po wdrożeniu (nowa migracja)”.

---

## Task 2: `progression-math` — `avgRpe: number | null` (TDD)

**Files:**
- Modify: `app/lib/progression-math.ts`
- Test: `app/lib/progression-math.test.ts`

- [ ] **Step 1: Napisz failujące testy dla null-RPE**

W `app/lib/progression-math.test.ts` zmień helper `sp` tak, by przyjmował `avgRpe: number | null` (sygnatura już to obejmie po zmianie typu), i dodaj nowy blok testów (wklej przed ostatnim `});` pliku):

```ts
describe("aggregateToWeeks z nullowalnym RPE", () => {
  it("uśrednia tylko nie-null RPE w obrębie tygodnia", () => {
    const out = aggregateToWeeks([
      sp("2026-05-25", 5, 5, 8, 15),
      sp("2026-05-27", 7, 6, null, 18),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.avgRpe).toBe(8); // null pominięte
  });
  it("daje avgRpe=null gdy wszystkie punkty tygodnia bez RPE", () => {
    const out = aggregateToWeeks([
      sp("2026-05-25", 5, 5, null, 15),
      sp("2026-05-27", 7, 6, null, 18),
    ]);
    expect(out[0]!.avgRpe).toBeNull();
  });
});

describe("markPrs z nullowalnym RPE", () => {
  it("przepuszcza avgRpe=null bez zmiany isPr", () => {
    const out = markPrs([sp("2026-01-01", 5, 5, null), sp("2026-01-08", 7, 7, 6)]);
    expect(out[0]!.avgRpe).toBeNull();
    expect(out[1]!.avgRpe).toBe(6);
    expect(out.map((p) => p.isPr)).toEqual([true, true]);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować (typ + zachowanie)**

Run: `npm test -- progression-math`
Expected: FAIL (TypeScript: `null` nie pasuje do `avgRpe: number`, oraz asercje `toBeNull`).

- [ ] **Step 3: Zmień typy i logikę**

W `app/lib/progression-math.ts`:

`SessionPoint.avgRpe` (linia ~9) i `ChartPoint.avgRpe` (linia ~18) → `number | null`:

```ts
  avgRpe: number | null;   // mean difficulty 1–10; null gdy żadna seria nie ma oceny
```

Dodaj helper po `mean` (po linii ~28):

```ts
/** Mean over non-null values; null when every value is null (no rated sets). */
function meanRpe(xs: Array<number | null>): number | null {
  const present = xs.filter((x): x is number => x != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}
```

W `aggregateToWeeks` (linia ~73) zamień `avgRpe`:

```ts
      avgRpe: ((): number | null => {
        const m = meanRpe(ps.map((p) => p.avgRpe));
        return m === null ? null : round1(m);
      })(),
```

W `markPrs` (linia ~88) zamień `avgRpe`:

```ts
      avgRpe: p.avgRpe === null ? null : round1(p.avgRpe),
```

`statusFromSessions`/`classifyStatus`/`computePeriodChangePct` używają tylko `avgReps`/`best` — bez zmian.

- [ ] **Step 4: Uruchom testy — zielone**

Run: `npm test -- progression-math`
Expected: PASS (wszystkie, w tym istniejące — `avgRpe=7` w starych przypadkach nadal działa).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Review tasku** (`/code-review` na diffie).

---

## Task 3: `workouts.ts` — warstwa zapisu (flaga + nullowalny difficulty)

**Files:**
- Modify: `app/lib/workouts.ts`

- [ ] **Step 1: `LoggingEntry` niesie `tracksRpe`**

W interfejsie `LoggingEntry` (linia ~14) dodaj pole:

```ts
  /** Whether this exercise collects an RPE/difficulty rating per set. */
  tracksRpe: boolean;
```

- [ ] **Step 2: `loadSessionForLogging` dołącza `tracksRpe`**

W `loadSessionForLogging`, w selekcie itemów (linia ~254) dodaj kolumnę:

```ts
    .select({
      item: schema.planItems,
      exerciseName: schema.exercises.name,
      exerciseUnit: schema.exercises.unit,
      exerciseTracksRpe: schema.exercises.tracksRpe,
    })
```

i w budowaniu `entries` (linia ~277) dodaj `tracksRpe`:

```ts
      entries.push({
        planItemId: it.item.id,
        exerciseId: it.item.exerciseId,
        exerciseName: it.exerciseName,
        unit: it.item.unit,
        expectedSets: isDropset ? (block.sets ?? 1) : (it.item.sets ?? 1),
        expectedReps: it.item.reps,
        note: it.item.note,
        isDropsetItem: isDropset,
        tracksRpe: it.exerciseTracksRpe,
      });
```

- [ ] **Step 3: `SaveSetInput.difficulty` nullowalne**

W `SaveSetInput` (linia ~593) zmień typ:

```ts
  reps: number;
  difficulty: number | null;
  videoFileId: string | null;
```

`saveWorkoutLog` wstawia `difficulty: s.difficulty` bez zmian — `null` przejdzie poprawnie po Task 1.

- [ ] **Step 4: `WorkoutLogListItem.avgDifficulty` nullowalne + brak COALESCE**

W `WorkoutLogListItem` (linia ~305) zmień:

```ts
  avgDifficulty: number | null;
```

W `statsForLogs` (linia ~319) zmień select i mapowanie:

```ts
      avgDifficulty: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
```

```ts
        avgDifficulty: r.avgDifficulty == null ? null : Math.round(Number(r.avgDifficulty) * 10) / 10,
```

a w `Omit<...>` mapie typ pochodny zadziała sam. W `listLogsForTrainee` (linia ~367) zmień fallback:

```ts
    avgDifficulty: stats.get(r.id)?.avgDifficulty ?? null,
```

- [ ] **Step 5: `WorkoutLogDetail` — set `difficulty` nullowalne**

Typ `sets` w `WorkoutLogDetail` używa `schema.WorkoutSetLog` (`log: schema.WorkoutSetLog`), który po Task 1 ma `difficulty: number | null`. Nic nie trzeba zmieniać w `workouts.ts`; konsumenci (Task 7) obsłużą null.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: błędy w konsumentach `avgDifficulty`/`difficulty` (UI) — to oczekiwane, naprawimy w Task 6/7. Błędy WYŁĄCZNIE w plikach UI listy/detalu, nie w `workouts.ts`.

- [ ] **Step 7: Review tasku** (`/code-review`).

> Uwaga: równolegle rozwijany plan `2026-05-31-listy-sortowanie-filtrowanie.md` też modyfikuje `listLogsForTrainee`/`statsForLogs`. Pracuj na bieżącym stanie pliku; jeśli sygnatury się rozjadą, zachowaj `avgDifficulty: number | null` jako kontrakt.

---

## Task 4: Logowanie — UI bez RPE dla ćwiczeń `tracksRpe = false`

> **UI/UX:** Ta zmiana dotyka warstwy wizualnej — prowadź ją skillem `frontend-design:frontend-design`, trzymając design-system i polskie UI.

**Files:**
- Modify: `app/routes/podopieczny/loguj.$sessionId.tsx`

- [ ] **Step 1: Akcja — nie wymagaj trudności gdy ćwiczenie bez RPE**

W `action`, w pętli po seriach (linia ~87), zamień blok walidacji tak, by zależał od `entry.tracksRpe`. Zastąp fragment od `const hasReps = ...` do `sets.push(...)` (linie ~91-137):

```ts
        const hasReps = repsRaw != null && repsRaw !== "";
        const hasDiff = diffRaw != null && diffRaw !== "";
        const hasVideo = videoBlob instanceof File && videoBlob.size > 0;

        const tracksRpe = entry.tracksRpe;

        // Pusty wiersz: dla ćwiczeń z RPE „pusty” = brak reps/diff/wideo;
        // dla ćwiczeń bez RPE „pusty” = brak reps/wideo (trudności i tak nie ma).
        const isBlank = tracksRpe ? !hasReps && !hasDiff && !hasVideo : !hasReps && !hasVideo;
        if (isBlank) {
          allSetsFilled = false;
          continue;
        }

        // Wiersz częściowy: reps są zawsze wymagane; trudność tylko gdy tracksRpe.
        if (!hasReps || (tracksRpe && !hasDiff)) {
          return {
            error: tracksRpe
              ? `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: uzupełnij liczbę powtórzeń i trudność (1-10).`
              : `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: uzupełnij liczbę powtórzeń.`,
          };
        }

        const reps = Number(repsRaw);
        if (!Number.isFinite(reps) || reps < 1 || reps > 1000) {
          return {
            error: `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: liczba powtórzeń poza zakresem (1-1000).`,
          };
        }

        let difficulty: number | null = null;
        if (tracksRpe) {
          difficulty = Number(diffRaw);
          if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10) {
            return {
              error: `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: trudność musi być 1-10.`,
            };
          }
        }

        let videoFileId: string | null = null;
        if (hasVideo) {
          const uploaded = await uploadFile(
            db,
            {
              file: videoBlob as File,
              kind: "set_video",
              trainerId: user.trainerId,
              uploadedBy: user.id,
            },
            cleanup,
          );
          videoFileId = uploaded.id;
        }

        sets.push({ ordinal: sIdx, reps, difficulty, videoFileId });
        anySetLogged = true;
```

Pole `difficulty` w `exercisesPayload`/`sets` typach (linie ~67-86) zmień `difficulty: number` → `difficulty: number | null`.

- [ ] **Step 2: Przekaż `tracksRpe` do `EntryCard` → `SetRow`**

`entries` z loadera już niosą `tracksRpe` (Task 3). W `EntryCard` (linia ~480) i `SetRow` (linia ~595) dodaj `tracksRpe` z `entry`. W `EntryCard` przekaż do `SetRow`:

```tsx
            <SetRow
              key={sIdx}
              eIdx={eIdx}
              sIdx={sIdx}
              unit={entry.unit}
              expectedReps={entry.expectedReps}
              tracksRpe={entry.tracksRpe}
              set={set}
              onChange={(patch) => onUpdateSet(sIdx, patch)}
              onSkip={() => onSkipSet(sIdx)}
            />
```

- [ ] **Step 3: `SetRow` — ukryj radio trudności gdy `!tracksRpe`**

W `SetRow` dodaj prop `tracksRpe: boolean`. „Wypełnienie” serii bez RPE = same reps. Zmień `onDifficultyChange` zostaje tylko dla tracksRpe. Owiń blok „Trudność 1–10” (linie ~691-712) warunkiem oraz dodaj fallback gdy bez RPE: po wpisaniu reps nie trzeba nic więcej. Zamień końcówkę komponentu:

```tsx
      {tracksRpe ? (
        <div>
          <div className="uppercase-label" style={{ fontSize: 10, marginBottom: 4 }}>
            Trudność 1–10
          </div>
          <div className="diff-radio">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
              <div key={v}>
                <input
                  id={`${diffName}-${v}`}
                  name={diffName}
                  type="radio"
                  value={v}
                  checked={set.difficulty === String(v)}
                  onChange={() => onDifficultyChange(String(v))}
                />
                <label htmlFor={`${diffName}-${v}`} data-tier={tierFor(v)}>
                  {v}
                </label>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-xs muted" style={{ fontStyle: "italic" }}>
          To ćwiczenie nie zbiera oceny trudności.
        </div>
      )}
```

- [ ] **Step 4: Progres „wypełnione” liczy serie bez RPE po samych reps**

W `stats` (useMemo, linia ~261) zmień warunek „filled” tak, by uwzględniał ćwiczenia bez RPE. Potrzebny dostęp do `tracksRpe` per entry — `setStates` jest indeksowane jak `entries`. Zmień pętlę:

```ts
  const stats = useMemo(() => {
    let total = 0;
    let filled = 0;
    let skipped = 0;
    setStates.forEach((sets, eIdx) => {
      const tracksRpe = entries[eIdx]?.tracksRpe ?? true;
      for (const s of sets) {
        total++;
        if (s.skipped) skipped++;
        else if (s.reps.trim() !== "" && (!tracksRpe || s.difficulty !== "")) filled++;
      }
    });
    return { total, filled, skipped };
  }, [setStates, entries]);
```

- [ ] **Step 5: „Wypełnij jak #1” — kopiuj reps zawsze, trudność tylko gdy jest**

`copyFromFirst` (linia ~240) już kopiuje `difficulty: s.difficulty || first.difficulty` — dla bez-RPE `difficulty` zostaje `""`, więc działa poprawnie. Zmiana nie wymagana; potwierdź lekturą.

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS dla `loguj.$sessionId.tsx`.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Review tasku** (`/code-review`).

---

## Task 5: Biblioteka — checkbox „Zbieraj RPE” w formularzach ćwiczeń

> **UI/UX:** prowadź skillem `frontend-design:frontend-design`.

**Files:**
- Modify: `app/routes/trener/biblioteka.nowe.tsx`
- Modify: `app/routes/trener/biblioteka.$exerciseId.tsx`
- Modify: `app/routes/trener/README.md` (opis formularzy — dopisz pole „RPE toggle”)

- [ ] **Step 1: `biblioteka.nowe.tsx` — Zod + zapis flagi**

Rozszerz `ExerciseSchema` (linia ~19):

```ts
const ExerciseSchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
  unit: z.enum(["REPS", "SEC"]),
  description: z.string().max(2000).default(""),
  tracksRpe: z.boolean(),
});
```

W `action` parsuj checkbox (po `fd.get("description")`, linia ~34):

```ts
  const parsed = ExerciseSchema.safeParse({
    name: fd.get("name"),
    unit: fd.get("unit"),
    description: fd.get("description") ?? "",
    tracksRpe: fd.get("tracksRpe") === "on",
  });
```

W `tx.insert(schema.exercises).values({...})` (linia ~69) dodaj `tracksRpe: parsed.data.tracksRpe`.

- [ ] **Step 2: `biblioteka.nowe.tsx` — kontrolka**

Po polu „Opis” / przed `CategoryPicker` (linia ~144) dodaj checkbox (domyślnie zaznaczony):

```tsx
        <label className="field" style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <input type="checkbox" name="tracksRpe" defaultChecked style={{ marginTop: 3 }} />
          <span>
            <span style={{ display: "block", fontWeight: 500 }}>
              Zbieraj ocenę trudności (RPE 1–10) przy logowaniu
            </span>
            <span className="text-xs muted">
              Wyłącz dla ćwiczeń, w których ocena wysiłku nie ma sensu — podopieczny nie zobaczy
              wtedy skali trudności.
            </span>
          </span>
        </label>
```

(Dopasuj klasy/markup do design-systemu — skill `frontend-design`.)

- [ ] **Step 3: `biblioteka.$exerciseId.tsx` — Zod + zapis + kontrolka**

`EditSchema` (linia ~29) dodaj `tracksRpe: z.boolean()`. W `action` przy `safeParse` (linia ~97) dodaj `tracksRpe: fd.get("tracksRpe") === "on"`. W `tx.update(schema.exercises).set({...})` (linia ~138) dodaj `tracksRpe: parsed.data.tracksRpe`. W formularzu (po polu „Opis”, przed `CategoryPicker`, linia ~252) dodaj ten sam checkbox co w kroku 2, ale `defaultChecked={exercise.tracksRpe}`.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: README + review**

Dopisz w `app/routes/trener/README.md` do wierszy `biblioteka.nowe.tsx` i `biblioteka.$exerciseId.tsx`, że formularz zawiera przełącznik zbierania RPE. `/code-review`.

---

## Task 6: UI list logów — `avgDifficulty: number | null` → „—”

> **UI/UX:** `frontend-design:frontend-design`.

**Files:**
- Modify: `app/routes/podopieczny/historia._index.tsx:68`
- Modify: `app/routes/podopieczny/_index.tsx:388`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx:319,330` (+ `DifficultyBadge`)

- [ ] **Step 1: `historia._index.tsx`**

W miejscu renderu (linia ~68) zabezpiecz null:

```tsx
                  {log.avgDifficulty == null ? "—" : <><span className="mono">{log.avgDifficulty}</span>/10</>}
```

- [ ] **Step 2: `podopieczny/_index.tsx`**

Analogicznie linia ~388:

```tsx
                      {log.avgDifficulty == null ? "—" : <><span className="mono">{log.avgDifficulty}</span>/10</>}
```

- [ ] **Step 3: `trener/podopieczni.$traineeId.tsx`**

Linia ~319 — jak wyżej. Znajdź komponent `DifficultyBadge` (linia ~330 i jego definicja w tym pliku) i obsłuż `avg: number | null`: gdy `null`, renderuj neutralny badge z „—” zamiast koloru wg progu. Przykład (dopasuj do istniejącej definicji):

```tsx
function DifficultyBadge({ avg }: { avg: number | null }) {
  if (avg == null) {
    return <span className="badge" style={{ color: "var(--muted)" }}>—</span>;
  }
  // ...istniejąca logika kolorów wg progów...
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS (błędy `avgDifficulty` z Task 3 zniknęły).
Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Review** (`/code-review`).

---

## Task 7: UI detalu logu + wykres reps-vs-RPE — obsługa `difficulty === null`

> **UI/UX:** `frontend-design:frontend-design`.

**Files:**
- Modify: `app/routes/podopieczny/historia.$logId.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.log.$logId.tsx`
- Modify: `app/components/progression-charts.tsx`

- [ ] **Step 1: `historia.$logId.tsx` — nagłówek „śr. trudność” gdy brak ocen**

`allDiff` (linia ~42) filtruj null i licz tylko po ocenach:

```tsx
  const allDiff = exercises.flatMap((e) => e.sets.map((s) => s.log.difficulty)).filter((d): d is number => d != null);
  const avgDiff =
    allDiff.length === 0 ? null : Math.round((allDiff.reduce((a, b) => a + b, 0) / allDiff.length) * 10) / 10;
```

W subnagłówku (linia ~83) zamień blok „śr. trudność”:

```tsx
            {avgDiff != null && (
              <>
                {" · śr. trudność "}
                <strong style={{ color: "var(--ink)" }} className="mono">
                  {avgDiff}/10
                </strong>
              </>
            )}
```

- [ ] **Step 2: `historia.$logId.tsx` — typ i render serii**

W `ExWithSigned` (linia ~145) zmień `difficulty: number` → `difficulty: number | null`. `SetRowDisplay` (linia ~279) prop `difficulty: number | null`; render:

```tsx
  const tone =
    difficulty == null
      ? "var(--muted)"
      : difficulty <= 4
        ? "var(--ok)"
        : difficulty <= 7
          ? "var(--warn)"
          : "var(--danger)";
```

i pigułka (linia ~322):

```tsx
      <span className="mono" style={{ fontSize: 12, color: tone, fontWeight: 600, background: "var(--surface-2)", padding: "2px 8px", borderRadius: 999 }}>
        {difficulty == null ? "—" : `${difficulty}/10`}
      </span>
```

- [ ] **Step 3: `trener/...log.$logId.tsx` — nagłówek, średnie i wiersze**

`allDiff`/`avgDiff` (linie ~57-61) — jak w kroku 1 (filtruj null; `avgDiff: number | null`). W subnagłówku (linia ~120) owiń „śr. trudność” warunkiem `avgDiff != null`.

`tone` (linia ~40) przyjmij `number | null`:

```tsx
function tone(diff: number | null): string {
  if (diff == null) return "var(--muted)";
  if (diff <= 4) return "var(--ok)";
  if (diff <= 7) return "var(--warn)";
  return "var(--danger)";
}
```

Per-ćwiczenie `exAvgDiff` (linia ~175) licz po ocenach:

```tsx
          const diffs = ex.sets.map((s) => s.log.difficulty).filter((d): d is number => d != null);
          const exAvgDiff = diffs.length === 0 ? null : diffs.reduce((a, b) => a + b, 0) / diffs.length;
```

W bloku „Trudność” nagłówka ćwiczenia (linia ~261) render:

```tsx
                      {exAvgDiff == null ? "—" : `${exAvgDiff.toFixed(1)}/10`}
```

W wierszu serii — kolumna „Trudn.” (linia ~362) i pasek „Wizualnie” (linie ~364-379): gdy `logged.log.difficulty == null`, pokaż „—” w kolumnie i pusty (szary) pasek:

```tsx
                        <span className="mono" style={{ color: tone(logged.log.difficulty), fontWeight: 600 }}>
                          {logged.log.difficulty == null ? "—" : `${logged.log.difficulty}/10`}
                        </span>
                        <div style={{ display: "flex", gap: 2 }}>
                          {Array.from({ length: 10 }, (_, n) => `cell-${n}`).map((cellKey, n) => (
                            <div
                              key={cellKey}
                              style={{
                                flex: 1,
                                height: 6,
                                borderRadius: 2,
                                background:
                                  logged.log.difficulty != null && n < logged.log.difficulty
                                    ? tone(logged.log.difficulty)
                                    : "var(--surface-2)",
                              }}
                            />
                          ))}
                        </div>
```

- [ ] **Step 4: `progression-charts.tsx` — `avgRpe: number | null`**

`rpeColor` (linia ~23) przyjmij `number | null`:

```tsx
function rpeColor(avgRpe: number | null): string {
  if (avgRpe == null) return "var(--muted)";
  if (avgRpe < 7) return "var(--ok)";
  if (avgRpe < 9) return "var(--warn)";
  return "var(--danger)";
}
```

W `ProgressionLineChart` `<title>` (linia ~142):

```tsx
                {p.label}: {fmtBest(p.best, unit)} · RPE {p.avgRpe ?? "—"}
```

W `RepsVsEffortChart`: gdy żaden punkt nie ma RPE — pokaż pusty stan; linię RPE rysuj tylko po punktach z RPE. Zamień początek funkcji (po `if (points.length < 2) return <NotEnough />;`, linia ~242):

```tsx
  const rpePoints = points
    .map((p, i) => ({ i, avgRpe: p.avgRpe }))
    .filter((x): x is { i: number; avgRpe: number } => x.avgRpe != null);
  const hasRpe = rpePoints.length >= 2;
```

i zbuduj `rpePath` z `rpePoints` (zamiast wszystkich punktów):

```tsx
  const rpePath = hasRpe
    ? rpePoints
        .map((x, k) => `${k === 0 ? "M" : "L"}${xAt(x.i).toFixed(1)},${rpeY(x.avgRpe).toFixed(1)}`)
        .join(" ")
    : "";
```

oraz w JSX rysuj `<path d={rpePath} .../>` i legendę „wysiłek (RPE)” tylko gdy `hasRpe`.

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Review** (`/code-review`).

---

## Task 8: `progression.ts` — `avgRpe` nullowalne + ukrycie KPI/wykresu RPE

> **UI/UX (trasa detalu):** `frontend-design:frontend-design`.

**Files:**
- Modify: `app/lib/progression.ts`
- Modify: `app/routes/podopieczny/progresja.$exerciseId.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx`

- [ ] **Step 1: `loadProgressionSessions` — avgRpe null**

W `RawSession` (linia ~23) `avgRpe` jest z `SessionPoint` (już `number | null` po Task 2). W selekcie (linia ~54) zmień:

```ts
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
```

W mapowaniu (linia ~91) zmień:

```ts
      avgRpe: r.avgRpe == null ? null : Number(r.avgRpe),
```

- [ ] **Step 2: `getExerciseProgression` — avgRpeInRange po ocenach**

`ProgressionKpis.avgRpeInRange` jest już `number | null`. Zmień obliczenie (linia ~217):

```ts
  const ratedInRange = inRange.map((p) => p.avgRpe).filter((x): x is number => x != null);
  const avgRpeInRange =
    ratedInRange.length === 0
      ? null
      : Math.round((ratedInRange.reduce((a, b) => a + b, 0) / ratedInRange.length) * 10) / 10;
```

- [ ] **Step 3: Trasa podopiecznego — ukryj wykres reps-vs-RPE gdy brak RPE**

W `app/routes/podopieczny/progresja.$exerciseId.tsx`: KPI „śr. RPE” (linia ~141) już renderuje `kpis.avgRpeInRange ?? "—"` — zostaw. Kartę „Siła = lżej” (linie ~171-174) owiń warunkiem:

```tsx
        {kpis.avgRpeInRange != null && (
          <div className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 16, marginBottom: 12 }}>Siła = lżej</h2>
            <RepsVsEffortChart points={points} />
          </div>
        )}
```

- [ ] **Step 4: Trasa trenera — analogiczne ukrycie**

W `app/routes/trener/podopieczni.$traineeId.progresja.$exerciseId.tsx` znajdź sekcję renderującą `RepsVsEffortChart` / KPI „śr. RPE” (ten widok korzysta z `getExerciseProgression`) i zastosuj ten sam warunek `kpis.avgRpeInRange != null` wokół wykresu reps-vs-RPE; KPI „śr. RPE” pokaż jako „—” gdy null.

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Review** (`/code-review`).

---

## Task 9: `stats.ts` — agregaty RPE pomijają brak ocen

**Files:**
- Modify: `app/lib/stats.ts`

- [ ] **Step 1: `loadPerExerciseHistory` — avgRpe null**

`PerExerciseRow.avgRpe` (linia ~510) → `number | null`. Select (linia ~526):

```ts
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
```

Mapowanie (linia ~561):

```ts
      avgRpe: r.avgRpe == null ? null : Number(r.avgRpe),
```

- [ ] **Step 2: `getExerciseProgress` — recent/prior avg RPE po ocenach**

`avg(...)` (linia ~24) liczy po `number[]`. Dla `recentRpe`/`priorRpe` (linie ~597-598) filtruj null:

```ts
    const ratedRecent = recent.map((r) => r.avgRpe).filter((x): x is number => x != null);
    const ratedPrior = prior.map((r) => r.avgRpe).filter((x): x is number => x != null);
    const recentRpe = avg(ratedRecent);
    const priorRpe = avg(ratedPrior);
```

(`ExerciseProgress.recentAvgRpe/priorAvgRpe` zostają `number` — `avg([])===0`; status liczony z reps, więc 0-RPE nic nie psuje.)

- [ ] **Step 3: `getPlateauExercises` — pomiń grupy bez RPE**

Plateau wymaga sygnału RPE. W pętli (linia ~658) po wyznaczeniu `window` dodaj:

```ts
    const newestRpeRaw = window[0]!.avgRpe;
    const oldestRpeRaw = window[window.length - 1]!.avgRpe;
    if (newestRpeRaw == null || oldestRpeRaw == null) continue; // brak RPE → brak sygnału plateau
    const newestRpe = newestRpeRaw;
    const oldestRpe = oldestRpeRaw;
```

i usuń wcześniejsze przypisania `newestRpe`/`oldestRpe` (linie ~670-671), zostawiając `rpeNonFalling` bez zmian.

- [ ] **Step 4: `getEasierAtSameReps` — wymagaj RPE**

W pętli (linia ~765) pomiń gdy brak RPE w `recent`:

```ts
    const recent = group[0]!;
    if (recent.avgRpe == null) continue;
```

i w porównaniu (linia ~778) pomiń gdy `prev.avgRpe == null`:

```ts
      if (prev.avgRpe == null) continue;
      if (prev.avgRpe - recent.avgRpe < 1) continue;
```

`recentRpe`/`priorRpe` w wyniku — `recent.avgRpe`/`best.avgRpe` są tu już nie-null (po `continue`). `round1` na nich zadziała.

- [ ] **Step 5: `getEffortBalance` — pomiń sesje bez RPE**

Select `avgRpe` (linia ~816):

```ts
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
```

W pętli klasyfikacji (linia ~842):

```ts
  for (const s of sessions) {
    if (s.avgRpe == null) continue; // sesja bez żadnej oceny RPE nie wchodzi do bilansu wysiłku
    const rpe = Number(s.avgRpe);
    if (rpe < 5) easy++;
    else if (rpe < 8) mid++;
    else hard++;
  }
  const total = easy + mid + hard;
```

(Zmiana `total` z `sessions.length` na `easy+mid+hard`, by „no-data” i procenty były liczone po sesjach z RPE.)

- [ ] **Step 6: `getHealthStats` — RPE/redZone po ocenach**

`recentAvgRpe`/`historicalAvgRpe` używają `COALESCE(AVG, 0)`. Zmień oba selecty (linie ~354, ~367) na `AVG(...)::float` bez COALESCE i typ `number | null`; w JS:

```ts
    recentAvgRpe = r?.avg == null ? 0 : round1(Number(r.avg));
```

```ts
  const historicalAvgRpe = histRpeRow?.avg == null ? 0 : round1(Number(histRpeRow.avg));
```

(Zachowujemy `0` jako „brak danych” dla trendu — dziś tak działa; brak ocen → trend `flat`.) `redZonePct`: licznik `difficulty >= 9` i mianownik `COUNT(*)` — zmień mianownik tak, by liczył tylko serie z oceną:

```ts
      total: sql<number>`COUNT(${schema.workoutSetLogs.difficulty})::int`,
```

(`COUNT(kolumna)` pomija NULL → odsetek „czerwonych” liczony po ocenionych seriach.)

- [ ] **Step 7: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 8: Review** (`/code-review`).

---

## Task 10: `wrapped.ts` — RPE po ocenionych seriach

**Files:**
- Modify: `app/lib/wrapped.ts`

- [ ] **Step 1: `MonthCore.avgRpe` nullowalne + redZone po ocenach**

`MonthCore` (linia ~201): `avgRpe: number | null`; dodaj `ratedSets: number`. W `loadMonthCore` select (linie ~224-225):

```ts
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
      red: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSetLogs.difficulty} >= 9 THEN 1 ELSE 0 END), 0)::int`,
      ratedSets: sql<number>`COUNT(${schema.workoutSetLogs.difficulty})::int`,
```

Zwrot (linia ~250):

```ts
    avgRpe: row?.avgRpe == null ? null : Math.round(Number(row.avgRpe) * 10) / 10,
    redZoneSets: Number(row?.red ?? 0),
    ratedSets: Number(row?.ratedSets ?? 0),
```

- [ ] **Step 2: Archetyp „maximalist” po ocenionych seriach**

`ArchetypeInputs.core` ma teraz `ratedSets`. W `pickArchetype` (linia ~520) zmień próg maksymalisty na mianownik z ocen:

```ts
  if (i.core.ratedSets > 0 && i.core.redZoneSets / i.core.ratedSets > 0.4) {
```

- [ ] **Step 3: `HeaviestDay.avgRpe` nullowalne**

`HeaviestDay.avgRpe` (linia ~155) → `number | null`. W `loadHeaviestDay` select (linia ~416):

```ts
      avgRpe: sql<number | null>`AVG(${schema.workoutSetLogs.difficulty})::float`,
```

Zwrot (linia ~445):

```ts
    avgRpe: r.avgRpe == null ? null : Math.round(Number(r.avgRpe) * 10) / 10,
```

- [ ] **Step 4: `VsPrevious` — RPE nullowalne**

`VsPrevious.avgRpeThis/avgRpePrev` (linie ~174-175) → `number | null`; `rpeDelta` zostaje `number | null`. W `getMonthlyWrapped` (linia ~626):

```ts
  const rpeDelta =
    core.avgRpe == null || prevCore.avgRpe == null
      ? null
      : Math.round((core.avgRpe - prevCore.avgRpe) * 10) / 10;
```

i przypisz `avgRpeThis: core.avgRpe, avgRpePrev: prevCore.avgRpe` (linie ~636-637).

- [ ] **Step 5: Konsument UI Wrapped — obsłuż null RPE**

Otwórz `app/routes/podopieczny/wrapped.$ym.tsx`, znajdź miejsca renderujące `heaviestDay.avgRpe`, `vsPrevious.avgRpeThis/Prev/rpeDelta` i pokaż „—” / ukryj sekcję RPE gdy `null`. (Konkretne miejsca zależą od obecnego renderu — dopasuj minimalnie, zgodnie z `frontend-design`.)

- [ ] **Step 6: Typecheck + build**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Review** (`/code-review`).

---

## Task 11: Testy integracyjne (PISZ — uruchamia właściciel)

**Files:**
- Create: `tests/rpe-toggle.itest.ts`

- [ ] **Step 1: Napisz itest oparty o wzorzec `tests/progression-tenant-scope.itest.ts`**

Stwórz `tests/rpe-toggle.itest.ts`. Skopiuj bootstrap (container, migrate, users, plan) z `progression-tenant-scope.itest.ts`. Zaseeduj trenera+podopiecznego, dwa ćwiczenia: jedno `tracksRpe: true`, jedno `tracksRpe: false`. Test 1: `saveWorkoutLog` z serią ćwiczenia bez RPE (`difficulty: null`) zapisuje wiersz z `difficulty IS NULL` (zapytaj bazę). Test 2: sesja mieszana (jedno z RPE `difficulty: 8`, jedno bez `null`) → `listLogsForTrainee` zwraca `avgDifficulty === 8` (NULL pominięte przez AVG). Test 3: `getEffortBalance`/`getExerciseProgression` dla ćwiczenia tylko-bez-RPE → `avgRpe`/`avgRpeInRange === null`, brak wyjątku. Wzór asercji bazowej:

```ts
  it("ćwiczenie bez RPE zapisuje difficulty = NULL", async () => {
    const logId = await saveWorkoutLog(db, {
      trainerId, traineeId, planId, planSessionId, sessionName: "Sesja",
      performedOn: "2026-02-01", note: null, allDone: true,
      exercises: [{ exerciseId: noRpeExerciseId, sets: [{ ordinal: 0, reps: 10, difficulty: null, videoFileId: null }] }],
    });
    const rows = await db
      .select({ difficulty: schema.workoutSetLogs.difficulty })
      .from(schema.workoutSetLogs)
      .innerJoin(schema.workoutExerciseLogs, eq(schema.workoutExerciseLogs.id, schema.workoutSetLogs.workoutExerciseLogId))
      .where(eq(schema.workoutExerciseLogs.workoutLogId, logId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.difficulty).toBeNull();
  });
```

(Importy: `saveWorkoutLog`, `listLogsForTrainee` z `~/lib/workouts`; `getEffortBalance` z `~/lib/stats`; `getExerciseProgression` z `~/lib/progression`; `eq` z `drizzle-orm`.)

- [ ] **Step 2: NIE uruchamiaj** (testcontainers/Docker — właściciel). Oznacz w handoffie: `npm run test:integration` (lub właściwa komenda z `package.json`).

- [ ] **Step 3: README testów**

Dopisz `rpe-toggle.itest.ts` do `tests/README.md`.

- [ ] **Step 4: Review** (`/code-review`).

---

## Bramki końcowe (FEATURE — z dowodem)

- [ ] `npm test` (jednostkowe) — zielone.
- [ ] `npm run typecheck` — zielone.
- [ ] `npm run lint` — zielone (`npm run format` jeśli trzeba).
- [ ] `npm run build` — zielone.
- [ ] Dokumentacja zaktualizowana: `app/routes/trener/README.md`, `app/lib/db/README.md` (jeśli dotyczy), `tests/README.md`, ewentualnie migrations README.
- [ ] `/code-review` na całości diffu.
- [ ] `/security-review` — zmiana dotyka `trainer_id`/tenant-scope (biblioteka, logowanie) i zapisu logu → **wymagany**.
- [ ] Testy integracyjne: zaraportuj i poproś właściciela o uruchomienie pod Dockerem.

## Handoff (granica gita)

- Podsumowanie + lista zmienionych plików.
- Proponowany komunikat commita.
- Notatki: **`npm run db:generate` wykonane** (nowa migracja w `app/lib/db/migrations/`); **owner: `npm run db:migrate`** po wdrożeniu. Brak nowych env, brak zmian seeda.
- Testy do odpalenia pod Dockerem: `*.itest.ts` (komenda z `package.json`).
- Ścieżka ręcznej weryfikacji: trener tworzy/edytuje ćwiczenie z odznaczonym „Zbieraj RPE” → podopieczny loguje sesję z tym ćwiczeniem (brak skali trudności) → szczegóły logu pokazują „—” zamiast trudności; statystyki/progresja nie pokazują paneli RPE dla tego ćwiczenia.

---

## Self-review (autora planu)

**Pokrycie spec:**
- Schemat (`tracks_rpe` + nullowalny `difficulty` + CHECK) → Task 1. ✓
- Warstwa zapisu (LoggingEntry, loadSessionForLogging, SaveSetInput, UI logowania) → Task 3, 4. ✓
- Reguła odczytu `avgRpe: number | null` (progression-math, progression, stats, wrapped) → Task 2, 8, 9, 10. ✓
- Effort balance / plateau / easier pomijają brak RPE → Task 9. ✓
- Ukrycie KPI „śr. RPE” i wykresu reps-vs-RPE → Task 7 (komponent), Task 8 (trasy). ✓
- Dane historyczne (keep & show) → nic nie kasujemy; null tylko dla nowych serii; detal logu renderuje istniejące oceny → Task 7. ✓
- UI biblioteki (checkbox) → Task 5. ✓
- Listy logów „—” → Task 6. ✓
- Testy: unit (progression-math) → Task 2; itest → Task 11. ✓

**Placeholder scan:** brak „TBD/TODO”. Dwa miejsca celowo „dopasuj wg obecnego renderu” (Task 8 Step 4 — trasa trenera progresji; Task 10 Step 5 — `wrapped.$ym.tsx`) — bo dokładny markup zależy od bieżącego pliku; warunek logiczny (`avgRpeInRange != null` / `avgRpe == null` → „—”) jest podany jednoznacznie.

**Spójność typów:** `tracksRpe: boolean` (schema, LoggingEntry, formularze); `difficulty: number | null` (schema, SaveSetInput, UI detalu); `avgRpe: number | null` (SessionPoint, ChartPoint, PerExerciseRow, RawSession, MonthCore.avgRpe, HeaviestDay.avgRpe, VsPrevious.avgRpe*); `avgDifficulty: number | null` (WorkoutLogListItem). Helper `meanRpe` zdefiniowany w Task 2. Spójne.
