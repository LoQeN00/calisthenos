# Pomysły — zgłoszenia podopiecznych: plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development`
> (zalecany) albo `superpowers:executing-plans` — realizacja task po tasku. Kroki
> mają checkboxy (`- [ ]`).

**Cel:** podopieczny zgłasza pomysł/błąd z `/podopieczny/pomysly`, trener czyta
wszystkie zgłoszenia w jednej skrzynce `/trener/pomysly`, ustawia status i
odpowiada — odpowiedź wraca do autora.

**Architektura:** jedna tabela `feature_requests` (tenant-scope przez
`trainer_id`), czysty moduł walidacji/prezentacji `feature-request-types.ts`
(cel testów jednostkowych), repo `feature-requests.ts` z wymaganym
`trainerId`/`traineeId` w każdej funkcji, trzy trasy RR7 (loader czyta, akcja
mutuje). Zero uploadu, zero nowych zależności.

**Stack:** React Router v7, Drizzle ORM + Postgres 16, Zod 3, Vitest 2, Biome.

Spec: [`../specs/2026-07-26-pomysly-zgloszenia-design.md`](../specs/2026-07-26-pomysly-zgloszenia-design.md).

## Ograniczenia globalne

- **Nigdy git, nigdy docker.** Zamiast kroku „commit" każdy task kończy się
  bramką `npm run typecheck` + `npm run lint`. Commit robi właściciel po handoffie.
- **Komendy powłoki tylko pojedynczo**, bez łańcuchowania/potoków/przekierowań
  (allowlista w `.claude/settings.local.json`).
- **UI po polsku**, brand `kalisthenos` małą literą. Nazwy własne w kodzie po
  angielsku (`featureRequests`), etykiety po polsku.
- **Tenant-scope:** każda funkcja repo przyjmuje wymagany `trainerId` lub
  `traineeId`; brak dopasowania → `null`/`0`/brak wiersza, trasa zamienia na **404**.
- **Etykiety statusów i typów mają jedno źródło prawdy** —
  `app/lib/feature-request-types.ts`. Żadnych literałów „Nowe"/„Pomysł"
  rozsianych po trasach.
- **Zod 3** (`z.string().trim().min(...)`, `parsed.error.issues[0]?.message`).
- **Warstwę wizualną tasków 4–6 prowadzi skill `frontend-design:frontend-design`**;
  klasy i tokeny z `design-system/README.md` + `app/styles/tokens.css`
  (`pagehead`, `card`, `list`, `list-row`, `empty`, `badge`, `btn`, `input`).
- **Review per task** (`superpowers:requesting-code-review`) przed przejściem dalej.
- Testy jednostkowe uruchamiamy wzorcem ścieżki pliku
  (`npx vitest run app/lib/feature-request-types.test.ts`), **nigdy `npm test`**
  (watch) i nigdy wzorcem, który złapie `tests/*.itest.ts` (Docker).

## Struktura plików

| Plik | Odpowiedzialność | Task |
|---|---|---|
| `app/lib/db/schema.ts` (modyfikacja) | 2 enumy + tabela `featureRequests` + typy | 1 |
| `app/lib/db/migrations/NNNN_*.sql` (generowany) | migracja `CREATE TYPE` + `CREATE TABLE` | 1 |
| `app/lib/feature-request-types.ts` (nowy) | Zod + etykiety PL + `statusPresentation` + `canTraineeDelete` — czyste, bez DB | 2 |
| `app/lib/feature-request-types.test.ts` (nowy) | testy jednostkowe powyższego | 2 |
| `app/lib/feature-requests.ts` (nowy) | repo tenant-scope (odczyty, tworzenie, usuwanie, odpowiedź, licznik) | 3 |
| `app/components/feature-request-badge.tsx` (nowy) | plakietka statusu (wspólna dla obu paneli) | 4 |
| `app/routes/podopieczny/pomysly.tsx` (nowy) | formularz + własna lista + akcje `create`/`delete` | 4 |
| `app/routes/podopieczny/_layout.tsx` (modyfikacja) | pozycja „Pomysły" + licznik | 4 |
| `app/routes/trener/pomysly.$requestId.tsx` (nowy) | szczegół + akcja `respond` | 5 |
| `app/routes/trener/pomysly._index.tsx` (nowy) | lista zbiorcza z filtrami i paginacją | 6 |
| `app/routes/trener/_layout.tsx` (modyfikacja) | pozycja „Pomysły" + odznaka „nowe" | 6 |
| `app/routes.ts` (modyfikacja) | trzy wpisy tras | 4, 5, 6 |
| `tests/feature-requests.itest.ts` (nowy) | tenant-scope end-to-end (uruchamia właściciel) | 7 |
| README-e katalogów | aktualizacja dokumentacji | 7 |

---

### Task 1: Schemat bazy + migracja

**Pliki:**
- Modyfikacja: `app/lib/db/schema.ts` (enumy przy pozostałych ~linia 58; tabela po `subscriptionPayments`; typy w sekcji „Types" na końcu)
- Generowany: `app/lib/db/migrations/NNNN_*.sql`

**Interfejsy:**
- Produkuje: `schema.featureRequests`, `schema.featureRequestKind`,
  `schema.featureRequestStatus`, typy `FeatureRequest`, `NewFeatureRequest`,
  `FeatureRequestKindDb`, `FeatureRequestStatusDb`.

- [ ] **Krok 1: Dopisz enumy w sekcji `// ---------------- Enums ----------------`**

Zaraz po `export const skillTier = pgEnum(...)`:

```ts
export const featureRequestKind = pgEnum("feature_request_kind", ["idea", "bug", "other"]);
export const featureRequestStatus = pgEnum("feature_request_status", [
  "new",
  "considering",
  "planned",
  "done",
  "rejected",
]);
```

- [ ] **Krok 2: Dopisz tabelę**

Na końcu pliku, przed sekcją `// ---------------- Types ----------------`:

```ts
// ---------------- Feature requests (Pomysły) ----------------

// Zgłoszenia podopiecznych: pomysły na usprawnienia i zgłoszenia błędów.
// Prywatne w parze — czyta je autor i JEGO trener, nikt więcej. `trainer_id`
// jest zdenormalizowany (jak w `workout_logs`), żeby skrzynka trenera była
// jednym zapytaniem bez joinowania autora tylko po to, by ustalić tenant.
export const featureRequests = pgTable(
  "feature_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traineeId: uuid("trainee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: featureRequestKind("kind").notNull().default("idea"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: featureRequestStatus("status").notNull().default("new"),
    trainerResponse: text("trainer_response"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    traineeCreatedIdx: index("feature_requests_trainee_created_idx").on(t.traineeId, t.createdAt),
    trainerStatusIdx: index("feature_requests_trainer_status_idx").on(t.trainerId, t.status),
    trainerCreatedIdx: index("feature_requests_trainer_created_idx").on(t.trainerId, t.createdAt),
  }),
);
```

- [ ] **Krok 3: Dopisz typy w sekcji „Types"**

Na końcu pliku:

```ts
export type FeatureRequest = typeof featureRequests.$inferSelect;
export type NewFeatureRequest = typeof featureRequests.$inferInsert;
export type FeatureRequestKindDb = (typeof featureRequestKind.enumValues)[number];
export type FeatureRequestStatusDb = (typeof featureRequestStatus.enumValues)[number];
```

- [ ] **Krok 4: Wygeneruj migrację**

Uruchom: `npm run db:generate`
Oczekiwane: nowy plik w `app/lib/db/migrations/` z `CREATE TYPE "feature_request_kind"`,
`CREATE TYPE "feature_request_status"`, `CREATE TABLE "feature_requests"` i trzema
`CREATE INDEX`. To czysty dodatek — drizzle-kit nie zada pytań o rename/drop.
Gdyby jednak zapytał interaktywnie: przerwij i zostaw krok właścicielowi
(handoff), nie zgaduj odpowiedzi.

- [ ] **Krok 5: Sprawdź wygenerowany SQL**

Odczytaj nowy plik migracji (narzędzie Read, nie `cat`). Zweryfikuj: brak
`DROP`, brak zmian w istniejących tabelach, `trainer_id`/`trainee_id` z
`ON DELETE cascade`, `status` z `DEFAULT 'new'`.

- [ ] **Krok 6: Bramka**

Uruchom: `npm run typecheck` → oczekiwane: bez błędów.
Uruchom: `npm run lint` → oczekiwane: bez błędów.

---

### Task 2: Czysty moduł typów, walidacji i prezentacji (TDD)

**Pliki:**
- Utwórz: `app/lib/feature-request-types.ts`
- Test: `app/lib/feature-request-types.test.ts`

**Interfejsy:**
- Konsumuje: `schema.featureRequestKind.enumValues`, `schema.featureRequestStatus.enumValues` (tylko w teście parzystości).
- Produkuje:
  - `FEATURE_REQUEST_KINDS: readonly ["idea","bug","other"]`, `FEATURE_REQUEST_STATUSES: readonly ["new","considering","planned","done","rejected"]`
  - typy `FeatureRequestKind`, `FeatureRequestStatus`, `FeatureRequestTone`, `FeatureRequestPresentation`
  - `KIND_LABEL`, `STATUS_LABEL`, `TONE_TEXT`, `TONE_DOT`
  - `statusPresentation(status: FeatureRequestStatus): FeatureRequestPresentation`
  - `canTraineeDelete(status: FeatureRequestStatus): boolean`
  - `FeatureRequestFormSchema` → `{ kind, title, body }`
  - `FeatureRequestResponseSchema` → `{ status, response: string | null }`

- [ ] **Krok 1: Napisz failujący test**

Utwórz `app/lib/feature-request-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";
import {
  FEATURE_REQUEST_KINDS,
  FEATURE_REQUEST_STATUSES,
  FeatureRequestFormSchema,
  FeatureRequestResponseSchema,
  KIND_LABEL,
  STATUS_LABEL,
  canTraineeDelete,
  statusPresentation,
} from "~/lib/feature-request-types";

const validForm = { kind: "idea", title: "Ciemny motyw", body: "Przydałby się ciemny motyw w aplikacji." };

describe("parzystość z enumami bazy", () => {
  it("typy zgłoszeń pokrywają się z pgEnum", () => {
    expect([...FEATURE_REQUEST_KINDS]).toEqual([...schema.featureRequestKind.enumValues]);
  });

  it("statusy pokrywają się z pgEnum", () => {
    expect([...FEATURE_REQUEST_STATUSES]).toEqual([...schema.featureRequestStatus.enumValues]);
  });

  it("każdy typ i status ma polską etykietę", () => {
    for (const k of FEATURE_REQUEST_KINDS) expect(KIND_LABEL[k].length).toBeGreaterThan(0);
    for (const s of FEATURE_REQUEST_STATUSES) expect(STATUS_LABEL[s].length).toBeGreaterThan(0);
  });
});

describe("FeatureRequestFormSchema", () => {
  it("przyjmuje poprawne zgłoszenie", () => {
    const parsed = FeatureRequestFormSchema.safeParse(validForm);
    expect(parsed.success).toBe(true);
  });

  it("domyślnym typem jest pomysł", () => {
    const parsed = FeatureRequestFormSchema.safeParse({ title: validForm.title, body: validForm.body });
    expect(parsed.success && parsed.data.kind).toBe("idea");
  });

  it("odrzuca nieznany typ", () => {
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, kind: "spam" }).success).toBe(false);
  });

  it("odrzuca tytuł krótszy niż 3 znaki, przyjmuje 3", () => {
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, title: "ab" }).success).toBe(false);
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, title: "abc" }).success).toBe(true);
  });

  it("odrzuca tytuł dłuższy niż 120 znaków, przyjmuje 120", () => {
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, title: "a".repeat(120) }).success).toBe(true);
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, title: "a".repeat(121) }).success).toBe(false);
  });

  it("przycina białe znaki i liczy długość PO przycięciu", () => {
    const parsed = FeatureRequestFormSchema.safeParse({ ...validForm, title: "  Ciemny motyw  " });
    expect(parsed.success && parsed.data.title).toBe("Ciemny motyw");
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, title: "   ab   " }).success).toBe(false);
  });

  it("odrzuca opis krótszy niż 10 znaków, przyjmuje 10", () => {
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, body: "za krotki" }).success).toBe(false);
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, body: "0123456789" }).success).toBe(true);
  });

  it("odrzuca opis dłuższy niż 2000 znaków, przyjmuje 2000", () => {
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, body: "a".repeat(2000) }).success).toBe(true);
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, body: "a".repeat(2001) }).success).toBe(false);
  });

  it("komunikaty błędów są po polsku", () => {
    const parsed = FeatureRequestFormSchema.safeParse({ ...validForm, title: "ab" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toContain("Tytuł");
  });
});

describe("FeatureRequestResponseSchema", () => {
  it("pusta odpowiedź staje się null", () => {
    const parsed = FeatureRequestResponseSchema.safeParse({ status: "done", response: "" });
    expect(parsed.success && parsed.data.response).toBeNull();
  });

  it("odpowiedź z samych spacji staje się null", () => {
    const parsed = FeatureRequestResponseSchema.safeParse({ status: "done", response: "   " });
    expect(parsed.success && parsed.data.response).toBeNull();
  });

  it("przycina odpowiedź", () => {
    const parsed = FeatureRequestResponseSchema.safeParse({ status: "planned", response: "  Robimy.  " });
    expect(parsed.success && parsed.data.response).toBe("Robimy.");
  });

  it("odrzuca odpowiedź dłuższą niż 2000 znaków", () => {
    expect(
      FeatureRequestResponseSchema.safeParse({ status: "done", response: "a".repeat(2001) }).success,
    ).toBe(false);
  });

  it("odrzuca nieznany status", () => {
    expect(FeatureRequestResponseSchema.safeParse({ status: "wontfix", response: "" }).success).toBe(false);
  });
});

describe("statusPresentation", () => {
  it("daje polską etykietę i ton dla każdego statusu", () => {
    expect(statusPresentation("new")).toEqual({ label: "Nowe", tone: "new" });
    expect(statusPresentation("considering")).toEqual({ label: "Rozważamy", tone: "progress" });
    expect(statusPresentation("planned")).toEqual({ label: "Zaplanowane", tone: "progress" });
    expect(statusPresentation("done")).toEqual({ label: "Zrobione", tone: "done" });
    expect(statusPresentation("rejected")).toEqual({ label: "Odrzucone", tone: "rejected" });
  });
});

describe("canTraineeDelete", () => {
  it("pozwala usunąć tylko zgłoszenie ze statusem Nowe", () => {
    expect(canTraineeDelete("new")).toBe(true);
    for (const s of FEATURE_REQUEST_STATUSES.filter((x) => x !== "new")) {
      expect(canTraineeDelete(s)).toBe(false);
    }
  });
});
```

- [ ] **Krok 2: Uruchom test i potwierdź, że failuje**

Uruchom: `npx vitest run app/lib/feature-request-types.test.ts`
Oczekiwane: FAIL — `Failed to resolve import "~/lib/feature-request-types"`.

- [ ] **Krok 3: Napisz implementację**

Utwórz `app/lib/feature-request-types.ts`:

```ts
import { z } from "zod";

/**
 * Zgłoszenia podopiecznych („Pomysły") — czysta warstwa: słowniki etykiet,
 * prezentacja statusu i schematy Zod. Bez DB, bez `Date.now` — cel testów
 * jednostkowych. Jedno źródło prawdy etykiet dla OBU paneli, żeby ten sam
 * status nie nazywał się inaczej u trenera niż u podopiecznego.
 */

export const FEATURE_REQUEST_KINDS = ["idea", "bug", "other"] as const;
export type FeatureRequestKind = (typeof FEATURE_REQUEST_KINDS)[number];

export const FEATURE_REQUEST_STATUSES = [
  "new",
  "considering",
  "planned",
  "done",
  "rejected",
] as const;
export type FeatureRequestStatus = (typeof FEATURE_REQUEST_STATUSES)[number];

export const KIND_LABEL: Record<FeatureRequestKind, string> = {
  idea: "Pomysł",
  bug: "Błąd",
  other: "Inne",
};

export const STATUS_LABEL: Record<FeatureRequestStatus, string> = {
  new: "Nowe",
  considering: "Rozważamy",
  planned: "Zaplanowane",
  done: "Zrobione",
  rejected: "Odrzucone",
};

export type FeatureRequestTone = "new" | "progress" | "done" | "rejected";

export interface FeatureRequestPresentation {
  label: string;
  tone: FeatureRequestTone;
}

/** Kolor tekstu plakietki per ton (zmienne z tokens.css). */
export const TONE_TEXT: Record<FeatureRequestTone, string> = {
  new: "var(--warn)",
  progress: "var(--ink-2)",
  done: "var(--ok)",
  rejected: "var(--muted)",
};

/** Kolor kropki plakietki per ton. */
export const TONE_DOT: Record<FeatureRequestTone, string> = {
  new: "var(--warn)",
  progress: "var(--muted-2)",
  done: "var(--ok)",
  rejected: "var(--muted-2)",
};

export function statusPresentation(status: FeatureRequestStatus): FeatureRequestPresentation {
  switch (status) {
    case "considering":
    case "planned":
      return { label: STATUS_LABEL[status], tone: "progress" };
    case "done":
      return { label: STATUS_LABEL.done, tone: "done" };
    case "rejected":
      return { label: STATUS_LABEL.rejected, tone: "rejected" };
    default:
      return { label: STATUS_LABEL.new, tone: "new" };
  }
}

/**
 * Autor może wycofać własne zgłoszenie, dopóki trener go nie ruszył. Po zmianie
 * statusu (czyli po odpowiedzi) kasowanie zabrałoby trenerowi rozmowę sprzed nosa.
 */
export function canTraineeDelete(status: FeatureRequestStatus): boolean {
  return status === "new";
}

export const FeatureRequestFormSchema = z.object({
  kind: z.enum(FEATURE_REQUEST_KINDS).default("idea"),
  title: z
    .string()
    .trim()
    .min(3, "Tytuł musi mieć co najmniej 3 znaki.")
    .max(120, "Tytuł może mieć najwyżej 120 znaków."),
  body: z
    .string()
    .trim()
    .min(10, "Opis musi mieć co najmniej 10 znaków.")
    .max(2000, "Opis może mieć najwyżej 2000 znaków."),
});
export type FeatureRequestForm = z.infer<typeof FeatureRequestFormSchema>;

export const FeatureRequestResponseSchema = z.object({
  status: z.enum(FEATURE_REQUEST_STATUSES),
  response: z
    .string()
    .trim()
    .max(2000, "Odpowiedź może mieć najwyżej 2000 znaków.")
    .transform((s) => (s.length === 0 ? null : s)),
});
export type FeatureRequestResponse = z.infer<typeof FeatureRequestResponseSchema>;
```

- [ ] **Krok 4: Uruchom test i potwierdź, że przechodzi**

Uruchom: `npx vitest run app/lib/feature-request-types.test.ts`
Oczekiwane: PASS, wszystkie przypadki zielone.

- [ ] **Krok 5: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npx biome format --write app/lib/feature-request-types.ts` → sformatowane.
Uruchom: `npm run lint` → bez błędów.

---

### Task 3: Repozytorium `feature-requests.ts`

**Pliki:**
- Utwórz: `app/lib/feature-requests.ts`

**Interfejsy:**
- Konsumuje: `schema.featureRequests`, `schema.users`, typy z `feature-request-types.ts`, `Db` z `~/lib/db/client`.
- Produkuje (używane przez taski 4–6):
  - `FeatureRequestError { message, userMessage }`
  - `type FeatureRequestSort = "newest" | "oldest"`
  - `interface TraineeRequestRow { id, kind, title, body, status, trainerResponse, respondedAtISO, createdAtISO }`
  - `interface TrainerRequestRow { id, kind, title, status, traineeId, traineeName, createdAtISO, respondedAtISO }`
  - `interface TrainerRequestDetail extends TrainerRequestRow { body, trainerResponse }`
  - `listForTrainee(db, traineeId, opts: { sort?, status?, limit, offset }): Promise<TraineeRequestRow[]>`
  - `countForTrainee(db, traineeId, opts: { status? }): Promise<number>`
  - `createFeatureRequest(db, args: { trainerId, traineeId, kind, title, body }): Promise<{ id: string }>`
  - `deleteFeatureRequest(db, args: { traineeId, id }): Promise<void>` (rzuca `FeatureRequestError`)
  - `listForTrainer(db, trainerId, opts: { sort?, status?, kind?, q?, limit, offset }): Promise<TrainerRequestRow[]>`
  - `countForTrainer(db, trainerId, opts: { status?, kind?, q? }): Promise<number>`
  - `getForTrainer(db, trainerId, id): Promise<TrainerRequestDetail | null>`
  - `respondToFeatureRequest(db, args: { trainerId, id, status, response }): Promise<void>` (rzuca `FeatureRequestError`)
  - `countNewForTrainer(db, trainerId): Promise<number>`

Uwaga o `status`/`kind` w opcjach: wartość `"all"` (albo `undefined`) znaczy
„bez filtra" — tak samo jak `defaultValue` w `<ListControls>`.

- [ ] **Krok 1: Napisz moduł**

Utwórz `app/lib/feature-requests.ts`:

```ts
import { type SQL, and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import type { FeatureRequestKind, FeatureRequestStatus } from "~/lib/feature-request-types";

/**
 * Repozytorium zgłoszeń podopiecznych („Pomysły"). Zgłoszenie jest PRYWATNE w
 * parze: czyta je autor i jego trener. Każda funkcja przyjmuje wymagany
 * `traineeId` (widok autora) albo `trainerId` (skrzynka trenera) i filtruje po
 * nim w zapytaniu — nigdy po odczycie. Brak dopasowania to `null`/`0`; trasa
 * zamienia to na 404, nie 403 (nie zdradzamy istnienia cudzego zasobu).
 */

export class FeatureRequestError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export type FeatureRequestSort = "newest" | "oldest";

export interface TraineeRequestRow {
  id: string;
  kind: FeatureRequestKind;
  title: string;
  body: string;
  status: FeatureRequestStatus;
  trainerResponse: string | null;
  respondedAtISO: string | null;
  createdAtISO: string;
}

export interface TrainerRequestRow {
  id: string;
  kind: FeatureRequestKind;
  title: string;
  status: FeatureRequestStatus;
  traineeId: string;
  traineeName: string;
  createdAtISO: string;
  respondedAtISO: string | null;
}

export interface TrainerRequestDetail extends TrainerRequestRow {
  body: string;
  trainerResponse: string | null;
}

type StatusFilter = FeatureRequestStatus | "all" | undefined;
type KindFilter = FeatureRequestKind | "all" | undefined;

function statusCond(status: StatusFilter): SQL | undefined {
  return status == null || status === "all"
    ? undefined
    : eq(schema.featureRequests.status, status);
}

function kindCond(kind: KindFilter): SQL | undefined {
  return kind == null || kind === "all" ? undefined : eq(schema.featureRequests.kind, kind);
}

/** Szukajka trenera: tytuł, treść albo nazwa autora. `%`/`_` escapujemy — inaczej `%` w zapytaniu pasuje do wszystkiego. */
function searchCond(q: string | undefined): SQL | undefined {
  const trimmed = (q ?? "").trim();
  if (trimmed.length === 0) return undefined;
  const pattern = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(
    ilike(schema.featureRequests.title, pattern),
    ilike(schema.featureRequests.body, pattern),
    ilike(schema.users.displayName, pattern),
  );
}

function orderFor(sort: FeatureRequestSort | undefined) {
  return sort === "oldest"
    ? asc(schema.featureRequests.createdAt)
    : desc(schema.featureRequests.createdAt);
}

// ---------------- Podopieczny (autor) ----------------

export async function listForTrainee(
  db: Db,
  traineeId: string,
  opts: { sort?: FeatureRequestSort; status?: StatusFilter; limit: number; offset: number },
): Promise<TraineeRequestRow[]> {
  const rows = await db
    .select({
      id: schema.featureRequests.id,
      kind: schema.featureRequests.kind,
      title: schema.featureRequests.title,
      body: schema.featureRequests.body,
      status: schema.featureRequests.status,
      trainerResponse: schema.featureRequests.trainerResponse,
      respondedAt: schema.featureRequests.respondedAt,
      createdAt: schema.featureRequests.createdAt,
    })
    .from(schema.featureRequests)
    .where(and(eq(schema.featureRequests.traineeId, traineeId), statusCond(opts.status)))
    .orderBy(orderFor(opts.sort))
    .limit(opts.limit)
    .offset(opts.offset);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    status: r.status,
    trainerResponse: r.trainerResponse,
    respondedAtISO: r.respondedAt?.toISOString() ?? null,
    createdAtISO: r.createdAt.toISOString(),
  }));
}

export async function countForTrainee(
  db: Db,
  traineeId: string,
  opts: { status?: StatusFilter } = {},
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.featureRequests)
    .where(and(eq(schema.featureRequests.traineeId, traineeId), statusCond(opts.status)));
  return Number(row?.c ?? 0);
}

export async function createFeatureRequest(
  db: Db,
  args: {
    trainerId: string;
    traineeId: string;
    kind: FeatureRequestKind;
    title: string;
    body: string;
  },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.featureRequests)
    .values({
      trainerId: args.trainerId,
      traineeId: args.traineeId,
      kind: args.kind,
      title: args.title,
      body: args.body,
    })
    .returning({ id: schema.featureRequests.id });
  return { id: row!.id };
}

/**
 * Kasuje WŁASNE zgłoszenie autora i tylko dopóki ma status `new`. Warunek statusu
 * siedzi w `WHERE`, nie w kodzie po odczycie — inaczej trener odpowiadający w tej
 * samej chwili przegrywałby wyścig i odpowiedź znikałaby razem ze zgłoszeniem.
 */
export async function deleteFeatureRequest(
  db: Db,
  args: { traineeId: string; id: string },
): Promise<void> {
  const deleted = await db
    .delete(schema.featureRequests)
    .where(
      and(
        eq(schema.featureRequests.id, args.id),
        eq(schema.featureRequests.traineeId, args.traineeId),
        eq(schema.featureRequests.status, "new"),
      ),
    )
    .returning({ id: schema.featureRequests.id });

  if (deleted.length === 0) {
    throw new FeatureRequestError(
      "not deletable",
      "Nie można usunąć tego zgłoszenia — trener już je obsłużył.",
    );
  }
}

// ---------------- Trener (skrzynka) ----------------

export async function listForTrainer(
  db: Db,
  trainerId: string,
  opts: {
    sort?: FeatureRequestSort;
    status?: StatusFilter;
    kind?: KindFilter;
    q?: string;
    limit: number;
    offset: number;
  },
): Promise<TrainerRequestRow[]> {
  const rows = await db
    .select({
      id: schema.featureRequests.id,
      kind: schema.featureRequests.kind,
      title: schema.featureRequests.title,
      status: schema.featureRequests.status,
      traineeId: schema.featureRequests.traineeId,
      traineeName: schema.users.displayName,
      createdAt: schema.featureRequests.createdAt,
      respondedAt: schema.featureRequests.respondedAt,
    })
    .from(schema.featureRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.featureRequests.traineeId))
    .where(
      and(
        eq(schema.featureRequests.trainerId, trainerId),
        statusCond(opts.status),
        kindCond(opts.kind),
        searchCond(opts.q),
      ),
    )
    .orderBy(orderFor(opts.sort))
    .limit(opts.limit)
    .offset(opts.offset);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    traineeId: r.traineeId,
    traineeName: r.traineeName,
    createdAtISO: r.createdAt.toISOString(),
    respondedAtISO: r.respondedAt?.toISOString() ?? null,
  }));
}

export async function countForTrainer(
  db: Db,
  trainerId: string,
  opts: { status?: StatusFilter; kind?: KindFilter; q?: string } = {},
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.featureRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.featureRequests.traineeId))
    .where(
      and(
        eq(schema.featureRequests.trainerId, trainerId),
        statusCond(opts.status),
        kindCond(opts.kind),
        searchCond(opts.q),
      ),
    );
  return Number(row?.c ?? 0);
}

export async function getForTrainer(
  db: Db,
  trainerId: string,
  id: string,
): Promise<TrainerRequestDetail | null> {
  const [r] = await db
    .select({
      id: schema.featureRequests.id,
      kind: schema.featureRequests.kind,
      title: schema.featureRequests.title,
      body: schema.featureRequests.body,
      status: schema.featureRequests.status,
      trainerResponse: schema.featureRequests.trainerResponse,
      traineeId: schema.featureRequests.traineeId,
      traineeName: schema.users.displayName,
      createdAt: schema.featureRequests.createdAt,
      respondedAt: schema.featureRequests.respondedAt,
    })
    .from(schema.featureRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.featureRequests.traineeId))
    .where(and(eq(schema.featureRequests.id, id), eq(schema.featureRequests.trainerId, trainerId)))
    .limit(1);

  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    status: r.status,
    trainerResponse: r.trainerResponse,
    traineeId: r.traineeId,
    traineeName: r.traineeName,
    createdAtISO: r.createdAt.toISOString(),
    respondedAtISO: r.respondedAt?.toISOString() ?? null,
  };
}

/**
 * Ustawia status i odpowiedź. `respondedAt` stemplujemy tylko przy NIEPUSTEJ
 * odpowiedzi — sama zmiana statusu nie jest odpowiedzią i nie powinna udawać, że
 * trener coś napisał.
 */
export async function respondToFeatureRequest(
  db: Db,
  args: {
    trainerId: string;
    id: string;
    status: FeatureRequestStatus;
    response: string | null;
  },
): Promise<void> {
  const updated = await db
    .update(schema.featureRequests)
    .set({
      status: args.status,
      trainerResponse: args.response,
      respondedAt: args.response == null ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.featureRequests.id, args.id), eq(schema.featureRequests.trainerId, args.trainerId)))
    .returning({ id: schema.featureRequests.id });

  if (updated.length === 0) {
    throw new FeatureRequestError("not found", "Nie znaleziono zgłoszenia.");
  }
}

/** Odznaka nawigacji trenera — liczy WYŁĄCZNIE nieruszone zgłoszenia. */
export async function countNewForTrainer(db: Db, trainerId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.featureRequests)
    .where(
      and(eq(schema.featureRequests.trainerId, trainerId), eq(schema.featureRequests.status, "new")),
    );
  return Number(row?.c ?? 0);
}
```

- [ ] **Krok 2: Bramka**

Uruchom: `npm run typecheck` → bez błędów (w szczególności: `r.kind`/`r.status`
z drizzle typują się na literały enuma, więc mapowanie na `FeatureRequestKind`/
`FeatureRequestStatus` przechodzi bez rzutowań; jeśli tsc zgłosi niezgodność,
znaczy że tuple w `feature-request-types.ts` rozjechały się z pgEnum — napraw
tam, nie rzutuj `as`).
Uruchom: `npx biome format --write app/lib/feature-requests.ts`
Uruchom: `npm run lint` → bez błędów.

---

### Task 4: Widok podopiecznego `/podopieczny/pomysly` + nawigacja

**UI prowadzi skill `frontend-design:frontend-design`** — zanim napiszesz JSX,
przejrzyj `design-system/README.md` i klasy w `app/styles/`.

**Pliki:**
- Utwórz: `app/components/feature-request-badge.tsx`
- Utwórz: `app/routes/podopieczny/pomysly.tsx`
- Modyfikacja: `app/routes.ts` (blok `prefix("podopieczny", …)`, po `route("konsultacje/:konsultacjaId", …)`)
- Modyfikacja: `app/routes/podopieczny/_layout.tsx` (loader + `NAV_ITEMS`)

**Interfejsy:**
- Konsumuje: `listForTrainee`, `countForTrainee`, `createFeatureRequest`, `deleteFeatureRequest`, `FeatureRequestError` (Task 3); `FeatureRequestFormSchema`, `statusPresentation`, `canTraineeDelete`, `KIND_LABEL`, `FEATURE_REQUEST_KINDS` (Task 2); `parseListControls`, `ListControls`, `Pagination`, `parsePage`, `fmtDate`, `pluralizePl`.
- Produkuje: komponent `<FeatureRequestBadge status={FeatureRequestStatus} />` (używany też w Tasku 5 i 6).

- [ ] **Krok 1: Plakietka statusu**

Utwórz `app/components/feature-request-badge.tsx`:

```tsx
import {
  type FeatureRequestStatus,
  TONE_DOT,
  TONE_TEXT,
  statusPresentation,
} from "~/lib/feature-request-types";

/**
 * Plakietka statusu zgłoszenia — sygnaturowy `.badge` design-systemu. Wygląd
 * bierze się z `statusPresentation`, więc status wygląda tak samo u autora i u
 * trenera.
 */
export function FeatureRequestBadge({ status }: { status: FeatureRequestStatus }) {
  const { label, tone } = statusPresentation(status);
  return (
    <span className="badge" style={{ color: TONE_TEXT[tone], whiteSpace: "nowrap" }}>
      <span className="badge-dot" style={{ background: TONE_DOT[tone] }} />
      {label}
    </span>
  );
}
```

- [ ] **Krok 2: Trasa podopiecznego**

Utwórz `app/routes/podopieczny/pomysly.tsx`:

```tsx
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { FeatureRequestBadge } from "~/components/feature-request-badge";
import { ListControls } from "~/components/list-controls";
import { Pagination, parsePage } from "~/components/pagination";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import {
  FEATURE_REQUEST_KINDS,
  FEATURE_REQUEST_STATUSES,
  FeatureRequestFormSchema,
  KIND_LABEL,
  STATUS_LABEL,
  canTraineeDelete,
} from "~/lib/feature-request-types";
import {
  FeatureRequestError,
  countForTrainee,
  createFeatureRequest,
  deleteFeatureRequest,
  listForTrainee,
  type FeatureRequestSort,
} from "~/lib/feature-requests";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";

const PAGE_SIZE = 20;
const ZGLOSZENIE: PlForms = { one: "zgłoszenie", few: "zgłoszenia", many: "zgłoszeń" };

const spec: ListControlsSpec = {
  sortOptions: [
    { key: "newest", label: "Najnowsze" },
    { key: "oldest", label: "Najstarsze" },
  ],
  defaultSort: "newest",
  filterGroups: [
    {
      param: "status",
      label: "Status",
      options: [
        { value: "all", label: "Wszystkie" },
        ...FEATURE_REQUEST_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
      ],
      defaultValue: "all",
    },
  ],
  searchable: false,
};

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);
  const controls = parseListControls(url.searchParams, spec);
  const status = controls.filters.status as "all" | (typeof FEATURE_REQUEST_STATUSES)[number];

  const total = await countForTrainee(db, user.id, { status });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const requests = await listForTrainee(db, user.id, {
    sort: controls.sort as FeatureRequestSort,
    status,
    limit: PAGE_SIZE,
    offset: (safePage - 1) * PAGE_SIZE,
  });

  return { requests, spec, controls, page: safePage, totalPages, total };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  // CHECK `users_role_check` gwarantuje trenera przy roli trainee — ale typ jest
  // nullowalny, więc zamiast rzutować, odmawiamy wprost.
  if (user.trainerId == null) throw new Response("Not Found", { status: 404 });

  const fd = await args.request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "delete") {
    const id = String(fd.get("id") ?? "");
    try {
      await deleteFeatureRequest(db, { traineeId: user.id, id });
      return { ok: "Zgłoszenie usunięte." as const, error: null };
    } catch (e) {
      if (e instanceof FeatureRequestError) return { ok: null, error: e.userMessage };
      throw e;
    }
  }

  const parsed = FeatureRequestFormSchema.safeParse({
    kind: fd.has("kind") ? String(fd.get("kind")) : undefined,
    title: String(fd.get("title") ?? ""),
    body: String(fd.get("body") ?? ""),
  });
  if (!parsed.success) {
    return { ok: null, error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
  }

  await createFeatureRequest(db, {
    trainerId: user.trainerId,
    traineeId: user.id,
    kind: parsed.data.kind,
    title: parsed.data.title,
    body: parsed.data.body,
  });
  return { ok: "Dzięki! Trener zobaczy Twoje zgłoszenie." as const, error: null };
}

export default function PomyslyPodopiecznego() {
  const { requests, spec, controls, page, totalPages, total } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Pomysły</h1>
          <div className="sub">
            Masz pomysł na usprawnienie aplikacji albo trafiłeś na błąd? Napisz — trener to zobaczy.
          </div>
        </div>
      </div>

      <Form
        method="post"
        className="card"
        style={{ padding: 16, display: "grid", gap: 12, marginBottom: 22 }}
      >
        <div className="row wrap" style={{ gap: 12 }}>
          <label className="col" style={{ gap: 4, width: 160 }}>
            <span className="text-sm">Typ</span>
            <select name="kind" className="input" defaultValue="idea">
              {FEATURE_REQUEST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="col" style={{ gap: 4, flex: 1, minWidth: 220 }}>
            <span className="text-sm">Tytuł</span>
            <input
              name="title"
              className="input"
              maxLength={120}
              required
              placeholder="np. Przypomnienie o treningu"
            />
          </label>
        </div>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Opis</span>
          <textarea
            name="body"
            className="input"
            rows={4}
            maxLength={2000}
            required
            placeholder="Opisz, co chcesz zmienić i dlaczego. Im konkretniej, tym lepiej."
          />
        </label>
        {actionData?.error != null && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>
            {actionData.error}
          </p>
        )}
        {actionData?.ok != null && (
          <p role="status" style={{ color: "var(--ok)", fontSize: 12, margin: 0 }}>
            {actionData.ok}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Wysyłam…" : "Wyślij zgłoszenie"}
        </button>
      </Form>

      <ListControls spec={spec} state={controls} />

      {total === 0 ? (
        <div className="empty">
          <h3>Brak zgłoszeń</h3>
          <div>Twoje pomysły pojawią się tutaj razem z odpowiedzią trenera.</div>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          {requests.map((r) => (
            <article key={r.id} className="card" style={{ padding: 16, display: "grid", gap: 8 }}>
              <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
                <span className="badge">{KIND_LABEL[r.kind]}</span>
                <FeatureRequestBadge status={r.status} />
                <span style={{ flex: 1 }} />
                <span className="text-xs muted mono">{fmtDate(r.createdAtISO)}</span>
              </div>
              <h3 style={{ margin: 0, fontSize: 15 }}>{r.title}</h3>
              <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{r.body}</p>

              {r.trainerResponse != null && (
                <div
                  className="col"
                  style={{
                    gap: 4,
                    padding: 12,
                    borderRadius: 10,
                    background: "var(--surface-2)",
                  }}
                >
                  <span className="text-xs muted">
                    Odpowiedź trenera
                    {r.respondedAtISO != null && ` · ${fmtDate(r.respondedAtISO)}`}
                  </span>
                  <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>
                    {r.trainerResponse}
                  </p>
                </div>
              )}

              {canTraineeDelete(r.status) && (
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="btn btn-sm" disabled={busy}>
                    Usuń
                  </button>
                </Form>
              )}
            </article>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        totalLabel={pluralizePl(total, ZGLOSZENIE)}
      />
    </div>
  );
}
```

- [ ] **Krok 3: Zarejestruj trasę**

W `app/routes.ts`, w bloku `prefix("podopieczny", [ layout(...) ])`, po linii
`route("konsultacje/:konsultacjaId", "routes/podopieczny/konsultacje.$konsultacjaId.tsx"),`:

```ts
      route("pomysly", "routes/podopieczny/pomysly.tsx"),
```

- [ ] **Krok 4: Dodaj pozycję w sidenavie podopiecznego**

W `app/routes/podopieczny/_layout.tsx`:

1. import: `import { countForTrainee } from "~/lib/feature-requests";`
2. w loaderze, po `const pending = await countPendingForTrainee(db, user.id);`:

```ts
  const ideas = await countForTrainee(db, user.id);
```

3. w zwracanym `tails` dopisz `ideas,`
4. w `NAV_ITEMS`, po pozycji „Konsultacje" (przed „Płatności"):

```ts
  {
    to: "/podopieczny/pomysly",
    label: "Pomysły",
    end: false,
    icon: "Sparkle" as const,
    tailKey: "ideas" as const,
  },
```

(`Sparkle` istnieje w `app/components/icons.tsx` — nie dodajemy nowej ikony.)

- [ ] **Krok 5: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npx biome format --write app/routes/podopieczny/pomysly.tsx`
Uruchom: `npm run lint` → bez błędów.
Uruchom: `npm run build` → build SSR + klient przechodzi.

---

### Task 5: Szczegół zgłoszenia u trenera + odpowiedź

**UI prowadzi skill `frontend-design:frontend-design`.**

**Pliki:**
- Utwórz: `app/routes/trener/pomysly.$requestId.tsx`
- Modyfikacja: `app/routes.ts` (blok `prefix("trener", …)`)

**Interfejsy:**
- Konsumuje: `getForTrainer`, `respondToFeatureRequest`, `FeatureRequestError` (Task 3); `FeatureRequestResponseSchema`, `FEATURE_REQUEST_STATUSES`, `STATUS_LABEL`, `KIND_LABEL` (Task 2); `<FeatureRequestBadge>` (Task 4).
- Produkuje: URL `/trener/pomysly/:requestId` — cel linków z listy w Tasku 6.

- [ ] **Krok 1: Napisz trasę**

Utwórz `app/routes/trener/pomysly.$requestId.tsx`:

```tsx
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { FeatureRequestBadge } from "~/components/feature-request-badge";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import {
  FEATURE_REQUEST_STATUSES,
  FeatureRequestResponseSchema,
  KIND_LABEL,
  STATUS_LABEL,
} from "~/lib/feature-request-types";
import { FeatureRequestError, getForTrainer, respondToFeatureRequest } from "~/lib/feature-requests";
import { fmtDate } from "~/lib/format";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const request = await getForTrainer(db, user.id, args.params.requestId ?? "");
  // Cudze zgłoszenie = 404, nie 403 — nie potwierdzamy, że taki wiersz istnieje.
  if (request == null) throw new Response("Not Found", { status: 404 });
  return { request };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const parsed = FeatureRequestResponseSchema.safeParse({
    status: String(fd.get("status") ?? ""),
    response: String(fd.get("response") ?? ""),
  });
  if (!parsed.success) {
    return { ok: null, error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
  }

  try {
    await respondToFeatureRequest(db, {
      trainerId: user.id,
      id: args.params.requestId ?? "",
      status: parsed.data.status,
      response: parsed.data.response,
    });
    return { ok: "Zapisano." as const, error: null };
  } catch (e) {
    if (e instanceof FeatureRequestError) throw new Response("Not Found", { status: 404 });
    throw e;
  }
}

export default function ZgloszenieTrenera() {
  const { request } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            <Link to="/trener/pomysly">Pomysły</Link> · {request.traineeName}
          </div>
          <h1>{request.title}</h1>
          <div className="sub row wrap" style={{ gap: 8, alignItems: "center" }}>
            <span className="badge">{KIND_LABEL[request.kind]}</span>
            <FeatureRequestBadge status={request.status} />
            <span className="text-xs muted mono">{fmtDate(request.createdAtISO)}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 22 }}>
        <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{request.body}</p>
      </div>

      <Form method="post" className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <label className="col" style={{ gap: 4, maxWidth: 240 }}>
          <span className="text-sm">Status</span>
          <select name="status" className="input" defaultValue={request.status}>
            {FEATURE_REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="col" style={{ gap: 4 }}>
          <span className="text-sm">Odpowiedź dla podopiecznego (opcjonalna)</span>
          <textarea
            name="response"
            className="input"
            rows={4}
            maxLength={2000}
            defaultValue={request.trainerResponse ?? ""}
            placeholder="Np. „Dobry pomysł — wchodzi w kolejnej wersji.”"
          />
          <span className="text-xs muted">
            Podopieczny zobaczy tę odpowiedź przy swoim zgłoszeniu. Puste pole kasuje odpowiedź.
          </span>
        </label>
        {actionData?.error != null && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: 0 }}>
            {actionData.error}
          </p>
        )}
        {actionData?.ok != null && (
          <p role="status" style={{ color: "var(--ok)", fontSize: 12, margin: 0 }}>
            {actionData.ok}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Zapisuję…" : "Zapisz"}
        </button>
      </Form>
    </div>
  );
}
```

- [ ] **Krok 2: Zarejestruj trasę**

W `app/routes.ts`, w bloku `prefix("trener", [ layout(...) ])`, po
`route("konsultacje", "routes/trener/konsultacje.tsx"),`:

```ts
      route("pomysly/:requestId", "routes/trener/pomysly.$requestId.tsx"),
```

(Wpis listy `route("pomysly", …)` dochodzi w Tasku 6 — kolejność wpisów w tym
pliku nie wpływa na dopasowanie, bo obie ścieżki są statyczne na pierwszym segmencie.)

- [ ] **Krok 3: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npx biome format --write app/routes/trener/pomysly.$requestId.tsx`
Uruchom: `npm run lint` → bez błędów.

---

### Task 6: Skrzynka trenera `/trener/pomysly` + odznaka w nawigacji

**UI prowadzi skill `frontend-design:frontend-design`.**

**Pliki:**
- Utwórz: `app/routes/trener/pomysly._index.tsx`
- Modyfikacja: `app/routes.ts`
- Modyfikacja: `app/routes/trener/_layout.tsx` (loader + `NAV_ITEMS`)

**Interfejsy:**
- Konsumuje: `listForTrainer`, `countForTrainer`, `countNewForTrainer` (Task 3); `<FeatureRequestBadge>` (Task 4); trasa szczegółu (Task 5).

- [ ] **Krok 1: Napisz trasę listy**

Utwórz `app/routes/trener/pomysly._index.tsx`:

```tsx
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { FeatureRequestBadge } from "~/components/feature-request-badge";
import { Icons } from "~/components/icons";
import { ListControls } from "~/components/list-controls";
import { Pagination, parsePage } from "~/components/pagination";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import {
  FEATURE_REQUEST_KINDS,
  FEATURE_REQUEST_STATUSES,
  KIND_LABEL,
  STATUS_LABEL,
} from "~/lib/feature-request-types";
import { countForTrainer, listForTrainer, type FeatureRequestSort } from "~/lib/feature-requests";
import { fmtDate, pluralizePl, type PlForms } from "~/lib/format";
import { parseListControls, type ListControlsSpec } from "~/lib/list-params";

const PAGE_SIZE = 20;
const ZGLOSZENIE: PlForms = { one: "zgłoszenie", few: "zgłoszenia", many: "zgłoszeń" };

const spec: ListControlsSpec = {
  sortOptions: [
    { key: "newest", label: "Najnowsze" },
    { key: "oldest", label: "Najstarsze" },
  ],
  defaultSort: "newest",
  filterGroups: [
    {
      param: "status",
      label: "Status",
      options: [
        { value: "all", label: "Wszystkie" },
        ...FEATURE_REQUEST_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
      ],
      defaultValue: "all",
    },
    {
      param: "kind",
      label: "Typ",
      options: [
        { value: "all", label: "Wszystkie" },
        ...FEATURE_REQUEST_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })),
      ],
      defaultValue: "all",
    },
  ],
  searchable: true,
};

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const page = parsePage(url.searchParams);
  const controls = parseListControls(url.searchParams, spec);
  const status = controls.filters.status as "all" | (typeof FEATURE_REQUEST_STATUSES)[number];
  const kind = controls.filters.kind as "all" | (typeof FEATURE_REQUEST_KINDS)[number];

  const total = await countForTrainer(db, user.id, { status, kind, q: controls.q });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const requests = await listForTrainer(db, user.id, {
    sort: controls.sort as FeatureRequestSort,
    status,
    kind,
    q: controls.q,
    limit: PAGE_SIZE,
    offset: (safePage - 1) * PAGE_SIZE,
  });

  return { requests, spec, controls, page: safePage, totalPages, total };
}

export default function PomyslyTrenera() {
  const { requests, spec, controls, page, totalPages, total } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Pomysły</h1>
          <div className="sub">
            {total === 0
              ? "Podopieczni nie zgłosili jeszcze nic."
              : `${total} ${pluralizePl(total, ZGLOSZENIE)} od podopiecznych.`}
          </div>
        </div>
      </div>

      <ListControls spec={spec} state={controls} searchPlaceholder="Szukaj po treści lub autorze…" />

      {total === 0 ? (
        <div className="empty">
          <h3>Brak zgłoszeń</h3>
          <div>Gdy podopieczny wyśle pomysł lub zgłosi błąd, zobaczysz go tutaj.</div>
        </div>
      ) : (
        <div className="list">
          {requests.map((r) => (
            <Link
              key={r.id}
              to={`/trener/pomysly/${r.id}`}
              className="list-row"
              style={{ gridTemplateColumns: "76px 1fr auto auto", gap: 14 }}
            >
              <div className="mono text-xs muted">{fmtDate(r.createdAtISO)}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</div>
                <div className="text-xs muted" style={{ marginTop: 2 }}>
                  {r.traineeName} · {KIND_LABEL[r.kind]}
                </div>
              </div>
              <FeatureRequestBadge status={r.status} />
              <Icons.Chev style={{ color: "var(--muted-2)" }} />
            </Link>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        totalLabel={pluralizePl(total, ZGLOSZENIE)}
      />
    </div>
  );
}
```

- [ ] **Krok 2: Zarejestruj trasę**

W `app/routes.ts`, w bloku `prefix("trener", …)`, tuż PRZED wpisem
`route("pomysly/:requestId", …)` z Tasku 5:

```ts
      route("pomysly", "routes/trener/pomysly._index.tsx"),
```

- [ ] **Krok 3: Pozycja w sidenavie trenera z odznaką „nowe"**

W `app/routes/trener/_layout.tsx`:

1. import: `import { countNewForTrainer } from "~/lib/feature-requests";`
2. w loaderze, po zapytaniu o `planCountRow`:

```ts
  const newIdeas = await countNewForTrainer(db, user.id);
```

3. w `tails` dopisz `ideas: newIdeas,`
4. w `NAV_ITEMS`, po pozycji „Konsultacje":

```ts
  {
    to: "/trener/pomysly",
    label: "Pomysły",
    end: false,
    icon: "Sparkle" as const,
    tailKey: "ideas" as const,
  },
```

- [ ] **Krok 4: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npx biome format --write app/routes/trener/pomysly._index.tsx`
Uruchom: `npm run lint` → bez błędów.
Uruchom: `npm run build` → przechodzi.

---

### Task 7: Test integracyjny tenant-scope + dokumentacja

**Pliki:**
- Utwórz: `tests/feature-requests.itest.ts` (NIE uruchamiamy — Docker; uruchamia właściciel)
- Modyfikacja: `app/lib/README.md`, `app/lib/db/README.md`, `app/routes/podopieczny/README.md`, `app/routes/trener/README.md`, `app/components/README.md`, `tests/README.md`

- [ ] **Krok 1: Napisz test integracyjny**

Utwórz `tests/feature-requests.itest.ts`:

```ts
// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import {
  FeatureRequestError,
  countForTrainee,
  countNewForTrainer,
  createFeatureRequest,
  deleteFeatureRequest,
  getForTrainer,
  listForTrainer,
  respondToFeatureRequest,
} from "~/lib/feature-requests";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerA = "";
let trainerB = "";
let traineeA = "";
let traineeB = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trenera@fr.example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;

  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@fr.example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;

  const [pA] = await db
    .insert(schema.users)
    .values({
      email: "podopiecznya@fr.example.com",
      displayName: "Ala Podopieczna",
      role: "trainee",
      trainerId: trainerA,
    })
    .returning({ id: schema.users.id });
  traineeA = pA!.id;

  const [pB] = await db
    .insert(schema.users)
    .values({
      email: "podopiecznyb@fr.example.com",
      displayName: "Bartek Podopieczny",
      role: "trainee",
      trainerId: trainerB,
    })
    .returning({ id: schema.users.id });
  traineeB = pB!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

async function newRequest(trainerId: string, traineeId: string, title: string) {
  return await createFeatureRequest(db, {
    trainerId,
    traineeId,
    kind: "idea",
    title,
    body: "Opis zgłoszenia testowego.",
  });
}

describe("tworzenie", () => {
  it("nowe zgłoszenie ma status new i trafia do trenera autora", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Ciemny motyw");
    const detail = await getForTrainer(db, trainerA, id);
    expect(detail?.status).toBe("new");
    expect(detail?.traineeName).toBe("Ala Podopieczna");
    expect(detail?.trainerResponse).toBeNull();
  });
});

describe("tenant-scope", () => {
  it("trener B nie odczyta zgłoszenia podopiecznego trenera A", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Tenant odczyt");
    expect(await getForTrainer(db, trainerB, id)).toBeNull();
  });

  it("lista trenera B nie zawiera zgłoszeń trenera A", async () => {
    await newRequest(trainerA, traineeA, "Tenant lista A");
    await newRequest(trainerB, traineeB, "Tenant lista B");
    const rows = await listForTrainer(db, trainerB, { limit: 100, offset: 0 });
    expect(rows.every((r) => r.traineeId === traineeB)).toBe(true);
    expect(rows.some((r) => r.title === "Tenant lista A")).toBe(false);
  });

  it("respondToFeatureRequest obcego trenera nic nie zmienia", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Tenant odpowiedź");
    const err = await respondToFeatureRequest(db, {
      trainerId: trainerB,
      id,
      status: "rejected",
      response: "Przejęte",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(FeatureRequestError);
    const detail = await getForTrainer(db, trainerA, id);
    expect(detail?.status).toBe("new");
    expect(detail?.trainerResponse).toBeNull();
  });

  it("podopieczny nie usunie cudzego zgłoszenia", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Tenant usuwanie");
    const err = await deleteFeatureRequest(db, { traineeId: traineeB, id }).catch((e) => e);
    expect(err).toBeInstanceOf(FeatureRequestError);
    expect(await getForTrainer(db, trainerA, id)).not.toBeNull();
  });
});

describe("odpowiedź trenera", () => {
  it("ustawia status, treść i respondedAt", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Odpowiedź pełna");
    await respondToFeatureRequest(db, {
      trainerId: trainerA,
      id,
      status: "planned",
      response: "Robimy w przyszłym miesiącu.",
    });
    const detail = await getForTrainer(db, trainerA, id);
    expect(detail?.status).toBe("planned");
    expect(detail?.trainerResponse).toBe("Robimy w przyszłym miesiącu.");
    expect(detail?.respondedAtISO).not.toBeNull();
  });

  it("sama zmiana statusu nie stempluje respondedAt", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Odpowiedź pusta");
    await respondToFeatureRequest(db, { trainerId: trainerA, id, status: "considering", response: null });
    const detail = await getForTrainer(db, trainerA, id);
    expect(detail?.status).toBe("considering");
    expect(detail?.respondedAtISO).toBeNull();
  });
});

describe("usuwanie przez autora", () => {
  it("usuwa własne zgłoszenie ze statusem new", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Do usunięcia");
    await deleteFeatureRequest(db, { traineeId: traineeA, id });
    expect(await getForTrainer(db, trainerA, id)).toBeNull();
  });

  it("nie usunie zgłoszenia po zmianie statusu przez trenera", async () => {
    const { id } = await newRequest(trainerA, traineeA, "Już obsłużone");
    await respondToFeatureRequest(db, { trainerId: trainerA, id, status: "done", response: "Zrobione." });
    const err = await deleteFeatureRequest(db, { traineeId: traineeA, id }).catch((e) => e);
    expect(err).toBeInstanceOf(FeatureRequestError);
    expect(await getForTrainer(db, trainerA, id)).not.toBeNull();
  });
});

describe("liczniki", () => {
  it("countNewForTrainer liczy tylko new i tylko własne", async () => {
    const before = await countNewForTrainer(db, trainerB);
    const { id } = await newRequest(trainerB, traineeB, "Licznik nowe");
    expect(await countNewForTrainer(db, trainerB)).toBe(before + 1);
    await respondToFeatureRequest(db, { trainerId: trainerB, id, status: "done", response: "OK." });
    expect(await countNewForTrainer(db, trainerB)).toBe(before);
  });

  it("countForTrainee liczy tylko własne zgłoszenia", async () => {
    const mine = await countForTrainee(db, traineeB);
    const all = await db.select().from(schema.featureRequests);
    expect(mine).toBeLessThan(all.length);
  });
});
```

- [ ] **Krok 2: Sprawdź, że test NIE jest uruchamiany w pętli**

Nie uruchamiaj go. Zweryfikuj tylko, że kompiluje się typami:
Uruchom: `npm run typecheck` → bez błędów.

- [ ] **Krok 3: Zaktualizuj dokumentację**

- `app/lib/README.md` — dwa wiersze w tabeli plików:
  - `feature-request-types.ts` — „Zgłoszenia podopiecznych (czyste, bez DB): `FEATURE_REQUEST_KINDS`/`FEATURE_REQUEST_STATUSES` + etykiety PL (`KIND_LABEL`, `STATUS_LABEL`), `statusPresentation` (etykieta+ton plakietki, wspólne dla obu paneli), `canTraineeDelete` (autor kasuje tylko status `new`), Zod `FeatureRequestFormSchema` i `FeatureRequestResponseSchema` (pusta odpowiedź → `null`)."
  - `feature-requests.ts` — „Repo zgłoszeń (tenant-scope): `listForTrainee`/`countForTrainee`, `createFeatureRequest`, `deleteFeatureRequest` (warunek `status='new'` w `WHERE`, nie po odczycie — chroni przed wyścigiem z odpowiedzią trenera), `listForTrainer`/`countForTrainer` (join po autorze, szukajka po tytule/treści/nazwisku z escapowaniem `%`/`_`), `getForTrainer`, `respondToFeatureRequest` (stempluje `responded_at` tylko przy niepustej odpowiedzi), `countNewForTrainer` (odznaka), `FeatureRequestError`."
- `app/lib/db/README.md` — dopisz tabelę `feature_requests` (+ enumy `feature_request_kind`, `feature_request_status`) w opisie schematu, w konwencji istniejących wpisów.
- `app/routes/podopieczny/README.md` — wiersz `pomysly.tsx` | `/podopieczny/pomysly` | loader, action, default | „Zgłoszenia podopiecznego: formularz (typ/tytuł/opis) + własna lista kart ze statusem i odpowiedzią trenera; sort + filtr statusu (`<ListControls>`), paginacja 20. Akcje `create` i `delete` (usuwanie tylko dopóki status `new`)." Dopisz też `lib/feature-requests`, `lib/feature-request-types` i `components/feature-request-badge` do listy modułów na dole.
- `app/routes/trener/README.md` — wiersze `pomysly._index.tsx` i `pomysly.$requestId.tsx` w tej samej konwencji + moduły na dole.
- `app/components/README.md` — wiersz `feature-request-badge.tsx`.
- `tests/README.md` — wiersz `feature-requests.itest.ts` z opisem, co pokrywa.

`CLAUDE.md` bez zmian — nie doszedł żaden katalog.

- [ ] **Krok 4: Bramka końcowa**

Uruchom: `npx vitest run app/lib/feature-request-types.test.ts` → PASS.
Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npm run lint` → bez błędów.
Uruchom: `npm run build` → przechodzi.

- [ ] **Krok 5: Review i security-review**

`/code-review` na całości diffu, potem `/security-review` (zmiana dotyka
`trainer_id` i wprowadza nową powierzchnię zapisu dostępną dla podopiecznego).

---

## Handoff (po Tasku 7)

Do wypisania właścicielowi:
- lista zmienionych/dodanych plików,
- proponowany komunikat commita,
- **`npm run db:migrate`** — wymagany przed uruchomieniem aplikacji (nowa tabela),
- test do odpalenia pod Dockerem: `npx vitest run tests/feature-requests.itest.ts`,
- ścieżka weryfikacji ręcznej: zaloguj się jako podopieczny → „Pomysły" → wyślij
  zgłoszenie → sprawdź odznakę i listę u trenera → ustaw status i odpowiedz →
  wróć na konto podopiecznego i potwierdź, że widzi odpowiedź, a przycisk „Usuń"
  zniknął.
