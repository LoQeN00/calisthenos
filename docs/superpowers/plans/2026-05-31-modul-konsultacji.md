# Moduł konsultacji — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać moduł konsultacji — trener dokumentuje okresowe spotkania (data, okres, podsumowanie + lista punktów „do poprawy" ze statusem), podopieczny czyta je read-only i widzi co ma jeszcze do poprawy.

**Architecture:** Dwie znormalizowane tabele (`consultations` → `consultation_action_items`) wzorem `plans`→`plan_sessions`. Walidacja Zod w `consultation-types.ts` (czysta, testowana jednostkowo), repo tenant-scoped w `consultations.ts`, trasy RR7 w `trener/*` (autor) i `podopieczny/*` (czytelnik). Loadery czytają, akcje mutują.

**Tech Stack:** React Router v7 (SSR, loadery/akcje), Drizzle ORM + PostgreSQL 16, Zod, Vitest (unit + testcontainers itest), Biome.

---

## Zasady procesu (kalisthenos-dev-flow) — obowiązują w każdym tasku

- **Nigdy git, nigdy docker.** Zamiast „Commit" każdy task kończy się **review** (`/code-review`); commit/branch/push robi właściciel na końcu (handoff).
- **TDD** dla logiki bez DB (`npm run test:unit`). Testy integracyjne `*.itest.ts` w `tests/` — **piszemy, NIE uruchamiamy** (`npm run test:itest` odpala właściciel pod Dockerem).
- **`npm run db:generate`** po zmianie schematu (to nie git/docker — generuje SQL z `schema.ts`; **nie** edytujemy `migrations/` ręcznie). `db:migrate` odpala właściciel.
- **Frontend/UI** prowadzi skill `frontend-design:frontend-design` (Taski 5–6): kod tu jest funkcjonalnym szkieletem, polish wizualny i zgodność z `design-system/README.md` + `app/styles/tokens.css` przez ten skill. UI po polsku.
- **Context7 (MCP)** po aktualne API (RR7, Drizzle, Zod), gdy coś niepewne.

Komendy testów (z `package.json`):
- Unit: `npm run test:unit` (vitest run, wyklucza `*.itest.ts`). Pliki: `app/**/*.test.ts`. `globals: false` → importuj `{ describe, it, expect } from "vitest"`.
- Integ: `npm run test:itest` (testcontainers). Pliki: `tests/**/*.itest.ts`. **Nie uruchamiamy.**

---

## Struktura plików

| Plik | Odpowiedzialność | Akcja |
|---|---|---|
| `app/lib/db/schema.ts` | enum + tabele `consultations`, `consultation_action_items` + typy | Modify |
| `app/lib/db/migrations/XXXX_*.sql` | migracja (generowana) | Create (przez `db:generate`) |
| `app/lib/consultation-types.ts` | schematy Zod formularza konsultacji | Create |
| `app/lib/consultation-types.test.ts` | testy jednostkowe Zod | Create |
| `app/lib/consultations.ts` | repo tenant-scoped (list/get/create/update/status/delete) | Create |
| `tests/consultations.itest.ts` | testy integracyjne (PISZEMY, nie uruchamiamy) | Create |
| `app/components/icons.tsx` | ikona `Consult` | Modify |
| `app/routes.ts` | 5 nowych wpisów tras | Modify |
| `app/routes/trener/podopieczni.$traineeId.tsx` | przycisk „Konsultacje" w nagłówku | Modify |
| `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx` | lista konsultacji (trener) | Create |
| `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx` | formularz nowej konsultacji | Create |
| `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx` | szczegóły/edycja/status/usuń | Create |
| `app/routes/podopieczny/_layout.tsx` | nav „Konsultacje" + badge otwartych punktów | Modify |
| `app/routes/podopieczny/konsultacje._index.tsx` | lista konsultacji (read-only) | Create |
| `app/routes/podopieczny/konsultacje.$konsultacjaId.tsx` | szczegóły (read-only) | Create |
| `app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md` | dokumentacja | Modify |

---

## Task 1: Schemat DB + migracja

**Files:**
- Modify: `app/lib/db/schema.ts`
- Create (generowana): migracja w `app/lib/db/migrations/`

- [ ] **Step 1: Dodaj enum statusu**

W `app/lib/db/schema.ts`, w sekcji `// ---------------- Enums ----------------` (po `bodyPhotoView`), dodaj:

```ts
export const consultationItemStatus = pgEnum("consultation_item_status", ["open", "resolved"]);
```

- [ ] **Step 2: Dodaj tabele konsultacji**

W `app/lib/db/schema.ts`, po sekcji `// ---------------- Body photos ----------------` (po `bodyPhotos`), a przed `// ---------------- Types ----------------`, dodaj:

```ts
// ---------------- Consultations ----------------

export const consultations = pgTable(
  "consultations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Denormalized for tenant-scoped queries (jak workout_logs).
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    heldOn: date("held_on").notNull(),
    periodFrom: date("period_from"),
    periodTo: date("period_to"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traineeDateIdx: index("consultations_trainee_date_idx").on(t.traineeId, t.heldOn),
    trainerCreatedIdx: index("consultations_trainer_created_idx").on(t.trainerId, t.createdAt),
    periodCheck: check(
      "consultations_period_check",
      sql`(${t.periodFrom} IS NULL AND ${t.periodTo} IS NULL) OR
          (${t.periodFrom} IS NOT NULL AND ${t.periodTo} IS NOT NULL AND ${t.periodFrom} <= ${t.periodTo})`,
    ),
  }),
);

export const consultationActionItems = pgTable(
  "consultation_action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    body: text("body").notNull(),
    status: consultationItemStatus("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex("consultation_action_items_consultation_ordinal_uniq").on(
      t.consultationId,
      t.ordinal,
    ),
  }),
);
```

- [ ] **Step 3: Dodaj typy**

W sekcji `// ---------------- Types ----------------` (na końcu pliku) dodaj:

```ts
export type Consultation = typeof consultations.$inferSelect;
export type NewConsultation = typeof consultations.$inferInsert;
export type ConsultationActionItem = typeof consultationActionItems.$inferSelect;
export type NewConsultationActionItem = typeof consultationActionItems.$inferInsert;
export type ConsultationItemStatus = (typeof consultationItemStatus.enumValues)[number];
```

- [ ] **Step 4: Wygeneruj migrację**

Run: `npm run db:generate`
Expected: nowy plik `app/lib/db/migrations/XXXX_*.sql` z `CREATE TYPE "consultation_item_status"`, `CREATE TABLE "consultations"`, `CREATE TABLE "consultation_action_items"`, indeksami i CHECK-iem. Snapshot w `migrations/meta/` zaktualizowany. **Nie edytuj wygenerowanego SQL ręcznie.**

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (brak błędów; nowe typy się kompilują).

- [ ] **Step 6: Review**

`/code-review` na zmianie schematu. Po akceptacji → kolejny task. (Commit zrobi właściciel.)

---

## Task 2: Walidacja Zod (`consultation-types.ts`) — TDD

**Files:**
- Create: `app/lib/consultation-types.ts`
- Test: `app/lib/consultation-types.test.ts`

- [ ] **Step 1: Napisz failujący test**

Create `app/lib/consultation-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ConsultationFormSchema } from "~/lib/consultation-types";

const base = {
  heldOn: "2026-05-20",
  title: "Konsultacja majowa",
  summary: "Ogólnie dobrze.",
  items: [{ body: "Łokcie przy podciąganiu", status: "open" as const }],
};

describe("ConsultationFormSchema", () => {
  it("akceptuje poprawny wpis bez okresu", () => {
    const r = ConsultationFormSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("akceptuje poprawny okres od<=do", () => {
    const r = ConsultationFormSchema.safeParse({
      ...base,
      periodFrom: "2026-05-01",
      periodTo: "2026-05-20",
    });
    expect(r.success).toBe(true);
  });

  it("odrzuca pusty tytuł", () => {
    const r = ConsultationFormSchema.safeParse({ ...base, title: "   " });
    expect(r.success).toBe(false);
  });

  it("odrzuca okres z tylko jednym końcem", () => {
    const r = ConsultationFormSchema.safeParse({ ...base, periodFrom: "2026-05-01" });
    expect(r.success).toBe(false);
  });

  it("odrzuca okres od>do", () => {
    const r = ConsultationFormSchema.safeParse({
      ...base,
      periodFrom: "2026-05-21",
      periodTo: "2026-05-20",
    });
    expect(r.success).toBe(false);
  });

  it("odrzuca punkt z pustą treścią", () => {
    const r = ConsultationFormSchema.safeParse({
      ...base,
      items: [{ body: "  ", status: "open" }],
    });
    expect(r.success).toBe(false);
  });

  it("domyślny status punktu to open, domyślne summary to pusty string", () => {
    const r = ConsultationFormSchema.parse({
      heldOn: "2026-05-20",
      title: "X",
      items: [{ body: "punkt" }],
    });
    expect(r.summary).toBe("");
    expect(r.items[0]!.status).toBe("open");
  });
});
```

- [ ] **Step 2: Uruchom test — ma faliować**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module "~/lib/consultation-types"` (plik nie istnieje).

- [ ] **Step 3: Zaimplementuj schemat**

Create `app/lib/consultation-types.ts`:

```ts
import { z } from "zod";

/**
 * Walidacja formularza konsultacji (server-side). Route buduje zwykły obiekt z
 * FormData i waliduje przez `ConsultationFormSchema`. Czysta logika — testowana
 * jednostkowo bez DB.
 */

export const ConsultationItemStatusSchema = z.enum(["open", "resolved"]);
export type ConsultationItemStatusForm = z.infer<typeof ConsultationItemStatusSchema>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Niepoprawna data.");

export const ActionItemFormSchema = z.object({
  // Server ignoruje id przy zapisie (rows są wycierane i pisane od nowa).
  id: z.string().optional(),
  body: z.string().trim().min(1, "Treść punktu nie może być pusta.").max(2000),
  status: ConsultationItemStatusSchema.default("open"),
});
export type ActionItemForm = z.infer<typeof ActionItemFormSchema>;

export const ConsultationFormSchema = z
  .object({
    heldOn: dateString,
    periodFrom: dateString.nullable().optional(),
    periodTo: dateString.nullable().optional(),
    title: z.string().trim().min(1, "Tytuł jest wymagany.").max(160),
    summary: z.string().max(10000).optional().default(""),
    items: z.array(ActionItemFormSchema).max(50).optional().default([]),
  })
  .refine((c) => (c.periodFrom == null) === (c.periodTo == null), {
    message: "Podaj oba końce okresu albo żaden.",
    path: ["periodTo"],
  })
  .refine(
    (c) => c.periodFrom == null || c.periodTo == null || c.periodFrom <= c.periodTo,
    { message: "Początek okresu nie może być po końcu.", path: ["periodTo"] },
  );
export type ConsultationForm = z.infer<typeof ConsultationFormSchema>;
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit`
Expected: PASS (7 testów zielonych).

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint` i `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Review**

`/code-review`. Po akceptacji → kolejny task.

---

## Task 3: Repo (`consultations.ts`) + test integracyjny

**Files:**
- Create: `app/lib/consultations.ts`
- Test (PISZEMY, NIE uruchamiamy): `tests/consultations.itest.ts`

- [ ] **Step 1: Zaimplementuj repo**

Create `app/lib/consultations.ts`:

```ts
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import type { ConsultationForm } from "~/lib/consultation-types";
import * as schema from "~/lib/db/schema";

export class ConsultationError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface ConsultationListItem {
  id: string;
  heldOn: string;
  periodFrom: string | null;
  periodTo: string | null;
  title: string;
  totalItemCount: number;
  openItemCount: number;
}

/** Lista konsultacji podopiecznego, najnowsze wg daty spotkania. Tenant-scope: traineeId. */
export async function listConsultationsForTrainee(
  db: Db,
  traineeId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<ConsultationListItem[]> {
  const rows = await db
    .select({
      id: schema.consultations.id,
      heldOn: schema.consultations.heldOn,
      periodFrom: schema.consultations.periodFrom,
      periodTo: schema.consultations.periodTo,
      title: schema.consultations.title,
      createdAt: schema.consultations.createdAt,
      total: count(schema.consultationActionItems.id),
      open: sql<number>`count(*) filter (where ${schema.consultationActionItems.status} = 'open')`,
    })
    .from(schema.consultations)
    .leftJoin(
      schema.consultationActionItems,
      eq(schema.consultationActionItems.consultationId, schema.consultations.id),
    )
    .where(eq(schema.consultations.traineeId, traineeId))
    .groupBy(schema.consultations.id)
    .orderBy(desc(schema.consultations.heldOn), desc(schema.consultations.createdAt))
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({
    id: r.id,
    heldOn: r.heldOn,
    periodFrom: r.periodFrom,
    periodTo: r.periodTo,
    title: r.title,
    totalItemCount: Number(r.total),
    openItemCount: Number(r.open),
  }));
}

export async function countConsultationsForTrainee(db: Db, traineeId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.consultations)
    .where(eq(schema.consultations.traineeId, traineeId));
  return Number(row?.c ?? 0);
}

/** Liczba otwartych punktów „do poprawy" w skali wszystkich konsultacji — pod badge. */
export async function countOpenItemsForTrainee(db: Db, traineeId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.consultationActionItems)
    .innerJoin(
      schema.consultations,
      eq(schema.consultations.id, schema.consultationActionItems.consultationId),
    )
    .where(
      and(
        eq(schema.consultations.traineeId, traineeId),
        eq(schema.consultationActionItems.status, "open"),
      ),
    );
  return Number(row?.c ?? 0);
}

export interface ConsultationDetail {
  consultation: schema.Consultation;
  items: schema.ConsultationActionItem[];
}

/**
 * Szczegóły konsultacji z punktami. Tenant-scope: podaj `trainerId` (widok trenera)
 * LUB `traineeId` (widok podopiecznego). Brak dopasowania → null (route zwraca 404).
 */
export async function getConsultationDetail(
  db: Db,
  args: { consultationId: string; trainerId?: string; traineeId?: string },
): Promise<ConsultationDetail | null> {
  const conds = [eq(schema.consultations.id, args.consultationId)];
  if (args.trainerId) conds.push(eq(schema.consultations.trainerId, args.trainerId));
  if (args.traineeId) conds.push(eq(schema.consultations.traineeId, args.traineeId));

  const [c] = await db
    .select()
    .from(schema.consultations)
    .where(and(...conds))
    .limit(1);
  if (!c) return null;

  const items = await db
    .select()
    .from(schema.consultationActionItems)
    .where(eq(schema.consultationActionItems.consultationId, args.consultationId))
    .orderBy(asc(schema.consultationActionItems.ordinal));

  return { consultation: c, items };
}

async function assertTraineeOwnedBy(db: Db, trainerId: string, traineeId: string): Promise<void> {
  const [row] = await db
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
  if (!row) throw new ConsultationError("trainee not owned", "Nie znaleziono podopiecznego.");
}

export interface CreateConsultationInput {
  trainerId: string;
  traineeId: string;
  form: ConsultationForm;
}

/** Tworzy konsultację z punktami. Re-weryfikuje własność podopiecznego. */
export async function createConsultation(db: Db, input: CreateConsultationInput): Promise<string> {
  await assertTraineeOwnedBy(db, input.trainerId, input.traineeId);
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.consultations)
      .values({
        trainerId: input.trainerId,
        traineeId: input.traineeId,
        heldOn: input.form.heldOn,
        periodFrom: input.form.periodFrom ?? null,
        periodTo: input.form.periodTo ?? null,
        title: input.form.title,
        summary: input.form.summary ?? "",
      })
      .returning({ id: schema.consultations.id });
    const id = row!.id;
    await insertItems(tx, id, input.form.items);
    return id;
  });
}

export interface UpdateConsultationInput {
  trainerId: string;
  consultationId: string;
  form: ConsultationForm;
}

/**
 * Edycja konsultacji (tylko właściciel-trener). Punkty są wycierane i pisane od
 * nowa z formularza (status każdego punktu pochodzi z formularza, więc oznaczenia
 * open/resolved są zachowane). Brak własności → ConsultationError.
 */
export async function updateConsultation(db: Db, input: UpdateConsultationInput): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: schema.consultations.id })
      .from(schema.consultations)
      .where(
        and(
          eq(schema.consultations.id, input.consultationId),
          eq(schema.consultations.trainerId, input.trainerId),
        ),
      )
      .limit(1);
    if (!c) throw new ConsultationError("not owned", "Nie znaleziono konsultacji.");

    await tx
      .update(schema.consultations)
      .set({
        heldOn: input.form.heldOn,
        periodFrom: input.form.periodFrom ?? null,
        periodTo: input.form.periodTo ?? null,
        title: input.form.title,
        summary: input.form.summary ?? "",
      })
      .where(eq(schema.consultations.id, input.consultationId));

    await tx
      .delete(schema.consultationActionItems)
      .where(eq(schema.consultationActionItems.consultationId, input.consultationId));
    await insertItems(tx, input.consultationId, input.form.items);
  });
}

async function insertItems(
  tx: Db,
  consultationId: string,
  items: ConsultationForm["items"],
): Promise<void> {
  if (items.length === 0) return;
  await tx.insert(schema.consultationActionItems).values(
    items.map((it, idx) => ({
      consultationId,
      ordinal: idx,
      body: it.body,
      status: it.status,
      resolvedAt: it.status === "resolved" ? new Date() : null,
    })),
  );
}

/** Przełącza status punktu (tylko właściciel-trener). Ustawia/zeruje resolved_at. */
export async function setActionItemStatus(
  db: Db,
  args: { trainerId: string; itemId: string; status: schema.ConsultationItemStatus },
): Promise<void> {
  const [owned] = await db
    .select({ id: schema.consultationActionItems.id })
    .from(schema.consultationActionItems)
    .innerJoin(
      schema.consultations,
      eq(schema.consultations.id, schema.consultationActionItems.consultationId),
    )
    .where(
      and(
        eq(schema.consultationActionItems.id, args.itemId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .limit(1);
  if (!owned) throw new ConsultationError("item not owned", "Nie znaleziono punktu.");

  await db
    .update(schema.consultationActionItems)
    .set({ status: args.status, resolvedAt: args.status === "resolved" ? new Date() : null })
    .where(eq(schema.consultationActionItems.id, args.itemId));
}

/** Usuwa konsultację (kaskada kasuje punkty). Tenant-scope: trainerId. */
export async function deleteConsultation(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<boolean> {
  const rows = await db
    .delete(schema.consultations)
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .returning({ id: schema.consultations.id });
  return rows.length > 0;
}
```

Uwaga: `insertItems` przyjmuje `tx: Db` — w repo używamy typu `Db` także dla obiektu transakcji (jak w innych modułach repo).

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck` i `npm run lint`
Expected: PASS. Jeśli typ transakcji nie pasuje do `Db`, sprawdź sygnaturę `db.transaction` w `app/lib/db/client.ts` i dopasuj typ parametru `tx` (Context7: drizzle-orm „transactions”).

- [ ] **Step 3: Napisz test integracyjny (NIE uruchamiaj)**

Create `tests/consultations.itest.ts`. Wzoruj się na strukturze testcontainers (uruchamia właściciel). Pokryj krytyczne przepływy:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import {
  countOpenItemsForTrainee,
  createConsultation,
  deleteConsultation,
  getConsultationDetail,
  listConsultationsForTrainee,
  setActionItemStatus,
  updateConsultation,
} from "~/lib/consultations";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let trainerA = "";
let traineeA = "";
let trainerB = "";
let traineeB = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [tA] = await db.insert(schema.users).values({
    email: "trenera@example.com", displayName: "Trener A", role: "trainer",
  }).returning({ id: schema.users.id });
  trainerA = tA!.id;
  const [pA] = await db.insert(schema.users).values({
    email: "podoa@example.com", displayName: "Podo A", role: "trainee", trainerId: trainerA,
  }).returning({ id: schema.users.id });
  traineeA = pA!.id;
  const [tB] = await db.insert(schema.users).values({
    email: "trenerb@example.com", displayName: "Trener B", role: "trainer",
  }).returning({ id: schema.users.id });
  trainerB = tB!.id;
  const [pB] = await db.insert(schema.users).values({
    email: "podob@example.com", displayName: "Podo B", role: "trainee", trainerId: trainerB,
  }).returning({ id: schema.users.id });
  traineeB = pB!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

const form = {
  heldOn: "2026-05-20",
  periodFrom: "2026-05-01",
  periodTo: "2026-05-19",
  title: "Maj",
  summary: "OK",
  items: [
    { body: "Łokcie", status: "open" as const },
    { body: "Tempo", status: "resolved" as const },
  ],
};

describe("consultations repo", () => {
  it("tworzy konsultację z punktami w kolejności", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const detail = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(detail).not.toBeNull();
    expect(detail!.items.map((i) => i.body)).toEqual(["Łokcie", "Tempo"]);
    expect(detail!.items[0]!.ordinal).toBe(0);
    expect(detail!.items[1]!.resolvedAt).not.toBeNull();
  });

  it("nie pozwala obcemu trenerowi odczytać konsultacji (404 → null)", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const asB = await getConsultationDetail(db, { consultationId: id, trainerId: trainerB });
    expect(asB).toBeNull();
  });

  it("nie pozwala obcemu podopiecznemu odczytać konsultacji", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const asPB = await getConsultationDetail(db, { consultationId: id, traineeId: traineeB });
    expect(asPB).toBeNull();
  });

  it("blokuje tworzenie konsultacji dla cudzego podopiecznego", async () => {
    await expect(
      createConsultation(db, { trainerId: trainerB, traineeId: traineeA, form }),
    ).rejects.toThrow();
  });

  it("setActionItemStatus ustawia/zeruje resolved_at i pilnuje właściciela", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const detail = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    const openItem = detail!.items.find((i) => i.status === "open")!;
    await setActionItemStatus(db, { trainerId: trainerA, itemId: openItem.id, status: "resolved" });
    const after = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(after!.items.find((i) => i.id === openItem.id)!.resolvedAt).not.toBeNull();
    await expect(
      setActionItemStatus(db, { trainerId: trainerB, itemId: openItem.id, status: "open" }),
    ).rejects.toThrow();
  });

  it("countOpenItemsForTrainee liczy otwarte punkty", async () => {
    const n = await countOpenItemsForTrainee(db, traineeA);
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it("update wymienia punkty", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    await updateConsultation(db, {
      trainerId: trainerA,
      consultationId: id,
      form: { ...form, items: [{ body: "Nowy", status: "open" }] },
    });
    const detail = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(detail!.items.map((i) => i.body)).toEqual(["Nowy"]);
  });

  it("delete kasuje konsultację i kaskadowo punkty", async () => {
    const id = await createConsultation(db, { trainerId: trainerA, traineeId: traineeA, form });
    const ok = await deleteConsultation(db, { trainerId: trainerA, consultationId: id });
    expect(ok).toBe(true);
    const gone = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(gone).toBeNull();
  });
});
```

> Jeśli istnieje już inny `*.itest.ts` w `tests/`, dopasuj boilerplate (kontener, migracje, `citext`) do tamtego zamiast powielać. Sprawdź też ścieżkę folderu migracji w `drizzle.config.ts`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. **Testu integracyjnego NIE uruchamiaj** (Docker — robi właściciel: `npm run test:itest`).

- [ ] **Step 5: Review + security-review**

`/code-review` oraz `/security-review` (dotyka `trainer_id`/tenant-scope). Po akceptacji → kolejny task.

---

## Task 4: Ikona + wpisy tras + przycisk u trenera

**Files:**
- Modify: `app/components/icons.tsx`
- Modify: `app/routes.ts`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx`

- [ ] **Step 1: Dodaj ikonę `Consult`**

W `app/components/icons.tsx`, w obiekcie `Icons` (np. po `Note`), dodaj:

```tsx
  Consult: makeIcon(
    <>
      <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>,
  ),
```

- [ ] **Step 2: Dodaj wpisy tras**

W `app/routes.ts`, w bloku `prefix("trener", [...])` wewnątrz layoutu, po trasach `podopieczni/:traineeId/statystyki`, dodaj:

```ts
      route(
        "podopieczni/:traineeId/konsultacje",
        "routes/trener/podopieczni.$traineeId.konsultacje._index.tsx",
      ),
      route(
        "podopieczni/:traineeId/konsultacje/nowa",
        "routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx",
      ),
      route(
        "podopieczni/:traineeId/konsultacje/:konsultacjaId",
        "routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx",
      ),
```

W bloku `prefix("podopieczny", [...])` wewnątrz layoutu, po `route("sylwetka", ...)`, dodaj:

```ts
      route("konsultacje", "routes/podopieczny/konsultacje._index.tsx"),
      route("konsultacje/:konsultacjaId", "routes/podopieczny/konsultacje.$konsultacjaId.tsx"),
```

- [ ] **Step 3: Dodaj przycisk „Konsultacje" u trenera**

W `app/routes/trener/podopieczni.$traineeId.tsx`, w nagłówkowym `<div className="row" style={{ gap: 8 }}>` (obecnie linie ~165–180, z przyciskami Statystyki/Sylwetka), dodaj przycisk między „Sylwetka" a „Nowy plan":

```tsx
          <Link
            to={`/trener/podopieczni/${trainee.id}/konsultacje`}
            className="btn"
          >
            <Icons.Consult /> Konsultacje
          </Link>
```

(`Icons` jest już importowane w tym pliku.)

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck` i `npm run lint`
Expected: PASS. (Trasy wskazują na pliki tworzone w Taskach 5–6 — RR7 typegen może zgłosić brak plików; utwórz puste pliki-zaślepki dopiero w kolejnych taskach lub wykonaj Task 4 razem z 5–6. Jeśli typegen blokuje, najpierw utwórz pliki tras z minimalnym `export default function(){return null}` i wypełnij w Taskach 5–6.)

- [ ] **Step 5: Review**

`/code-review`. Po akceptacji → kolejny task.

---

## Task 5: UI trenera (lista + formularz + szczegóły) — `frontend-design`

> **Prowadzi `frontend-design:frontend-design`.** Poniższy kod to funkcjonalny szkielet (loadery/akcje są wiążące — to logika i autoryzacja). Warstwę wizualną (klasy z `tokens.css`, `.card`, `.btn`, `.list`, `.empty`, `.crumbs`, `.pagehead`) dopracuj zgodnie z `design-system/README.md`, wzorując się na `podopieczni.$traineeId.sylwetka.tsx`.

**Files:**
- Create: `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx`
- Create: `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx`
- Create: `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx`

- [ ] **Step 1: Lista konsultacji (trener)**

Create `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx`:

```tsx
import { and, eq } from "drizzle-orm";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { listConsultationsForTrainee } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";

  const [trainee] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (!trainee) throw new Response("not found", { status: 404 });

  const consultations = await listConsultationsForTrainee(db, traineeId, { limit: 200 });
  return { trainee, consultations };
}

export default function TrenerKonsultacjeList() {
  const { trainee, consultations } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Konsultacje</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>{trainee.displayName}</div>
          <h1>Konsultacje</h1>
          <div className="sub">
            {consultations.length === 0
              ? "Jeszcze brak konsultacji."
              : `${consultations.length} udokumentowanych spotkań`}
          </div>
        </div>
        <Link
          to={`/trener/podopieczni/${trainee.id}/konsultacje/nowa`}
          className="btn btn-primary"
        >
          <Icons.Plus /> Nowa konsultacja
        </Link>
      </div>

      {consultations.length === 0 ? (
        <div className="empty">
          <h3>Brak konsultacji</h3>
          <div>Dodaj pierwszą, by udokumentować ustalenia ze spotkania.</div>
        </div>
      ) : (
        <div className="list">
          {consultations.map((c) => (
            <Link
              key={c.id}
              to={`/trener/podopieczni/${trainee.id}/konsultacje/${c.id}`}
              className="list-row"
            >
              <div className="mono text-xs muted">{fmtDate(c.heldOn)}</div>
              <div style={{ flex: 1 }}>
                <strong>{c.title}</strong>
                {c.periodFrom && c.periodTo && (
                  <span className="text-xs muted">
                    {" "}· okres {fmtDate(c.periodFrom)}–{fmtDate(c.periodTo)}
                  </span>
                )}
              </div>
              <div className="text-xs muted">
                {c.openItemCount > 0
                  ? `${c.openItemCount} do poprawy`
                  : c.totalItemCount > 0
                    ? "wszystko poprawione"
                    : "—"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Formularz nowej konsultacji**

Create `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx`:

```tsx
import { and, eq } from "drizzle-orm";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { ConsultationFormSchema } from "~/lib/consultation-types";
import { ConsultationError, createConsultation } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { todayISO } from "~/lib/format";
import { parseConsultationFormData } from "~/lib/consultation-form.server";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const [trainee] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (!trainee) throw new Response("not found", { status: 404 });
  return { trainee, today: todayISO() };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const fd = await args.request.formData();
  const parsed = ConsultationFormSchema.safeParse(parseConsultationFormData(fd));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
  }
  try {
    await createConsultation(db, { trainerId: user.id, traineeId, form: parsed.data });
  } catch (e) {
    if (e instanceof ConsultationError) return { error: e.userMessage };
    throw e;
  }
  throw redirect(`/trener/podopieczni/${traineeId}/konsultacje`);
}

export default function TrenerKonsultacjaNowa() {
  const { trainee, today } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <div>
      <div className="crumbs">
        <Link to={`/trener/podopieczni/${trainee.id}/konsultacje`}>Konsultacje</Link>
        <span className="sep">›</span>
        <span className="current">Nowa</span>
      </div>
      <div className="pagehead">
        <h1>Nowa konsultacja</h1>
      </div>
      {actionData?.error && (
        <p role="alert" style={{ color: "var(--danger)", marginBottom: 14 }}>{actionData.error}</p>
      )}
      <ConsultationForm defaultHeldOn={today} />
    </div>
  );
}
```

> **`ConsultationForm`** to współdzielony komponent edycji (data, okres od–do, tytuł, summary, dynamiczna lista punktów z polem `status` jako hidden + checkboxem). Wydziel go do `app/components/consultation-form.tsx` i użyj w Step 1/3 tego taska. Dynamiczne dodawanie/usuwanie punktów po stronie klienta (`useState`), serializacja punktów jak niżej. **Projekt komponentu prowadzi `frontend-design`.**

- [ ] **Step 3: Helper parsowania FormData (server)**

Create `app/lib/consultation-form.server.ts`:

```ts
/**
 * Buduje surowy obiekt formularza konsultacji z FormData, gotowy do walidacji
 * przez ConsultationFormSchema. Punkty przychodzą jako równoległe pola
 * `itemBody[]` i `itemStatus[]` (ten sam ordinal = ten sam indeks).
 */
export function parseConsultationFormData(fd: FormData) {
  const bodies = fd.getAll("itemBody").map((v) => String(v));
  const statuses = fd.getAll("itemStatus").map((v) => String(v));
  const items = bodies
    .map((body, i) => ({ body, status: statuses[i] === "resolved" ? "resolved" : "open" }))
    .filter((it) => it.body.trim().length > 0);

  const periodFrom = String(fd.get("periodFrom") ?? "").trim() || null;
  const periodTo = String(fd.get("periodTo") ?? "").trim() || null;

  return {
    heldOn: String(fd.get("heldOn") ?? ""),
    periodFrom,
    periodTo,
    title: String(fd.get("title") ?? ""),
    summary: String(fd.get("summary") ?? ""),
    items,
  };
}
```

- [ ] **Step 4: Szczegóły + edycja + status + usuwanie**

Create `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx`. Loader ładuje detail przez `getConsultationDetail({ consultationId, trainerId })` (null → 404). Action obsługuje 3 intencje:

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
import { ConsultationFormSchema } from "~/lib/consultation-types";
import {
  ConsultationError,
  deleteConsultation,
  getConsultationDetail,
  setActionItemStatus,
  updateConsultation,
} from "~/lib/consultations";
import { parseConsultationFormData } from "~/lib/consultation-form.server";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const detail = await getConsultationDetail(db, {
    consultationId: args.params.konsultacjaId ?? "",
    trainerId: user.id,
  });
  if (!detail) throw new Response("not found", { status: 404 });
  return { detail, traineeId: args.params.traineeId ?? "" };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const consultationId = args.params.konsultacjaId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  try {
    if (intent === "delete") {
      await deleteConsultation(db, { trainerId: user.id, consultationId });
      throw redirect(`/trener/podopieczni/${traineeId}/konsultacje`);
    }
    if (intent === "toggle-item") {
      const itemId = String(fd.get("itemId") ?? "");
      const status = fd.get("status") === "resolved" ? "resolved" : "open";
      await setActionItemStatus(db, { trainerId: user.id, itemId, status });
      return null;
    }
    if (intent === "update") {
      const parsed = ConsultationFormSchema.safeParse(parseConsultationFormData(fd));
      if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      }
      await updateConsultation(db, { trainerId: user.id, consultationId, form: parsed.data });
      return { success: "Zapisano." };
    }
    return null;
  } catch (e) {
    if (e instanceof Response) throw e;
    if (e instanceof ConsultationError) return { error: e.userMessage };
    throw e;
  }
}
```

Komponent: tryb podglądu (data, okres, summary, lista punktów z przyciskiem toggle statusu — `Form method="post"` z `intent=toggle-item`, `itemId`, docelowy `status`) + tryb edycji (`?edit=1`, używa `ConsultationForm` z `intent=update`) + usuwanie (`ConfirmSubmitButton` z `intent=delete`, wzorem `DeletePlanForm`). **Layout i interakcje prowadzi `frontend-design`.**

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck` i `npm run lint`
Expected: PASS.

- [ ] **Step 6: Review**

`/code-review` + `/security-review` (loadery/akcje tenant-scope). Po akceptacji → kolejny task.

---

## Task 6: UI podopiecznego (nav + lista + szczegóły read-only) — `frontend-design`

> **Prowadzi `frontend-design:frontend-design`.** Widoki read-only; mobile-first.

**Files:**
- Modify: `app/routes/podopieczny/_layout.tsx`
- Create: `app/routes/podopieczny/konsultacje._index.tsx`
- Create: `app/routes/podopieczny/konsultacje.$konsultacjaId.tsx`

- [ ] **Step 1: Nav + badge w layoucie**

W `app/routes/podopieczny/_layout.tsx`:
- import: `import { countOpenItemsForTrainee } from "~/lib/consultations";`
- w `loader`, po policzeniu zdjęć, dodaj:

```ts
  const openItems = await countOpenItemsForTrainee(db, user.id);
```

- w zwracanym `tails` dodaj `consultations: openItems`.
- w `NAV_ITEMS` dodaj po „Sylwetka":

```ts
  { to: "/podopieczny/konsultacje", label: "Konsultacje", end: false, icon: "Consult" as const, tailKey: "consultations" as const },
```

(`tailKey` „consultations" pokazuje liczbę otwartych punktów „do poprawy" jako badge; istniejący render `nav-tail` to obsłuży.)

- [ ] **Step 2: Lista (read-only)**

Create `app/routes/podopieczny/konsultacje._index.tsx`:

```tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { listConsultationsForTrainee } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";

const PUNKT: PlForms = { one: "punkt", few: "punkty", many: "punktów" };

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const consultations = await listConsultationsForTrainee(db, user.id, { limit: 200 });
  return { consultations };
}

export default function PodopiecznyKonsultacje() {
  const { consultations } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Podopieczny</div>
          <h1>Konsultacje</h1>
          <div className="sub">
            {consultations.length === 0
              ? "Brak konsultacji."
              : "Ustalenia z Twoich spotkań z trenerem."}
          </div>
        </div>
      </div>
      {consultations.length === 0 ? (
        <div className="empty">
          <h3>Brak konsultacji</h3>
          <div>Pojawią się tu po pierwszym udokumentowanym spotkaniu.</div>
        </div>
      ) : (
        <div className="list">
          {consultations.map((c) => (
            <Link key={c.id} to={`/podopieczny/konsultacje/${c.id}`} className="list-row">
              <div className="mono text-xs muted">{fmtDate(c.heldOn)}</div>
              <div style={{ flex: 1 }}><strong>{c.title}</strong></div>
              {c.openItemCount > 0 && (
                <span className="badge">
                  {c.openItemCount} {pluralizePl(c.openItemCount, PUNKT)} do poprawy
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Szczegóły (read-only)**

Create `app/routes/podopieczny/konsultacje.$konsultacjaId.tsx`:

```tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { getConsultationDetail } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const detail = await getConsultationDetail(db, {
    consultationId: args.params.konsultacjaId ?? "",
    traineeId: user.id,
  });
  if (!detail) throw new Response("not found", { status: 404 });
  return { detail };
}

export default function PodopiecznyKonsultacjaDetail() {
  const { detail } = useLoaderData<typeof loader>();
  const { consultation: c, items } = detail;
  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/konsultacje">Konsultacje</Link>
        <span className="sep">›</span>
        <span className="current">{fmtDate(c.heldOn)}</span>
      </div>
      <div className="pagehead">
        <div>
          <h1>{c.title}</h1>
          <div className="sub">
            {fmtDate(c.heldOn)}
            {c.periodFrom && c.periodTo && (
              <> · okres {fmtDate(c.periodFrom)}–{fmtDate(c.periodTo)}</>
            )}
          </div>
        </div>
      </div>

      {c.summary && (
        <div className="card" style={{ marginBottom: 14, whiteSpace: "pre-wrap" }}>
          {c.summary}
        </div>
      )}

      <h2 style={{ margin: "20px 0 12px", fontSize: 17 }}>Do poprawy</h2>
      {items.length === 0 ? (
        <div className="empty"><div>Brak punktów do poprawy z tej konsultacji.</div></div>
      ) : (
        <div className="list">
          {items.map((it) => (
            <div key={it.id} className="list-row">
              <span style={{ color: it.status === "resolved" ? "var(--ok)" : "var(--muted)" }}>
                {it.status === "resolved" ? <Icons.Check /> : <Icons.Dot />}
              </span>
              <div style={{ flex: 1, opacity: it.status === "resolved" ? 0.6 : 1 }}>
                {it.body}
              </div>
              <span className="text-xs muted">
                {it.status === "resolved" ? "poprawione" : "otwarte"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run typecheck`, `npm run lint`, `npm run build`
Expected: PASS (build potwierdza, że wszystkie trasy z Taska 4 mają pliki).

- [ ] **Step 5: Review**

`/code-review` + `/security-review`. Po akceptacji → kolejny task.

---

## Task 7: Dokumentacja

**Files:**
- Modify: `app/lib/README.md`
- Modify: `app/routes/trener/README.md`
- Modify: `app/routes/podopieczny/README.md`

- [ ] **Step 1: `app/lib/README.md`** — w tabeli plików dodaj wiersze:

```
| `consultation-types.ts` | Schematy Zod formularza konsultacji: `ConsultationFormSchema`, `ActionItemFormSchema` + typy. |
| `consultation-form.server.ts` | Parsowanie FormData konsultacji do obiektu walidowanego Zodem: `parseConsultationFormData`. |
| `consultations.ts` | Repozytorium konsultacji (tenant-scope): list/count/detail, `createConsultation`, `updateConsultation`, `setActionItemStatus`, `deleteConsultation`, `countOpenItemsForTrainee`, `ConsultationError`. |
```

- [ ] **Step 2: `app/routes/trener/README.md`** — dodaj trasy konsultacji do mapy URL→plik (lista, nowa, szczegóły) z krótkim opisem (autor: trener).

- [ ] **Step 3: `app/routes/podopieczny/README.md`** — dodaj trasy `konsultacje` (lista) i `konsultacje/:konsultacjaId` (szczegóły read-only) oraz nowy element nawigacji „Konsultacje" w opisie layoutu.

- [ ] **Step 4: Sanity** — `CLAUDE.md` mapa projektu bez zmian (brak nowych katalogów). Sprawdź, że opisy są zwięzłe i prawdziwe.

- [ ] **Step 5: Review**

`/code-review` (dokumentacja). Po akceptacji → bramki końcowe.

---

## Bramki końcowe (z dowodem)

- [ ] `npm run test:unit` — zielone (Task 2).
- [ ] `npm run typecheck` — zielone.
- [ ] `npm run lint` — zielone.
- [ ] `npm run build` — zielone.
- [ ] Dokumentacja zaktualizowana (Task 7).
- [ ] `/code-review` na całości diffu.
- [ ] `/security-review` (feature dotyka `trainer_id`/tenant-scope).
- [ ] Testy integracyjne `tests/consultations.itest.ts` — **zaraportuj właścicielowi** do uruchomienia: `npm run test:itest` (Docker).

## Handoff (granica gita/Dockera — właściciel)

Na końcu wypisz:
- Podsumowanie + lista zmienionych/nowych plików.
- Proponowany komunikat commita (np. `feat: moduł konsultacji trener↔podopieczny`).
- **Migracja:** `npm run db:generate` już wykonane (nowy plik w `migrations/`); właściciel uruchamia `npm run db:migrate`. Brak nowych env, brak zmian w seedzie.
- Testy do uruchomienia pod Dockerem: `npm run test:itest`.
- Ścieżka ręcznej weryfikacji: jako trener wejdź na podopiecznego → „Konsultacje" → „Nowa konsultacja" (data, okres, tytuł, summary, punkty) → zapis; otwórz szczegóły, oznacz punkt „poprawione"; jako podopieczny sprawdź listę „Konsultacje" (badge otwartych punktów) i widok read-only.
```
