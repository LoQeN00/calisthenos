# Umiejętności: progresja przez warianty — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wprowadzić „umiejętność" jako uporządkowaną drabinę wariantów (mapujących się na istniejące `exercises`), pokazać trenerowi i podopiecznemu, gdzie podopieczny jest na każdej drabinie, dać trenerowi ręczny awans/cofnięcie z historią oraz sygnałową sugestię „rozważ awans".

**Architecture:** Trzy nowe tabele tenant-scope (`skills`, `skill_variations`, `skill_advancements`). Aktualny poziom wyliczany z historii zdarzeń (czysta funkcja). Sugestia awansu to czysta funkcja na sygnałach już liczonych w `app/lib/stats.ts`/`progression.ts`. Awans rozprzęgnięty od planu (deep-link do edytora). Logika domenowa w `app/lib/*`, trasy w `app/routes/*` wołają repo w loaderach/akcjach (brak osobnego API).

**Tech Stack:** React Router v7 (framework mode, SSR), TypeScript strict, Drizzle ORM + Postgres 16, Zod, Vitest (unit) + testcontainers (`*.itest.ts`, owner-run), Biome.

**Spec:** [`docs/superpowers/specs/2026-06-01-umiejetnosci-progresja-wariantow-design.md`](../specs/2026-06-01-umiejetnosci-progresja-wariantow-design.md)

---

## ⚠️ Granice procesu (czytaj zanim zaczniesz)

- **Claude nie dotyka gita ani Dockera.** Tam gdzie szablon mówi „commit" — to **checkpoint**: po przejściu bramek właściciel commituje. Nie uruchamiaj `git ...` ani `docker compose ...`.
- **`npm run db:generate`** (drizzle-kit, codegen migracji z `schema.ts`) — **Claude może** uruchomić; nie wymaga DB.
- **`npm run db:migrate`** i **testy integracyjne `*.itest.ts`** (testcontainers / Docker) — **uruchamia właściciel**. Pisz pliki `*.itest.ts`, ale ich nie odpalaj.
- **Review per task:** po każdym zadaniu `/code-review`; `/security-review` po zadaniach dotykających tenant-scope/autoryzacji (Task 1, 4, 5, 7, 8).
- **Warstwa wizualna:** route'y w tym planie dostarczają działający, zgodny z istniejącymi wzorcami UI. Po zazielenieniu logiki **polish wizualny prowadź skillem `frontend-design:frontend-design`** zgodnie z `design-system/README.md`; do iteracji `npm run shots`. UI po polsku, marka `calisthenos` małą literą.
- **Bramki „done" całości:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` zielone; `/code-review`; `/security-review`; właściciel: `npm run db:migrate` + `*.itest.ts`.

---

## Struktura plików

**Nowe (logika domenowa):**
- `app/lib/skill-progression-math.ts` — czyste funkcje: `currentLevelFromEvents`, `suggestAdvancement` (+ stałe). Bez DB.
- `app/lib/skill-progression-math.test.ts` — testy jednostkowe powyższych.
- `app/lib/skill-types.ts` — schematy Zod formularzy (`SkillFormSchema`, `AdvancementFormSchema`, `ReorderFormSchema`).
- `app/lib/skill-types.test.ts` — testy schematów.
- `app/lib/skills.ts` — repo umiejętności/wariantów (CRUD + reorder + archiwizacja).
- `app/lib/skill-progression.ts` — repo mapy/awansów (`getSkillMapForTrainee`, `setStartingLevel`, `recordAdvancement`).

**Nowe (trasy):**
- `app/routes/trener/umiejetnosci._index.tsx` — lista umiejętności trenera.
- `app/routes/trener/umiejetnosci.nowa.tsx` — tworzenie umiejętności.
- `app/routes/trener/umiejetnosci.$skillId.tsx` — edytor wariantów.
- `app/routes/trener/podopieczni.$traineeId.umiejetnosci.tsx` — mapa + akcje awansu.
- `app/routes/podopieczny/umiejetnosci.tsx` — mapa read-only.

**Nowe (testy integracyjne, owner-run):**
- `tests/skills.itest.ts` lub w istniejącym katalogu `tests/` zgodnie z konwencją repo.

**Modyfikowane:**
- `app/lib/db/schema.ts` — 3 nowe tabele + typy.
- `app/routes.ts` — rejestracja 5 tras.
- `app/routes/trener/_layout.tsx` — pozycja nav „Umiejętności".
- `app/routes/podopieczny/_layout.tsx` — pozycja nav „Umiejętności".
- `app/routes/trener/podopieczni.$traineeId.tsx` — przycisk „Umiejętności" w pasku akcji.
- READMEs: `app/lib/README.md`, `app/routes/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `app/lib/db/README.md`; w razie potrzeby `CLAUDE.md`.

---

## Task 1: Schemat bazy — `skills`, `skill_variations`, `skill_advancements`

**Files:**
- Modify: `app/lib/db/schema.ts` (dopisać na końcu sekcji tabel, przed `// ---------------- Types ----------------`, oraz typy w sekcji Types)
- Generate: `app/lib/db/migrations/*` (przez `npm run db:generate`)

- [ ] **Step 1: Dodać tabele do `schema.ts`**

Wkleić przed sekcją `// ---------------- Types ----------------`:

```ts
// ---------------- Skills (drabiny wariantów) ----------------

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    trainerNameUniq: uniqueIndex("skills_trainer_name_uniq").on(t.trainerId, t.name),
    trainerIdx: index("skills_trainer_idx").on(t.trainerId),
  }),
);

export const skillVariations = pgTable(
  "skill_variations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    ordinal: integer("ordinal").notNull(), // 1 = najłatwiejszy szczebel
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    skillOrdinalUniq: uniqueIndex("skill_variations_skill_ordinal_uniq").on(t.skillId, t.ordinal),
    skillExerciseUniq: uniqueIndex("skill_variations_skill_exercise_uniq").on(
      t.skillId,
      t.exerciseId,
    ),
    // Jedno ćwiczenie należy do co najwyżej jednej umiejętności (cały zbiór trenera).
    exerciseUniq: uniqueIndex("skill_variations_exercise_uniq").on(t.exerciseId),
  }),
);

export const skillAdvancements = pgTable(
  "skill_advancements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Denormalizacja dla zapytań tenant-scope (jak workout_logs).
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    // NULL = ustawienie poziomu startowego.
    fromVariationId: uuid("from_variation_id").references(() => skillVariations.id, {
      onDelete: "restrict",
    }),
    toVariationId: uuid("to_variation_id")
      .notNull()
      .references(() => skillVariations.id, { onDelete: "restrict" }),
    advancedOn: date("advanced_on").notNull(),
    advancedBy: uuid("advanced_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traineeSkillIdx: index("skill_advancements_trainee_skill_idx").on(
      t.traineeId,
      t.skillId,
      t.advancedOn,
    ),
    trainerIdx: index("skill_advancements_trainer_idx").on(t.trainerId, t.createdAt),
  }),
);
```

- [ ] **Step 2: Dodać typy w sekcji Types**

Dopisać na końcu pliku, w bloku eksportów typów:

```ts
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type SkillVariation = typeof skillVariations.$inferSelect;
export type NewSkillVariation = typeof skillVariations.$inferInsert;
export type SkillAdvancement = typeof skillAdvancements.$inferSelect;
export type NewSkillAdvancement = typeof skillAdvancements.$inferInsert;
```

- [ ] **Step 3: Wygenerować migrację**

Run: `npm run db:generate`
Expected: nowy plik SQL w `app/lib/db/migrations/` tworzący 3 tabele + indeksy; snapshot w `migrations/meta/` zaktualizowany. **Nie edytuj** wygenerowanego SQL ręcznie.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (0 błędów).

- [ ] **Step 5: Checkpoint** — `/code-review` + `/security-review` (nowy model tenant-scope). Właściciel commituje. Właściciel uruchomi `npm run db:migrate` przed testami integracyjnymi.

---

## Task 2: Czysta logika — `skill-progression-math.ts` (TDD)

**Files:**
- Create: `app/lib/skill-progression-math.ts`
- Test: `app/lib/skill-progression-math.test.ts`

- [ ] **Step 1: Napisać failing test**

`app/lib/skill-progression-math.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  currentLevelFromEvents,
  suggestAdvancement,
  type AdvancementEvent,
  type AdvanceSignals,
} from "./skill-progression-math";

const ev = (
  toVariationId: string,
  toOrdinal: number,
  advancedOn: string,
  createdAt: number,
): AdvancementEvent => ({ toVariationId, toOrdinal, advancedOn, createdAt });

describe("currentLevelFromEvents", () => {
  it("returns null when there are no events", () => {
    expect(currentLevelFromEvents([])).toBeNull();
  });
  it("returns the only event", () => {
    expect(currentLevelFromEvents([ev("v1", 1, "2026-05-01", 1000)])).toEqual({
      toVariationId: "v1",
      toOrdinal: 1,
    });
  });
  it("picks the latest by advancedOn", () => {
    const events = [ev("v1", 1, "2026-05-01", 1000), ev("v2", 2, "2026-05-10", 1100)];
    expect(currentLevelFromEvents(events)?.toVariationId).toBe("v2");
  });
  it("tie-breaks same advancedOn by createdAt (newer wins)", () => {
    const events = [ev("v2", 2, "2026-05-10", 1100), ev("v3", 3, "2026-05-10", 1200)];
    expect(currentLevelFromEvents(events)?.toVariationId).toBe("v3");
  });
  it("handles a regress event (lower ordinal) as the current level", () => {
    const events = [ev("v3", 3, "2026-05-10", 1200), ev("v2", 2, "2026-05-12", 1300)];
    expect(currentLevelFromEvents(events)).toEqual({ toVariationId: "v2", toOrdinal: 2 });
  });
});

const sig = (over: Partial<AdvanceSignals>): AdvanceSignals => ({
  sessionsOnCurrent: 6,
  status: "flat",
  easierAtSameReps: false,
  inPlateau: false,
  recentAvgRpe: 7,
  hasHigherVariant: true,
  hasLowerVariant: true,
  ...over,
});

describe("suggestAdvancement", () => {
  it("suggests advance when status up, enough sessions, not plateaued, higher variant exists", () => {
    expect(suggestAdvancement(sig({ status: "up" }))).toBe("advance");
  });
  it("suggests advance when 'easier at same reps' even if status is flat", () => {
    expect(suggestAdvancement(sig({ status: "flat", easierAtSameReps: true }))).toBe("advance");
  });
  it("does NOT advance below the session guard", () => {
    expect(suggestAdvancement(sig({ status: "up", sessionsOnCurrent: 3 }))).toBeNull();
  });
  it("does NOT advance while in plateau", () => {
    expect(suggestAdvancement(sig({ status: "up", inPlateau: true }))).toBeNull();
  });
  it("does NOT advance with no higher variant", () => {
    expect(suggestAdvancement(sig({ status: "up", hasHigherVariant: false }))).toBeNull();
  });
  it("suggests regress when status down and RPE high and lower variant exists", () => {
    expect(suggestAdvancement(sig({ status: "down", recentAvgRpe: 9 }))).toBe("regress");
  });
  it("does NOT regress when RPE is not high", () => {
    expect(suggestAdvancement(sig({ status: "down", recentAvgRpe: 6 }))).toBeNull();
  });
  it("does NOT regress with no lower variant", () => {
    expect(suggestAdvancement(sig({ status: "down", recentAvgRpe: 9, hasLowerVariant: false }))).toBeNull();
  });
  it("returns null for a flat, unremarkable signal", () => {
    expect(suggestAdvancement(sig({}))).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchomić test — ma NIE przejść**

Run: `npm test -- skill-progression-math`
Expected: FAIL — moduł/eksporty nie istnieją.

- [ ] **Step 3: Zaimplementować `skill-progression-math.ts`**

```ts
import type { ProgressionStatus } from "./progression-math";

/** Jedno zdarzenie awansu, zredukowane do pól potrzebnych do wyliczenia poziomu. */
export interface AdvancementEvent {
  toVariationId: string;
  toOrdinal: number;
  advancedOn: string; // YYYY-MM-DD
  createdAt: number; // epoch ms — tie-break przy tej samej dacie
}

/** Aktualny poziom = najświeższe zdarzenie (advancedOn, potem createdAt). null gdy brak. */
export function currentLevelFromEvents(
  events: AdvancementEvent[],
): { toVariationId: string; toOrdinal: number } | null {
  if (events.length === 0) return null;
  let best = events[0]!;
  for (const e of events) {
    if (e.advancedOn > best.advancedOn) best = e;
    else if (e.advancedOn === best.advancedOn && e.createdAt > best.createdAt) best = e;
  }
  return { toVariationId: best.toVariationId, toOrdinal: best.toOrdinal };
}

/** Próg minimalnej liczby sesji na bieżącym wariancie, zanim cokolwiek sugerujemy. */
export const MIN_SESSIONS_FOR_SUGGESTION = 4;
/** Średnie RPE uznawane za „zmaganie się" (przy cofnięciu). Skala 1–10. */
export const HIGH_RPE = 8;

export interface AdvanceSignals {
  sessionsOnCurrent: number;
  status: ProgressionStatus; // "up" | "flat" | "down" | "new"
  easierAtSameReps: boolean;
  inPlateau: boolean;
  recentAvgRpe: number | null;
  hasHigherVariant: boolean;
  hasLowerVariant: boolean;
}

export type AdvancementSuggestion = "advance" | "regress" | null;

/**
 * Miękka sugestia na bazie sygnałów (bez konfigurowalnych progów).
 * Awans i tak jest ręczny — to tylko podpowiedź dla trenera.
 */
export function suggestAdvancement(s: AdvanceSignals): AdvancementSuggestion {
  if (s.sessionsOnCurrent < MIN_SESSIONS_FOR_SUGGESTION) return null;

  if (
    s.hasHigherVariant &&
    !s.inPlateau &&
    (s.status === "up" || s.easierAtSameReps)
  ) {
    return "advance";
  }

  if (
    s.hasLowerVariant &&
    s.status === "down" &&
    s.recentAvgRpe != null &&
    s.recentAvgRpe >= HIGH_RPE
  ) {
    return "regress";
  }

  return null;
}
```

- [ ] **Step 4: Uruchomić test — ma przejść**

Run: `npm test -- skill-progression-math`
Expected: PASS (wszystkie przypadki).

- [ ] **Step 5: Checkpoint** — `/code-review`. Właściciel commituje.

---

## Task 3: Schematy Zod formularzy — `skill-types.ts` (TDD)

**Files:**
- Create: `app/lib/skill-types.ts`
- Test: `app/lib/skill-types.test.ts`

- [ ] **Step 1: Napisać failing test**

`app/lib/skill-types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SkillFormSchema, AdvancementFormSchema, ReorderFormSchema } from "./skill-types";

describe("SkillFormSchema", () => {
  it("accepts a valid skill", () => {
    const r = SkillFormSchema.safeParse({ name: "Front Lever", description: "Drabina pleców" });
    expect(r.success).toBe(true);
  });
  it("trims and rejects empty name", () => {
    expect(SkillFormSchema.safeParse({ name: "   ", description: "" }).success).toBe(false);
  });
  it("defaults description to empty string", () => {
    const r = SkillFormSchema.safeParse({ name: "Planche" });
    expect(r.success && r.data.description).toBe("");
  });
});

describe("AdvancementFormSchema", () => {
  it("accepts a valid advancement", () => {
    const r = AdvancementFormSchema.safeParse({
      toVariationId: "11111111-1111-1111-1111-111111111111",
      advancedOn: "2026-06-01",
      note: "czysto 5×20s",
    });
    expect(r.success).toBe(true);
  });
  it("rejects a bad date", () => {
    expect(
      AdvancementFormSchema.safeParse({
        toVariationId: "11111111-1111-1111-1111-111111111111",
        advancedOn: "01-06-2026",
      }).success,
    ).toBe(false);
  });
  it("rejects a non-uuid variation id", () => {
    expect(
      AdvancementFormSchema.safeParse({ toVariationId: "nope", advancedOn: "2026-06-01" }).success,
    ).toBe(false);
  });
});

describe("ReorderFormSchema", () => {
  it("accepts a list of uuids", () => {
    const r = ReorderFormSchema.safeParse({
      variationIds: [
        "11111111-1111-1111-1111-111111111111",
        "22222222-2222-2222-2222-222222222222",
      ],
    });
    expect(r.success).toBe(true);
  });
  it("rejects an empty list", () => {
    expect(ReorderFormSchema.safeParse({ variationIds: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchomić test — ma NIE przejść**

Run: `npm test -- skill-types`
Expected: FAIL — moduł nie istnieje.

- [ ] **Step 3: Zaimplementować `skill-types.ts`**

```ts
import { z } from "zod";

/** Schematy walidacji formularzy umiejętności (server-side). Czysta logika — testowana bez DB. */

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Niepoprawna data.");

export const SkillFormSchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
  description: z.string().max(2000).default(""),
});
export type SkillForm = z.infer<typeof SkillFormSchema>;

export const AdvancementFormSchema = z.object({
  toVariationId: z.string().uuid("Niepoprawny wariant."),
  advancedOn: dateString,
  note: z.string().trim().max(2000).optional(),
});
export type AdvancementForm = z.infer<typeof AdvancementFormSchema>;

export const ReorderFormSchema = z.object({
  variationIds: z.array(z.string().uuid()).min(1, "Pusta lista wariantów."),
});
export type ReorderForm = z.infer<typeof ReorderFormSchema>;
```

- [ ] **Step 4: Uruchomić test — ma przejść**

Run: `npm test -- skill-types`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — `/code-review`. Właściciel commituje.

---

## Task 4: Repo umiejętności/wariantów — `skills.ts`

**Files:**
- Create: `app/lib/skills.ts`
- Reference: `app/lib/categories.ts` (wzorzec repo + `Error` z `userMessage` + obsługa unique-violation)

> Funkcje uderzają w DB — testy integracyjne (owner-run) w Task 9. Bramka tego zadania: `typecheck` + `lint` + `build`.

- [ ] **Step 1: Zaimplementować `skills.ts`**

```ts
import { and, asc, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export class SkillError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface SkillListRow {
  id: string;
  name: string;
  description: string;
  variationCount: number;
}

/** Aktywne umiejętności trenera + liczba wariantów. */
export async function listSkillsForTrainer(db: Db, trainerId: string): Promise<SkillListRow[]> {
  const rows = await db
    .select({
      id: schema.skills.id,
      name: schema.skills.name,
      description: schema.skills.description,
      variationCount: sql<number>`COUNT(${schema.skillVariations.id})::int`,
    })
    .from(schema.skills)
    .leftJoin(schema.skillVariations, eq(schema.skillVariations.skillId, schema.skills.id))
    .where(and(eq(schema.skills.trainerId, trainerId), isNull(schema.skills.archivedAt)))
    .groupBy(schema.skills.id)
    .orderBy(asc(schema.skills.name));
  return rows.map((r) => ({ ...r, variationCount: Number(r.variationCount) }));
}

export interface VariationRow {
  id: string;
  exerciseId: string;
  ordinal: number;
  exerciseName: string;
  unit: "REPS" | "SEC";
}

export interface SkillDetail {
  id: string;
  name: string;
  description: string;
  variations: VariationRow[]; // posortowane rosnąco po ordinal
}

/** Umiejętność trenera z wariantami. null gdy nie istnieje / nie jego (→ 404). */
export async function getSkillWithVariations(
  db: Db,
  trainerId: string,
  skillId: string,
): Promise<SkillDetail | null> {
  const [skill] = await db
    .select()
    .from(schema.skills)
    .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)))
    .limit(1);
  if (!skill) return null;

  const variations = await db
    .select({
      id: schema.skillVariations.id,
      exerciseId: schema.skillVariations.exerciseId,
      ordinal: schema.skillVariations.ordinal,
      exerciseName: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.skillVariations)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.skillVariations.exerciseId))
    .where(eq(schema.skillVariations.skillId, skillId))
    .orderBy(asc(schema.skillVariations.ordinal));

  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    variations,
  };
}

export async function createSkill(
  db: Db,
  trainerId: string,
  name: string,
  description: string,
): Promise<schema.Skill> {
  try {
    const [row] = await db
      .insert(schema.skills)
      .values({ trainerId, name, description })
      .returning();
    return row!;
  } catch (e) {
    if (e instanceof Error && e.message.includes("skills_trainer_name_uniq")) {
      throw new SkillError("duplicate", "Umiejętność o tej nazwie już istnieje.");
    }
    throw e;
  }
}

export async function updateSkill(
  db: Db,
  trainerId: string,
  skillId: string,
  name: string,
  description: string,
): Promise<void> {
  try {
    await db
      .update(schema.skills)
      .set({ name, description })
      .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)));
  } catch (e) {
    if (e instanceof Error && e.message.includes("skills_trainer_name_uniq")) {
      throw new SkillError("duplicate", "Umiejętność o tej nazwie już istnieje.");
    }
    throw e;
  }
}

export async function archiveSkill(db: Db, trainerId: string, skillId: string): Promise<void> {
  await db
    .update(schema.skills)
    .set({ archivedAt: sql`now()` })
    .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)));
}

/**
 * Dodaje wariant na koniec drabiny (ordinal = max+1). Weryfikuje, że i umiejętność,
 * i ćwiczenie należą do trenera. Łamie UNIQUE(exercise_id) → przyjazny błąd.
 */
export async function addVariation(
  db: Db,
  trainerId: string,
  skillId: string,
  exerciseId: string,
): Promise<void> {
  const [skill] = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)))
    .limit(1);
  if (!skill) throw new SkillError("not found", "Nie znaleziono umiejętności.");

  const [exercise] = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, trainerId)))
    .limit(1);
  if (!exercise) throw new SkillError("not found", "Nie znaleziono ćwiczenia.");

  const [maxRow] = await db
    .select({ m: sql<number>`COALESCE(MAX(${schema.skillVariations.ordinal}), 0)::int` })
    .from(schema.skillVariations)
    .where(eq(schema.skillVariations.skillId, skillId));
  const nextOrdinal = Number(maxRow?.m ?? 0) + 1;

  try {
    await db
      .insert(schema.skillVariations)
      .values({ skillId, exerciseId, ordinal: nextOrdinal });
  } catch (e) {
    if (e instanceof Error && e.message.includes("skill_variations_exercise_uniq")) {
      throw new SkillError(
        "exercise taken",
        "To ćwiczenie jest już wariantem innej umiejętności.",
      );
    }
    throw e;
  }
}

/** Usuwa wariant (jeśli należy do umiejętności trenera). RESTRICT z awansów → przyjazny błąd. */
export async function removeVariation(
  db: Db,
  trainerId: string,
  skillId: string,
  variationId: string,
): Promise<void> {
  // Potwierdź własność przez join na skills.trainer_id.
  const [v] = await db
    .select({ id: schema.skillVariations.id })
    .from(schema.skillVariations)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
    .where(
      and(
        eq(schema.skillVariations.id, variationId),
        eq(schema.skillVariations.skillId, skillId),
        eq(schema.skills.trainerId, trainerId),
      ),
    )
    .limit(1);
  if (!v) throw new SkillError("not found", "Nie znaleziono wariantu.");

  try {
    await db.delete(schema.skillVariations).where(eq(schema.skillVariations.id, variationId));
  } catch (e) {
    // 23503 = foreign_key_violation (awans odnosi się do wariantu).
    if (e instanceof Error && e.message.includes("skill_advancements")) {
      throw new SkillError(
        "referenced",
        "Nie można usunąć — ten wariant jest użyty w historii awansów. Zarchiwizuj umiejętność zamiast tego.",
      );
    }
    throw e;
  }
}

/**
 * Ustawia kolejność wariantów wg podanej listy id. Robi to w transakcji, dwufazowo,
 * by nie złamać UNIQUE(skill_id, ordinal): najpierw ordinale ujemne, potem docelowe.
 * Lista musi zawierać DOKŁADNIE bieżące warianty umiejętności.
 */
export async function reorderVariations(
  db: Db,
  trainerId: string,
  skillId: string,
  variationIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await tx
      .select({ id: schema.skillVariations.id })
      .from(schema.skillVariations)
      .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
      .where(and(eq(schema.skillVariations.skillId, skillId), eq(schema.skills.trainerId, trainerId)));
    const currentIds = new Set(current.map((c) => c.id));
    if (currentIds.size !== variationIds.length || variationIds.some((id) => !currentIds.has(id))) {
      throw new SkillError("mismatch", "Lista wariantów nie zgadza się z umiejętnością.");
    }
    // Faza 1: tymczasowe ujemne ordinale (unikamy kolizji UNIQUE).
    for (let i = 0; i < variationIds.length; i++) {
      await tx
        .update(schema.skillVariations)
        .set({ ordinal: -(i + 1) })
        .where(eq(schema.skillVariations.id, variationIds[i]!));
    }
    // Faza 2: docelowe ordinale 1..n.
    for (let i = 0; i < variationIds.length; i++) {
      await tx
        .update(schema.skillVariations)
        .set({ ordinal: i + 1 })
        .where(eq(schema.skillVariations.id, variationIds[i]!));
    }
  });
}

/** Ćwiczenia trenera, które NIE są jeszcze wariantem żadnej umiejętności (do pickera). */
export async function listAssignableExercises(
  db: Db,
  trainerId: string,
): Promise<Array<{ id: string; name: string; unit: "REPS" | "SEC" }>> {
  const taken = await db
    .select({ exerciseId: schema.skillVariations.exerciseId })
    .from(schema.skillVariations)
    .innerJoin(schema.skills, eq(schema.skills.id, schema.skillVariations.skillId))
    .where(eq(schema.skills.trainerId, trainerId));
  const takenIds = taken.map((t) => t.exerciseId);

  const conds = [
    eq(schema.exercises.trainerId, trainerId),
    isNull(schema.exercises.archivedAt),
  ];
  if (takenIds.length > 0) conds.push(notInArray(schema.exercises.id, takenIds));

  return await db
    .select({ id: schema.exercises.id, name: schema.exercises.name, unit: schema.exercises.unit })
    .from(schema.exercises)
    .where(and(...conds))
    .orderBy(asc(schema.exercises.name));
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Checkpoint** — `/code-review` + `/security-review` (tenant-scope w repo). Właściciel commituje.

---

## Task 5: Repo mapy/awansów — `skill-progression.ts`

**Files:**
- Create: `app/lib/skill-progression.ts`
- Reuse: `findTraineeOfTrainer` z `app/lib/progression.ts`; `getExerciseProgress`, `getEasierAtSameReps`, `getPlateauExercises` z `app/lib/stats.ts`; `currentLevelFromEvents`, `suggestAdvancement` z `app/lib/skill-progression-math.ts`.

> Funkcje uderzają w DB — testy integracyjne (owner-run) w Task 9. Bramka: `typecheck` + `lint` + `build`.

- [ ] **Step 1: Zaimplementować `skill-progression.ts`**

```ts
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  getEasierAtSameReps,
  getExerciseProgress,
  getPlateauExercises,
} from "~/lib/stats";
import {
  currentLevelFromEvents,
  suggestAdvancement,
  type AdvancementSuggestion,
} from "~/lib/skill-progression-math";
import { SkillError } from "~/lib/skills";

export interface SkillMapVariation {
  id: string;
  exerciseId: string;
  ordinal: number;
  exerciseName: string;
  unit: "REPS" | "SEC";
  isCurrent: boolean;
}

export interface SkillAdvancementHistoryRow {
  advancedOn: string;
  fromVariationId: string | null;
  toVariationId: string;
  note: string | null;
}

export interface SkillMapEntry {
  skillId: string;
  skillName: string;
  variations: SkillMapVariation[]; // ordinal asc
  currentVariationId: string | null; // null = nieprzypisana
  lastAdvancedOn: string | null;
  suggestion: AdvancementSuggestion; // null gdy brak sygnału / read-only kontekst
  history: SkillAdvancementHistoryRow[]; // newest first
}

export type SkillMap = SkillMapEntry[];

/**
 * Pełna mapa umiejętności dla podopiecznego (perspektywa trenera).
 * Sugestię liczymy z sygnałów stats.ts dla bieżącego wariantu.
 * Tenant-scope: traineeId musi należeć do trainerId — guard po stronie trasy
 * (findTraineeOfTrainer), tu filtrujemy umiejętności po trainerId.
 */
export async function getSkillMapForTrainee(
  db: Db,
  trainerId: string,
  traineeId: string,
  opts: { withSuggestions?: boolean } = {},
): Promise<SkillMap> {
  // 1. Umiejętności trenera + warianty.
  const skills = await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skills)
    .where(and(eq(schema.skills.trainerId, trainerId), eq(schema.skills.archivedAt, schema.skills.archivedAt))) // placeholder; patrz niżej
    .orderBy(asc(schema.skills.name));
  // UWAGA: powyższy `where` to celowy placeholder do zamiany w Step 2 — patrz korekta.

  throw new Error("zaimplementowane w Step 2");
}
```

> Powyższy szkielet zawiera celowy błąd `where` (Drizzle nie zignoruje `eq(col,col)` poprawnie dla NULL). Step 2 podaje pełną, poprawną implementację — wklej ją w całości zamiast szkieletu.

- [ ] **Step 2: Wkleić pełną, poprawną implementację (zastępuje całą funkcję ze Step 1)**

```ts
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  getEasierAtSameReps,
  getExerciseProgress,
  getPlateauExercises,
} from "~/lib/stats";
import {
  currentLevelFromEvents,
  suggestAdvancement,
  type AdvancementSuggestion,
  type AdvancementEvent,
} from "~/lib/skill-progression-math";
import { SkillError } from "~/lib/skills";

export interface SkillMapVariation {
  id: string;
  exerciseId: string;
  ordinal: number;
  exerciseName: string;
  unit: "REPS" | "SEC";
  isCurrent: boolean;
}

export interface SkillAdvancementHistoryRow {
  advancedOn: string;
  fromVariationId: string | null;
  toVariationId: string;
  note: string | null;
}

export interface SkillMapEntry {
  skillId: string;
  skillName: string;
  variations: SkillMapVariation[];
  currentVariationId: string | null;
  lastAdvancedOn: string | null;
  suggestion: AdvancementSuggestion;
  history: SkillAdvancementHistoryRow[];
}

export type SkillMap = SkillMapEntry[];

export async function getSkillMapForTrainee(
  db: Db,
  trainerId: string,
  traineeId: string,
  opts: { withSuggestions?: boolean } = {},
): Promise<SkillMap> {
  const skills = await db
    .select({ id: schema.skills.id, name: schema.skills.name })
    .from(schema.skills)
    .where(and(eq(schema.skills.trainerId, trainerId), isNull(schema.skills.archivedAt)))
    .orderBy(asc(schema.skills.name));
  if (skills.length === 0) return [];
  const skillIds = skills.map((s) => s.id);

  const variations = await db
    .select({
      id: schema.skillVariations.id,
      skillId: schema.skillVariations.skillId,
      exerciseId: schema.skillVariations.exerciseId,
      ordinal: schema.skillVariations.ordinal,
      exerciseName: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.skillVariations)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.skillVariations.exerciseId))
    .where(inArray(schema.skillVariations.skillId, skillIds))
    .orderBy(asc(schema.skillVariations.skillId), asc(schema.skillVariations.ordinal));

  const advRows = await db
    .select({
      skillId: schema.skillAdvancements.skillId,
      fromVariationId: schema.skillAdvancements.fromVariationId,
      toVariationId: schema.skillAdvancements.toVariationId,
      advancedOn: schema.skillAdvancements.advancedOn,
      createdAt: schema.skillAdvancements.createdAt,
      note: schema.skillAdvancements.note,
    })
    .from(schema.skillAdvancements)
    .where(
      and(
        eq(schema.skillAdvancements.trainerId, trainerId),
        eq(schema.skillAdvancements.traineeId, traineeId),
        inArray(schema.skillAdvancements.skillId, skillIds),
      ),
    )
    .orderBy(desc(schema.skillAdvancements.advancedOn), desc(schema.skillAdvancements.createdAt));

  // Grupowanie pomocnicze.
  const varsBySkill = new Map<string, typeof variations>();
  for (const v of variations) {
    const arr = varsBySkill.get(v.skillId) ?? [];
    arr.push(v);
    varsBySkill.set(v.skillId, arr);
  }
  const ordinalByVarId = new Map(variations.map((v) => [v.id, v.ordinal] as const));
  const advBySkill = new Map<string, typeof advRows>();
  for (const a of advRows) {
    const arr = advBySkill.get(a.skillId) ?? [];
    arr.push(a);
    advBySkill.set(a.skillId, arr);
  }

  // Sygnały (raz na całego podopiecznego) — mapy po exerciseId.
  let progressByEx = new Map<string, { status: "up" | "flat" | "down" | "new"; sessionCount: number; recentAvgRpe: number }>();
  let easierSet = new Set<string>();
  let plateauSet = new Set<string>();
  if (opts.withSuggestions) {
    const progress = await getExerciseProgress(db, traineeId);
    progressByEx = new Map(
      progress.map((p) => [p.exerciseId, { status: p.status, sessionCount: p.sessionCount, recentAvgRpe: p.recentAvgRpe }]),
    );
    easierSet = new Set((await getEasierAtSameReps(db, traineeId)).map((e) => e.exerciseId));
    plateauSet = new Set((await getPlateauExercises(db, traineeId)).map((p) => p.exerciseId));
  }

  return skills.map((skill) => {
    const vars = varsBySkill.get(skill.id) ?? [];
    const events: AdvancementEvent[] = (advBySkill.get(skill.id) ?? []).map((a) => ({
      toVariationId: a.toVariationId,
      toOrdinal: ordinalByVarId.get(a.toVariationId) ?? 0,
      advancedOn: a.advancedOn,
      createdAt: a.createdAt.getTime(),
    }));
    const current = currentLevelFromEvents(events);
    const currentVar = current ? vars.find((v) => v.id === current.toVariationId) ?? null : null;
    const lastAdvancedOn = (advBySkill.get(skill.id) ?? [])[0]?.advancedOn ?? null;

    let suggestion: AdvancementSuggestion = null;
    if (opts.withSuggestions && currentVar) {
      const prog = progressByEx.get(currentVar.exerciseId);
      const ordinals = vars.map((v) => v.ordinal);
      const maxOrd = Math.max(...ordinals);
      const minOrd = Math.min(...ordinals);
      suggestion = suggestAdvancement({
        sessionsOnCurrent: prog?.sessionCount ?? 0,
        status: prog?.status ?? "new",
        easierAtSameReps: easierSet.has(currentVar.exerciseId),
        inPlateau: plateauSet.has(currentVar.exerciseId),
        recentAvgRpe: prog?.recentAvgRpe ?? null,
        hasHigherVariant: currentVar.ordinal < maxOrd,
        hasLowerVariant: currentVar.ordinal > minOrd,
      });
    }

    return {
      skillId: skill.id,
      skillName: skill.name,
      variations: vars.map((v) => ({
        id: v.id,
        exerciseId: v.exerciseId,
        ordinal: v.ordinal,
        exerciseName: v.exerciseName,
        unit: v.unit,
        isCurrent: currentVar?.id === v.id,
      })),
      currentVariationId: currentVar?.id ?? null,
      lastAdvancedOn,
      suggestion,
      history: (advBySkill.get(skill.id) ?? []).map((a) => ({
        advancedOn: a.advancedOn,
        fromVariationId: a.fromVariationId,
        toVariationId: a.toVariationId,
        note: a.note,
      })),
    };
  });
}

/** Wspólny insert zdarzenia awansu/cofnięcia/poziomu startowego z walidacją tenant-scope. */
async function insertAdvancement(
  db: Db,
  trainerId: string,
  traineeId: string,
  skillId: string,
  toVariationId: string,
  fromVariationId: string | null,
  advancedOn: string,
  note: string | null,
): Promise<void> {
  // Walidacja: skill należy do trenera, podopieczny należy do trenera,
  // wariant(y) należą do tej umiejętności.
  const [skill] = await db
    .select({ id: schema.skills.id })
    .from(schema.skills)
    .where(and(eq(schema.skills.id, skillId), eq(schema.skills.trainerId, trainerId)))
    .limit(1);
  if (!skill) throw new SkillError("not found", "Nie znaleziono umiejętności.");

  const [trainee] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (!trainee) throw new SkillError("not found", "Nie znaleziono podopiecznego.");

  const ids = fromVariationId ? [toVariationId, fromVariationId] : [toVariationId];
  const vars = await db
    .select({ id: schema.skillVariations.id })
    .from(schema.skillVariations)
    .where(and(eq(schema.skillVariations.skillId, skillId), inArray(schema.skillVariations.id, ids)));
  if (vars.length !== ids.length) {
    throw new SkillError("bad variation", "Wariant nie należy do tej umiejętności.");
  }

  await db.insert(schema.skillAdvancements).values({
    trainerId,
    traineeId,
    skillId,
    fromVariationId,
    toVariationId,
    advancedOn,
    advancedBy: trainerId,
    note,
  });
}

/** Ustawienie poziomu startowego (from = NULL). */
export async function setStartingLevel(
  db: Db,
  trainerId: string,
  traineeId: string,
  skillId: string,
  toVariationId: string,
  advancedOn: string,
  note: string | null,
): Promise<void> {
  await insertAdvancement(db, trainerId, traineeId, skillId, toVariationId, null, advancedOn, note);
}

/** Awans/cofnięcie: from = bieżący poziom, to = wybrany wariant (wyższy lub niższy ordinal). */
export async function recordAdvancement(
  db: Db,
  trainerId: string,
  traineeId: string,
  skillId: string,
  toVariationId: string,
  advancedOn: string,
  note: string | null,
): Promise<void> {
  // Wylicz bieżący poziom z mapy (re-using getSkillMapForTrainee byłoby drogie;
  // pobierz tylko zdarzenia tej umiejętności).
  const advRows = await db
    .select({
      toVariationId: schema.skillAdvancements.toVariationId,
      advancedOn: schema.skillAdvancements.advancedOn,
      createdAt: schema.skillAdvancements.createdAt,
    })
    .from(schema.skillAdvancements)
    .where(
      and(
        eq(schema.skillAdvancements.trainerId, trainerId),
        eq(schema.skillAdvancements.traineeId, traineeId),
        eq(schema.skillAdvancements.skillId, skillId),
      ),
    );
  const events: AdvancementEvent[] = advRows.map((a) => ({
    toVariationId: a.toVariationId,
    toOrdinal: 0, // nieistotne dla wyliczenia from-id
    advancedOn: a.advancedOn,
    createdAt: a.createdAt.getTime(),
  }));
  const current = currentLevelFromEvents(events);
  if (current == null) {
    throw new SkillError("no start", "Najpierw ustaw poziom startowy.");
  }
  if (current.toVariationId === toVariationId) {
    throw new SkillError("same level", "Podopieczny jest już na tym wariancie.");
  }
  await insertAdvancement(
    db,
    trainerId,
    traineeId,
    skillId,
    toVariationId,
    current.toVariationId,
    advancedOn,
    note,
  );
}
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS. (Build potwierdza, że importy z `stats.ts`/`progression-math.ts` są spójne.)

- [ ] **Step 4: Checkpoint** — `/code-review` + `/security-review`. Właściciel commituje.

---

## Task 6: Trasy autoringu trenera (lista / nowa / edytor)

**Files:**
- Create: `app/routes/trener/umiejetnosci._index.tsx`
- Create: `app/routes/trener/umiejetnosci.nowa.tsx`
- Create: `app/routes/trener/umiejetnosci.$skillId.tsx`
- Modify: `app/routes.ts`
- Modify: `app/routes/trener/_layout.tsx` (nav)
- Reference: `app/routes/trener/biblioteka._index.tsx` (lista + ListControls), `app/routes/trener/podopieczni.$traineeId.tsx` (intent-action + komunikaty)

> Loader/action = logika (przeglądalna). Markup jest funkcjonalny i zgodny ze wzorcami; **polish wizualny później przez `frontend-design`**.

- [ ] **Step 1: Zarejestrować trasy w `app/routes.ts`**

W bloku `prefix("trener", [ layout(... [` dodać po liniach `biblioteka/...`:

```ts
route("umiejetnosci", "routes/trener/umiejetnosci._index.tsx"),
route("umiejetnosci/nowa", "routes/trener/umiejetnosci.nowa.tsx"),
route("umiejetnosci/:skillId", "routes/trener/umiejetnosci.$skillId.tsx"),
```

- [ ] **Step 2: Dodać pozycję nav w `app/routes/trener/_layout.tsx`**

W tablicy `NAV_ITEMS` dodać po pozycji „Biblioteka ćwiczeń":

```ts
{
  to: "/trener/umiejetnosci",
  label: "Umiejętności",
  end: false,
  icon: "Trend" as const,
  tailKey: null,
},
```

(Jeśli `Icons.Trend` nie pasuje wizualnie — wybierz dowolny istniejący klucz z `app/components/icons.tsx`. Nie dodawaj nowej ikony w tym zadaniu.)

- [ ] **Step 3: `umiejetnosci._index.tsx` — lista**

```tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { listSkillsForTrainer } from "~/lib/skills";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const skills = await listSkillsForTrainer(db, user.id);
  return { skills };
}

export default function UmiejetnosciList() {
  const { skills } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Trener</div>
          <h1>Umiejętności</h1>
          <div className="sub">
            {skills.length === 0 ? "Brak umiejętności." : `${skills.length} umiejętności.`}
          </div>
        </div>
        <Link to="/trener/umiejetnosci/nowa" className="btn btn-primary">
          <Icons.Plus /> Nowa umiejętność
        </Link>
      </div>

      {skills.length === 0 ? (
        <div className="empty">
          <h3>Brak umiejętności</h3>
          <div>Utwórz pierwszą drabinę wariantów (np. Front Lever), by śledzić progresję.</div>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {skills.map((s) => (
            <Link key={s.id} to={`/trener/umiejetnosci/${s.id}`} className="card card-hover" style={{ padding: 14 }}>
              <h3 style={{ margin: 0 }}>{s.name}</h3>
              <div className="text-xs muted" style={{ marginTop: 8 }}>
                {s.variationCount} wariantów
              </div>
              {s.description && (
                <div className="text-sm muted" style={{ marginTop: 8, lineHeight: 1.4 }}>
                  {s.description}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `umiejetnosci.nowa.tsx` — tworzenie**

```tsx
import { Form, redirect, useActionData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { createSkill, SkillError } from "~/lib/skills";
import { SkillFormSchema } from "~/lib/skill-types";

export async function loader(args: LoaderFunctionArgs) {
  await requireUser(args.request, db, { role: "trainer" });
  return null;
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const parsed = SkillFormSchema.safeParse({
    name: String(fd.get("name") ?? ""),
    description: String(fd.get("description") ?? ""),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
  }
  try {
    const skill = await createSkill(db, user.id, parsed.data.name, parsed.data.description);
    throw redirect(`/trener/umiejetnosci/${skill.id}`);
  } catch (e) {
    if (e instanceof Response) throw e;
    if (e instanceof SkillError) return { error: e.userMessage };
    throw e;
  }
}

export default function NowaUmiejetnosc() {
  const actionData = useActionData<typeof action>();
  return (
    <div style={{ maxWidth: 560 }}>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Trener</div>
          <h1>Nowa umiejętność</h1>
        </div>
      </div>
      <Form method="post" className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Nazwa</span>
          <input name="name" className="input" maxLength={120} required placeholder="np. Front Lever" />
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Opis (opcjonalny)</span>
          <textarea name="description" className="input" maxLength={2000} rows={3} />
        </label>
        {actionData?.error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>{actionData.error}</p>
        )}
        <button type="submit" className="btn btn-primary">Utwórz</button>
      </Form>
    </div>
  );
}
```

- [ ] **Step 5: `umiejetnosci.$skillId.tsx` — edytor wariantów**

```tsx
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import {
  addVariation,
  archiveSkill,
  getSkillWithVariations,
  listAssignableExercises,
  removeVariation,
  reorderVariations,
  SkillError,
  updateSkill,
} from "~/lib/skills";
import { SkillFormSchema } from "~/lib/skill-types";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const skillId = args.params.skillId ?? "";
  const skill = await getSkillWithVariations(db, user.id, skillId);
  if (!skill) throw new Response("not found", { status: 404 });
  const assignable = await listAssignableExercises(db, user.id);
  return { skill, assignable };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const skillId = args.params.skillId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  try {
    if (intent === "save") {
      const parsed = SkillFormSchema.safeParse({
        name: String(fd.get("name") ?? ""),
        description: String(fd.get("description") ?? ""),
      });
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      await updateSkill(db, user.id, skillId, parsed.data.name, parsed.data.description);
      return { ok: true };
    }
    if (intent === "add-variation") {
      const exerciseId = String(fd.get("exerciseId") ?? "");
      if (exerciseId) await addVariation(db, user.id, skillId, exerciseId);
      return { ok: true };
    }
    if (intent === "remove-variation") {
      const variationId = String(fd.get("variationId") ?? "");
      if (variationId) await removeVariation(db, user.id, skillId, variationId);
      return { ok: true };
    }
    if (intent === "move") {
      // przesuwanie ↑/↓: klient wysyła pełną kolejność po zmianie
      const ids = fd.getAll("variationIds").map(String);
      if (ids.length > 0) await reorderVariations(db, user.id, skillId, ids);
      return { ok: true };
    }
    if (intent === "archive") {
      await archiveSkill(db, user.id, skillId);
      throw redirect("/trener/umiejetnosci");
    }
    return null;
  } catch (e) {
    if (e instanceof Response) throw e;
    if (e instanceof SkillError) return { error: e.userMessage };
    throw e;
  }
}

export default function EdytorUmiejetnosci() {
  const { skill, assignable } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const ids = skill.variations.map((v) => v.id);

  function reorderedIds(from: number, to: number): string[] {
    const copy = [...ids];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved!);
    return copy;
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="crumbs">
        <Link to="/trener/umiejetnosci">Umiejętności</Link>
        <span className="sep">›</span>
        <span className="current">{skill.name}</span>
      </div>

      {actionData?.error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{actionData.error}</p>
      )}

      <Form method="post" className="card" style={{ padding: 16, display: "grid", gap: 12, marginBottom: 18 }}>
        <input type="hidden" name="intent" value="save" />
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Nazwa</span>
          <input name="name" className="input" defaultValue={skill.name} maxLength={120} required />
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Opis</span>
          <textarea name="description" className="input" defaultValue={skill.description} maxLength={2000} rows={3} />
        </label>
        <button type="submit" className="btn">Zapisz</button>
      </Form>

      <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>Warianty (od najłatwiejszego)</h2>
      {skill.variations.length === 0 ? (
        <div className="text-sm muted" style={{ marginBottom: 12 }}>
          Brak wariantów. Dodaj co najmniej jeden, by móc przypisać poziom startowy podopiecznemu.
        </div>
      ) : (
        <div className="col" style={{ gap: 8, marginBottom: 16 }}>
          {skill.variations.map((v, i) => (
            <div key={v.id} className="card row between" style={{ padding: "10px 14px", gap: 10 }}>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <span className="mono text-xs muted">{v.ordinal}</span>
                <span style={{ fontWeight: 500 }}>{v.exerciseName}</span>
                <span className="badge">{v.unit}</span>
              </div>
              <div className="row" style={{ gap: 4 }}>
                {i > 0 && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="move" />
                    {reorderedIds(i, i - 1).map((id) => (
                      <input key={id} type="hidden" name="variationIds" value={id} />
                    ))}
                    <button type="submit" className="btn btn-sm btn-ghost" aria-label="W górę">↑</button>
                  </Form>
                )}
                {i < skill.variations.length - 1 && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="move" />
                    {reorderedIds(i, i + 1).map((id) => (
                      <input key={id} type="hidden" name="variationIds" value={id} />
                    ))}
                    <button type="submit" className="btn btn-sm btn-ghost" aria-label="W dół">↓</button>
                  </Form>
                )}
                <Form method="post">
                  <input type="hidden" name="intent" value="remove-variation" />
                  <input type="hidden" name="variationId" value={v.id} />
                  <ConfirmSubmitButton
                    className="btn btn-sm btn-ghost"
                    style={{ color: "var(--danger)" }}
                    title="Usuń wariant"
                    confirmOptions={{
                      title: `Usunąć wariant „${v.exerciseName}"?`,
                      message: "Jeśli jest użyty w historii awansów, usunięcie zostanie zablokowane.",
                      destructive: true,
                      confirmText: "Usuń",
                    }}
                  >
                    <Icons.X />
                  </ConfirmSubmitButton>
                </Form>
              </div>
            </div>
          ))}
        </div>
      )}

      <Form method="post" className="row" style={{ gap: 8 }}>
        <input type="hidden" name="intent" value="add-variation" />
        <select name="exerciseId" className="input" style={{ flex: 1 }} required defaultValue="">
          <option value="" disabled>Dodaj ćwiczenie jako wariant…</option>
          {assignable.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.name} ({ex.unit})</option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary"><Icons.Plus /> Dodaj</button>
      </Form>

      <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        <Form method="post">
          <input type="hidden" name="intent" value="archive" />
          <ConfirmSubmitButton
            className="btn btn-danger"
            confirmOptions={{
              title: `Zarchiwizować „${skill.name}"?`,
              message: "Umiejętność zniknie z listy. Historia awansów podopiecznych pozostanie.",
              destructive: true,
              confirmText: "Zarchiwizuj",
            }}
          >
            <Icons.Trash /> Zarchiwizuj umiejętność
          </ConfirmSubmitButton>
        </Form>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 7: Checkpoint** — `/code-review` + `/security-review` (autoryzacja w loaderach/akcjach). Właściciel commituje.

---

## Task 7: Trasa mapy trenera (per podopieczny) + akcje awansu

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.umiejetnosci.tsx`
- Modify: `app/routes.ts`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx` (przycisk „Umiejętności")
- Reuse: `findTraineeOfTrainer` (`~/lib/progression`), `getSkillMapForTrainee`/`setStartingLevel`/`recordAdvancement` (`~/lib/skill-progression`), `AdvancementFormSchema` (`~/lib/skill-types`)

- [ ] **Step 1: Zarejestrować trasę w `app/routes.ts`**

W bloku `trener` po liniach `progresja/...` (lub przy innych `podopieczni/:traineeId/...`) dodać:

```ts
route(
  "podopieczni/:traineeId/umiejetnosci",
  "routes/trener/podopieczni.$traineeId.umiejetnosci.tsx",
),
```

- [ ] **Step 2: Dodać przycisk „Umiejętności" w `podopieczni.$traineeId.tsx`**

W pasku akcji (`<div className="row" style={{ gap: 8 }}>` z przyciskami Statystyki/Progresja/Sylwetka/Konsultacje) dodać po „Progresja":

```tsx
<Link to={`/trener/podopieczni/${trainee.id}/umiejetnosci`} className="btn">
  <Icons.Trend /> Umiejętności
</Link>
```

- [ ] **Step 3: Utworzyć `podopieczni.$traineeId.umiejetnosci.tsx`**

```tsx
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { findTraineeOfTrainer } from "~/lib/progression";
import {
  getSkillMapForTrainee,
  recordAdvancement,
  setStartingLevel,
} from "~/lib/skill-progression";
import { SkillError } from "~/lib/skills";
import { AdvancementFormSchema } from "~/lib/skill-types";
import { todayIso } from "~/lib/progression";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const map = await getSkillMapForTrainee(db, user.id, traineeId, { withSuggestions: true });
  return { trainee, map, today: todayIso() };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });

  const fd = await args.request.formData();
  const intent = fd.get("intent");
  const skillId = String(fd.get("skillId") ?? "");
  const parsed = AdvancementFormSchema.safeParse({
    toVariationId: String(fd.get("toVariationId") ?? ""),
    advancedOn: String(fd.get("advancedOn") ?? ""),
    note: fd.get("note") ? String(fd.get("note")) : undefined,
  });
  if (!skillId || !parsed.success) {
    return { error: parsed.success ? "Brak umiejętności." : parsed.error.issues[0]?.message };
  }
  const { toVariationId, advancedOn, note } = parsed.data;
  try {
    if (intent === "set-start") {
      await setStartingLevel(db, user.id, traineeId, skillId, toVariationId, advancedOn, note ?? null);
    } else if (intent === "advance") {
      await recordAdvancement(db, user.id, traineeId, skillId, toVariationId, advancedOn, note ?? null);
    } else {
      return null;
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof SkillError) return { error: e.userMessage };
    throw e;
  }
}

export default function TrenerUmiejetnosci() {
  const { trainee, map, today } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Umiejętności</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{trainee.displayName}</div>
          <h1>Umiejętności</h1>
          <div className="sub">Pozycja na drabinach wariantów i awanse.</div>
        </div>
      </div>

      {actionData?.error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{actionData.error}</p>
      )}

      {map.length === 0 ? (
        <div className="empty">
          <h3>Brak umiejętności</h3>
          <div>Najpierw utwórz umiejętności w sekcji „Umiejętności".</div>
        </div>
      ) : (
        <div className="col" style={{ gap: 16 }}>
          {map.map((entry) => (
            <div key={entry.skillId} className="card" style={{ padding: 16 }}>
              <div className="row between" style={{ alignItems: "center", marginBottom: 10 }}>
                <h2 style={{ fontSize: 17, margin: 0 }}>{entry.skillName}</h2>
                {entry.suggestion === "advance" && (
                  <span className="badge active" title="Sygnały wskazują gotowość">
                    <Icons.Trend /> rozważ awans
                  </span>
                )}
                {entry.suggestion === "regress" && (
                  <span className="badge" style={{ color: "var(--danger)" }} title="Sygnały wskazują zmaganie">
                    rozważ cofnięcie
                  </span>
                )}
              </div>

              {/* Drabina */}
              <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
                {entry.variations.map((v) => (
                  <span
                    key={v.id}
                    className={`tag${v.isCurrent ? " active" : ""}`}
                    style={v.isCurrent ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined}
                  >
                    {v.ordinal}. {v.exerciseName}{v.isCurrent ? " · TU JESTEŚ" : ""}
                  </span>
                ))}
                {entry.variations.length === 0 && (
                  <span className="text-xs muted">Brak wariantów — uzupełnij w edytorze umiejętności.</span>
                )}
              </div>

              {entry.lastAdvancedOn && (
                <div className="text-xs muted" style={{ marginBottom: 12 }}>
                  Ostatni awans: {fmtDate(entry.lastAdvancedOn)}
                </div>
              )}

              {/* Akcja: poziom startowy lub awans/cofnięcie */}
              {entry.variations.length > 0 && (
                <Form method="post" className="row wrap" style={{ gap: 8, alignItems: "flex-end" }}>
                  <input type="hidden" name="intent" value={entry.currentVariationId ? "advance" : "set-start"} />
                  <input type="hidden" name="skillId" value={entry.skillId} />
                  <label className="col" style={{ gap: 4 }}>
                    <span className="text-xs muted">{entry.currentVariationId ? "Zmień na" : "Poziom startowy"}</span>
                    <select name="toVariationId" className="input" required defaultValue="">
                      <option value="" disabled>wybierz wariant…</option>
                      {entry.variations.map((v) => (
                        <option key={v.id} value={v.id} disabled={v.isCurrent}>
                          {v.ordinal}. {v.exerciseName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col" style={{ gap: 4 }}>
                    <span className="text-xs muted">Data</span>
                    <input type="date" name="advancedOn" className="input" defaultValue={today} required />
                  </label>
                  <button type="submit" className="btn btn-primary">
                    {entry.currentVariationId ? "Zapisz zmianę" : "Ustaw poziom"}
                  </button>
                  {entry.currentVariationId && (
                    <Link
                      to={`/trener/podopieczni/${trainee.id}`}
                      className="btn btn-ghost"
                      title="Podmień ćwiczenie w planie ręcznie w edytorze"
                    >
                      Edytuj plan
                    </Link>
                  )}
                </Form>
              )}

              {/* Historia */}
              {entry.history.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary className="text-xs muted" style={{ cursor: "pointer" }}>
                    Historia awansów ({entry.history.length})
                  </summary>
                  <ul className="text-xs muted" style={{ marginTop: 8 }}>
                    {entry.history.map((h, i) => (
                      <li key={`${h.advancedOn}-${i}`}>
                        {fmtDate(h.advancedOn)} — {h.fromVariationId ? "awans" : "poziom startowy"}
                        {h.note ? ` · „${h.note}"` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

> Uwaga: „Edytuj plan" deep-linkuje do widoku podopiecznego (skąd jest „Edytuj plan" do edytora) — świadome rozprzęgnięcie ze spec §8. Bez auto-mutacji planu.

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — `/code-review` + `/security-review`. Właściciel commituje.

---

## Task 8: Trasa mapy read-only dla podopiecznego

**Files:**
- Create: `app/routes/podopieczny/umiejetnosci.tsx`
- Modify: `app/routes.ts`
- Modify: `app/routes/podopieczny/_layout.tsx` (nav)

> Podopieczny widzi własną mapę bez akcji i bez sugestii (`withSuggestions: false`). Tenant-scope: trener podopiecznego = `user.trainerId`.

- [ ] **Step 1: Zarejestrować trasę w `app/routes.ts`**

W bloku `podopieczny` po `progresja/...` dodać:

```ts
route("umiejetnosci", "routes/podopieczny/umiejetnosci.tsx"),
```

- [ ] **Step 2: Dodać pozycję nav w `app/routes/podopieczny/_layout.tsx`**

W `NAV_ITEMS` po „Progresja" dodać:

```ts
{
  to: "/podopieczny/umiejetnosci",
  label: "Umiejętności",
  end: false,
  icon: "Trend" as const,
  tailKey: null,
},
```

- [ ] **Step 3: Utworzyć `podopieczny/umiejetnosci.tsx`**

```tsx
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { getSkillMapForTrainee } from "~/lib/skill-progression";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  // role=trainee => trainerId NOT NULL (gwarantuje CHECK w schemacie).
  const trainerId = user.trainerId!;
  const map = await getSkillMapForTrainee(db, trainerId, user.id, { withSuggestions: false });
  // Pokazuj tylko umiejętności, które są podopiecznemu przypisane (mają bieżący poziom).
  const assigned = map.filter((m) => m.currentVariationId != null);
  return { map: assigned };
}

export default function PodopiecznyUmiejetnosci() {
  const { map } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Podopieczny</div>
          <h1>Umiejętności</h1>
          <div className="sub">Twoja pozycja na drabinach wariantów.</div>
        </div>
      </div>

      {map.length === 0 ? (
        <div className="empty">
          <h3>Brak przypisanych umiejętności</h3>
          <div>Trener przypisze Ci poziom startowy, gdy zaczniecie pracować nad umiejętnością.</div>
        </div>
      ) : (
        <div className="col" style={{ gap: 16 }}>
          {map.map((entry) => (
            <div key={entry.skillId} className="card" style={{ padding: 16 }}>
              <h2 style={{ fontSize: 17, margin: "0 0 10px" }}>{entry.skillName}</h2>
              <div className="row wrap" style={{ gap: 6 }}>
                {entry.variations.map((v) => (
                  <span
                    key={v.id}
                    className={`tag${v.isCurrent ? " active" : ""}`}
                    style={v.isCurrent ? { background: "var(--accent)", color: "var(--accent-ink)" } : undefined}
                  >
                    {v.ordinal}. {v.exerciseName}{v.isCurrent ? " · TU JESTEŚ" : ""}
                  </span>
                ))}
              </div>
              {entry.lastAdvancedOn && (
                <div className="text-xs muted" style={{ marginTop: 10 }}>
                  Ostatni awans: {fmtDate(entry.lastAdvancedOn)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Checkpoint** — `/code-review` + `/security-review` (read-only, brak akcji mutujących u podopiecznego). Właściciel commituje.

---

## Task 9: Testy integracyjne (owner-run) + dokumentacja

**Files:**
- Create: `tests/skills.itest.ts` (zgodnie z konwencją katalogu `tests/` — sprawdź istniejące `*.itest.ts` dla wzorca bootstrapu testcontainers/seed)
- Modify: `app/lib/README.md`, `app/routes/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`, `app/lib/db/README.md`, w razie potrzeby `CLAUDE.md`

- [ ] **Step 1: Przeczytać istniejący wzorzec testów integracyjnych**

Run: przejrzyj `tests/` (np. `Glob tests/**/*.itest.ts`) i jeden istniejący plik, by skopiować sposób stawiania DB, seedowania trenera/podopiecznego i wywoływania repo/tras.

- [ ] **Step 2: Napisać `tests/skills.itest.ts`** pokrywający (wg spec §12):
  - tenant-scope: trener A nie widzi/nie awansuje umiejętności ani podopiecznego trenera B → 404 / `SkillError`;
  - pełny cykl: `createSkill` → `addVariation` ×N → `reorderVariations` → `setStartingLevel` → `recordAdvancement` (awans) → `recordAdvancement` (cofnięcie) → `getSkillMapForTrainee` zwraca poprawny `currentVariationId` i `history`;
  - `UNIQUE(exercise_id)`: drugi `addVariation` z tym samym ćwiczeniem do innej umiejętności → `SkillError "exercise taken"`;
  - `ON DELETE RESTRICT`: `removeVariation` na wariancie użytym w awansie → `SkillError "referenced"`;
  - read-only podopiecznego: POST na trasę awansu jako trainee → odrzucone (`requireUser({role:"trainer"})` → 404/redirect login).

  Struktura testów dopasowana do wzorca z kroku 1 (te same helpery do DB/seed). **Nie uruchamiaj** — to robi właściciel.

- [ ] **Step 3: Zaktualizować dokumentację (część „done")**

  - `app/lib/README.md` — dopisać do tabeli: `skill-progression-math.ts`, `skill-types.ts`, `skills.ts`, `skill-progression.ts` (krótki opis kluczowych eksportów, w stylu istniejących wierszy).
  - `app/routes/trener/README.md` — dodać `umiejetnosci._index/nowa/$skillId` oraz `podopieczni.$traineeId.umiejetnosci`.
  - `app/routes/podopieczny/README.md` — dodać `umiejetnosci`.
  - `app/routes/README.md` — uzupełnić mapę URL→plik o nowe trasy.
  - `app/lib/db/README.md` — wzmianka o tabelach `skills`/`skill_variations`/`skill_advancements` (schemat = źródło prawdy).
  - `CLAUDE.md` — jeśli uznasz „Umiejętności" za nową pozycję nawigacji/sekcję wartą wpisu w mapie projektu, dopisz; w przeciwnym razie pomiń.

- [ ] **Step 4: Checkpoint** — `/code-review`. Właściciel commituje. Właściciel uruchamia `npm run db:migrate` (jeśli jeszcze nie) i `*.itest.ts`.

---

## Task 10: Bramki końcowe + handoff

- [ ] **Step 1: Pełny zestaw bramek**

Run:
```
npm test
npm run typecheck
npm run lint
npm run build
```
Expected: wszystko zielone.

- [ ] **Step 2: `/security-review`** całości zmian (auth, tenant-scope, brak mutacji u podopiecznego, walidacja wejść).

- [ ] **Step 3: (opcjonalnie) polish wizualny** — uruchom `frontend-design:frontend-design` dla trzech widoków (edytor umiejętności, mapa trenera, mapa podopiecznego) zgodnie z `design-system/README.md`; iteruj `npm run shots`.

- [ ] **Step 4: Handoff dla właściciela** — przygotuj notatkę:
  - sugerowany opis commita/commitów,
  - **migracja:** „uruchom `npm run db:migrate` (nowa migracja tworzy `skills`, `skill_variations`, `skill_advancements`)",
  - **testy do odpalenia pod Dockerem:** `tests/skills.itest.ts`,
  - lista nowych tras i pozycji nav,
  - świadomie odłożone (roadmapa spec §15): bramki konfigurowalne, auto-podmiana planu, DAG prerekwizytów, mastery %, wspólna biblioteka.

---

## Self-Review (autor planu)

**1. Pokrycie spec:**
- §3 model danych → Task 1 (3 tabele + constraints + indeksy). ✓
- §4 autoring → Task 6 (lista/nowa/edytor, picker tylko nieprzypisanych, reorder ↑/↓, archiwizacja). ✓
- §5 mapa trener + podopieczny → Task 7 + Task 8. ✓
- §6 awans ręczny + historia → Task 5 (`setStartingLevel`/`recordAdvancement`) + Task 7 UI + historia w `getSkillMapForTrainee`. ✓
- §7 sugestia sygnałowa → Task 2 (`suggestAdvancement`) + Task 5 (spięcie z `stats.ts`). ✓
- §8 rozprzęgnięcie planu → Task 7 (deep-link „Edytuj plan", brak mutacji). ✓
- §10 autoryzacja/tenant-scope/404 → Task 4/5/7/8 + `/security-review`. ✓
- §11 warstwa kodu → pliki zgodne. ✓
- §12 testy → Task 2/3 (unit) + Task 9 (itest). ✓
- §14 dokumentacja → Task 9 Step 3. ✓
- §17 kryteria akceptacji → pokryte przez Task 2/4/5/7/8/9.

**2. Placeholdery:** Brak „TBD/TODO". Jedyny celowy „szkielet z błędem" (Task 5 Step 1) jest natychmiast zastępowany pełną implementacją w Step 2 i wyraźnie tak oznaczony.

**3. Spójność typów/nazw:** `currentLevelFromEvents`, `suggestAdvancement`, `AdvanceSignals`, `AdvancementEvent`, `getSkillMapForTrainee`, `setStartingLevel`, `recordAdvancement`, `addVariation`, `removeVariation`, `reorderVariations`, `listAssignableExercises`, `SkillFormSchema`, `AdvancementFormSchema`, `ReorderFormSchema` — używane spójnie między zadaniami. Eksporty schematu (`skills`/`skillVariations`/`skillAdvancements`) zgodne z importami w repo.

> Uwaga wykonawcza: `getExerciseProgress`/`getEasierAtSameReps`/`getPlateauExercises` zwracają pola `status`, `sessionCount`, `recentAvgRpe`, `exerciseId` (potwierdzone w `app/lib/stats.ts`). Jeśli w trakcie implementacji nazwa pola się nie zgadza — dostosuj mapowanie w `getSkillMapForTrainee`, nie zmieniaj `stats.ts`.
