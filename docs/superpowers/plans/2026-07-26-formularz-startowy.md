# Formularz startowy — onboarding podopiecznego: plan implementacji

> **Dla agentów:** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development`
> (zalecany) albo `superpowers:executing-plans` — realizacja task po tasku. Kroki
> mają checkboxy (`- [ ]`).

**Cel:** trener może opcjonalnie doczepić do zaproszenia krótki formularz
(1–12 ćwiczeń z własnej biblioteki + notatka); podopieczny po założeniu konta
musi go wypełnić, zanim wejdzie do aplikacji; trener czyta wyniki na karcie
podopiecznego.

**Architektura:** dwie tabele (`onboarding_forms` + `onboarding_form_items`)
tworzone **razem z zaproszeniem**, `trainee_id` stemplowany dopiero przy
`consumeInvite` — jeden byt przez całe życie, bez przepisywania szablonu na
wyniki. Czysty moduł walidacji `onboarding-form-types.ts` (cel testów
jednostkowych), repo `onboarding-forms.ts` z wymaganym `trainerId`/`traineeId`,
dwie nowe trasy RR7 + bramka w layoucie podopiecznego za istniejącą bramką
płatności.

**Stack:** React Router v7, Drizzle ORM + Postgres 16, Zod 3, Vitest 2, Biome.

Spec: [`../specs/2026-07-26-formularz-startowy-design.md`](../specs/2026-07-26-formularz-startowy-design.md).

## Ograniczenia globalne

- **Nigdy git, nigdy docker.** Zamiast kroku „commit" każdy task kończy się
  bramką `npm run typecheck` + `npm run lint`. Commit robi właściciel po handoffie.
- **Komendy powłoki tylko pojedynczo**, bez łańcuchowania (`;`, `&&`), potoków
  (`| tail`) i przekierowań (`>/dev/null`) — inaczej wypadają z allowlisty
  w `.claude/settings.local.json` i wyskakuje okienko.
- Testy jednostkowe uruchamiamy **wzorcem ścieżki pliku**
  (`npx vitest run app/lib/onboarding-form-types.test.ts`), **nigdy `npm test`**
  (watch) i **nigdy** wzorcem, który złapie `tests/*.itest.ts` (te wymagają Dockera).
- **UI po polsku**, brand `kalisthenos` małą literą. Nazwy w kodzie po angielsku
  (`onboardingForms`), etykiety po polsku.
- **Tenant-scope:** każda funkcja repo przyjmuje wymagany `trainerId` lub
  `traineeId` i filtruje po nim **w zapytaniu**, nie po odczycie. Brak
  dopasowania → `null`, a trasa zamienia to na **404**, nie 403.
- **Identyfikator formularza nigdy nie przychodzi z pola `<input>`** — zawsze
  wyznaczamy go z `traineeId` z sesji. Z formularza HTML przychodzą wyłącznie
  identyfikatory **pozycji**, weryfikowane względem formularza.
- **Etykieta wyniku ma jedno źródło prawdy** — `answerLabel` w
  `app/lib/onboarding-form-types.ts`. Żadnych „powtórzeń"/„s" wklejanych po trasach.
- **Zod 3**: `z.string().trim().min(...)`, błędy przez `parsed.error.issues[0]?.message`.
- **Warstwę wizualną tasków 4, 5 i 7 prowadzi skill `frontend-design:frontend-design`**;
  klasy i tokeny z `design-system/README.md` + `app/styles/tokens.css`
  (`auth-shell`, `auth-card`, `pagehead`, `card`, `list`, `list-row`, `empty`,
  `badge`, `btn`, `input`, `field`, `alert`).
- **Review per task** (`superpowers:requesting-code-review`) przed przejściem dalej.
- Schemat to źródło prawdy: migracje **wyłącznie** przez `npm run db:generate`,
  nigdy ręczna edycja plików w `app/lib/db/migrations/`.

## Struktura plików

| Plik | Odpowiedzialność | Task |
|---|---|---|
| `app/lib/db/schema.ts` (modyfikacja) | tabele `onboardingForms` + `onboardingFormItems` + typy | 1 |
| `app/lib/db/migrations/NNNN_*.sql` (generowany) | migracja `CREATE TABLE` ×2 | 1 |
| `app/lib/onboarding-form-types.ts` (nowy) | Zod + `answerLabel` + parser równoległych pól — czyste, bez DB | 2 |
| `app/lib/onboarding-form-types.test.ts` (nowy) | testy jednostkowe powyższego | 2 |
| `app/lib/onboarding-forms.ts` (nowy) | repo tenant-scope (tworzenie, przypięcie, bramka, odczyty, zapis odpowiedzi) | 3 |
| `app/lib/auth/invite.ts` (modyfikacja) | `consumeInvite` stempluje `trainee_id` na formularzu | 3 |
| `app/components/onboarding-picker.tsx` (nowy) | sekcja modala: przełącznik + szukajka + checkboxy ćwiczeń + notatka | 4 |
| `app/routes/trener/podopieczni._index.tsx` (modyfikacja) | loader dociąga ćwiczenia; akcja tworzy zaproszenie + formularz w jednej transakcji | 4 |
| `app/lib/stripe/gate.ts` (nowy) | `hasTraineeAppAccess` — bramka płatności wyjęta z loadera layoutu | 5 |
| `app/routes/podopieczny/formularz.tsx` (nowy) | ekran wypełniania (poza layoutem) + akcja zapisu | 5 |
| `app/routes.ts` (modyfikacja) | dwa wpisy tras | 5, 7 |
| `app/routes/podopieczny/_layout.tsx` (modyfikacja) | bramka formularza za bramką płatności + reużycie `hasTraineeAppAccess` | 6 |
| `app/routes/podopieczny/wrapped.$ym.tsx` (modyfikacja) | ta sama bramka formularza | 6 |
| `app/routes/trener/podopieczni.$traineeId.formularz.tsx` (nowy) | widok wyników dla trenera | 7 |
| `app/routes/trener/podopieczni.$traineeId.tsx` (modyfikacja) | plakietka „Formularz startowy" | 7 |
| `tests/onboarding-forms.itest.ts` (nowy) | przepływ end-to-end + tenant-scope (uruchamia właściciel) | 8 |
| README-e katalogów | aktualizacja dokumentacji | 8 |

---

### Task 1: Schemat bazy + migracja

**Pliki:**
- Modyfikacja: `app/lib/db/schema.ts` (tabele na końcu pliku, przed `// ---------------- Types ----------------` w linii ~756; typy na końcu sekcji Types)
- Generowany: `app/lib/db/migrations/NNNN_*.sql`

**Interfejsy:**
- Produkuje: `schema.onboardingForms`, `schema.onboardingFormItems`, typy
  `OnboardingForm`, `NewOnboardingForm`, `OnboardingFormItem`, `NewOnboardingFormItem`.

- [ ] **Krok 1: Dopisz obie tabele**

W `app/lib/db/schema.ts`, tuż przed linią `// ---------------- Types ----------------`.
Wszystkie użyte helpery (`pgTable`, `uuid`, `text`, `integer`, `timestamp`,
`index`, `uniqueIndex`, `check`, `sql`) są już zaimportowane na górze pliku —
nie dopisuj importów.

```ts
// ---------------- Onboarding forms (Formularz startowy) ----------------

// Formularz startowy: zestaw ćwiczeń, o które trener pyta podopiecznego zaraz po
// założeniu konta. Wiersz powstaje RAZEM z zaproszeniem (`invite_id`), a
// `trainee_id` dostaje dopiero przy jego konsumpcji — jeden byt przez całe
// życie, bez przepisywania szablonu na osobny wiersz wyników.
export const onboardingForms = pgTable(
  "onboarding_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: uuid("trainer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => invites.id, { onDelete: "cascade" }),
    // NULL do chwili przyjęcia zaproszenia (patrz `consumeInvite`).
    traineeId: uuid("trainee_id").references(() => users.id, { onDelete: "cascade" }),
    trainerNote: text("trainer_note"),
    traineeNote: text("trainee_note"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    inviteUniq: uniqueIndex("onboarding_forms_invite_uniq").on(t.inviteId),
    // Najwyżej jeden CZEKAJĄCY formularz na podopiecznego. Wiersze sprzed
    // przyjęcia zaproszenia mają trainee_id NULL, a NULL-e w indeksie unikalnym
    // są w Postgresie rozróżnialne — więc nie kolidują ze sobą.
    traineePendingUniq: uniqueIndex("onboarding_forms_trainee_pending_uniq")
      .on(t.traineeId)
      .where(sql`${t.completedAt} IS NULL`),
    trainerIdx: index("onboarding_forms_trainer_idx").on(t.trainerId),
    traineeIdx: index("onboarding_forms_trainee_idx").on(t.traineeId),
  }),
);

// Pozycja formularza = jedno ćwiczenie, o które trener pyta. `unit` jest
// SNAPSHOTEM z chwili tworzenia: trener może później przełączyć ćwiczenie z REPS
// na SEC, a wtedy zapisane „35" zmieniłoby znaczenie z powtórzeń na sekundy.
// Nazwę ćwiczenia czytamy joinem — zmiana nazwy to zwykle korekta literówki.
export const onboardingFormItems = pgTable(
  "onboarding_form_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => onboardingForms.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    unit: exerciseUnit("unit").notNull(),
    // NULL = jeszcze nieodpowiedziane. 0 to prawidłowa odpowiedź („ani razu").
    value: integer("value"),
    comment: text("comment"),
  },
  (t) => ({
    formOrdinalUniq: uniqueIndex("onboarding_form_items_form_ordinal_uniq").on(
      t.formId,
      t.ordinal,
    ),
    formExerciseUniq: uniqueIndex("onboarding_form_items_form_exercise_uniq").on(
      t.formId,
      t.exerciseId,
    ),
    valueCheck: check(
      "onboarding_form_items_value_check",
      sql`${t.value} IS NULL OR (${t.value} >= 0 AND ${t.value} <= 10000)`,
    ),
  }),
);
```

- [ ] **Krok 2: Dopisz typy**

Na samym końcu `app/lib/db/schema.ts`, po `export type FeatureRequestStatusDb = ...`:

```ts
export type OnboardingForm = typeof onboardingForms.$inferSelect;
export type NewOnboardingForm = typeof onboardingForms.$inferInsert;
export type OnboardingFormItem = typeof onboardingFormItems.$inferSelect;
export type NewOnboardingFormItem = typeof onboardingFormItems.$inferInsert;
```

- [ ] **Krok 3: Wygeneruj migrację**

Uruchom: `npm run db:generate`
Oczekiwane: nowy plik `app/lib/db/migrations/NNNN_*.sql` z **dwoma** `CREATE TABLE`,
czterema `CREATE INDEX`/`CREATE UNIQUE INDEX` na `onboarding_forms`, dwoma na
`onboarding_form_items` i `CHECK` na `value`, plus wpis w `meta/_journal.json`.

To czyste dodanie tabel, więc drizzle-kit **nie** powinien o nic pytać. Gdyby
jednak wyświetlił interaktywny wybór (rename/drop) — **przerwij i oddaj krok
właścicielowi**: drizzle-kit potrzebuje TTY, a zgadywanie odpowiedzi zepsułoby
migrację.

- [ ] **Krok 4: Sprawdź wygenerowany SQL**

Przeczytaj nowy plik `.sql` (narzędziem Read, nie `cat`). Potwierdź:
`onboarding_forms_trainee_pending_uniq` ma klauzulę `WHERE "completed_at" IS NULL`,
a `onboarding_form_items` ma `CONSTRAINT "onboarding_form_items_value_check"`.
Pliku **nie edytuj** — jeśli coś się nie zgadza, popraw `schema.ts` i wygeneruj ponownie.

- [ ] **Krok 5: Bramka**

Uruchom: `npm run typecheck` → oczekiwane: bez błędów.
Uruchom: `npm run lint` → oczekiwane: bez błędów.

---

### Task 2: Czysty moduł walidacji + testy jednostkowe (TDD)

**Pliki:**
- Utwórz: `app/lib/onboarding-form-types.ts`
- Test: `app/lib/onboarding-form-types.test.ts`

**Interfejsy:**
- Konsumuje: `pluralizePl`, `PlForms` z `~/lib/format`.
- Produkuje: `MAX_ONBOARDING_EXERCISES` (12), `MAX_ONBOARDING_VALUE` (10000),
  typ `OnboardingUnit = "REPS" | "SEC"`, `answerLabel(unit, value): string`,
  `OnboardingTemplateSchema` (→ `{ exerciseIds: string[]; note: string | null }`),
  `OnboardingAnswersSchema` (→ `{ answers: { itemId: string; value: number; comment: string | null }[]; traineeNote: string | null }`),
  `toAnswersInput(raw)`.

- [ ] **Krok 1: Napisz failujący test**

Utwórz `app/lib/onboarding-form-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_ONBOARDING_EXERCISES,
  OnboardingAnswersSchema,
  OnboardingTemplateSchema,
  answerLabel,
  toAnswersInput,
} from "./onboarding-form-types";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("answerLabel", () => {
  it("odmienia powtórzenia po polsku", () => {
    expect(answerLabel("REPS", 1)).toBe("1 powtórzenie");
    expect(answerLabel("REPS", 3)).toBe("3 powtórzenia");
    expect(answerLabel("REPS", 12)).toBe("12 powtórzeń");
    expect(answerLabel("REPS", 0)).toBe("0 powtórzeń");
  });

  it("sekundy podaje skrótem", () => {
    expect(answerLabel("SEC", 35)).toBe("35 s");
  });
});

describe("OnboardingTemplateSchema", () => {
  it("przyjmuje poprawny zestaw i zwija pustą notatkę do null", () => {
    const parsed = OnboardingTemplateSchema.safeParse({
      exerciseIds: [UUID_A, UUID_B],
      note: "   ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.exerciseIds).toEqual([UUID_A, UUID_B]);
      expect(parsed.data.note).toBeNull();
    }
  });

  it("odrzuca pusty wybór", () => {
    const parsed = OnboardingTemplateSchema.safeParse({ exerciseIds: [], note: "" });
    expect(parsed.success).toBe(false);
  });

  it("odrzuca wybór ponad limit", () => {
    // Poprawne, różne UUID-y — inaczej test przechodziłby z powodu błędnego
    // formatu zamiast z powodu przekroczonego limitu.
    const ids = Array.from(
      { length: MAX_ONBOARDING_EXERCISES + 1 },
      (_, i) => `${String(i + 1).padStart(8, "0")}-1111-4111-8111-111111111111`,
    );
    const parsed = OnboardingTemplateSchema.safeParse({ exerciseIds: ids, note: "" });
    expect(parsed.success).toBe(false);
  });

  it("odrzuca duplikat ćwiczenia", () => {
    const parsed = OnboardingTemplateSchema.safeParse({
      exerciseIds: [UUID_A, UUID_A],
      note: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("odrzuca notatkę dłuższą niż 1000 znaków", () => {
    const parsed = OnboardingTemplateSchema.safeParse({
      exerciseIds: [UUID_A],
      note: "x".repeat(1001),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("toAnswersInput", () => {
  it("skleja równoległe pola w listę odpowiedzi", () => {
    const input = toAnswersInput({
      itemIds: [UUID_A, UUID_B],
      values: ["12", "0"],
      comments: ["z gumą", ""],
      traineeNote: " byłem po treningu ",
    });
    expect(input).toEqual({
      answers: [
        { itemId: UUID_A, value: 12, comment: "z gumą" },
        { itemId: UUID_B, value: 0, comment: "" },
      ],
      traineeNote: " byłem po treningu ",
    });
  });

  it("zamienia puste pole wyniku na NaN, żeby Zod je odrzucił", () => {
    const input = toAnswersInput({
      itemIds: [UUID_A],
      values: ["   "],
      comments: [""],
      traineeNote: "",
    });
    expect(Number.isNaN(input.answers[0]!.value)).toBe(true);
  });
});

describe("OnboardingAnswersSchema", () => {
  const ok = {
    answers: [{ itemId: UUID_A, value: 12, comment: "" }],
    traineeNote: "",
  };

  it("przyjmuje poprawne odpowiedzi i zwija puste teksty do null", () => {
    const parsed = OnboardingAnswersSchema.safeParse(ok);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.answers[0]!.comment).toBeNull();
      expect(parsed.data.traineeNote).toBeNull();
    }
  });

  it("przyjmuje zero jako prawidłowy wynik", () => {
    const parsed = OnboardingAnswersSchema.safeParse({
      ...ok,
      answers: [{ itemId: UUID_A, value: 0, comment: "" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("odrzuca wynik ujemny, ułamkowy, za duży i nie-liczbę", () => {
    for (const value of [-1, 12.5, 10001, Number.NaN]) {
      const parsed = OnboardingAnswersSchema.safeParse({
        ...ok,
        answers: [{ itemId: UUID_A, value, comment: "" }],
      });
      expect(parsed.success, `value=${value}`).toBe(false);
    }
  });

  it("odrzuca komentarz dłuższy niż 200 znaków", () => {
    const parsed = OnboardingAnswersSchema.safeParse({
      ...ok,
      answers: [{ itemId: UUID_A, value: 1, comment: "x".repeat(201) }],
    });
    expect(parsed.success).toBe(false);
  });

  it("odrzuca pustą listę odpowiedzi", () => {
    const parsed = OnboardingAnswersSchema.safeParse({ answers: [], traineeNote: "" });
    expect(parsed.success).toBe(false);
  });
});
```

- [ ] **Krok 2: Uruchom test — musi failować**

Uruchom: `npx vitest run app/lib/onboarding-form-types.test.ts`
Oczekiwane: FAIL — `Failed to resolve import "./onboarding-form-types"`.

- [ ] **Krok 3: Napisz moduł**

Utwórz `app/lib/onboarding-form-types.ts`:

```ts
import { z } from "zod";
import { type PlForms, pluralizePl } from "~/lib/format";

/**
 * Formularz startowy — czysta warstwa: schematy Zod, opis wyniku i parser
 * równoległych pól formularza. Bez DB i bez `Date.now` — cel testów
 * jednostkowych.
 *
 * `answerLabel` to CO INNEGO niż `unitLabelPl` z `progression-math.ts`: tamto
 * jest skrótem osi wykresu („powt."), to jest pełną frazą z liczbą i polską
 * odmianą („3 powtórzenia"). Nie zastępuj jednego drugim.
 */

export const MAX_ONBOARDING_EXERCISES = 12;
export const MAX_ONBOARDING_VALUE = 10000;
export const MAX_ONBOARDING_NOTE = 1000;
export const MAX_ONBOARDING_COMMENT = 200;

export type OnboardingUnit = "REPS" | "SEC";

const POWTORZENIE: PlForms = {
  one: "powtórzenie",
  few: "powtórzenia",
  many: "powtórzeń",
};

/** Opis wyniku pozycji: „12 powtórzeń" / „35 s". */
export function answerLabel(unit: OnboardingUnit, value: number): string {
  if (unit === "SEC") return `${value} s`;
  return `${value} ${pluralizePl(value, POWTORZENIE)}`;
}

const optionalNote = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} może mieć najwyżej ${max} znaków.`)
    .transform((s) => (s.length === 0 ? null : s));

/** Szablon doczepiany do zaproszenia przez trenera. */
export const OnboardingTemplateSchema = z.object({
  exerciseIds: z
    .array(z.string().uuid())
    .min(1, "Wybierz co najmniej jedno ćwiczenie.")
    .max(
      MAX_ONBOARDING_EXERCISES,
      `Możesz wybrać najwyżej ${MAX_ONBOARDING_EXERCISES} ćwiczeń.`,
    )
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "To samo ćwiczenie nie może wejść dwa razy.",
    }),
  note: optionalNote(MAX_ONBOARDING_NOTE, "Notatka"),
});
export type OnboardingTemplate = z.infer<typeof OnboardingTemplateSchema>;

export const OnboardingAnswerSchema = z.object({
  itemId: z.string().uuid(),
  value: z
    .number({ invalid_type_error: "Podaj wynik liczbą." })
    .int("Wynik musi być liczbą całkowitą.")
    .min(0, "Wynik nie może być ujemny.")
    .max(MAX_ONBOARDING_VALUE, `Wynik może wynosić najwyżej ${MAX_ONBOARDING_VALUE}.`),
  comment: optionalNote(MAX_ONBOARDING_COMMENT, "Komentarz"),
});

/** Odpowiedzi podopiecznego. */
export const OnboardingAnswersSchema = z.object({
  answers: z.array(OnboardingAnswerSchema).min(1, "Formularz jest pusty."),
  traineeNote: optionalNote(MAX_ONBOARDING_NOTE, "Notatka"),
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;

/**
 * Puste pole wyniku ma polecieć jako NaN, a nie 0 — `Number("")` daje zero, więc
 * niewypełnione pole po cichu zapisałoby się jako „ani razu". NaN odbija się od
 * `z.number()` z czytelnym komunikatem.
 */
function toValue(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return Number.NaN;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Równoległe pola `<input name="itemId">` / `value` / `comment` → obiekt do walidacji. */
export function toAnswersInput(raw: {
  itemIds: string[];
  values: string[];
  comments: string[];
  traineeNote: string;
}): { answers: { itemId: string; value: number; comment: string }[]; traineeNote: string } {
  return {
    answers: raw.itemIds.map((itemId, i) => ({
      itemId,
      value: toValue(raw.values[i] ?? ""),
      comment: raw.comments[i] ?? "",
    })),
    traineeNote: raw.traineeNote,
  };
}
```

- [ ] **Krok 4: Uruchom test — musi przejść**

Uruchom: `npx vitest run app/lib/onboarding-form-types.test.ts`
Oczekiwane: PASS, wszystkie przypadki zielone.

- [ ] **Krok 5: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npm run lint` → bez błędów.

---

### Task 3: Repozytorium + wpięcie w konsumpcję zaproszenia

**Pliki:**
- Utwórz: `app/lib/onboarding-forms.ts`
- Modyfikacja: `app/lib/auth/invite.ts` (wewnątrz transakcji `consumeInvite`, po utworzeniu/podmianie użytkownika)

**Interfejsy:**
- Konsumuje: `Db` z `~/lib/db/client`, `schema.onboardingForms` / `schema.onboardingFormItems`
  (Task 1), `OnboardingUnit` (Task 2).
- Produkuje: `OnboardingFormError`, `createOnboardingForm`, `attachFormToTrainee`,
  `hasPendingOnboarding`, `getPendingFormForTrainee`, `submitOnboardingForm`,
  `getFormForTrainer`, `getFormStatusForTrainee` oraz typy `OnboardingItemView`,
  `PendingFormView`, `TrainerFormView`.

- [ ] **Krok 1: Napisz repo**

Utwórz `app/lib/onboarding-forms.ts`:

```ts
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import type { OnboardingUnit } from "~/lib/onboarding-form-types";

/**
 * Repozytorium formularza startowego. Formularz jest prywatny w parze: czyta go
 * podopieczny (własny, czekający) i JEGO trener. Każda funkcja przyjmuje
 * wymagany `traineeId` albo `trainerId` i filtruje po nim W ZAPYTANIU — nigdy po
 * odczycie. Brak dopasowania to `null`; trasa zamienia to na 404, nie 403.
 */

export class OnboardingFormError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface OnboardingItemView {
  id: string;
  exerciseId: string;
  exerciseName: string;
  unit: OnboardingUnit;
  ordinal: number;
  value: number | null;
  comment: string | null;
}

export interface PendingFormView {
  id: string;
  trainerNote: string | null;
  items: OnboardingItemView[];
}

export interface TrainerFormView extends PendingFormView {
  traineeNote: string | null;
  completedAtISO: string | null;
  createdAtISO: string;
}

async function loadItems(db: Db, formId: string): Promise<OnboardingItemView[]> {
  const rows = await db
    .select({
      id: schema.onboardingFormItems.id,
      exerciseId: schema.onboardingFormItems.exerciseId,
      exerciseName: schema.exercises.name,
      unit: schema.onboardingFormItems.unit,
      ordinal: schema.onboardingFormItems.ordinal,
      value: schema.onboardingFormItems.value,
      comment: schema.onboardingFormItems.comment,
    })
    .from(schema.onboardingFormItems)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.onboardingFormItems.exerciseId))
    .where(eq(schema.onboardingFormItems.formId, formId))
    .orderBy(asc(schema.onboardingFormItems.ordinal));
  return rows;
}

// ---------------- Trener: tworzenie ----------------

/**
 * Tworzy formularz doczepiony do zaproszenia. Wołane WEWNĄTRZ tej samej
 * transakcji co `createInvite` — inaczej dałoby się wygenerować i wysłać link do
 * zaproszenia, któremu formularz nie doszedł.
 *
 * Kolejność pozycji = kolejność `exerciseIds`. Jednostka jest snapshotowana z
 * biblioteki, bo trener może ją później przełączyć.
 */
export async function createOnboardingForm(
  db: Db,
  input: { trainerId: string; inviteId: string; exerciseIds: string[]; note: string | null },
): Promise<string> {
  // Każde ćwiczenie MUSI należeć do tego trenera i być aktywne. Bez tego
  // podmiana `value` w polu formularza wciągnęłaby do formularza cudze ćwiczenie.
  const owned = await db
    .select({ id: schema.exercises.id, unit: schema.exercises.unit })
    .from(schema.exercises)
    .where(
      and(
        inArray(schema.exercises.id, input.exerciseIds),
        eq(schema.exercises.trainerId, input.trainerId),
        isNull(schema.exercises.archivedAt),
      ),
    );
  const unitById = new Map(owned.map((e) => [e.id, e.unit]));
  if (unitById.size !== input.exerciseIds.length) {
    throw new OnboardingFormError(
      `exercises not owned by trainer ${input.trainerId}`,
      "Któreś z wybranych ćwiczeń nie istnieje w Twojej bibliotece.",
    );
  }

  const [form] = await db
    .insert(schema.onboardingForms)
    .values({
      trainerId: input.trainerId,
      inviteId: input.inviteId,
      trainerNote: input.note,
    })
    .returning({ id: schema.onboardingForms.id });
  const formId = form!.id;

  await db.insert(schema.onboardingFormItems).values(
    input.exerciseIds.map((exerciseId, i) => ({
      formId,
      exerciseId,
      ordinal: i,
      unit: unitById.get(exerciseId)!,
    })),
  );

  return formId;
}

/**
 * Stempluje `trainee_id` na formularzu należącym do zaproszenia. Wołane
 * WEWNĄTRZ transakcji `consumeInvite` — konto i przypięcie formularza powstają
 * albo oba, albo żadne.
 */
export async function attachFormToTrainee(
  db: Db,
  inviteId: string,
  traineeId: string,
): Promise<void> {
  await db
    .update(schema.onboardingForms)
    .set({ traineeId })
    .where(
      and(
        eq(schema.onboardingForms.inviteId, inviteId),
        isNull(schema.onboardingForms.traineeId),
      ),
    );
}

// ---------------- Podopieczny ----------------

/** Bramka: czy podopieczny ma niewypełniony formularz. */
export async function hasPendingOnboarding(db: Db, traineeId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.onboardingForms.id })
    .from(schema.onboardingForms)
    .where(
      and(
        eq(schema.onboardingForms.traineeId, traineeId),
        isNull(schema.onboardingForms.completedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function getPendingFormForTrainee(
  db: Db,
  traineeId: string,
): Promise<PendingFormView | null> {
  const rows = await db
    .select({
      id: schema.onboardingForms.id,
      trainerNote: schema.onboardingForms.trainerNote,
    })
    .from(schema.onboardingForms)
    .where(
      and(
        eq(schema.onboardingForms.traineeId, traineeId),
        isNull(schema.onboardingForms.completedAt),
      ),
    )
    .limit(1);
  const form = rows[0];
  if (!form) return null;
  return { id: form.id, trainerNote: form.trainerNote, items: await loadItems(db, form.id) };
}

/**
 * Zapisuje odpowiedzi i zamyka formularz. Formularz wybieramy po `traineeId`
 * z SESJI — z przeglądarki przychodzą wyłącznie identyfikatory pozycji, i to
 * sprawdzane względem tego formularza.
 *
 * `SELECT ... FOR UPDATE` serializuje równoległe wysyłki, a warunek
 * `completed_at IS NULL` siedzi dodatkowo w `WHERE` finalnego UPDATE-a: drugie
 * kliknięcie „Gotowe" ma odbić się od bazy, a nie od sprawdzenia w kodzie, które
 * przegrywa wyścig.
 */
export async function submitOnboardingForm(
  db: Db,
  traineeId: string,
  input: {
    answers: { itemId: string; value: number; comment: string | null }[];
    traineeNote: string | null;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const formRows = await tx
      .select({ id: schema.onboardingForms.id })
      .from(schema.onboardingForms)
      .where(
        and(
          eq(schema.onboardingForms.traineeId, traineeId),
          isNull(schema.onboardingForms.completedAt),
        ),
      )
      .limit(1)
      .for("update");
    const form = formRows[0];
    if (!form) {
      throw new OnboardingFormError(
        `no pending onboarding form for trainee ${traineeId}`,
        "Ten formularz jest już wypełniony.",
      );
    }

    const itemRows = await tx
      .select({ id: schema.onboardingFormItems.id })
      .from(schema.onboardingFormItems)
      .where(eq(schema.onboardingFormItems.formId, form.id));
    const expected = new Set(itemRows.map((r) => r.id));
    const got = new Set(input.answers.map((a) => a.itemId));
    if (expected.size !== got.size || [...expected].some((id) => !got.has(id))) {
      throw new OnboardingFormError(
        `answer set mismatch for form ${form.id}`,
        "Formularz jest niekompletny — odśwież stronę i wypełnij go ponownie.",
      );
    }

    for (const answer of input.answers) {
      await tx
        .update(schema.onboardingFormItems)
        .set({ value: answer.value, comment: answer.comment })
        .where(
          and(
            eq(schema.onboardingFormItems.id, answer.itemId),
            eq(schema.onboardingFormItems.formId, form.id),
          ),
        );
    }

    const closed = await tx
      .update(schema.onboardingForms)
      .set({ traineeNote: input.traineeNote, completedAt: sql`now()` })
      .where(
        and(
          eq(schema.onboardingForms.id, form.id),
          isNull(schema.onboardingForms.completedAt),
        ),
      )
      .returning({ id: schema.onboardingForms.id });
    if (closed.length !== 1) {
      throw new OnboardingFormError(
        `form ${form.id} already completed`,
        "Ten formularz jest już wypełniony.",
      );
    }
  });
}

// ---------------- Trener: odczyt ----------------

export async function getFormForTrainer(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<TrainerFormView | null> {
  const rows = await db
    .select({
      id: schema.onboardingForms.id,
      trainerNote: schema.onboardingForms.trainerNote,
      traineeNote: schema.onboardingForms.traineeNote,
      completedAt: schema.onboardingForms.completedAt,
      createdAt: schema.onboardingForms.createdAt,
    })
    .from(schema.onboardingForms)
    .where(
      and(
        eq(schema.onboardingForms.trainerId, trainerId),
        eq(schema.onboardingForms.traineeId, traineeId),
      ),
    )
    .limit(1);
  const form = rows[0];
  if (!form) return null;
  return {
    id: form.id,
    trainerNote: form.trainerNote,
    traineeNote: form.traineeNote,
    completedAtISO: form.completedAt?.toISOString() ?? null,
    createdAtISO: form.createdAt.toISOString(),
    items: await loadItems(db, form.id),
  };
}

/** Plakietka na karcie podopiecznego. `null` = trener nie doczepił formularza. */
export async function getFormStatusForTrainee(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<{ completedAtISO: string | null } | null> {
  const rows = await db
    .select({ completedAt: schema.onboardingForms.completedAt })
    .from(schema.onboardingForms)
    .where(
      and(
        eq(schema.onboardingForms.trainerId, trainerId),
        eq(schema.onboardingForms.traineeId, traineeId),
      ),
    )
    .limit(1);
  const form = rows[0];
  if (!form) return null;
  return { completedAtISO: form.completedAt?.toISOString() ?? null };
}
```

- [ ] **Krok 2: Wepnij przypięcie formularza w `consumeInvite`**

W `app/lib/auth/invite.ts` dopisz import pod istniejące:

```ts
import { attachFormToTrainee } from "../onboarding-forms";
```

Następnie w `consumeInvite`, **wewnątrz** `db.transaction`, między blokiem
`if (invite.replacesUserId) { ... } else { ... }` a `const consumed = await tx.update(schema.invites)`,
wstaw:

```ts
    // Formularz startowy (jeśli trener go doczepił) dostaje właściciela w tej
    // samej transakcji co konto — inaczej awaria po utworzeniu użytkownika
    // zostawiłaby formularz-sierotę bez podopiecznego.
    await attachFormToTrainee(tx, invite.id, user.id);
```

- [ ] **Krok 3: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npm run lint` → bez błędów.
Uruchom: `npx vitest run app/lib/onboarding-form-types.test.ts` → PASS (regresja Taska 2).

---

### Task 4: Trener — sekcja formularza w modalu zaproszenia

> Warstwę wizualną prowadzi skill `frontend-design:frontend-design`.

**Pliki:**
- Utwórz: `app/components/onboarding-picker.tsx`
- Modyfikacja: `app/routes/trener/podopieczni._index.tsx` (importy; loader ~64–95; akcja ~97–135; modal ~191–261)

**Interfejsy:**
- Konsumuje: `OnboardingTemplateSchema`, `MAX_ONBOARDING_EXERCISES` (Task 2);
  `createOnboardingForm`, `OnboardingFormError` (Task 3).
- Produkuje: `OnboardingPicker({ exercises })`, gdzie
  `exercises: { id: string; name: string; unit: "REPS" | "SEC" }[]`. Komponent
  renderuje pola `withOnboarding` (checkbox), `onboardingExercise` (wiele
  checkboxów) i `onboardingNote` (textarea) — bez własnego `<Form>`, owija go trasa.

- [ ] **Krok 1: Napisz komponent pickera**

Utwórz `app/components/onboarding-picker.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router";
import { MAX_ONBOARDING_EXERCISES } from "~/lib/onboarding-form-types";

export interface PickableExercise {
  id: string;
  name: string;
  unit: "REPS" | "SEC";
}

/**
 * Sekcja modala zaproszenia: opcjonalny formularz startowy. Nie renderuje
 * `<Form>` — owija go trasa-rodzic (wzorem `consultation-form.tsx`).
 */
export function OnboardingPicker({ exercises }: { exercises: PickableExercise[] }) {
  const [on, setOn] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const needle = q.trim().toLowerCase();
  const visible =
    needle === "" ? exercises : exercises.filter((e) => e.name.toLowerCase().includes(needle));
  const atLimit = selected.length >= MAX_ONBOARDING_EXERCISES;

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  if (exercises.length === 0) {
    return (
      <div
        className="text-sm muted"
        style={{
          padding: "10px 12px",
          border: "1px dashed var(--line-2)",
          borderRadius: 8,
          background: "var(--surface)",
        }}
      >
        Formularz startowy wymaga ćwiczeń w bibliotece.{" "}
        <Link to="/trener/biblioteka" style={{ color: "var(--ink)" }}>
          Dodaj pierwsze ćwiczenie
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="field">
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          name="withOnboarding"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          style={{ width: 15, height: 15, margin: 0, accentColor: "var(--accent)" }}
        />
        <span>Dołącz formularz startowy — opcjonalnie</span>
      </label>
      <p className="text-xs muted" style={{ margin: "4px 0 0" }}>
        Podopieczny wypełni go zaraz po założeniu konta, zanim wejdzie do aplikacji.
      </p>

      {on && (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj ćwiczenia…"
            className="input"
            aria-label="Szukaj ćwiczenia"
          />
          <div
            className="text-xs muted mono"
            style={{ textTransform: "uppercase", letterSpacing: ".08em" }}
          >
            Wybrano {selected.length}/{MAX_ONBOARDING_EXERCISES}
          </div>
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: 8,
              display: "grid",
              gap: 4,
            }}
          >
            {visible.length === 0 ? (
              <div className="text-sm muted">Nic nie pasuje do „{q}".</div>
            ) : (
              visible.map((e) => {
                const isOn = selected.includes(e.id);
                return (
                  <label
                    key={e.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 6px",
                      borderRadius: 6,
                      cursor: isOn || !atLimit ? "pointer" : "not-allowed",
                      opacity: isOn || !atLimit ? 1 : 0.45,
                      background: isOn ? "var(--accent-soft)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      name="onboardingExercise"
                      value={e.id}
                      checked={isOn}
                      disabled={!isOn && atLimit}
                      onChange={() => toggle(e.id)}
                      style={{ width: 14, height: 14, margin: 0, accentColor: "var(--accent)" }}
                    />
                    <span style={{ flex: 1, fontSize: 13 }}>{e.name}</span>
                    <span
                      className="mono text-xs muted"
                      style={{ textTransform: "uppercase", letterSpacing: ".08em" }}
                    >
                      {e.unit === "SEC" ? "sek." : "powt."}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          {/* Zaznaczenia odfiltrowane aktualną szukajką nie mają checkboxa w DOM,
              więc przeglądarka by ich nie wysłała — trener widziałby „Wybrano 2/12",
              a zapisałoby się jedno ćwiczenie. Dosyłamy je ukrytymi polami. */}
          {selected
            .filter((id) => !visible.some((e) => e.id === id))
            .map((id) => (
              <input key={id} type="hidden" name="onboardingExercise" value={id} />
            ))}
          <label className="field" style={{ margin: 0 }}>
            <span className="text-sm">Notatka dla podopiecznego — opcjonalnie</span>
            <textarea
              name="onboardingNote"
              className="input"
              rows={2}
              maxLength={1000}
              placeholder="np. Wykonaj na świeżo, bez rozgrzewki do upadku."
            />
          </label>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Krok 2: Dociągnij ćwiczenia w loaderze**

W `app/routes/trener/podopieczni._index.tsx` dopisz do importów z `drizzle-orm`
(pliku dziś nie importuje ich wcale — dodaj nową linię na górze):

```ts
import { and, asc, eq, isNull } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
```

W `loader`, po `const clients = await listClientsForTrainer(...)`, dopisz:

```ts
  // Biblioteka do pickera formularza startowego. Ciągniemy ją w loaderze zamiast
  // osobnym fetcherem — kilka KB na wejście, a modal działa bez dodatkowej rundy.
  const exercises = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.name,
      unit: schema.exercises.unit,
    })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, user.id), isNull(schema.exercises.archivedAt)))
    .orderBy(asc(schema.exercises.name));
```

i dodaj `exercises` do zwracanego obiektu (obok `stripeAvailable`).

- [ ] **Krok 3: Twórz zaproszenie i formularz w jednej transakcji**

W tym samym pliku dopisz importy:

```ts
import { createOnboardingForm, OnboardingFormError } from "~/lib/onboarding-forms";
import { OnboardingTemplateSchema } from "~/lib/onboarding-form-types";
import { OnboardingPicker } from "~/components/onboarding-picker";
```

W `action`, zastąp blok od `const { token } = await createInvite(db, {` do
`});` włącznie:

```ts
  const wantsForm = fd.get("withOnboarding") === "on";
  let template: { exerciseIds: string[]; note: string | null } | null = null;
  if (wantsForm) {
    const parsedTemplate = OnboardingTemplateSchema.safeParse({
      exerciseIds: fd.getAll("onboardingExercise").map(String),
      note: String(fd.get("onboardingNote") ?? ""),
    });
    if (!parsedTemplate.success) {
      return { error: parsedTemplate.error.issues[0]?.message ?? "Sprawdź formularz." };
    }
    template = parsedTemplate.data;
  }

  let token: string;
  try {
    // Jedna transakcja: albo zaproszenie Z formularzem, albo nic. Inaczej dałoby
    // się wysłać link do zaproszenia, któremu formularz nie doszedł.
    token = await db.transaction(async (tx) => {
      const created = await createInvite(tx, {
        trainerId: user.id,
        displayName: parsed.data.displayName,
        email: parsed.data.email,
        monthlyAmountGrosze,
      });
      if (template) {
        await createOnboardingForm(tx, {
          trainerId: user.id,
          inviteId: created.invite.id,
          exerciseIds: template.exerciseIds,
          note: template.note,
        });
      }
      return created.token;
    });
  } catch (e) {
    if (e instanceof OnboardingFormError) return { error: e.userMessage };
    throw e;
  }
```

`createInvite` przyjmuje typ `Db`, który obejmuje też transakcję — sygnatury nie
zmieniamy.

Do zwracanego z akcji obiektu `invite` dopisz `withOnboarding: template != null`.

- [ ] **Krok 4: Wstaw picker do modala i pokaż fakt w karcie wyniku**

W komponencie `TrenerPodopieczniList` dodaj `exercises` do destrukturyzacji
`useLoaderData`. W `<Modal>`, w `<div className="modal-body">`, po polu kwoty
(bloku `{stripeAvailable && (...)}`) a przed blokiem błędu, wstaw:

```tsx
            <OnboardingPicker exercises={exercises} />
```

W `InviteCreatedCard` rozszerz typ propsa o `withOnboarding: boolean` i pod
linią z emailem dopisz:

```tsx
      {invite.withOnboarding && (
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
          Z formularzem startowym — podopieczny wypełni go po założeniu konta.
        </div>
      )}
```

- [ ] **Krok 5: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npm run lint` → bez błędów.
Uruchom: `npx biome format --write app/components/onboarding-picker.tsx`

---

### Task 5: Podopieczny — ekran wypełniania formularza

> Warstwę wizualną prowadzi skill `frontend-design:frontend-design`.

**Pliki:**
- Utwórz: `app/lib/stripe/gate.ts`
- Utwórz: `app/routes/podopieczny/formularz.tsx`
- Modyfikacja: `app/routes.ts` (obok `route("aktywuj", ...)`, czyli **poza** `layout(...)`)

**Interfejsy:**
- Konsumuje: `getPendingFormForTrainee`, `submitOnboardingForm`, `OnboardingFormError` (Task 3);
  `OnboardingAnswersSchema`, `toAnswersInput`, `answerLabel` (Task 2).
- Produkuje: `hasTraineeAppAccess(db, user)` →
  `Promise<{ hasAccess: boolean; sub: Awaited<ReturnType<typeof getSubscriptionForPair>> }>`
  — używane ponownie w Tasku 6.

- [ ] **Krok 1: Wyjmij bramkę płatności do własnego modułu**

Utwórz `app/lib/stripe/gate.ts`:

```ts
import type { Db } from "~/lib/db/client";
import { stripeApiConfigured } from "~/lib/env";
import { hasAppAccess, paymentRequired } from "~/lib/stripe/access";
import { getConnectionRow } from "~/lib/stripe/connections";
import { getSubscriptionForPair } from "~/lib/stripe/subscriptions";

/**
 * Serwerowa bramka dostępu podopiecznego: czy wpuszczamy go do aplikacji.
 *
 * Osobny moduł, bo `access.ts` jest czysty (same predykaty, zero DB) i taki ma
 * zostać, a `subscriptions.ts` nie może zależeć od bramki, skoro bramka zależy
 * od niego. Zwracamy też `sub`, żeby wołający nie musiał go dociągać drugi raz
 * (layout rysuje z niego odznakę „Płatności").
 */
export async function hasTraineeAppAccess(
  db: Db,
  user: { id: string; trainerId: string | null },
): Promise<{
  hasAccess: boolean;
  sub: Awaited<ReturnType<typeof getSubscriptionForPair>>;
}> {
  if (!user.trainerId) return { hasAccess: true, sub: null };
  const sub = await getSubscriptionForPair(db, user.trainerId, user.id);
  const conn = await getConnectionRow(db, user.trainerId);
  const required = paymentRequired({
    stripeConfigured: stripeApiConfigured(),
    chargesEnabled: Boolean(conn?.chargesEnabled),
    hasPrice: Boolean(sub?.stripePriceId),
  });
  return { hasAccess: hasAppAccess({ paymentRequired: required, status: sub?.status ?? null }), sub };
}
```

`getSubscriptionForPair` kończy się `return row ?? null`, więc
`Awaited<ReturnType<typeof getSubscriptionForPair>>` obejmuje już `null` —
`subscriptions.ts` zostaje nietknięty.

- [ ] **Krok 2: Napisz trasę podopiecznego**

Utwórz `app/routes/podopieczny/formularz.tsx`:

```tsx
import { eq } from "drizzle-orm";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  OnboardingAnswersSchema,
  toAnswersInput,
} from "~/lib/onboarding-form-types";
import { OnboardingFormError, getPendingFormForTrainee, submitOnboardingForm } from "~/lib/onboarding-forms";
import { hasTraineeAppAccess } from "~/lib/stripe/gate";

// ============================================================
// Ekran formularza startowego żyje POZA layoutem podopiecznego (bez sidenava),
// żeby bramka w `_layout.tsx` nie wpadała w pętlę redirectów — dokładnie jak
// `/podopieczny/aktywuj`. Kolejność bramek (najpierw płatność) sprawdzamy TU
// ponownie, bo na tę trasę można wejść wprost z adresu.
// ============================================================

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request, db, { role: "trainee" });

  const { hasAccess } = await hasTraineeAppAccess(db, user);
  if (!hasAccess) throw redirect("/podopieczny/aktywuj");

  const form = await getPendingFormForTrainee(db, user.id);
  if (!form) throw redirect("/podopieczny");

  const trainerRows = user.trainerId
    ? await db
        .select({ name: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, user.trainerId))
        .limit(1)
    : [];

  return { form, trainerName: trainerRows[0]?.name ?? null };
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request, db, { role: "trainee" });
  const fd = await request.formData();

  const parsed = OnboardingAnswersSchema.safeParse(
    toAnswersInput({
      itemIds: fd.getAll("itemId").map(String),
      values: fd.getAll("value").map(String),
      comments: fd.getAll("comment").map(String),
      traineeNote: String(fd.get("traineeNote") ?? ""),
    }),
  );
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Sprawdź wpisane wyniki." };
  }

  try {
    await submitOnboardingForm(db, user.id, parsed.data);
  } catch (e) {
    if (e instanceof OnboardingFormError) return { error: e.userMessage };
    throw e;
  }
  return redirect("/podopieczny");
}

export default function FormularzStartowy() {
  const { form, trainerName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Formularz startowy
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Na czym dziś stoisz?</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          {trainerName ?? "Twój trener"} prosi o kilka liczb, żeby ułożyć Ci pierwszy plan.
          Wypełnij formularz, aby przejść dalej.
        </p>

        {form.trainerNote != null && (
          <div
            className="card"
            style={{ padding: 14, marginBottom: 18, background: "var(--surface-2)" }}
          >
            <div
              className="mono text-xs muted"
              style={{ textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}
            >
              Od trenera
            </div>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{form.trainerNote}</div>
          </div>
        )}

        {actionData && "error" in actionData && (
          <p className="alert alert-error" style={{ marginBottom: 14 }} role="alert">
            {actionData.error}
          </p>
        )}

        <Form method="post" style={{ display: "grid", gap: 16 }}>
          {form.items.map((item) => (
            <div key={item.id} className="field" style={{ margin: 0 }}>
              <input type="hidden" name="itemId" value={item.id} />
              <label htmlFor={`val-${item.id}`} style={{ fontWeight: 600 }}>
                {item.exerciseName}
              </label>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <input
                  id={`val-${item.id}`}
                  name="value"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10000}
                  step={1}
                  required
                  className="input"
                  style={{ maxWidth: 120 }}
                />
                <span className="mono text-xs muted" style={{ textTransform: "uppercase" }}>
                  {item.unit === "SEC" ? "sekund" : "powtórzeń"}
                </span>
              </div>
              <input
                name="comment"
                type="text"
                maxLength={200}
                className="input"
                style={{ marginTop: 6 }}
                placeholder="Komentarz — opcjonalnie (np. „z gumą”)"
              />
            </div>
          ))}

          <label className="field" style={{ margin: 0 }}>
            <span className="text-sm">Coś jeszcze, co trener powinien wiedzieć? — opcjonalnie</span>
            <textarea name="traineeNote" className="input" rows={3} maxLength={1000} />
          </label>

          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Zapisuję…" : "Gotowe — przejdź do aplikacji"}
          </button>
        </Form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/wyloguj" className="muted text-sm">
            Wyloguj
          </Link>
        </div>
      </div>
    </main>
  );
}
```

**Uwaga o równoległych polach:** `itemId`, `value` i `comment` powtarzają się raz
na pozycję i muszą zachować **tę samą kolejność** — `fd.getAll` zwraca je w
kolejności wystąpienia w DOM, a `<input type="hidden" name="itemId">` stoi w tym
samym bloku co jego `value`/`comment`. Nie przenoś ukrytych pól poza pętlę.

- [ ] **Krok 3: Zarejestruj trasę**

W `app/routes.ts`, w bloku `...prefix("podopieczny", [...])`, **poza**
`layout(...)`, obok `route("aktywuj", "routes/podopieczny/aktywuj.tsx")`:

```ts
    // Formularz startowy — OUTSIDE the layout, bo to dokąd bramka w _layout.tsx
    // odsyła podopiecznych z niewypełnionym formularzem (gdyby było w children
    // → pętla redirectów).
    route("formularz", "routes/podopieczny/formularz.tsx"),
```

- [ ] **Krok 4: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npm run lint` → bez błędów.
Uruchom: `npm run build` → build przechodzi (trasa wpięta poprawnie).

---

### Task 6: Bramka w layoucie podopiecznego i we Wrapped

**Pliki:**
- Modyfikacja: `app/routes/podopieczny/_layout.tsx` (loader, linie ~15–83)
- Modyfikacja: `app/routes/podopieczny/wrapped.$ym.tsx` (loader, ~linia 21)

**Interfejsy:**
- Konsumuje: `hasPendingOnboarding` (Task 3), `hasTraineeAppAccess` (Task 5),
  trasa `/podopieczny/formularz` (Task 5).

- [ ] **Krok 1: Wymień importy bramki płatności**

W `app/routes/podopieczny/_layout.tsx` **usuń** cztery importy, które obsługiwały
bramkę ręcznie:

```ts
import { stripeApiConfigured } from "~/lib/env";
import { hasAppAccess, paymentRequired } from "~/lib/stripe/access";
import { getConnectionRow } from "~/lib/stripe/connections";
import { getSubscriptionForPair } from "~/lib/stripe/subscriptions";
```

i **dodaj** dwa:

```ts
import { hasPendingOnboarding } from "~/lib/onboarding-forms";
import { hasTraineeAppAccess } from "~/lib/stripe/gate";
```

Importy `and`, `count`, `eq` z `drizzle-orm` oraz `redirect` z `react-router`
zostają — dalej ich używamy.

- [ ] **Krok 2: Przepisz loader w całości**

Zastąp całą funkcję `loader` (linie ~15–83) poniższą. Zmiany względem obecnej:
bramki wskoczyły na samą górę, blok „Payment gating + badge" zniknął na rzecz
`hasTraineeAppAccess`, doszła bramka formularza. Reszta zapytań bez zmian.

```ts
export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });

  // Bramki idą PRZED licznikami — podopieczny, którego i tak odsyłamy, nie ma po
  // co kosztować sześciu zapytań. Kolejność: najpierw płatność (drzwi do
  // aplikacji), potem formularz startowy (już wnętrze relacji).
  const { hasAccess, sub } = await hasTraineeAppAccess(db, user);
  if (!hasAccess) throw redirect("/podopieczny/aktywuj");
  if (await hasPendingOnboarding(db, user.id)) throw redirect("/podopieczny/formularz");

  const [logCountRow] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(eq(schema.workoutLogs.traineeId, user.id));
  const [photoCountRow] = await db
    .select({ c: count() })
    .from(schema.bodyPhotos)
    .where(eq(schema.bodyPhotos.traineeId, user.id));

  // Sessions count = sessions in the trainee's active plan (if any).
  const activePlan = await db
    .select({ id: schema.plans.id })
    .from(schema.plans)
    .where(and(eq(schema.plans.traineeId, user.id), eq(schema.plans.status, "active")))
    .limit(1);
  let sessionsCount = 0;
  if (activePlan[0]) {
    const [row] = await db
      .select({ c: count() })
      .from(schema.planSessions)
      .where(eq(schema.planSessions.planId, activePlan[0].id));
    sessionsCount = Number(row?.c ?? 0);
  }

  const pending = await countPendingForTrainee(db, user.id);
  const ideas = await countForTrainee(db, user.id);

  // Odznaka: subskrypcja wymaga uwagi (past_due, unpaid albo brak wiersza, gdy
  // trener ustawił już cenę). `sub` jest null, gdy trenera nie ma — wtedy 0.
  const needsAttention =
    sub?.status === "past_due" ||
    sub?.status === "unpaid" ||
    (sub?.status === "none" && sub.stripePriceId != null);

  return {
    user,
    tails: {
      sessions: sessionsCount,
      history: Number(logCountRow?.c ?? 0),
      photos: Number(photoCountRow?.c ?? 0),
      consultations: pending,
      ideas,
      payments: needsAttention ? 1 : 0,
    },
  };
}
```

- [ ] **Krok 3: Dołóż bramkę we Wrapped**

W `app/routes/podopieczny/wrapped.$ym.tsx` dopisz import:

```ts
import { hasPendingOnboarding } from "~/lib/onboarding-forms";
```

i zaraz po `const user = await requireUser(args.request, db, { role: "trainee" });`:

```ts
  // Wrapped żyje poza layoutem, więc bramka formularza musi tu stać osobno.
  // Bramki płatności celowo NIE dokładamy — dziś jej tu nie ma i ta zmiana nie
  // jest od zaostrzania dostępu.
  if (await hasPendingOnboarding(db, user.id)) throw redirect("/podopieczny/formularz");
```

Jeśli `redirect` nie jest w tym pliku importowany, dopisz go do importu z `react-router`.

- [ ] **Krok 4: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npm run lint` → bez błędów.
Uruchom: `npm run build` → przechodzi.

---

### Task 7: Trener — widok wyników + plakietka na karcie podopiecznego

> Warstwę wizualną prowadzi skill `frontend-design:frontend-design`.

**Pliki:**
- Utwórz: `app/routes/trener/podopieczni.$traineeId.formularz.tsx`
- Modyfikacja: `app/routes.ts` (blok tras trenera, obok pozostałych `podopieczni/:traineeId/*`)
- Modyfikacja: `app/routes/trener/podopieczni.$traineeId.tsx` (loader + pasek przycisków ~linie 290–318)

**Interfejsy:**
- Konsumuje: `getFormForTrainer`, `getFormStatusForTrainee` (Task 3),
  `answerLabel` (Task 2), `fmtDate`/`fmtDateTime` z `~/lib/format`.

- [ ] **Krok 1: Napisz trasę wyników**

Utwórz `app/routes/trener/podopieczni.$traineeId.formularz.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDateTime } from "~/lib/format";
import { answerLabel } from "~/lib/onboarding-form-types";
import { getFormForTrainer } from "~/lib/onboarding-forms";
import { assertTraineeOwnedBy } from "~/lib/trainees";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  // Rzuca 404, gdy podopieczny nie jest nasz — zanim w ogóle zapytamy o formularz.
  await assertTraineeOwnedBy(db, user.id, traineeId);

  const form = await getFormForTrainer(db, user.id, traineeId);
  if (!form) throw new Response("not found", { status: 404 });

  // Nazwa podopiecznego w nagłówku — trener otwierający tę stronę wprost (zakładka,
  // przycisk „wstecz") musi wiedzieć, czyj to formularz. Tak samo robią sąsiednie
  // widoki `sylwetka` i `platnosci`.
  const [trainee] = await db
    .select({ displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, traineeId))
    .limit(1);

  return { form, traineeId, traineeName: trainee?.displayName ?? null };
}

export default function FormularzStartowyTrenera() {
  const { form, traineeId, traineeName } = useLoaderData<typeof loader>();
  const done = form.completedAtISO != null;

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            <Link to={`/trener/podopieczni/${traineeId}`} style={{ color: "inherit" }}>
              ← Podopieczny{traineeName != null ? ` · ${traineeName}` : ""}
            </Link>
          </div>
          <h1>Formularz startowy</h1>
          <div className="sub">
            {done
              ? `Wypełniony ${fmtDateTime(form.completedAtISO!)}.`
              : "Czeka na wypełnienie przez podopiecznego."}
          </div>
        </div>
      </div>

      {form.trainerNote != null && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div
            className="mono text-xs muted"
            style={{ textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}
          >
            Twoja notatka
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{form.trainerNote}</div>
        </div>
      )}

      <div className="list">
        <div
          className="list-head"
          style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 2fr", gap: 14 }}
        >
          <div>Ćwiczenie</div>
          <div>Wynik</div>
          <div>Komentarz</div>
        </div>
        {form.items.map((item) => (
          <div
            key={item.id}
            className="list-row"
            // Wiersz nie jest linkiem, a `.list-row` ma bezwarunkowe `cursor: pointer`.
            style={{ gridTemplateColumns: "1.6fr 0.8fr 2fr", gap: 14, cursor: "default" }}
          >
            <div style={{ fontSize: 14, fontWeight: 500 }}>{item.exerciseName}</div>
            <div className="mono">
              {item.value == null ? (
                <span className="muted">—</span>
              ) : (
                answerLabel(item.unit, item.value)
              )}
            </div>
            <div className="text-sm muted">{item.comment ?? "—"}</div>
          </div>
        ))}
      </div>

      {form.traineeNote != null && (
        <div className="card" style={{ marginTop: 16 }}>
          <div
            className="mono text-xs muted"
            style={{ textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}
          >
            Od podopiecznego
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{form.traineeNote}</div>
        </div>
      )}

      {!done && (
        <div className="empty" style={{ marginTop: 16 }}>
          <Icons.Consult />
          <div>Podopieczny zobaczy ten formularz przy pierwszym wejściu do aplikacji.</div>
        </div>
      )}
    </div>
  );
}
```

`Icons.Consult` (ikona konsultacji) i `Icons.Check` istnieją w
`app/components/icons.tsx` — nie dodawaj nowych ikon.

- [ ] **Krok 2: Zarejestruj trasę**

W `app/routes.ts`, w bloku trenera, po wpisie `podopieczni/:traineeId/sylwetka`:

```ts
      route(
        "podopieczni/:traineeId/formularz",
        "routes/trener/podopieczni.$traineeId.formularz.tsx",
      ),
```

- [ ] **Krok 3: Plakietka na karcie podopiecznego**

W `app/routes/trener/podopieczni.$traineeId.tsx` dopisz import:

```ts
import { getFormStatusForTrainee } from "~/lib/onboarding-forms";
```

W `loader`, po pobraniu `trainee` (a przed zwróceniem danych), dopisz:

```ts
  const onboardingStatus = await getFormStatusForTrainee(db, user.id, traineeId);
```

i dodaj `onboardingStatus` do zwracanego obiektu. W komponencie dodaj je do
destrukturyzacji `useLoaderData`, a w pasku przycisków (obok „Rozwój",
„Sylwetka", „Konsultacje", „Płatności") wstaw:

```tsx
          {onboardingStatus != null && (
            <Link to={`/trener/podopieczni/${trainee.id}/formularz`} className="btn">
              <Icons.Check /> Formularz startowy
              {onboardingStatus.completedAtISO == null && (
                <span className="badge" style={{ marginLeft: 6 }}>
                  <span className="badge-dot" />
                  czeka
                </span>
              )}
            </Link>
          )}
```

- [ ] **Krok 4: Bramka**

Uruchom: `npm run typecheck` → bez błędów.
Uruchom: `npm run lint` → bez błędów.
Uruchom: `npm run build` → przechodzi.

---

### Task 8: Test integracyjny + dokumentacja + bramki końcowe

**Pliki:**
- Utwórz: `tests/onboarding-forms.itest.ts`
- Modyfikacja: `tests/README.md`, `app/lib/README.md`, `app/components/README.md`,
  `app/lib/db/README.md`, `app/lib/auth/README.md`, `app/lib/stripe/README.md`,
  `app/routes/README.md`, `app/routes/trener/README.md`, `app/routes/podopieczny/README.md`,
  `docs/superpowers/plans/README.md`

- [ ] **Krok 1: Napisz test integracyjny**

Utwórz `tests/onboarding-forms.itest.ts`. **Nie uruchamiaj go** — wymaga Dockera,
odpala go właściciel.

```ts
// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consumeInvite, createInvite } from "~/lib/auth/invite";
import * as schema from "~/lib/db/schema";
import {
  OnboardingFormError,
  createOnboardingForm,
  getFormForTrainer,
  getFormStatusForTrainee,
  getPendingFormForTrainee,
  hasPendingOnboarding,
  submitOnboardingForm,
} from "~/lib/onboarding-forms";
import { deleteTraineeFully } from "~/lib/trainees";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerA = "";
let trainerB = "";
let pullUpId = "";
let plankId = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trenera@onb.example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;

  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@onb.example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;

  const [pullUp] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Pull-up", unit: "REPS" })
    .returning({ id: schema.exercises.id });
  pullUpId = pullUp!.id;

  const [plank] = await db
    .insert(schema.exercises)
    .values({ trainerId: trainerA, name: "Plank", unit: "SEC" })
    .returning({ id: schema.exercises.id });
  plankId = plank!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

/** Zaproszenie + (opcjonalnie) formularz w jednej transakcji, jak robi to trasa. */
async function inviteWithForm(email: string, exerciseIds: string[] | null) {
  return await db.transaction(async (tx) => {
    const created = await createInvite(tx, {
      trainerId: trainerA,
      displayName: "Nowy Podopieczny",
      email,
    });
    if (exerciseIds) {
      await createOnboardingForm(tx, {
        trainerId: trainerA,
        inviteId: created.invite.id,
        exerciseIds,
        note: "Wykonaj na świeżo.",
      });
    }
    return created;
  });
}

async function accept(token: string, email: string) {
  const result = await consumeInvite(db, {
    token,
    chosenEmail: email,
    chosenDisplayName: "Nowy Podopieczny",
    newPasswordHash: "x".repeat(40),
  });
  return result.user.id;
}

describe("formularz startowy — przepływ", () => {
  it("przypina formularz do konta i blokuje aplikację do wypełnienia", async () => {
    const email = "p1@onb.example.com";
    const { token } = await inviteWithForm(email, [pullUpId, plankId]);
    const traineeId = await accept(token, email);

    expect(await hasPendingOnboarding(db, traineeId)).toBe(true);

    const pending = await getPendingFormForTrainee(db, traineeId);
    expect(pending).not.toBeNull();
    expect(pending!.items.map((i) => i.exerciseName)).toEqual(["Pull-up", "Plank"]);
    expect(pending!.items.map((i) => i.unit)).toEqual(["REPS", "SEC"]);
    expect(pending!.trainerNote).toBe("Wykonaj na świeżo.");

    await submitOnboardingForm(db, traineeId, {
      answers: [
        { itemId: pending!.items[0]!.id, value: 8, comment: "ostatnie na siłę" },
        { itemId: pending!.items[1]!.id, value: 45, comment: null },
      ],
      traineeNote: "Byłem po treningu nóg.",
    });

    expect(await hasPendingOnboarding(db, traineeId)).toBe(false);

    const forTrainer = await getFormForTrainer(db, trainerA, traineeId);
    expect(forTrainer!.completedAtISO).not.toBeNull();
    expect(forTrainer!.traineeNote).toBe("Byłem po treningu nóg.");
    expect(forTrainer!.items.map((i) => i.value)).toEqual([8, 45]);
    expect(forTrainer!.items[0]!.comment).toBe("ostatnie na siłę");
  });

  it("drugie wysłanie nie nadpisuje odpowiedzi", async () => {
    const email = "p2@onb.example.com";
    const { token } = await inviteWithForm(email, [pullUpId]);
    const traineeId = await accept(token, email);
    const pending = await getPendingFormForTrainee(db, traineeId);

    await submitOnboardingForm(db, traineeId, {
      answers: [{ itemId: pending!.items[0]!.id, value: 5, comment: null }],
      traineeNote: null,
    });

    await expect(
      submitOnboardingForm(db, traineeId, {
        answers: [{ itemId: pending!.items[0]!.id, value: 99, comment: null }],
        traineeNote: null,
      }),
    ).rejects.toBeInstanceOf(OnboardingFormError);

    const after = await getFormForTrainer(db, trainerA, traineeId);
    expect(after!.items[0]!.value).toBe(5);
  });

  it("odrzuca niekompletny komplet odpowiedzi", async () => {
    const email = "p3@onb.example.com";
    const { token } = await inviteWithForm(email, [pullUpId, plankId]);
    const traineeId = await accept(token, email);
    const pending = await getPendingFormForTrainee(db, traineeId);

    await expect(
      submitOnboardingForm(db, traineeId, {
        answers: [{ itemId: pending!.items[0]!.id, value: 5, comment: null }],
        traineeNote: null,
      }),
    ).rejects.toBeInstanceOf(OnboardingFormError);
    expect(await hasPendingOnboarding(db, traineeId)).toBe(true);
  });

  it("zaproszenie bez formularza zostawia flow bez zmian", async () => {
    const email = "p4@onb.example.com";
    const { token } = await inviteWithForm(email, null);
    const traineeId = await accept(token, email);

    expect(await hasPendingOnboarding(db, traineeId)).toBe(false);
    expect(await getFormStatusForTrainee(db, trainerA, traineeId)).toBeNull();
  });
});

describe("formularz startowy — tenant-scope", () => {
  it("nie tworzy formularza z cudzego ćwiczenia", async () => {
    const [own] = await db
      .insert(schema.exercises)
      .values({ trainerId: trainerB, name: "Dip", unit: "REPS" })
      .returning({ id: schema.exercises.id });

    await expect(
      db.transaction(async (tx) => {
        const created = await createInvite(tx, {
          trainerId: trainerA,
          displayName: "Ktoś",
          email: "p5@onb.example.com",
        });
        await createOnboardingForm(tx, {
          trainerId: trainerA,
          inviteId: created.invite.id,
          exerciseIds: [own!.id],
          note: null,
        });
      }),
    ).rejects.toBeInstanceOf(OnboardingFormError);
  });

  it("obcy trener nie widzi formularza", async () => {
    const email = "p6@onb.example.com";
    const { token } = await inviteWithForm(email, [pullUpId]);
    const traineeId = await accept(token, email);

    expect(await getFormForTrainer(db, trainerB, traineeId)).toBeNull();
    expect(await getFormStatusForTrainee(db, trainerB, traineeId)).toBeNull();
  });

  it("usunięcie podopiecznego kasuje formularz i pozycje", async () => {
    const email = "p7@onb.example.com";
    const { token } = await inviteWithForm(email, [pullUpId, plankId]);
    const traineeId = await accept(token, email);
    const formId = (await getPendingFormForTrainee(db, traineeId))!.id;

    await deleteTraineeFully(db, trainerA, traineeId);

    const forms = await db
      .select({ id: schema.onboardingForms.id })
      .from(schema.onboardingForms)
      .where(eq(schema.onboardingForms.id, formId));
    expect(forms).toHaveLength(0);

    const items = await db
      .select({ id: schema.onboardingFormItems.id })
      .from(schema.onboardingFormItems)
      .where(eq(schema.onboardingFormItems.formId, formId));
    expect(items).toHaveLength(0);
  });
});
```

- [ ] **Krok 2: Zaktualizuj README-e**

Dopisz wiersze (zwięźle, w konwencji istniejących tabel):

- `app/lib/README.md` — `onboarding-form-types.ts` i `onboarding-forms.ts`.
- `app/components/README.md` — `onboarding-picker.tsx`.
- `app/lib/db/README.md` — tabele `onboarding_forms` + `onboarding_form_items`
  (jeśli README wymienia tabele) i nowa migracja.
- `app/lib/auth/README.md` — `consumeInvite` stempluje `trainee_id` na formularzu startowym.
- `app/lib/stripe/README.md` — nowy `gate.ts` (`hasTraineeAppAccess`).
- `app/routes/README.md` — mapa URL→plik: `/podopieczny/formularz`,
  `/trener/podopieczni/:traineeId/formularz`.
- `app/routes/trener/README.md` — `podopieczni.$traineeId.formularz.tsx` +
  zmiana w `podopieczni._index.tsx` i `podopieczni.$traineeId.tsx`.
- `app/routes/podopieczny/README.md` — `formularz.tsx` + bramka w `_layout.tsx`
  i `wrapped.$ym.tsx`.
- `tests/README.md` — `onboarding-forms.itest.ts`.
- `docs/superpowers/plans/README.md` — wiersz o tym planie.

`CLAUDE.md` **nie** wymaga zmiany: nie dochodzi nowy katalog, stack ani konwencja.

- [ ] **Krok 3: Bramki końcowe**

Uruchom pojedynczo, każdą osobnym wywołaniem:
1. `npx vitest run app/lib/onboarding-form-types.test.ts` → PASS
2. `npm run typecheck` → bez błędów
3. `npm run lint` → bez błędów
4. `npm run build` → przechodzi

- [ ] **Krok 4: Przeglądy**

`/code-review` na całości diffu, potem `/security-review` (zmiana dotyka
zaproszeń, tworzenia konta i `trainer_id`).

- [ ] **Krok 5: Handoff**

Wypisz właścicielowi:
- listę zmienionych/nowych plików,
- proponowany komunikat commita (tekst, **bez** wykonywania gita),
- `npm run db:migrate` do odpalenia (nowa migracja z Taska 1),
- komendę testu integracyjnego: `npx vitest run tests/onboarding-forms.itest.ts`
  (Docker),
- ścieżkę weryfikacji ręcznej: zaproś podopiecznego z formularzem → przyjmij
  zaproszenie → sprawdź blokadę → wypełnij → sprawdź widok trenera; powtórz bez
  formularza i potwierdź, że flow jest jak dawniej.

---

## Kolejność i zależności

```
Task 1 (schemat) → Task 2 (czysty moduł) → Task 3 (repo + consumeInvite)
   ├→ Task 4 (trener: tworzenie)
   └→ Task 5 (podopieczny: wypełnianie + gate.ts) → Task 6 (bramki)
                                                  → Task 7 (trener: wyniki)
Task 8 (itest + docs + bramki końcowe) na końcu.
```

Task 6 **musi** iść po Tasku 5 — bramka odsyła na trasę, która wcześniej nie
istnieje, więc odwrotna kolejność zamurowałaby aplikację podopiecznego.
