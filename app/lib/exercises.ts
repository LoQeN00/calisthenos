import { and, arrayContains, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { deleteFileBlob, deleteFileRow, UploadCleanupQueue, uploadFile } from "~/lib/file-uploads";

/** Normalize a raw comma-separated tag string into a deduplicated, length-capped array. */
export function normalizeTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag.length === 0 || tag.length > 32) continue;
    seen.add(tag);
    if (seen.size >= 20) break;
  }
  return Array.from(seen);
}

export interface ExerciseWithDemo {
  exercise: schema.Exercise;
  demoFile: schema.File | null;
}

/**
 * Aktywne ćwiczenia trenera do pickerów (edytor planu, formularz startowy).
 * Celowo BEZ filtra wariantów umiejętności — to robi `listAssignableExercises` w `skills.ts`
 * i jest to inna lista.
 */
export async function listActiveExercisesForTrainer(
  db: Db,
  trainerId: string,
): Promise<Array<{ id: string; name: string; unit: "REPS" | "SEC" }>> {
  return await db
    .select({ id: schema.exercises.id, name: schema.exercises.name, unit: schema.exercises.unit })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, trainerId), isNull(schema.exercises.archivedAt)))
    .orderBy(asc(schema.exercises.name));
}

export async function countActiveExercisesForTrainer(db: Db, trainerId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.trainerId, trainerId), isNull(schema.exercises.archivedAt)));
  return Number(row?.c ?? 0);
}

/** Ćwiczenie razem z wierszem pliku demo (LEFT JOIN) — do widoku edycji. */
export async function getExerciseWithDemoForTrainer(
  db: Db,
  trainerId: string,
  exerciseId: string,
): Promise<ExerciseWithDemo | null> {
  const rows = await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, trainerId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Sam wiersz ćwiczenia, bez demo — do akcji, które tylko sprawdzają stan. */
export async function getExerciseForTrainer(
  db: Db,
  trainerId: string,
  exerciseId: string,
): Promise<schema.Exercise | null> {
  const rows = await db
    .select()
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, trainerId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Archiwizacja / przywrócenie. `trainer_id` JEST w WHERE — dla obcego tenanta to no-op,
 * mimo że wywołanie i tak stoi za sprawdzeniem własności (obrona w głąb).
 */
export async function setExerciseArchived(
  db: Db,
  trainerId: string,
  exerciseId: string,
  archived: boolean,
): Promise<void> {
  await db
    .update(schema.exercises)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.trainerId, trainerId)));
}

/**
 * Tworzy ćwiczenie razem z opcjonalnym demo w JEDNEJ transakcji.
 * `UploadCleanupQueue` żyje wewnątrz — rollback transakcji musi też sprzątnąć blob,
 * inaczej na wolumenie zostaje plik, do którego nic nie prowadzi.
 *
 * `UploadError` leci na zewnątrz — komunikat dla użytkownika składa trasa.
 */
export async function createExerciseWithDemo(
  db: Db,
  input: {
    trainerId: string;
    name: string;
    unit: "REPS" | "SEC";
    /** Kolumna jest NOT NULL DEFAULT '' — brak opisu to pusty string, nie `null`. */
    description: string;
    tags: string[];
    tracksRpe: boolean;
    demo: File | null;
  },
): Promise<void> {
  const cleanup = new UploadCleanupQueue(db);
  try {
    await db.transaction(async (tx) => {
      let demoFileId: string | null = null;
      if (input.demo != null) {
        const uploaded = await uploadFile(
          tx,
          {
            file: input.demo,
            kind: "exercise_demo",
            trainerId: input.trainerId,
            uploadedBy: input.trainerId,
          },
          cleanup,
        );
        demoFileId = uploaded.id;
      }
      await tx.insert(schema.exercises).values({
        trainerId: input.trainerId,
        name: input.name,
        unit: input.unit,
        description: input.description,
        tracksRpe: input.tracksRpe,
        tags: input.tags,
        demoFileId,
      });
    });
    cleanup.commit();
  } catch (e) {
    await cleanup.cleanup();
    throw e;
  }
}

/**
 * Zapis edycji ćwiczenia z opcjonalną PODMIANĄ demo. Wiersz starego pliku znika w tej samej
 * transakcji, ale blob kasujemy DOPIERO po commicie — inaczej rollback zostawiłby wiersz
 * przywrócony, a plik już usunięty z dysku (martwy odnośnik do nieistniejącego nagrania).
 *
 * `currentDemoFileId` podaje wywołujący z wiersza, który i tak wczytał do sprawdzenia
 * własności (`getExerciseForTrainer`) — dzięki temu nie robimy drugiego SELECT-a.
 * `trainer_id` JEST w `WHERE` UPDATE-a (obrona w głąb, jak w `setExerciseArchived`).
 */
export async function updateExerciseWithDemo(
  db: Db,
  input: {
    trainerId: string;
    exerciseId: string;
    /** Z wiersza wczytanego przy sprawdzeniu własności. */
    currentDemoFileId: string | null;
    name: string;
    unit: "REPS" | "SEC";
    /** Kolumna jest NOT NULL DEFAULT '' — brak opisu to pusty string, nie `null`. */
    description: string;
    tags: string[];
    tracksRpe: boolean;
    /** `null` = zostaw dotychczasowe demo bez zmian. */
    demo: File | null;
  },
): Promise<void> {
  const cleanup = new UploadCleanupQueue(db);
  let oldDemoStoragePathToDelete: string | null = null;
  try {
    await db.transaction(async (tx) => {
      let demoFileId: string | null = input.currentDemoFileId;
      const oldDemoFileId = input.currentDemoFileId;

      if (input.demo != null) {
        const uploaded = await uploadFile(
          tx,
          {
            file: input.demo,
            kind: "exercise_demo",
            trainerId: input.trainerId,
            uploadedBy: input.trainerId,
          },
          cleanup,
        );
        demoFileId = uploaded.id;
      }

      await tx
        .update(schema.exercises)
        .set({
          name: input.name,
          unit: input.unit,
          description: input.description,
          tracksRpe: input.tracksRpe,
          tags: input.tags,
          demoFileId,
        })
        .where(
          and(
            eq(schema.exercises.id, input.exerciseId),
            eq(schema.exercises.trainerId, input.trainerId),
          ),
        );

      if (input.demo != null && oldDemoFileId) {
        // Wiersz starego demo znika W transakcji; blob dopiero po commicie (niżej).
        oldDemoStoragePathToDelete = await deleteFileRow(tx, oldDemoFileId);
      }
    });
    cleanup.commit();
    if (oldDemoStoragePathToDelete) {
      // Best-effort po commicie (jak w deleteBodyPhoto / trainees): podmiana jest już
      // zatwierdzona, więc błąd usunięcia starego blobu nie może wywrócić operacji.
      try {
        await deleteFileBlob(oldDemoStoragePathToDelete);
      } catch {
        // Swallow — osierocony blob zamiast wywrócenia udanej operacji.
      }
    }
  } catch (e) {
    await cleanup.cleanup();
    throw e;
  }
}

export type ExerciseSort = "name_asc" | "name_desc" | "newest" | "oldest";

export interface ExerciseFilter {
  q?: string;
  /** Nazwa kategorii. Wywołujący podaje wyłącznie kategorię znaną trenerowi. */
  tag?: string;
  unit?: "REPS" | "SEC";
}

function exerciseConditions(trainerId: string, filter: ExerciseFilter) {
  const conditions = [
    eq(schema.exercises.trainerId, trainerId),
    isNull(schema.exercises.archivedAt),
  ];
  if (filter.q != null && filter.q.length > 0) {
    conditions.push(ilike(schema.exercises.name, `%${filter.q}%`));
  }
  if (filter.tag != null) {
    conditions.push(arrayContains(schema.exercises.tags, [filter.tag]));
  }
  if (filter.unit === "REPS" || filter.unit === "SEC") {
    conditions.push(eq(schema.exercises.unit, filter.unit));
  }
  return conditions;
}

export async function countExercisesForTrainer(
  db: Db,
  trainerId: string,
  filter: ExerciseFilter,
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.exercises)
    .where(and(...exerciseConditions(trainerId, filter)));
  return Number(row?.c ?? 0);
}

export async function listExercisesForTrainer(
  db: Db,
  trainerId: string,
  opts: ExerciseFilter & { sort: ExerciseSort; limit: number; offset: number },
): Promise<ExerciseWithDemo[]> {
  const orderBy =
    opts.sort === "name_desc"
      ? [desc(schema.exercises.name)]
      : opts.sort === "newest"
        ? [desc(schema.exercises.createdAt)]
        : opts.sort === "oldest"
          ? [asc(schema.exercises.createdAt)]
          : [asc(schema.exercises.name)];

  return await db
    .select({ exercise: schema.exercises, demoFile: schema.files })
    .from(schema.exercises)
    .leftJoin(schema.files, eq(schema.files.id, schema.exercises.demoFileId))
    .where(and(...exerciseConditions(trainerId, opts)))
    .orderBy(...orderBy)
    .limit(opts.limit)
    .offset(opts.offset);
}
