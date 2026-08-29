import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  MAX_ONBOARDING_EXERCISES,
  type OnboardingAnswers,
  type OnboardingUnit,
} from "~/lib/onboarding-form-types";

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
 * zaproszenia, któremu formularz nie doszedł. Transakcję otwiera
 * `createInviteWithOnboarding` w `~/lib/auth/invite`: mieszka tam, a nie tutaj, bo
 * `auth/invite` już importuje ten moduł (`attachFormToTrainee`) i import w drugą
 * stronę zamknąłby cykl.
 *
 * Kolejność pozycji = kolejność `exerciseIds`. Jednostka jest snapshotowana z
 * biblioteki, bo trener może ją później przełączyć.
 */
export async function createOnboardingForm(
  db: Db,
  input: { trainerId: string; inviteId: string; exerciseIds: string[]; note: string | null },
): Promise<string> {
  // Zakres pilnuje też Zod na trasie, ale to jest publiczne API repo: pusta lista
  // przechodzi strażnika własności niżej (0 === 0), wiersz formularza się wstawia,
  // a dopiero `insert(...).values([])` rzuca surowy błąd drizzle — czyli 500
  // zamiast komunikatu.
  if (input.exerciseIds.length === 0 || input.exerciseIds.length > MAX_ONBOARDING_EXERCISES) {
    throw new OnboardingFormError(
      `invalid exercise count ${input.exerciseIds.length} for trainer ${input.trainerId}`,
      `Wybierz od 1 do ${MAX_ONBOARDING_EXERCISES} ćwiczeń.`,
    );
  }

  // Formularz i zaproszenie MUSZĄ należeć do tego samego trenera. Dziś jedyny
  // wołający podaje `inviteId` prosto z `createInvite` w tej samej transakcji, ale
  // docstring tego modułu obiecuje filtr po tenancie W ZAPYTANIU — bez tego
  // warunku trasa „poproś istniejącego podopiecznego" doczepiłaby formularz do
  // cudzego zaproszenia. Komunikat nie zdradza, czy takie zaproszenie istnieje.
  const inviteRows = await db
    .select({ id: schema.invites.id })
    .from(schema.invites)
    .where(
      and(eq(schema.invites.id, input.inviteId), eq(schema.invites.trainerId, input.trainerId)),
    )
    .limit(1);
  if (inviteRows.length === 0) {
    throw new OnboardingFormError(
      `invite ${input.inviteId} not owned by trainer ${input.trainerId}`,
      "Nie udało się dołączyć formularza do tego zaproszenia.",
    );
  }

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
 *
 * Bierze CAŁY wiersz zaproszenia, nie samo `id`: `consumeInvite` ma go już
 * wczytanego, więc `trainer_id` wchodzi do `WHERE` bez dodatkowego zapytania i
 * formularza nie da się przypiąć w poprzek tenantów.
 */
export async function attachFormToTrainee(
  db: Db,
  invite: { id: string; trainerId: string },
  traineeId: string,
): Promise<void> {
  await db
    .update(schema.onboardingForms)
    .set({ traineeId })
    .where(
      and(
        eq(schema.onboardingForms.inviteId, invite.id),
        eq(schema.onboardingForms.trainerId, invite.trainerId),
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
    .orderBy(desc(schema.onboardingForms.createdAt))
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
    .orderBy(desc(schema.onboardingForms.createdAt))
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
  input: OnboardingAnswers,
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
      .orderBy(desc(schema.onboardingForms.createdAt))
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
    // Porównujemy DŁUGOŚĆ TABLICY wejściowej, a nie rozmiar zbioru `got`: zbiór
    // zwija duplikaty, więc sto tysięcy powtórzeń tego samego `itemId` uchodziłoby
    // za komplet i rozkręcało tyleż sekwencyjnych UPDATE-ów w transakcji
    // trzymającej `FOR UPDATE` — na jednym z dziesięciu połączeń puli. Długość
    // tablicy wiąże rozmiar pętli niżej z liczbą pozycji z BAZY, niezależnie od
    // tego, co przepuści warstwa Zod. Warunek przynależności zostaje: razem dają
    // dokładną równość zbiorów (got ⊇ expected przy równych licznościach).
    if (expected.size !== input.answers.length || [...expected].some((id) => !got.has(id))) {
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
        and(eq(schema.onboardingForms.id, form.id), isNull(schema.onboardingForms.completedAt)),
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
    .orderBy(desc(schema.onboardingForms.createdAt))
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
    .orderBy(desc(schema.onboardingForms.createdAt))
    .limit(1);
  const form = rows[0];
  if (!form) return null;
  return { completedAtISO: form.completedAt?.toISOString() ?? null };
}
