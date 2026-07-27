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
        inviteId: created.invite!.id,
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
          inviteId: created.invite!.id,
          exerciseIds: [own!.id],
          note: null,
        });
      }),
    ).rejects.toBeInstanceOf(OnboardingFormError);
  });

  it("nie tworzy formularza z ćwiczenia zarchiwizowanego", async () => {
    // Osobny przypadek od „cudzego ćwiczenia": bez niego usunięcie warunku
    // `archived_at IS NULL` z zapytania przeszłoby cały zestaw na zielono.
    const [archived] = await db
      .insert(schema.exercises)
      .values({
        trainerId: trainerA,
        name: "Muscle-up (wycofane)",
        unit: "REPS",
        archivedAt: new Date(),
      })
      .returning({ id: schema.exercises.id });

    await expect(
      db.transaction(async (tx) => {
        const created = await createInvite(tx, {
          trainerId: trainerA,
          displayName: "Ktoś",
          email: "p8@onb.example.com",
        });
        await createOnboardingForm(tx, {
          trainerId: trainerA,
          inviteId: created.invite!.id,
          exerciseIds: [archived!.id],
          note: null,
        });
      }),
    ).rejects.toBeInstanceOf(OnboardingFormError);
  });

  it("podopieczny nie zapisze odpowiedzi na cudzych pozycjach formularza", async () => {
    // Najważniejszy niezmiennik tego featurea: identyfikatory pozycji przychodzą
    // z przeglądarki, więc formularz MUSI być wybrany po `traineeId` z sesji, a
    // pozycje sprawdzone względem NIEGO.
    const emailA = "p9@onb.example.com";
    const { token: tokenA } = await inviteWithForm(emailA, [pullUpId, plankId]);
    const traineeA = await accept(tokenA, emailA);
    const formA = (await getPendingFormForTrainee(db, traineeA))!;

    const emailB = "p10@onb.example.com";
    const { token: tokenB } = await inviteWithForm(emailB, [pullUpId, plankId]);
    const traineeB = await accept(tokenB, emailB);

    await expect(
      submitOnboardingForm(db, traineeB, {
        answers: formA.items.map((i) => ({ itemId: i.id, value: 99, comment: null })),
        traineeNote: "podstawione cudze pozycje",
      }),
    ).rejects.toBeInstanceOf(OnboardingFormError);

    // Formularz A nietknięty i nadal czekający...
    expect(await hasPendingOnboarding(db, traineeA)).toBe(true);
    const afterA = await getPendingFormForTrainee(db, traineeA);
    expect(afterA!.items.map((i) => i.value)).toEqual([null, null]);
    // ...a formularz B nie zamknął się cudzymi odpowiedziami.
    expect(await hasPendingOnboarding(db, traineeB)).toBe(true);
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
