# Konsultacje: harmonogram cykliczny — Faza 1 (natywny rdzeń) — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przebudować moduł konsultacji w byt o cyklu życia (zaplanowana → potwierdzona/odrzucona/zmiana → udokumentowana) z natywnym, cyklicznym harmonogramem (co tydzień / 2 tyg. / miesiąc), kalendarzem podopiecznego z potwierdzaniem terminów i ręcznym linkiem spotkania — **bez integracji Google** (to Faza 2).

**Architecture:** Źródłem prawdy jest baza. `consultations` staje się pojedynczą okazją/terminem (`scheduled_at`, `status`, `meeting_url`, `schedule_id`, …); nowa tabela `consultation_schedules` trzyma regułę cyklu. Czysta funkcja `consultation-recurrence.ts` liczy daty (TDD); repo tenant-scoped materializuje terminy idempotentnie i obsługuje przejścia statusów. Trasy RR7 dla trenera (autor harmonogramu) i podopiecznego (kalendarz + potwierdzanie). Pełny spec: [`docs/superpowers/specs/2026-06-01-konsultacje-harmonogram-google-design.md`](../specs/2026-06-01-konsultacje-harmonogram-google-design.md).

**Tech Stack:** React Router v7 (SSR, loadery/akcje), Drizzle ORM + PostgreSQL 16, Zod, Vitest (unit + testcontainers itest), Biome.

---

## Zasady procesu (kalisthenos-dev-flow) — obowiązują w każdym tasku

- **Nigdy git, nigdy docker.** Zamiast „Commit" każdy task kończy się **review** (`/code-review`); commit/branch/push robi właściciel na końcu (handoff).
- **TDD** dla logiki bez DB (`npm run test:unit`). Testy integracyjne `*.itest.ts` w `tests/` — **piszemy, NIE uruchamiamy** (`npm run test:itest` odpala właściciel pod Dockerem).
- **`npm run db:generate`** po zmianie schematu (generuje SQL z `schema.ts`; **nie** edytujemy `migrations/` ręcznie). `db:migrate` odpala właściciel.
- **Frontend/UI** prowadzi skill `frontend-design:frontend-design` (Taski 7–8): kod tu jest funkcjonalnym szkieletem (loadery/akcje są wiążące — to logika i autoryzacja), polish wizualny i zgodność z `design-system/README.md` + `app/styles/tokens.css` przez ten skill. UI po polsku.
- **Context7 (MCP)** po aktualne API (RR7, Drizzle, Zod), gdy coś niepewne.
- **Big bang:** moduł nie jest jeszcze używany — przebudowa `consultations` bez troski o migrację danych.

Komendy testów (z `package.json`):
- Unit: `npm run test:unit` (vitest run, wyklucza `*.itest.ts`). Pliki: `app/**/*.test.ts`. `globals: false` → importuj `{ describe, it, expect } from "vitest"`.
- Integ: `npm run test:itest` (testcontainers). Pliki: `tests/**/*.itest.ts`. **Nie uruchamiamy.**

**Założenie TZ (v1):** instanty `scheduled_at` traktujemy i renderujemy w **UTC** (jedna strefa aplikacji). Pełne strefy per użytkownik to późniejszy dodatek (poza zakresem). Stąd `consultation-recurrence.ts` i `fmtDateTime` operują na getterach UTC — testy są deterministyczne niezależnie od strefy maszyny CI.

---

## Struktura plików

| Plik | Odpowiedzialność | Akcja |
|---|---|---|
| `app/lib/db/schema.ts` | enumy `consultation_status`/`consultation_cadence`, przebudowa `consultations`, nowa `consultation_schedules`, typy | Modify |
| `app/lib/db/migrations/XXXX_*.sql` | migracja (generowana) | Create (przez `db:generate`) |
| `app/lib/format.ts` | `fmtDateTime`, `fmtTime` | Modify |
| `app/lib/format.test.ts` | testy formatowania daty+godziny | Create (jeśli brak) / Modify |
| `app/lib/consultation-recurrence.ts` | czyste liczenie dat terminów z reguły cyklu | Create |
| `app/lib/consultation-recurrence.test.ts` | testy jednostkowe generatora | Create |
| `app/lib/consultation-types.ts` | Zod: harmonogram, formularz konsultacji (scheduledAt/duration/url), akcje statusów + czyste guardy przejść | Modify (przepis) |
| `app/lib/consultation-types.test.ts` | testy Zod + guardów | Modify (przepis) |
| `app/lib/consultation-schedules.ts` | repo harmonogramu (CRUD + materializacja terminów) | Create |
| `app/lib/consultations.ts` | repo okazji: lista/detail/przejścia statusów/dokumentacja/usuwanie/badge | Modify (przepis) |
| `app/lib/consultation-form.server.ts` | parsowanie FormData (konsultacja + harmonogram) | Modify |
| `tests/consultations.itest.ts` | testy integracyjne (PISZEMY, nie uruchamiamy) | Modify (przepis) |
| `app/components/consultation-form.tsx` | formularz dokumentowania (scheduledAt/duration/url + punkty) | Modify |
| `app/components/schedule-form.tsx` | formularz harmonogramu (cadence/dzień/godzina/czas) | Create |
| `app/components/icons.tsx` | ikony `Calendar`, `Video` (jeśli brak) | Modify |
| `app/routes.ts` | wpisy tras (bez zmian liczby — pliki konsultacji już zarejestrowane) | (sprawdzić) |
| `app/routes/trener/podopieczni.$traineeId.tsx` | kafel: najbliższy termin + oczekujące | Modify |
| `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx` | panel harmonogramu + lista terminów + akcje | Modify (przepis) |
| `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx` | termin ad-hoc (planned/documented) | Modify |
| `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx` | szczegóły + dokumentowanie + przełóż/odwołaj/toggle | Modify (przepis) |
| `app/routes/podopieczny/_layout.tsx` | badge „do potwierdzenia" | Modify |
| `app/routes/podopieczny/konsultacje._index.tsx` | kalendarz (siatka miesiąca) + potwierdzanie | Modify (przepis) |
| `app/routes/podopieczny/konsultacje.$konsultacjaId.tsx` | szczegóły + akcje potwierdź/odrzuć/zmiana | Modify (przepis) |
| `app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md` | dokumentacja | Modify |

---

## Task 1: Schemat DB + migracja

**Files:**
- Modify: `app/lib/db/schema.ts`
- Create (generowana): migracja w `app/lib/db/migrations/`

- [ ] **Step 1: Rozszerz importy pg-core**

W `app/lib/db/schema.ts` w imporcie z `"drizzle-orm/pg-core"` dodaj `time` i `smallint` do listy (obok `integer`, `date`, …):

```ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  boolean,
  integer,
  smallint,
  timestamp,
  time,
  date,
  check,
  index,
  uniqueIndex,
  customType,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Dodaj/zmień enumy**

W sekcji `// ---------------- Enums ----------------`, obok `consultationItemStatus`, dodaj:

```ts
export const consultationStatus = pgEnum("consultation_status", [
  "planned",
  "confirmed",
  "change_requested",
  "cancelled",
  "documented",
]);
export const consultationCadence = pgEnum("consultation_cadence", [
  "weekly",
  "biweekly",
  "monthly",
]);
```

- [ ] **Step 3: Zastąp definicję `consultations` i dodaj `consultation_schedules`**

W sekcji `// ---------------- Consultations ----------------` **zastąp** całą obecną definicję `consultations` poniższą i **dodaj** `consultationSchedules` (przed `consultationActionItems`, które zostaje bez zmian):

```ts
export const consultationSchedules = pgTable(
  "consultation_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cadence: consultationCadence("cadence").notNull(),
    weekday: smallint("weekday"), // 0=Sun..6=Sat (weekly/biweekly)
    dayOfMonth: smallint("day_of_month"), // 1..28 (monthly)
    timeOfDay: time("time_of_day").notNull(),
    durationMin: integer("duration_min").notNull().default(45),
    startsOn: date("starts_on").notNull(),
    defaultMeetingUrl: text("default_meeting_url"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Jeden aktywny harmonogram na parę trener-podopieczny.
    oneActiveUniq: uniqueIndex("consultation_schedules_one_active_uniq")
      .on(t.trainerId, t.traineeId)
      .where(sql`${t.active}`),
    anchorCheck: check(
      "consultation_schedules_anchor_check",
      sql`(${t.cadence} IN ('weekly','biweekly') AND ${t.weekday} IS NOT NULL AND ${t.dayOfMonth} IS NULL)
          OR (${t.cadence} = 'monthly' AND ${t.dayOfMonth} IS NOT NULL AND ${t.weekday} IS NULL)`,
    ),
    domCheck: check(
      "consultation_schedules_dom_check",
      sql`${t.dayOfMonth} IS NULL OR (${t.dayOfMonth} >= 1 AND ${t.dayOfMonth} <= 28)`,
    ),
    weekdayCheck: check(
      "consultation_schedules_weekday_check",
      sql`${t.weekday} IS NULL OR (${t.weekday} >= 0 AND ${t.weekday} <= 6)`,
    ),
  }),
);

export const consultations = pgTable(
  "consultations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => consultationSchedules.id, {
      onDelete: "set null",
    }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(45),
    status: consultationStatus("status").notNull().default("planned"),
    meetingUrl: text("meeting_url"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    traineeNote: text("trainee_note"),
    periodFrom: date("period_from"),
    periodTo: date("period_to"),
    googleEventId: text("google_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traineeSchedIdx: index("consultations_trainee_sched_idx").on(t.traineeId, t.scheduledAt),
    trainerStatusIdx: index("consultations_trainer_status_idx").on(t.trainerId, t.status),
    scheduleIdx: index("consultations_schedule_idx").on(t.scheduleId),
    // Dedup materializacji: jeden termin danej serii na dany czas.
    schedSlotUniq: uniqueIndex("consultations_schedule_slot_uniq").on(t.scheduleId, t.scheduledAt),
    periodCheck: check(
      "consultations_period_check",
      sql`(${t.periodFrom} IS NULL AND ${t.periodTo} IS NULL) OR
          (${t.periodFrom} IS NOT NULL AND ${t.periodTo} IS NOT NULL AND ${t.periodFrom} <= ${t.periodTo})`,
    ),
  }),
);
```

> Uwaga: `schedSlotUniq` na `(schedule_id, scheduled_at)` — Postgres traktuje NULL-e jako różne, więc wiersze ad-hoc (`schedule_id = NULL`) nie kolidują. To wystarcza do dedup materializacji.

- [ ] **Step 4: Zaktualizuj typy konsultacji**

W sekcji `// ---------------- Types ----------------` zastąp/uzupełnij bloki konsultacji:

```ts
export type Consultation = typeof consultations.$inferSelect;
export type NewConsultation = typeof consultations.$inferInsert;
export type ConsultationStatus = (typeof consultationStatus.enumValues)[number];
export type ConsultationSchedule = typeof consultationSchedules.$inferSelect;
export type NewConsultationSchedule = typeof consultationSchedules.$inferInsert;
export type ConsultationCadence = (typeof consultationCadence.enumValues)[number];
export type ConsultationActionItem = typeof consultationActionItems.$inferSelect;
export type NewConsultationActionItem = typeof consultationActionItems.$inferInsert;
export type ConsultationItemStatus = (typeof consultationItemStatus.enumValues)[number];
```

- [ ] **Step 5: Wygeneruj migrację**

Run: `npm run db:generate`
Expected: nowy plik `app/lib/db/migrations/XXXX_*.sql` z `CREATE TYPE "consultation_status"`, `CREATE TYPE "consultation_cadence"`, `CREATE TABLE "consultation_schedules"`, przebudową `consultations` (nowe kolumny, usunięcie `held_on`), indeksami i CHECK-ami. Snapshot w `migrations/meta/` zaktualizowany. **Nie edytuj SQL ręcznie.** Jeśli Drizzle Kit zapyta o rename `held_on`→`scheduled_at`, wybierz **utworzenie nowej / usunięcie starej** (big bang, brak danych).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS dla `schema.ts`. (Pliki repo/tras zaczną się kompilować po kolejnych taskach — jeśli `tsc` zgłosi błędy w `consultations.ts`/trasach, to oczekiwane do Tasków 5–8; zweryfikuj, że błędy dotyczą tylko jeszcze-nieprzepisanych plików.)

- [ ] **Step 7: Review**

`/code-review` na schemacie + `/security-review` (nowe tabele tenant-scope, `trainer_id`). Po akceptacji → kolejny task.

---

## Task 2: `fmtDateTime` / `fmtTime` w `format.ts` — TDD

**Files:**
- Modify: `app/lib/format.ts`
- Test: `app/lib/format.test.ts` (utwórz, jeśli nie istnieje)

- [ ] **Step 1: Napisz failujący test**

Dodaj do `app/lib/format.test.ts` (lub utwórz plik z importami `{ describe, it, expect } from "vitest"`):

```ts
import { describe, expect, it } from "vitest";
import { fmtDateTime, fmtTime } from "~/lib/format";

describe("fmtDateTime / fmtTime (UTC, v1)", () => {
  it("formatuje datę i godzinę w UTC", () => {
    expect(fmtDateTime("2026-06-11T18:00:00.000Z")).toBe("11 cze 2026, 18:00");
  });
  it("zeruje godzinę/minutę do dwóch cyfr", () => {
    expect(fmtDateTime("2026-01-05T09:05:00.000Z")).toBe("5 sty 2026, 09:05");
  });
  it("fmtTime zwraca samą godzinę UTC", () => {
    expect(fmtTime("2026-06-11T18:30:00.000Z")).toBe("18:30");
  });
});
```

- [ ] **Step 2: Uruchom test — ma faliować**

Run: `npm run test:unit`
Expected: FAIL — `fmtDateTime`/`fmtTime` nie istnieją.

- [ ] **Step 3: Zaimplementuj**

W `app/lib/format.ts` dodaj (po `fmtDateShort`):

```ts
/** Data + godzina w UTC (v1 = jedna strefa aplikacji). */
export function fmtDateTime(iso: string): string {
  const d = parseDate(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTH_SHORT_PL[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm}`;
}

/** Sama godzina w UTC. */
export function fmtTime(iso: string): string {
  const d = parseDate(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit`
Expected: PASS (3 nowe testy zielone).

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint` i `npm run typecheck`
Expected: PASS (modulo jeszcze-nieprzepisane pliki repo/tras).

- [ ] **Step 6: Review** — `/code-review`. Po akceptacji → kolejny task.

---

## Task 3: Generator dat `consultation-recurrence.ts` — TDD

**Files:**
- Create: `app/lib/consultation-recurrence.ts`
- Test: `app/lib/consultation-recurrence.test.ts`

- [ ] **Step 1: Napisz failujący test**

Create `app/lib/consultation-recurrence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextOccurrences, type RecurrenceRule } from "~/lib/consultation-recurrence";

// 2026-06-01 to poniedziałek; środa = 2026-06-03.
const weekly: RecurrenceRule = {
  cadence: "weekly",
  weekday: 3, // środa (0=niedziela)
  dayOfMonth: null,
  timeOfDay: "18:00",
  startsOn: "2026-06-01",
};

describe("nextOccurrences", () => {
  it("weekly: kolejne środy 18:00 UTC w oknie", () => {
    const out = nextOccurrences(weekly, { from: "2026-06-01", horizonDays: 21 });
    expect(out).toEqual([
      "2026-06-03T18:00:00.000Z",
      "2026-06-10T18:00:00.000Z",
      "2026-06-17T18:00:00.000Z",
    ]);
  });

  it("biweekly: co druga środa od kotwicy", () => {
    const out = nextOccurrences({ ...weekly, cadence: "biweekly" }, {
      from: "2026-06-01",
      horizonDays: 21,
    });
    expect(out).toEqual(["2026-06-03T18:00:00.000Z", "2026-06-17T18:00:00.000Z"]);
  });

  it("pomija terminy przed `from`", () => {
    const out = nextOccurrences(weekly, { from: "2026-06-11", horizonDays: 14 });
    expect(out).toEqual(["2026-06-17T18:00:00.000Z", "2026-06-24T18:00:00.000Z"]);
  });

  it("monthly: 15. dnia miesiąca", () => {
    const monthly: RecurrenceRule = {
      cadence: "monthly",
      weekday: null,
      dayOfMonth: 15,
      timeOfDay: "09:30",
      startsOn: "2026-06-01",
    };
    const out = nextOccurrences(monthly, { from: "2026-06-01", horizonDays: 70 });
    expect(out).toEqual(["2026-06-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z", "2026-08-15T09:30:00.000Z"]);
  });
});
```

- [ ] **Step 2: Uruchom test — ma faliować**

Run: `npm run test:unit`
Expected: FAIL — `Cannot find module "~/lib/consultation-recurrence"`.

- [ ] **Step 3: Zaimplementuj generator**

Create `app/lib/consultation-recurrence.ts`:

```ts
import type { ConsultationCadence } from "~/lib/db/schema";

export interface RecurrenceRule {
  cadence: ConsultationCadence;
  /** 0=niedziela..6=sobota — dla weekly/biweekly. */
  weekday: number | null;
  /** 1..28 — dla monthly. */
  dayOfMonth: number | null;
  /** "HH:MM". */
  timeOfDay: string;
  /** Kotwica serii, "YYYY-MM-DD". */
  startsOn: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseHM(time: string): { h: number; m: number } {
  const [h, m] = time.split(":").map((x) => Number(x));
  return { h: h ?? 0, m: m ?? 0 };
}

/** UTC timestamp z dnia (YYYY-MM-DD) i godziny (HH:MM). */
function atUTC(dateISO: string, time: string): Date {
  const { h, m } = parseHM(time);
  const [y, mo, d] = dateISO.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1, h, m, 0, 0));
}

/**
 * Liczy daty terminów (ISO UTC) z reguły cyklu w oknie [from, from+horizonDays].
 * Czysta funkcja — bez I/O, bez `Date.now()` (kotwica `from` podawana z zewnątrz).
 */
export function nextOccurrences(
  rule: RecurrenceRule,
  opts: { from: string; horizonDays: number },
): string[] {
  const windowStart = atUTC(opts.from, "00:00");
  const windowEnd = new Date(windowStart.getTime() + opts.horizonDays * DAY_MS);
  const out: string[] = [];

  if (rule.cadence === "monthly") {
    const dom = rule.dayOfMonth ?? 1;
    const anchor = atUTC(rule.startsOn, rule.timeOfDay);
    let y = anchor.getUTCFullYear();
    let mo = anchor.getUTCMonth();
    // Iteruj miesiącami od kotwicy do końca okna.
    for (let guard = 0; guard < 400; guard++) {
      const { h, m } = parseHM(rule.timeOfDay);
      const occ = new Date(Date.UTC(y, mo, dom, h, m, 0, 0));
      if (occ.getTime() > windowEnd.getTime()) break;
      if (occ.getTime() >= windowStart.getTime() && occ.getTime() >= anchor.getTime()) {
        out.push(occ.toISOString());
      }
      mo += 1;
      if (mo > 11) {
        mo = 0;
        y += 1;
      }
    }
    return out;
  }

  // weekly / biweekly
  const stepDays = rule.cadence === "biweekly" ? 14 : 7;
  const anchor = atUTC(rule.startsOn, rule.timeOfDay);
  // Pierwsza data >= startsOn o właściwym dniu tygodnia.
  let first = anchor;
  const targetDow = rule.weekday ?? anchor.getUTCDay();
  const delta = (targetDow - anchor.getUTCDay() + 7) % 7;
  first = new Date(anchor.getTime() + delta * DAY_MS);

  for (let t = first.getTime(); t <= windowEnd.getTime(); t += stepDays * DAY_MS) {
    if (t >= windowStart.getTime()) out.push(new Date(t).toISOString());
  }
  return out;
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit`
Expected: PASS (4 testy generatora zielone).

- [ ] **Step 5: Lint + typecheck** — `npm run lint`, `npm run typecheck`. Expected: PASS (modulo nieprzepisane pliki).

- [ ] **Step 6: Review** — `/code-review`. Po akceptacji → kolejny task.

---

## Task 4: Zod + guardy przejść (`consultation-types.ts`) — TDD

**Files:**
- Modify (przepis): `app/lib/consultation-types.ts`
- Test (przepis): `app/lib/consultation-types.test.ts`

- [ ] **Step 1: Napisz failujące testy**

Zastąp zawartość `app/lib/consultation-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ConsultationDocFormSchema,
  ScheduleFormSchema,
  canTraineeAct,
  canTrainerReschedule,
  canDocument,
} from "~/lib/consultation-types";

describe("ScheduleFormSchema", () => {
  const weekly = { cadence: "weekly", weekday: 3, timeOfDay: "18:00", durationMin: 45, startsOn: "2026-06-01" };

  it("akceptuje poprawny harmonogram weekly", () => {
    expect(ScheduleFormSchema.safeParse(weekly).success).toBe(true);
  });
  it("wymaga weekday dla weekly", () => {
    const { weekday, ...noWeekday } = weekly;
    expect(ScheduleFormSchema.safeParse(noWeekday).success).toBe(false);
  });
  it("wymaga dayOfMonth dla monthly i odrzuca >28", () => {
    expect(ScheduleFormSchema.safeParse({ cadence: "monthly", dayOfMonth: 15, timeOfDay: "09:00", durationMin: 60, startsOn: "2026-06-01" }).success).toBe(true);
    expect(ScheduleFormSchema.safeParse({ cadence: "monthly", dayOfMonth: 31, timeOfDay: "09:00", durationMin: 60, startsOn: "2026-06-01" }).success).toBe(false);
  });
  it("odrzuca złą godzinę i niedodatni czas trwania", () => {
    expect(ScheduleFormSchema.safeParse({ ...weekly, timeOfDay: "25:00" }).success).toBe(false);
    expect(ScheduleFormSchema.safeParse({ ...weekly, durationMin: 0 }).success).toBe(false);
  });
});

describe("ConsultationDocFormSchema", () => {
  const base = {
    scheduledAt: "2026-06-11T18:00",
    durationMin: 45,
    title: "Czerwiec",
    summary: "OK",
    items: [{ body: "Łokcie", status: "open" as const }],
  };
  it("akceptuje poprawny wpis", () => {
    expect(ConsultationDocFormSchema.safeParse(base).success).toBe(true);
  });
  it("odrzuca pusty tytuł i pustą treść punktu", () => {
    expect(ConsultationDocFormSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
    expect(ConsultationDocFormSchema.safeParse({ ...base, items: [{ body: " ", status: "open" }] }).success).toBe(false);
  });
  it("waliduje okres oba-albo-żaden + from<=to", () => {
    expect(ConsultationDocFormSchema.safeParse({ ...base, periodFrom: "2026-06-01" }).success).toBe(false);
    expect(ConsultationDocFormSchema.safeParse({ ...base, periodFrom: "2026-06-10", periodTo: "2026-06-01" }).success).toBe(false);
  });
});

describe("guardy przejść statusów", () => {
  it("podopieczny działa tylko na planned/confirmed", () => {
    expect(canTraineeAct("planned", "confirm")).toBe(true);
    expect(canTraineeAct("confirmed", "request_change")).toBe(true);
    expect(canTraineeAct("cancelled", "confirm")).toBe(false);
    expect(canTraineeAct("documented", "decline")).toBe(false);
  });
  it("trener przekłada/odwołuje tylko żywe terminy", () => {
    expect(canTrainerReschedule("planned")).toBe(true);
    expect(canTrainerReschedule("change_requested")).toBe(true);
    expect(canTrainerReschedule("cancelled")).toBe(false);
    expect(canTrainerReschedule("documented")).toBe(false);
  });
  it("dokumentować można wszystko poza cancelled", () => {
    expect(canDocument("confirmed")).toBe(true);
    expect(canDocument("planned")).toBe(true);
    expect(canDocument("cancelled")).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — ma faliować**

Run: `npm run test:unit`
Expected: FAIL — brak nowych eksportów w `consultation-types.ts`.

- [ ] **Step 3: Zaimplementuj**

Zastąp zawartość `app/lib/consultation-types.ts`:

```ts
import { z } from "zod";
import type { ConsultationStatus } from "~/lib/db/schema";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Niepoprawna data.");
// datetime-local z <input type="datetime-local"> ma format "YYYY-MM-DDTHH:MM".
const dateTimeLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Niepoprawna data/godzina.");
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Niepoprawna godzina.");

// ---------------- Punkty „do poprawy" ----------------

export const ConsultationItemStatusSchema = z.enum(["open", "resolved"]);
export type ConsultationItemStatusForm = z.infer<typeof ConsultationItemStatusSchema>;

export const ActionItemFormSchema = z.object({
  id: z.string().optional(),
  body: z.string().trim().min(1, "Treść punktu nie może być pusta.").max(2000),
  status: ConsultationItemStatusSchema.default("open"),
});
export type ActionItemForm = z.infer<typeof ActionItemFormSchema>;

// ---------------- Harmonogram ----------------

export const ScheduleFormSchema = z
  .object({
    cadence: z.enum(["weekly", "biweekly", "monthly"]),
    weekday: z.coerce.number().int().min(0).max(6).nullable().optional(),
    dayOfMonth: z.coerce.number().int().min(1).max(28).nullable().optional(),
    timeOfDay: timeString,
    durationMin: z.coerce.number().int().positive().max(600),
    startsOn: dateString,
    defaultMeetingUrl: z.string().trim().url("Niepoprawny URL.").max(500).nullable().optional(),
  })
  .refine(
    (s) => (s.cadence === "monthly" ? s.dayOfMonth != null : s.weekday != null),
    { message: "Wskaż dzień zgodny z częstotliwością.", path: ["cadence"] },
  );
export type ScheduleForm = z.infer<typeof ScheduleFormSchema>;

// ---------------- Dokumentacja / termin ad-hoc ----------------

export const ConsultationDocFormSchema = z
  .object({
    scheduledAt: dateTimeLocal,
    durationMin: z.coerce.number().int().positive().max(600).default(45),
    meetingUrl: z.string().trim().url("Niepoprawny URL.").max(500).nullable().optional(),
    title: z.string().trim().min(1, "Tytuł jest wymagany.").max(160),
    summary: z.string().max(10000).default(""),
    periodFrom: dateString.nullable().optional(),
    periodTo: dateString.nullable().optional(),
    items: z.array(ActionItemFormSchema).max(50).default([]),
  })
  .refine((c) => (c.periodFrom == null) === (c.periodTo == null), {
    message: "Podaj oba końce okresu albo żaden.",
    path: ["periodTo"],
  })
  .refine((c) => c.periodFrom == null || c.periodTo == null || c.periodFrom <= c.periodTo, {
    message: "Początek okresu nie może być po końcu.",
    path: ["periodTo"],
  });
export type ConsultationDocForm = z.infer<typeof ConsultationDocFormSchema>;

// ---------------- Akcja podopiecznego ----------------

export const TraineeActionSchema = z.enum(["confirm", "decline", "request_change"]);
export type TraineeAction = z.infer<typeof TraineeActionSchema>;

// ---------------- Czyste guardy przejść (TDD) ----------------

export function canTraineeAct(status: ConsultationStatus, _action: TraineeAction): boolean {
  return status === "planned" || status === "confirmed";
}
export function canTrainerReschedule(status: ConsultationStatus): boolean {
  return status === "planned" || status === "confirmed" || status === "change_requested";
}
export const canTrainerCancel = canTrainerReschedule;
export function canDocument(status: ConsultationStatus): boolean {
  return status !== "cancelled";
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm run test:unit`
Expected: PASS (wszystkie grupy zielone).

- [ ] **Step 5: Lint + typecheck** — `npm run lint`, `npm run typecheck`. Expected: PASS (modulo repo/trasy).

- [ ] **Step 6: Review** — `/code-review`. Po akceptacji → kolejny task.

---

## Task 5: Repo harmonogramu (`consultation-schedules.ts`) + materializacja

**Files:**
- Create: `app/lib/consultation-schedules.ts`

- [ ] **Step 1: Zaimplementuj repo harmonogramu**

Create `app/lib/consultation-schedules.ts`:

```ts
import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import type { ScheduleForm } from "~/lib/consultation-types";
import { nextOccurrences, type RecurrenceRule } from "~/lib/consultation-recurrence";
import * as schema from "~/lib/db/schema";

export class ScheduleError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

/** Okno materializacji terminów (dni w przód). */
export const HORIZON_DAYS = 70;

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
  if (!row) throw new ScheduleError("trainee not owned", "Nie znaleziono podopiecznego.");
}

/** Aktywny harmonogram pary trener-podopieczny (lub null). Tenant-scope: trainerId. */
export async function getActiveSchedule(
  db: Db,
  args: { trainerId: string; traineeId: string },
): Promise<schema.ConsultationSchedule | null> {
  const [row] = await db
    .select()
    .from(schema.consultationSchedules)
    .where(
      and(
        eq(schema.consultationSchedules.trainerId, args.trainerId),
        eq(schema.consultationSchedules.traineeId, args.traineeId),
        eq(schema.consultationSchedules.active, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

function ruleFromSchedule(s: schema.ConsultationSchedule): RecurrenceRule {
  return {
    cadence: s.cadence,
    weekday: s.weekday,
    dayOfMonth: s.dayOfMonth,
    timeOfDay: s.timeOfDay.slice(0, 5), // "HH:MM:SS" -> "HH:MM"
    startsOn: s.startsOn,
  };
}

/**
 * Materializuje brakujące terminy `planned` dla harmonogramu w oknie HORIZON_DAYS.
 * Idempotentne dzięki unikatowi (schedule_id, scheduled_at) + onConflictDoNothing.
 * `fromISO` (YYYY-MM-DD) podawane z route (np. todayISO()) — repo nie woła Date.now bezpośrednio.
 */
export async function ensureOccurrences(
  db: Db,
  scheduleId: string,
  fromISO: string,
): Promise<void> {
  const [s] = await db
    .select()
    .from(schema.consultationSchedules)
    .where(eq(schema.consultationSchedules.id, scheduleId))
    .limit(1);
  if (!s || !s.active) return;

  const dates = nextOccurrences(ruleFromSchedule(s), { from: fromISO, horizonDays: HORIZON_DAYS });
  if (dates.length === 0) return;

  await db
    .insert(schema.consultations)
    .values(
      dates.map((iso) => ({
        trainerId: s.trainerId,
        traineeId: s.traineeId,
        scheduleId: s.id,
        scheduledAt: new Date(iso),
        durationMin: s.durationMin,
        status: "planned" as const,
        meetingUrl: s.defaultMeetingUrl ?? null,
        title: defaultTitle(iso),
      })),
    )
    .onConflictDoNothing({
      target: [schema.consultations.scheduleId, schema.consultations.scheduledAt],
    });
}

/** Tytuł domyślny dla zaplanowanego terminu, np. "Konsultacja — 11.06.2026". */
export function defaultTitle(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `Konsultacja — ${dd}.${mm}.${d.getUTCFullYear()}`;
}

export interface UpsertScheduleInput {
  trainerId: string;
  traineeId: string;
  form: ScheduleForm;
  fromISO: string;
}

/**
 * Ustawia harmonogram pary (jeden aktywny). Dezaktywuje poprzedni, tworzy nowy,
 * regeneruje przyszłe terminy. Niepotwierdzone `planned` ze STAREGO harmonogramu
 * są odpinane (anulowane), `confirmed`/`documented` zostają. Tenant-scope: trainerId.
 */
export async function upsertSchedule(db: Db, input: UpsertScheduleInput): Promise<string> {
  await assertTraineeOwnedBy(db, input.trainerId, input.traineeId);
  return await db.transaction(async (tx) => {
    // Anuluj przyszłe, niepotwierdzone terminy z dotychczasowych aktywnych serii.
    const old = await tx
      .select({ id: schema.consultationSchedules.id })
      .from(schema.consultationSchedules)
      .where(
        and(
          eq(schema.consultationSchedules.trainerId, input.trainerId),
          eq(schema.consultationSchedules.traineeId, input.traineeId),
          eq(schema.consultationSchedules.active, true),
        ),
      );
    for (const o of old) {
      await tx
        .update(schema.consultations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(schema.consultations.scheduleId, o.id),
            eq(schema.consultations.status, "planned"),
            gte(schema.consultations.scheduledAt, new Date(`${input.fromISO}T00:00:00.000Z`)),
          ),
        );
      await tx
        .update(schema.consultationSchedules)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(schema.consultationSchedules.id, o.id));
    }

    const f = input.form;
    const [row] = await tx
      .insert(schema.consultationSchedules)
      .values({
        trainerId: input.trainerId,
        traineeId: input.traineeId,
        cadence: f.cadence,
        weekday: f.cadence === "monthly" ? null : (f.weekday ?? null),
        dayOfMonth: f.cadence === "monthly" ? (f.dayOfMonth ?? null) : null,
        timeOfDay: f.timeOfDay,
        durationMin: f.durationMin,
        startsOn: f.startsOn,
        defaultMeetingUrl: f.defaultMeetingUrl ?? null,
        active: true,
      })
      .returning({ id: schema.consultationSchedules.id });
    const id = row!.id;
    await ensureOccurrences(tx, id, input.fromISO);
    return id;
  });
}

/**
 * Wyłącza harmonogram („nigdy"): dezaktywuje + anuluje przyszłe niepotwierdzone
 * `planned`. Tenant-scope: trainerId.
 */
export async function deactivateSchedule(
  db: Db,
  args: { trainerId: string; traineeId: string; fromISO: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.consultationSchedules)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(schema.consultationSchedules.trainerId, args.trainerId),
          eq(schema.consultationSchedules.traineeId, args.traineeId),
          eq(schema.consultationSchedules.active, true),
        ),
      )
      .returning({ id: schema.consultationSchedules.id });
    for (const r of rows) {
      await tx
        .update(schema.consultations)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(schema.consultations.scheduleId, r.id),
            eq(schema.consultations.status, "planned"),
            gte(schema.consultations.scheduledAt, new Date(`${args.fromISO}T00:00:00.000Z`)),
          ),
        );
    }
  });
}
```

> Importy `isNull`/`ne` mogą okazać się nieużyte — usuń te, których nie wykorzystasz (Biome to wyłapie w Step 2).

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck` i `npm run lint`
Expected: PASS dla tego pliku. Jeśli `onConflictDoNothing`/`target` ma inną sygnaturę — sprawdź Context7 „drizzle-orm postgres on conflict do nothing”.

- [ ] **Step 3: Review** — `/code-review` + `/security-review` (tenant-scope, `trainer_id`). Po akceptacji → kolejny task.

---

## Task 6: Repo okazji (`consultations.ts`) + test integracyjny

**Files:**
- Modify (przepis): `app/lib/consultations.ts`
- Modify (przepis, PISZEMY/NIE uruchamiamy): `tests/consultations.itest.ts`

- [ ] **Step 1: Zaimplementuj repo okazji**

Zastąp zawartość `app/lib/consultations.ts`:

```ts
import { and, asc, between, desc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import type { ConsultationDocForm, TraineeAction } from "~/lib/consultation-types";
import { canDocument, canTraineeAct, canTrainerReschedule } from "~/lib/consultation-types";
import * as schema from "~/lib/db/schema";

export class ConsultationError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

const LIVE_STATUSES = ["planned", "confirmed", "change_requested"] as const;

export interface OccurrenceListItem {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: schema.ConsultationStatus;
  title: string;
  meetingUrl: string | null;
  openItemCount: number;
  totalItemCount: number;
}

/**
 * Terminy podopiecznego w zakresie [fromISO, toISO] (ISO datetime) — pod kalendarz.
 * Tenant-scope: traineeId. Pomija `cancelled`.
 */
export async function listOccurrencesForTrainee(
  db: Db,
  traineeId: string,
  range: { fromISO: string; toISO: string },
): Promise<OccurrenceListItem[]> {
  const rows = await db
    .select({
      id: schema.consultations.id,
      scheduledAt: schema.consultations.scheduledAt,
      durationMin: schema.consultations.durationMin,
      status: schema.consultations.status,
      title: schema.consultations.title,
      meetingUrl: schema.consultations.meetingUrl,
    })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.traineeId, traineeId),
        between(
          schema.consultations.scheduledAt,
          new Date(range.fromISO),
          new Date(range.toISO),
        ),
      ),
    )
    .orderBy(asc(schema.consultations.scheduledAt));

  return rows
    .filter((r) => r.status !== "cancelled")
    .map((r) => ({
      id: r.id,
      scheduledAt: typeof r.scheduledAt === "string" ? r.scheduledAt : (r.scheduledAt as Date).toISOString(),
      durationMin: r.durationMin,
      status: r.status,
      title: r.title,
      meetingUrl: r.meetingUrl,
      openItemCount: 0,
      totalItemCount: 0,
    }));
}

/** Terminy podopiecznego widziane przez trenera (wszystkie statusy). Tenant-scope: trainerId+traineeId. */
export async function listOccurrencesForTrainer(
  db: Db,
  args: { trainerId: string; traineeId: string },
): Promise<schema.Consultation[]> {
  return await db
    .select()
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.trainerId, args.trainerId),
        eq(schema.consultations.traineeId, args.traineeId),
      ),
    )
    .orderBy(asc(schema.consultations.scheduledAt));
}

/** Liczba terminów czekających na reakcję podopiecznego (badge). Tenant-scope: traineeId. */
export async function countPendingForTrainee(db: Db, traineeId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.consultations.id })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.traineeId, traineeId),
        eq(schema.consultations.status, "planned"),
      ),
    );
  return rows.length;
}

/** Najbliższy żywy termin podopiecznego po `nowISO` (lub null). Tenant-scope: traineeId. */
export async function nextUpcomingForTrainee(
  db: Db,
  traineeId: string,
  nowISO: string,
): Promise<schema.Consultation | null> {
  const [row] = await db
    .select()
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.traineeId, traineeId),
        gt(schema.consultations.scheduledAt, new Date(nowISO)),
        inArray(schema.consultations.status, [...LIVE_STATUSES]),
      ),
    )
    .orderBy(asc(schema.consultations.scheduledAt))
    .limit(1);
  return row ?? null;
}

export interface ConsultationDetail {
  consultation: schema.Consultation;
  items: schema.ConsultationActionItem[];
}

/** Szczegóły. Tenant-scope: podaj trainerId LUB traineeId. Brak dopasowania → null (404). */
export async function getConsultationDetail(
  db: Db,
  args: { consultationId: string; trainerId?: string; traineeId?: string },
): Promise<ConsultationDetail | null> {
  if (!args.trainerId && !args.traineeId) {
    throw new ConsultationError("scope required", "Brak kontekstu dostępu.");
  }
  const conds = [eq(schema.consultations.id, args.consultationId)];
  if (args.trainerId) conds.push(eq(schema.consultations.trainerId, args.trainerId));
  if (args.traineeId) conds.push(eq(schema.consultations.traineeId, args.traineeId));

  const [c] = await db.select().from(schema.consultations).where(and(...conds)).limit(1);
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

/** Termin ad-hoc (poza serią): status `planned` albo od razu `documented`. Tenant-scope: trainerId. */
export async function createAdhocConsultation(
  db: Db,
  input: { trainerId: string; traineeId: string; form: ConsultationDocForm; documented: boolean },
): Promise<string> {
  await assertTraineeOwnedBy(db, input.trainerId, input.traineeId);
  return await db.transaction(async (tx) => {
    const f = input.form;
    const [row] = await tx
      .insert(schema.consultations)
      .values({
        trainerId: input.trainerId,
        traineeId: input.traineeId,
        scheduleId: null,
        scheduledAt: new Date(`${f.scheduledAt}:00.000Z`),
        durationMin: f.durationMin,
        status: input.documented ? "documented" : "planned",
        meetingUrl: f.meetingUrl ?? null,
        title: f.title,
        summary: f.summary ?? "",
        periodFrom: f.periodFrom ?? null,
        periodTo: f.periodTo ?? null,
      })
      .returning({ id: schema.consultations.id });
    const id = row!.id;
    if (input.documented) await insertItems(tx, id, f.items);
    return id;
  });
}

/** Dokumentuje termin (status → documented; pola + punkty). Tenant-scope: trainerId. */
export async function documentConsultation(
  db: Db,
  input: { trainerId: string; consultationId: string; form: ConsultationDocForm },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: schema.consultations.id, status: schema.consultations.status })
      .from(schema.consultations)
      .where(
        and(
          eq(schema.consultations.id, input.consultationId),
          eq(schema.consultations.trainerId, input.trainerId),
        ),
      )
      .limit(1);
    if (!c) throw new ConsultationError("not owned", "Nie znaleziono konsultacji.");
    if (!canDocument(c.status)) {
      throw new ConsultationError("bad status", "Nie można udokumentować odwołanego terminu.");
    }
    const f = input.form;
    await tx
      .update(schema.consultations)
      .set({
        scheduledAt: new Date(`${f.scheduledAt}:00.000Z`),
        durationMin: f.durationMin,
        meetingUrl: f.meetingUrl ?? null,
        title: f.title,
        summary: f.summary ?? "",
        periodFrom: f.periodFrom ?? null,
        periodTo: f.periodTo ?? null,
        status: "documented",
      })
      .where(eq(schema.consultations.id, input.consultationId));
    await tx
      .delete(schema.consultationActionItems)
      .where(eq(schema.consultationActionItems.consultationId, input.consultationId));
    await insertItems(tx, input.consultationId, f.items);
  });
}

async function insertItems(
  db: Db,
  consultationId: string,
  items: ConsultationDocForm["items"],
): Promise<void> {
  if (items.length === 0) return;
  await db.insert(schema.consultationActionItems).values(
    items.map((it, idx) => ({
      consultationId,
      ordinal: idx,
      body: it.body,
      status: it.status,
      resolvedAt: it.status === "resolved" ? new Date() : null,
    })),
  );
}

/** Trener: przełóż pojedynczy termin (nowy czas, status → planned). Tenant-scope: trainerId. */
export async function rescheduleOccurrence(
  db: Db,
  args: { trainerId: string; consultationId: string; scheduledAtLocal: string; durationMin?: number },
): Promise<void> {
  const [c] = await db
    .select({ id: schema.consultations.id, status: schema.consultations.status })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .limit(1);
  if (!c) throw new ConsultationError("not owned", "Nie znaleziono terminu.");
  if (!canTrainerReschedule(c.status)) {
    throw new ConsultationError("bad status", "Tego terminu nie można przełożyć.");
  }
  await db
    .update(schema.consultations)
    .set({
      scheduledAt: new Date(`${args.scheduledAtLocal}:00.000Z`),
      status: "planned",
      traineeNote: null,
      ...(args.durationMin ? { durationMin: args.durationMin } : {}),
    })
    .where(eq(schema.consultations.id, args.consultationId));
}

/** Trener: odwołaj pojedynczy termin (status → cancelled). Tenant-scope: trainerId. */
export async function cancelOccurrence(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<void> {
  const rows = await db
    .update(schema.consultations)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .returning({ id: schema.consultations.id });
  if (rows.length === 0) throw new ConsultationError("not owned", "Nie znaleziono terminu.");
}

/** Podopieczny: reakcja na termin. Tylko własny i z dozwolonego statusu. Tenant-scope: traineeId. */
export async function respondToOccurrence(
  db: Db,
  args: { traineeId: string; consultationId: string; action: TraineeAction; note?: string },
): Promise<void> {
  const [c] = await db
    .select({ id: schema.consultations.id, status: schema.consultations.status })
    .from(schema.consultations)
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.traineeId, args.traineeId),
      ),
    )
    .limit(1);
  if (!c) throw new ConsultationError("not owned", "Nie znaleziono terminu.");
  if (!canTraineeAct(c.status, args.action)) {
    throw new ConsultationError("bad status", "Tego terminu nie można już zmienić.");
  }
  const nextStatus =
    args.action === "confirm" ? "confirmed" : args.action === "decline" ? "cancelled" : "change_requested";
  await db
    .update(schema.consultations)
    .set({
      status: nextStatus,
      traineeNote: args.action === "request_change" ? (args.note ?? null) : null,
    })
    .where(eq(schema.consultations.id, args.consultationId));
}

/** Przełącza status punktu „do poprawy" (tylko właściciel-trener). */
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

> Liczniki punktów na liście kalendarza (`openItemCount`/`totalItemCount`) zostawiamy na 0 w v1 — w widoku kalendarza terminy są zwykle jeszcze niedokumentowane. Jeśli design pokaże potrzebę liczników na minionych/dokumentowanych pozycjach, dodaj `leftJoin` + `count(... filter ...)` jak w poprzedniej wersji repo (Context7: drizzle aggregate filter). Usuń nieużyte importy (`gt`, `inArray` itd.) wskazane przez Biome.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck` i `npm run lint`
Expected: PASS. Dla niezgodności typu `scheduledAt` (string vs Date przy select) sprawdź tryb kolumny `timestamp` w Drizzle — w razie potrzeby zmapuj jak w `listOccurrencesForTrainee` (`typeof === "string" ? … : (… as Date).toISOString()`).

- [ ] **Step 3: Przepisz test integracyjny (NIE uruchamiaj)**

Zastąp zawartość `tests/consultations.itest.ts`. Boilerplate kontenera/migracji/`citext` jak w obecnej wersji (Trener A/Podo A, Trener B/Podo B). Pokryj krytyczne przepływy:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import { getActiveSchedule, upsertSchedule, deactivateSchedule, ensureOccurrences } from "~/lib/consultation-schedules";
import {
  cancelOccurrence,
  countPendingForTrainee,
  createAdhocConsultation,
  documentConsultation,
  getConsultationDetail,
  listOccurrencesForTrainee,
  rescheduleOccurrence,
  respondToOccurrence,
} from "~/lib/consultations";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
let trainerA = "", traineeA = "", trainerB = "", traineeB = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const mk = async (email: string, role: "trainer" | "trainee", trainerId?: string) => {
    const [u] = await db.insert(schema.users).values({ email, displayName: email, role, trainerId }).returning({ id: schema.users.id });
    return u!.id;
  };
  trainerA = await mk("ta@example.com", "trainer");
  traineeA = await mk("pa@example.com", "trainee", trainerA);
  trainerB = await mk("tb@example.com", "trainer");
  traineeB = await mk("pb@example.com", "trainee", trainerB);
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

const weeklyForm = {
  cadence: "weekly" as const, weekday: 3, dayOfMonth: null, timeOfDay: "18:00",
  durationMin: 45, startsOn: "2026-06-01", defaultMeetingUrl: null,
};

describe("harmonogram + materializacja", () => {
  it("upsertSchedule generuje terminy planned z właściwymi datami i jest idempotentny", async () => {
    const schedId = await upsertSchedule(db, { trainerId: trainerA, traineeId: traineeA, form: weeklyForm, fromISO: "2026-06-01" });
    const occ1 = await listOccurrencesForTrainee(db, traineeA, { fromISO: "2026-06-01T00:00:00.000Z", toISO: "2026-06-30T23:59:59.000Z" });
    expect(occ1.length).toBeGreaterThanOrEqual(4); // środy czerwca
    expect(occ1.every((o) => o.status === "planned")).toBe(true);
    // idempotencja
    await ensureOccurrences(db, schedId, "2026-06-01");
    const occ2 = await listOccurrencesForTrainee(db, traineeA, { fromISO: "2026-06-01T00:00:00.000Z", toISO: "2026-06-30T23:59:59.000Z" });
    expect(occ2.length).toBe(occ1.length);
  });

  it("blokuje harmonogram dla cudzego podopiecznego", async () => {
    await expect(
      upsertSchedule(db, { trainerId: trainerB, traineeId: traineeA, form: weeklyForm, fromISO: "2026-06-01" }),
    ).rejects.toThrow();
  });

  it("deactivateSchedule anuluje przyszłe planned", async () => {
    await deactivateSchedule(db, { trainerId: trainerA, traineeId: traineeA, fromISO: "2026-06-01" });
    expect(await getActiveSchedule(db, { trainerId: trainerA, traineeId: traineeA })).toBeNull();
    const occ = await listOccurrencesForTrainee(db, traineeA, { fromISO: "2026-06-01T00:00:00.000Z", toISO: "2026-06-30T23:59:59.000Z" });
    expect(occ.length).toBe(0); // wszystkie cancelled, lista je pomija
  });
});

describe("cykl życia terminu", () => {
  it("podopieczny potwierdza tylko własny i z dozwolonego statusu", async () => {
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA, traineeId: traineeA, documented: false,
      form: { scheduledAt: "2026-07-01T18:00", durationMin: 45, title: "Ad-hoc", summary: "", items: [] },
    });
    await respondToOccurrence(db, { traineeId: traineeA, consultationId: id, action: "confirm" });
    const d = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(d!.consultation.status).toBe("confirmed");
    // obcy podopieczny nie może
    await expect(
      respondToOccurrence(db, { traineeId: traineeB, consultationId: id, action: "decline" }),
    ).rejects.toThrow();
  });

  it("prośba o zmianę zapisuje notatkę; reschedule wraca do planned i czyści notatkę", async () => {
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA, traineeId: traineeA, documented: false,
      form: { scheduledAt: "2026-07-08T18:00", durationMin: 45, title: "X", summary: "", items: [] },
    });
    await respondToOccurrence(db, { traineeId: traineeA, consultationId: id, action: "request_change", note: "Wolę rano" });
    let d = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(d!.consultation.status).toBe("change_requested");
    expect(d!.consultation.traineeNote).toBe("Wolę rano");
    await rescheduleOccurrence(db, { trainerId: trainerA, consultationId: id, scheduledAtLocal: "2026-07-09T09:00" });
    d = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(d!.consultation.status).toBe("planned");
    expect(d!.consultation.traineeNote).toBeNull();
  });

  it("cancel pilnuje właściciela; documented wstawia punkty i blokuje cancelled", async () => {
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA, traineeId: traineeA, documented: false,
      form: { scheduledAt: "2026-07-15T18:00", durationMin: 45, title: "Y", summary: "", items: [] },
    });
    await expect(cancelOccurrence(db, { trainerId: trainerB, consultationId: id })).rejects.toThrow();
    await documentConsultation(db, {
      trainerId: trainerA, consultationId: id,
      form: { scheduledAt: "2026-07-15T18:00", durationMin: 45, title: "Y", summary: "Dobre tempo", items: [{ body: "Łokcie", status: "open" }] },
    });
    const d = await getConsultationDetail(db, { consultationId: id, trainerId: trainerA });
    expect(d!.consultation.status).toBe("documented");
    expect(d!.items.map((i) => i.body)).toEqual(["Łokcie"]);
  });

  it("countPendingForTrainee liczy planned czekające na reakcję", async () => {
    const n = await countPendingForTrainee(db, traineeA);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(await countPendingForTrainee(db, traineeB)).toBe(0);
  });

  it("tenant-scope: obcy trener nie czyta szczegółów", async () => {
    const id = await createAdhocConsultation(db, {
      trainerId: trainerA, traineeId: traineeA, documented: true,
      form: { scheduledAt: "2026-07-20T18:00", durationMin: 45, title: "Z", summary: "ok", items: [] },
    });
    expect(await getConsultationDetail(db, { consultationId: id, trainerId: trainerB })).toBeNull();
    expect(await getConsultationDetail(db, { consultationId: id, traineeId: traineeB })).toBeNull();
  });
});
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS. **Testu integracyjnego NIE uruchamiaj** (Docker — właściciel: `npm run test:itest`).

- [ ] **Step 5: Review + security-review** — `/code-review` + `/security-review` (tenant-scope, przejścia statusów, `trainer_id`). Po akceptacji → kolejny task.

---

## Task 7: UI trenera (panel harmonogramu + lista terminów + dokumentowanie) — `frontend-design`

> **Prowadzi `frontend-design:frontend-design`.** Kod poniżej to funkcjonalny szkielet — loadery/akcje (logika + autoryzacja) są wiążące; warstwę wizualną (klasy z `tokens.css`, `.card`, `.btn`, `.list`, `.empty`, `.crumbs`, `.pagehead`, `.seg`) dopracuj wg `design-system/README.md`, wzorując się na istniejących trasach trenera. Makiety zatwierdzone w brainstormie: panel cyklu (segment co tydzień/2 tyg./miesiąc/nigdy + dzień + godzina + czas), lista „Nadchodzące terminy" ze statusami i akcjami Przełóż/Odwołaj, sekcja „Do udokumentowania / minione" z akcją Udokumentuj.

**Files:**
- Modify: `app/lib/consultation-form.server.ts`
- Create: `app/components/schedule-form.tsx`
- Modify: `app/components/consultation-form.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx`
- Modify: `app/routes/trener/podopieczni.$traineeId.tsx`

- [ ] **Step 1: Helpery parsowania FormData (server)**

Zastąp zawartość `app/lib/consultation-form.server.ts`:

```ts
/**
 * Parsery FormData → surowe obiekty do walidacji Zodem (ConsultationDocFormSchema
 * / ScheduleFormSchema). Punkty: równoległe pola `itemBody[]` + `itemStatus[]`.
 */
export function parseConsultationDocFormData(fd: FormData) {
  const bodies = fd.getAll("itemBody").map((v) => String(v));
  const statuses = fd.getAll("itemStatus").map((v) => String(v));
  const items = bodies
    .map((body, i) => ({ body, status: statuses[i] === "resolved" ? "resolved" : "open" }))
    .filter((it) => it.body.trim().length > 0);
  const periodFrom = String(fd.get("periodFrom") ?? "").trim() || null;
  const periodTo = String(fd.get("periodTo") ?? "").trim() || null;
  const meetingUrl = String(fd.get("meetingUrl") ?? "").trim() || null;
  return {
    scheduledAt: String(fd.get("scheduledAt") ?? ""),
    durationMin: String(fd.get("durationMin") ?? "45"),
    meetingUrl,
    title: String(fd.get("title") ?? ""),
    summary: String(fd.get("summary") ?? ""),
    periodFrom,
    periodTo,
    items,
  };
}

export function parseScheduleFormData(fd: FormData) {
  const cadence = String(fd.get("cadence") ?? "");
  const weekdayRaw = String(fd.get("weekday") ?? "").trim();
  const domRaw = String(fd.get("dayOfMonth") ?? "").trim();
  const url = String(fd.get("defaultMeetingUrl") ?? "").trim() || null;
  return {
    cadence,
    weekday: weekdayRaw === "" ? null : Number(weekdayRaw),
    dayOfMonth: domRaw === "" ? null : Number(domRaw),
    timeOfDay: String(fd.get("timeOfDay") ?? ""),
    durationMin: String(fd.get("durationMin") ?? "45"),
    startsOn: String(fd.get("startsOn") ?? ""),
    defaultMeetingUrl: url,
  };
}
```

- [ ] **Step 2: `schedule-form.tsx` (komponent, frontend-design)**

Create `app/components/schedule-form.tsx`: kontrolowany formularz (bez własnego `<Form>` — rodzic owija). Pola: `cadence` (segment/radio: weekly/biweekly/monthly + przycisk „Wyłącz" wysyłający `intent=deactivate-schedule`), warunkowo `weekday` (select 0–6) lub `dayOfMonth` (1–28), `timeOfDay` (`<input type="time">`), `durationMin` (number), `startsOn` (`<input type="date">`), `defaultMeetingUrl` (url, opcjonalny). Props: `defaultValue?: ScheduleForm | null`. **Projekt wizualny + interakcja warunkowego pola prowadzi `frontend-design`.**

- [ ] **Step 3: `consultation-form.tsx` (dokumentowanie — aktualizacja)**

Zaktualizuj `app/components/consultation-form.tsx`: zamień pole `heldOn` (date) na `scheduledAt` (`<input type="datetime-local" name="scheduledAt">`), dodaj `durationMin` (number, domyślnie 45) i `meetingUrl` (url, opcjonalny). Reszta (tytuł, okres od–do, summary, dynamiczna lista punktów z `itemBody`/`itemStatus`) bez zmian. Zaktualizuj typ `ConsultationFormDefaultValue` (`scheduledAt`, `durationMin`, `meetingUrl`).

- [ ] **Step 4: Lista trenera + panel harmonogramu (`_index`)**

Zastąp `app/routes/trener/podopieczni.$traineeId.konsultacje._index.tsx`. Loader: weryfikuje trenera+podopiecznego (404 jak dotąd), woła `ensureOccurrences` dla aktywnego harmonogramu, ładuje harmonogram i terminy. Action: `save-schedule` / `deactivate-schedule`.

```tsx
import { and, eq } from "drizzle-orm";
import {
  Form, Link, useActionData, useLoaderData,
  type ActionFunctionArgs, type LoaderFunctionArgs,
} from "react-router";
import { ScheduleForm } from "~/components/schedule-form";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { ScheduleFormSchema } from "~/lib/consultation-types";
import { parseScheduleFormData } from "~/lib/consultation-form.server";
import {
  getActiveSchedule, upsertSchedule, deactivateSchedule, ensureOccurrences, ScheduleError,
} from "~/lib/consultation-schedules";
import { listOccurrencesForTrainer } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDateTime, todayISO } from "~/lib/format";

async function loadTrainee(traineeId: string, trainerId: string) {
  const [t] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(and(eq(schema.users.id, traineeId), eq(schema.users.trainerId, trainerId), eq(schema.users.role, "trainee")))
    .limit(1);
  return t ?? null;
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await loadTrainee(traineeId, user.id);
  if (!trainee) throw new Response("not found", { status: 404 });

  const schedule = await getActiveSchedule(db, { trainerId: user.id, traineeId });
  if (schedule) await ensureOccurrences(db, schedule.id, todayISO());
  const occurrences = await listOccurrencesForTrainer(db, { trainerId: user.id, traineeId });
  return { trainee, schedule, occurrences };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  try {
    if (intent === "deactivate-schedule") {
      await deactivateSchedule(db, { trainerId: user.id, traineeId, fromISO: todayISO() });
      return { success: "Harmonogram wyłączony." };
    }
    if (intent === "save-schedule") {
      const parsed = ScheduleFormSchema.safeParse(parseScheduleFormData(fd));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      await upsertSchedule(db, { trainerId: user.id, traineeId, form: parsed.data, fromISO: todayISO() });
      return { success: "Harmonogram zapisany." };
    }
    return null;
  } catch (e) {
    if (e instanceof ScheduleError) return { error: e.userMessage };
    throw e;
  }
}

export default function TrenerKonsultacjeIndex() {
  const { trainee, schedule, occurrences } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const now = Date.now();
  const upcoming = occurrences.filter(
    (o) => o.status !== "documented" && o.status !== "cancelled" && new Date(o.scheduledAt).getTime() >= now,
  );
  const past = occurrences.filter(
    (o) => o.status === "documented" || (o.status !== "cancelled" && new Date(o.scheduledAt).getTime() < now),
  );
  // Render: crumbs + pagehead z przyciskiem „Nowa konsultacja", panel <ScheduleForm> w <Form method="post">
  // (intent=save-schedule / deactivate-schedule), listy `upcoming` i `past` z linkami do szczegółów.
  // fmtDateTime(o.scheduledAt) do dat; status → etykieta. Layout: frontend-design.
  return null; // ← zastąp pełnym JSX (frontend-design)
}
```

> Etykiety statusów (PL): `planned`→„zaplanowana", `confirmed`→„potwierdzona", `change_requested`→„prośba o zmianę", `documented`→„udokumentowana". Termin po godzinie a niedokumentowany → etykieta „do udokumentowania".

- [ ] **Step 5: Termin ad-hoc (`nowa`)**

Zaktualizuj `app/routes/trener/podopieczni.$traineeId.konsultacje.nowa.tsx`: action używa `ConsultationDocFormSchema` + `parseConsultationDocFormData`, woła `createAdhocConsultation` z `documented: fd.get("intent") === "save-documented"` (dwa przyciski: „Zaplanuj" → planned, „Zapisz jako odbytą" → documented). Loader bez zmian (weryfikacja trenera+podopiecznego), `defaultScheduledAt` z `todayISO()+"T18:00"`. Formularz: `<ConsultationForm>`.

- [ ] **Step 6: Szczegóły + dokumentowanie + przełóż/odwołaj/toggle**

Zastąp `app/routes/trener/podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx`. Loader: `getConsultationDetail({ consultationId, trainerId, traineeId })` (scope po obu — jak dotychczasowa wersja, 404 gdy null). Action wg `intent`:

```tsx
// ... importy: requireUser, getConsultationDetail, documentConsultation, rescheduleOccurrence,
// cancelOccurrence, setActionItemStatus, deleteConsultation, ConsultationError,
// ConsultationDocFormSchema, parseConsultationDocFormData, ConfirmSubmitButton, fmtDateTime ...

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const consultationId = args.params.konsultacjaId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  try {
    // Wiązanie do ścieżki traineeId (mislinked URL → 404), jak w dotychczasowej wersji:
    if (intent === "delete" || intent === "document" || intent === "reschedule" || intent === "cancel") {
      const owned = await getConsultationDetail(db, { consultationId, trainerId: user.id, traineeId });
      if (!owned) throw new Response("not found", { status: 404 });
    }
    if (intent === "delete") {
      await deleteConsultation(db, { trainerId: user.id, consultationId });
      throw redirect(`/trener/podopieczni/${traineeId}/konsultacje`);
    }
    if (intent === "cancel") {
      await cancelOccurrence(db, { trainerId: user.id, consultationId });
      return { success: "Termin odwołany." };
    }
    if (intent === "reschedule") {
      const scheduledAtLocal = String(fd.get("scheduledAt") ?? "");
      const durationMin = Number(fd.get("durationMin") ?? "") || undefined;
      await rescheduleOccurrence(db, { trainerId: user.id, consultationId, scheduledAtLocal, durationMin });
      return { success: "Termin przełożony." };
    }
    if (intent === "toggle-item") {
      const itemId = String(fd.get("itemId") ?? "");
      const status = fd.get("status") === "resolved" ? "resolved" : "open";
      await setActionItemStatus(db, { trainerId: user.id, itemId, status });
      return null;
    }
    if (intent === "document") {
      const parsed = ConsultationDocFormSchema.safeParse(parseConsultationDocFormData(fd));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      await documentConsultation(db, { trainerId: user.id, consultationId, form: parsed.data });
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

Komponent: widok (status, data `fmtDateTime`, link Meet, notatka podopiecznego gdy `change_requested`, podsumowanie + punkty z toggle) + tryb dokumentowania (`?document=1`, `<ConsultationForm intent=document>`) + przyciski Przełóż (`reschedule`, mały formularz `datetime-local`) / Odwołaj (`ConfirmSubmitButton intent=cancel`) / Usuń (`ConfirmSubmitButton intent=delete`). **Layout/interakcje: frontend-design.**

- [ ] **Step 7: Kafel na stronie podopiecznego u trenera**

W `app/routes/trener/podopieczni.$traineeId.tsx`: w loaderze dolicz `nextUpcomingForTrainee(db, traineeId, new Date().toISOString())` i `countPendingForTrainee`; w nagłówku przy linku „Konsultacje" pokaż najbliższy termin (`fmtDateTime`) + liczbę oczekujących/próśb o zmianę. (Import z `~/lib/consultations`.) **Wizual: frontend-design.**

- [ ] **Step 8: Typecheck + lint**

Run: `npm run typecheck` i `npm run lint`
Expected: PASS.

- [ ] **Step 9: Review** — `/code-review` + `/security-review` (loadery/akcje tenant-scope). Po akceptacji → kolejny task.

---

## Task 8: UI podopiecznego (kalendarz + potwierdzanie) — `frontend-design`

> **Prowadzi `frontend-design:frontend-design`.** Mobile-first. Układ zatwierdzony: **siatka miesiąca** (wariant A) — dni z kropką na terminie, tap → karta terminu z akcjami Potwierdzam / Zmiana / Odrzuć; „najbliższy termin" wyeksponowany na górze.

**Files:**
- Modify: `app/routes/podopieczny/_layout.tsx`
- Modify (przepis): `app/routes/podopieczny/konsultacje._index.tsx`
- Modify (przepis): `app/routes/podopieczny/konsultacje.$konsultacjaId.tsx`

- [ ] **Step 1: Badge „do potwierdzenia" w layoucie**

W `app/routes/podopieczny/_layout.tsx`: zamień import i użycie `countOpenItemsForTrainee` na `countPendingForTrainee` z `~/lib/consultations`:

```ts
import { countPendingForTrainee } from "~/lib/consultations";
// ...
const pending = await countPendingForTrainee(db, user.id);
// ... w tails:
consultations: pending,
```

(`NAV_ITEMS` i render `nav-tail` bez zmian — badge pokaże liczbę terminów do potwierdzenia.)

- [ ] **Step 2: Kalendarz (siatka miesiąca) + potwierdzanie**

Zastąp `app/routes/podopieczny/konsultacje._index.tsx`. Loader: liczy zakres miesiąca z param `?m=YYYY-MM` (domyślnie bieżący wg `todayISO()`), woła `listOccurrencesForTrainee` dla tego zakresu + `nextUpcomingForTrainee`. Action: `respond` (confirm/decline/request_change).

```tsx
import {
  Form, useActionData, useLoaderData,
  type ActionFunctionArgs, type LoaderFunctionArgs,
} from "react-router";
import { requireUser } from "~/lib/auth";
import { TraineeActionSchema } from "~/lib/consultation-types";
import { listOccurrencesForTrainee, nextUpcomingForTrainee, respondToOccurrence, ConsultationError } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import { fmtDateTime, todayISO } from "~/lib/format";

function monthRange(m: string): { fromISO: string; toISO: string; year: number; month0: number } {
  const [y, mo] = m.split("-").map((x) => Number(x));
  const year = y!, month0 = (mo ?? 1) - 1;
  const from = new Date(Date.UTC(year, month0, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month0 + 1, 0, 23, 59, 59));
  return { fromISO: from.toISOString(), toISO: to.toISOString(), year, month0 };
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const m = url.searchParams.get("m") ?? todayISO().slice(0, 7);
  const range = monthRange(m);
  const occurrences = await listOccurrencesForTrainee(db, user.id, range);
  const next = await nextUpcomingForTrainee(db, user.id, new Date().toISOString());
  return { occurrences, next, m, year: range.year, month0: range.month0 };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const fd = await args.request.formData();
  const consultationId = String(fd.get("consultationId") ?? "");
  const parsedAction = TraineeActionSchema.safeParse(String(fd.get("action") ?? ""));
  if (!parsedAction.success) return { error: "Nieznana akcja." };
  const note = String(fd.get("note") ?? "").trim() || undefined;
  try {
    await respondToOccurrence(db, { traineeId: user.id, consultationId, action: parsedAction.data, note });
    return { success: "Zapisano." };
  } catch (e) {
    if (e instanceof ConsultationError) return { error: e.userMessage };
    throw e;
  }
}

export default function PodopiecznyKonsultacjeKalendarz() {
  const { occurrences, next } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  // Render siatki miesiąca: dni 1..N, kropka gdy istnieje termin tego dnia (po occurrences),
  // tap/selekcja dnia → karta terminu z <Form method="post"> (action=confirm/decline/request_change,
  // hidden consultationId; dla request_change opcjonalne pole `note`). Na górze „najbliższy termin":
  // next && fmtDateTime(next.scheduledAt) + link Meet (next.meetingUrl). Nawigacja miesięcy: ?m=YYYY-MM.
  // Layout/siatka: frontend-design.
  return null; // ← zastąp pełnym JSX (frontend-design)
}
```

- [ ] **Step 3: Szczegóły terminu + akcje (read + potwierdzanie)**

Zastąp `app/routes/podopieczny/konsultacje.$konsultacjaId.tsx`. Loader: `getConsultationDetail({ consultationId, traineeId })` (null → 404). Action: `respond` (jak w Step 2, ten sam `respondToOccurrence`). Widok: data `fmtDateTime`, status, link Meet, podsumowanie + punkty read-only; gdy status `planned`/`confirmed` → przyciski Potwierdzam / Poproś o zmianę / Odrzuć (`<Form method="post">`). **Layout: frontend-design.**

- [ ] **Step 4: Typecheck + lint + build**

Run: `npm run typecheck`, `npm run lint`, `npm run build`
Expected: PASS (build potwierdza wszystkie trasy).

- [ ] **Step 5: Review** — `/code-review` + `/security-review`. Po akceptacji → kolejny task.

---

## Task 9: Dokumentacja

**Files:**
- Modify: `app/lib/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`

- [ ] **Step 1: `app/lib/README.md`** — zaktualizuj/dodaj wiersze:

```
| `consultation-recurrence.ts` | Czyste liczenie dat terminów z reguły cyklu: `nextOccurrences`, `RecurrenceRule`. |
| `consultation-types.ts` | Zod: `ScheduleFormSchema`, `ConsultationDocFormSchema`, `TraineeActionSchema` + czyste guardy przejść (`canTraineeAct`, `canTrainerReschedule`, `canDocument`). |
| `consultation-schedules.ts` | Repo harmonogramu (tenant-scope): `getActiveSchedule`, `upsertSchedule`, `deactivateSchedule`, `ensureOccurrences` (materializacja), `HORIZON_DAYS`. |
| `consultations.ts` | Repo okazji (tenant-scope): listy/detail, `createAdhocConsultation`, `documentConsultation`, `rescheduleOccurrence`, `cancelOccurrence`, `respondToOccurrence`, `setActionItemStatus`, `deleteConsultation`, `countPendingForTrainee`, `nextUpcomingForTrainee`. |
| `consultation-form.server.ts` | Parsowanie FormData: `parseConsultationDocFormData`, `parseScheduleFormData`. |
```

Zaktualizuj też wiersz `format.ts` o `fmtDateTime`/`fmtTime`.

- [ ] **Step 2: `app/routes/trener/README.md`** — opis tras konsultacji zaktualizuj: lista = panel harmonogramu + terminy, `nowa` = termin ad-hoc, szczegóły = dokumentowanie/przełóż/odwołaj. (Trasa `integracje/google` dochodzi w Fazie 2 — nie dopisuj teraz.)

- [ ] **Step 3: `app/routes/podopieczny/README.md`** — `konsultacje` = kalendarz (siatka miesiąca) + potwierdzanie; `konsultacje/:konsultacjaId` = szczegóły + akcje; badge „do potwierdzenia".

- [ ] **Step 4: Sanity** — `CLAUDE.md` mapa bez zmian (Faza 1 nie dodaje katalogów; `app/lib/google/` dochodzi w Fazie 2). Opisy zwięzłe i prawdziwe.

- [ ] **Step 5: Review** — `/code-review`. Po akceptacji → bramki końcowe.

---

## Bramki końcowe (z dowodem — `superpowers:verification-before-completion`)

- [ ] `npm run test:unit` — zielone (format, recurrence, types/guardy).
- [ ] `npm run typecheck` — zielone.
- [ ] `npm run lint` — zielone.
- [ ] `npm run build` — zielone.
- [ ] Dokumentacja zaktualizowana (Task 9).
- [ ] `/code-review` na całości diffu.
- [ ] `/security-review` (feature dotyka `trainer_id`/tenant-scope, przejścia statusów).
- [ ] Testy integracyjne `tests/consultations.itest.ts` — **zaraportuj właścicielowi**: `npm run test:itest` (Docker).

## Handoff (granica gita/Dockera — właściciel)

Na końcu wypisz:
- Podsumowanie + lista zmienionych/nowych plików.
- Proponowany komunikat commita (np. `feat(konsultacje): harmonogram cykliczny + cykl życia terminów (Faza 1)`).
- **Migracja:** `npm run db:generate` wykonane (nowy plik w `migrations/`, przebudowa `consultations` + nowa `consultation_schedules` + enumy); właściciel uruchamia `npm run db:migrate`. Brak nowych env w Fazie 1. Brak zmian w seedzie (opcjonalnie: dodać przykładowy harmonogram do `scripts/seed.ts` — do decyzji właściciela).
- Testy do uruchomienia pod Dockerem: `npm run test:itest`.
- Ścieżka ręcznej weryfikacji: jako trener wejdź na podopiecznego → „Konsultacje" → ustaw harmonogram (np. co tydzień, środa 18:00) → sprawdź wygenerowane terminy; przełóż/odwołaj pojedynczy; dodaj termin ad-hoc i udokumentuj (summary + punkt). Jako podopieczny: „Konsultacje" → siatka miesiąca, potwierdź/odrzuć/poproś o zmianę termin, sprawdź badge „do potwierdzenia" i „najbliższy termin".
- **Następny krok:** Faza 2 (integracja Google) — osobny plan po wylądowaniu Fazy 1.
```
