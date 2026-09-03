import { and, count, eq, isNull } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { deleteFileBlob } from "~/lib/file-uploads";
import { traineeListControllerQuery } from "@kalisthenos/api-client";
import type { TraineeListPage } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";

export class TraineeDeleteError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export type ClientSort = "name_asc" | "name_desc" | "last_session" | "most_sessions" | "newest";
export type PlanFilter = "all" | "with" | "without";

export interface ClientListOpts {
  page: number;
  sort: ClientSort;
  q?: string;
  /** Domyślnie `all` — wtedy parametr nie idzie do kontraktu. */
  plan?: PlanFilter;
}

/**
 * Lista podopiecznych trenera z liczbą sesji i datą ostatniej — pierwszy odczyt
 * tego modułu na kontrakcie (`GET /v1/trainees`, dodany w Etapie 1 właśnie dla
 * niego). Do integracji mieszkał w `workouts.ts` jako `listClientsForTrainer`
 * + `countClientsForTrainer`; przeszedł tu, bo zasób to podopieczni, a po stronie
 * BE model odczytu żyje w `analytics` (przekracza granicę kontekstu — ADR-0009).
 * Strona (30) i licznik przychodzą razem; `q` obejmuje nazwę ALBO e-mail, jak
 * dotychczasowy `ilike` na `users`.
 *
 * Dwie rzeczy, których kontrakt NIE niesie: nazwy aktywnego planu (jest `hasActivePlan`)
 * i daty dołączenia — dołożenie ich jest addytywne po stronie BE. Trzecia różnica
 * jest celowa: `sessionCount` liczy WYŁĄCZNIE treningi odbyte u tego trenera.
 */
export async function listClientsForTrainer(
  api: Api,
  opts: ClientListOpts,
): Promise<TraineeListPage> {
  const { data } = await traineeListControllerQuery({
    client: api,
    query: {
      page: opts.page,
      sort: opts.sort,
      // `all` to BRAK parametru; puste `q=` znaczy „szukaj pustego łańcucha".
      ...(opts.plan != null && opts.plan !== "all" ? { plan: opts.plan } : {}),
      ...(opts.q != null && opts.q.length > 0 ? { q: opts.q } : {}),
    },
    throwOnError: true,
  });
  return data;
}

/**
 * Permanently delete a trainee and everything they own.
 *
 * NOTE — external side-effects are NOT handled here. Cancelling the Stripe
 * subscription + deleting the Stripe customer (RODO) and removing the trainee's
 * Google Calendar events happen in the calling route (`podopieczni.$traineeId.tsx`,
 * intent `delete-trainee`) via `cleanupSubscriptionForTrainee` + `syncCancelAllForPair`,
 * BEFORE this DB cascade — once the rows below are gone, the Stripe/Google links are
 * lost. This function is purely the DB-cascade primitive.
 *
 * Cascade map (from schema):
 * - plans.traineeId, workoutLogs.traineeId, bodyPhotos.traineeId, sessions.userId,
 *   consultations.traineeId, consultation_schedules.traineeId,
 *   coaching_subscriptions.traineeId, subscription_payments.traineeId
 *   → ON DELETE CASCADE. These cascade-delete automatically when the user is removed,
 *   dragging their children with them (plan sessions/blocks/items, workout
 *   exercise/set logs, consultation action items). The Stripe rows go too — but the
 *   live subscription at Stripe must already be cancelled by the route (see NOTE).
 * - `skill_advancements.trainee_id` → ON DELETE CASCADE. The trainee's advancement
 *   history goes with the user. `advanced_by` points to the *trainer* (who stays),
 *   so its RESTRICT does not block this cascade.
 * - `onboarding_forms.trainee_id` → ON DELETE CASCADE. The starting form goes with
 *   the trainee, dragging its `onboarding_form_items` along via `form_id` (also
 *   ON DELETE CASCADE). Nothing here points at a file, so no blob cleanup.
 *
 * What we have to handle manually:
 * - `invites.consumed_by_user` / `invites.replaces_user_id`: no ON DELETE
 *   defined → defaults to NO ACTION → would block. We NULL them first.
 * - `files.uploaded_by`: ON DELETE RESTRICT → would block deletion. The trainee
 *   only ever uploads `body_photo` and `set_video` files. We delete those file
 *   rows (and their blobs post-commit) before deleting the user. We must drop
 *   `body_photos` rows first because `body_photos.file_id` is RESTRICT.
 *   `workout_set_logs.video_file_id` is SET NULL, so it doesn't block.
 * - `skill_advancements.advanced_by`: ON DELETE RESTRICT. Today only trainers
 *   advance, so this never points at the trainee — but the FK is a foot-gun for a
 *   future self-advance flow. We defensively drop any row authored by this user
 *   first so the cascade below can never be blocked.
 */
export async function deleteTraineeFully(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<{ displayName: string; deletedFiles: number }> {
  // Verify ownership + role outside the tx so the error message is friendlier.
  const traineeRows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      role: schema.users.role,
      trainerId: schema.users.trainerId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, traineeId))
    .limit(1);
  const trainee = traineeRows[0];
  if (!trainee || trainee.trainerId !== trainerId || trainee.role !== "trainee") {
    throw new TraineeDeleteError(
      `trainee ${traineeId} not owned by ${trainerId}`,
      "Podopieczny nie istnieje albo nie należy do Ciebie.",
    );
  }

  // Collect blob paths inside the tx, delete from disk only after commit.
  const storagePaths = await db.transaction(async (tx) => {
    // 1) Null out invite back-references (no ON DELETE defined on these FKs).
    await tx
      .update(schema.invites)
      .set({ consumedByUser: null })
      .where(eq(schema.invites.consumedByUser, traineeId));
    await tx
      .update(schema.invites)
      .set({ replacesUserId: null })
      .where(eq(schema.invites.replacesUserId, traineeId));

    // 2) Drop the trainee's body photos first — body_photos.file_id is RESTRICT,
    //    so the file rows can't be removed while a body_photo still references
    //    them.
    await tx.delete(schema.bodyPhotos).where(eq(schema.bodyPhotos.traineeId, traineeId));

    // 2b) Defensive: drop advancement rows AUTHORED by this user (advanced_by).
    //     `skill_advancements.advanced_by` is RESTRICT; today it's always the
    //     trainer, but a future self-advance flow would otherwise block the user
    //     delete. Rows where the trainee is the SUBJECT (trainee_id) cascade in
    //     step 4.
    await tx
      .delete(schema.skillAdvancements)
      .where(eq(schema.skillAdvancements.advancedBy, traineeId));

    // 3) Delete every file the trainee uploaded. Capture storagePaths for the
    //    post-commit blob cleanup. workout_set_logs.video_file_id is SET NULL,
    //    so it won't block; exercise_demo files are uploaded by the trainer, so
    //    they won't appear here.
    const removedFiles = await tx
      .delete(schema.files)
      .where(eq(schema.files.uploadedBy, traineeId))
      .returning({ storagePath: schema.files.storagePath });

    // 4) Finally delete the user. Cascades through sessions, plans (with
    //    sessions/blocks/items), workout_logs (with exercise/set logs).
    await tx.delete(schema.users).where(eq(schema.users.id, traineeId));

    return removedFiles.map((r) => r.storagePath);
  });

  // 5) Best-effort blob removal. A failure here leaves orphans on disk but the
  //    DB is already consistent — preferable to crashing the request.
  let deletedFiles = 0;
  for (const path of storagePaths) {
    try {
      await deleteFileBlob(path);
      deletedFiles += 1;
    } catch {
      // Swallow.
    }
  }

  return { displayName: trainee.displayName, deletedFiles };
}

/** Sanity helper used by the route to re-verify ownership before showing the form. */
export async function assertTraineeOwnedBy(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<void> {
  const rows = await db
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
  if (rows.length === 0) {
    throw new Response("not found", { status: 404 });
  }
}

/** Returns the trainee {id, displayName} iff it belongs to this trainer; otherwise null (caller → 404). */
export async function findTraineeOfTrainer(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<{ id: string; displayName: string } | null> {
  const rows = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Pełny wiersz podopiecznego, tylko w obrębie tenanta trenera; null → 404 po stronie trasy. */
export async function getTraineeOfTrainer(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<schema.User | null> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Aktywni podopieczni trenera (bez zarchiwizowanych) — do pickerów. */
export async function listTraineesOfTrainer(
  db: Db,
  trainerId: string,
): Promise<Array<{ id: string; displayName: string }>> {
  return await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
        isNull(schema.users.archivedAt),
      ),
    )
    .orderBy(schema.users.displayName);
}

/** Licznik do nawigacji — celowo LICZY zarchiwizowanych, jak dotychczas w layoucie. */
export async function countTraineesOfTrainer(db: Db, trainerId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.users)
    .where(and(eq(schema.users.trainerId, trainerId), eq(schema.users.role, "trainee")));
  return Number(row?.c ?? 0);
}
