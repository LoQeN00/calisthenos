import { and, asc, count, desc, eq } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  deleteFileBlob,
  deleteFileRow,
  UploadCleanupQueue,
  UploadError,
  uploadFile,
} from "~/lib/file-uploads";

export interface BodyPhotoRow {
  id: string;
  view: schema.BodyPhotoView;
  takenOn: string;
  note: string | null;
  fileId: string;
  mimeType: string;
  createdAt: Date;
}

/** List a trainee's body photos, newest first by default. */
export async function listBodyPhotosForTrainee(
  db: Db,
  traineeId: string,
  opts: { limit?: number; offset?: number; sort?: "newest" | "oldest" } = {},
): Promise<BodyPhotoRow[]> {
  const order =
    opts.sort === "oldest"
      ? [asc(schema.bodyPhotos.takenOn), asc(schema.bodyPhotos.createdAt)]
      : [desc(schema.bodyPhotos.takenOn), desc(schema.bodyPhotos.createdAt)];
  const rows = await db
    .select({
      photo: schema.bodyPhotos,
      mimeType: schema.files.mimeType,
    })
    .from(schema.bodyPhotos)
    .innerJoin(schema.files, eq(schema.files.id, schema.bodyPhotos.fileId))
    .where(eq(schema.bodyPhotos.traineeId, traineeId))
    .orderBy(...order)
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({
    id: r.photo.id,
    view: r.photo.view,
    takenOn: r.photo.takenOn,
    note: r.photo.note,
    fileId: r.photo.fileId,
    mimeType: r.mimeType,
    createdAt: r.photo.createdAt,
  }));
}

export async function countBodyPhotosForTrainee(db: Db, traineeId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.bodyPhotos)
    .where(eq(schema.bodyPhotos.traineeId, traineeId));
  return Number(row?.c ?? 0);
}

export class BodyPhotoError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface AddBodyPhotoInput {
  trainerId: string;
  traineeId: string;
  file: File;
  view: schema.BodyPhotoView;
  takenOn: string; // YYYY-MM-DD
  note: string | null;
}

/**
 * Upload a body photo and insert its row. Uses an UploadCleanupQueue so that
 * a partial-success state (file row committed, body_photos insert fails) is
 * cleaned up automatically.
 */
export async function addBodyPhoto(db: Db, input: AddBodyPhotoInput): Promise<string> {
  const cleanup = new UploadCleanupQueue(db);
  try {
    const uploaded = await uploadFile(
      db,
      {
        file: input.file,
        kind: "body_photo",
        trainerId: input.trainerId,
        uploadedBy: input.traineeId,
      },
      cleanup,
    );

    const [row] = await db
      .insert(schema.bodyPhotos)
      .values({
        trainerId: input.trainerId,
        traineeId: input.traineeId,
        view: input.view,
        takenOn: input.takenOn,
        note: input.note,
        fileId: uploaded.id,
      })
      .returning({ id: schema.bodyPhotos.id });
    cleanup.commit();
    return row!.id;
  } catch (e) {
    await cleanup.cleanup();
    if (e instanceof UploadError) {
      throw new BodyPhotoError(e.message, e.userMessage);
    }
    throw e;
  }
}

/**
 * Delete a body photo owned by `traineeId`. Removes the body_photos row AND
 * its underlying file row + blob. Returns true if a row was removed.
 *
 * Note: body_photos.file_id is `ON DELETE RESTRICT`, so we must drop the
 * body_photos row first inside a tx, capture the file id, then delete the
 * file row + blob.
 */
export async function deleteBodyPhoto(
  db: Db,
  photoId: string,
  traineeId: string,
): Promise<boolean> {
  const storagePath = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(schema.bodyPhotos)
      .where(and(eq(schema.bodyPhotos.id, photoId), eq(schema.bodyPhotos.traineeId, traineeId)))
      .returning({ fileId: schema.bodyPhotos.fileId });
    const fileId = rows[0]?.fileId;
    if (!fileId) return null;
    return await deleteFileRow(tx, fileId);
  });

  if (storagePath != null) {
    // Best-effort: wiersze są już skasowane w transakcji, więc DB jest spójne.
    // Błąd I/O dysku zostawia osierocony blob, ale nie może wywrócić udanej
    // operacji 500-tką (ten sam wzorzec co w trainees.ts).
    try {
      await deleteFileBlob(storagePath);
    } catch {
      // Swallow.
    }
    return true;
  }
  return false;
}
