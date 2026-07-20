import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { getEnv } from "~/lib/env";
import { getStorage } from "~/lib/storage";
import * as schema from "~/lib/db/schema";
import type { Db } from "~/lib/db/client";
import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  bodyPhotoPath,
  exerciseDemoPath,
  newFileId,
  setVideoPath,
} from "~/lib/files";

/**
 * `file-type` library inspects the first ~4100 bytes to identify common formats
 * by their binary signature (magic bytes). This guards against a client lying
 * about `Content-Type` (sending `video/mp4` for a malicious PHP file, etc.).
 */
const MAGIC_BYTE_INSPECT_SIZE = 4100;

export type UploadKind = "exercise_demo" | "set_video" | "body_photo";

export type UploadOwner = { trainerId: string } | { organizationId: string };

/**
 * Rozbija właściciela na kolumny `files` (dokładnie jedna niepusta — lustro CHECK
 * `files_owner_check`). Wyczerpujące: dodanie nowego wariantu `UploadOwner` bez
 * obsługi tutaj zapali błąd typu na `never`.
 */
function ownerColumns(owner: UploadOwner): {
  trainerId: string | null;
  organizationId: string | null;
} {
  if ("trainerId" in owner) return { trainerId: owner.trainerId, organizationId: null };
  if ("organizationId" in owner) return { trainerId: null, organizationId: owner.organizationId };
  const _exhaustive: never = owner;
  return _exhaustive;
}

export interface UploadFileInput {
  file: File;
  kind: UploadKind;
  owner: UploadOwner;
  uploadedBy: string;
}

export interface UploadedFileRecord {
  id: string;
  storagePath: string;
  mimeType: string;
  bytes: number;
}

/**
 * Track-and-cleanup helper for multi-file upload flows.
 * On `cleanup()`: deletes both the `files` row AND the underlying blob for every
 * tracked upload. This is the correct primitive when `uploadFile` was called
 * outside a transaction (so the row is already committed and a later failure
 * in the orchestrating action would otherwise leak the row).
 *
 * Call `commit()` on the success path to forget the tracked items.
 */
export class UploadCleanupQueue {
  constructor(private readonly db: Db) {}
  private items: Array<{ fileId: string; storagePath: string }> = [];
  track(item: { fileId: string; storagePath: string }): void {
    this.items.push(item);
  }
  async cleanup(): Promise<void> {
    for (const item of this.items) {
      try {
        // deleteFile removes the row + blob; safe even if the row is already gone.
        await deleteFile(this.db, item.fileId);
      } catch {
        // Best-effort: keep cleaning up the remaining items. A failed delete
        // leaves an orphan row/blob, which is preferable to losing track.
      }
    }
    this.items = [];
  }
  commit(): void {
    this.items = [];
  }
}

function allowedMimesFor(kind: UploadKind): Set<string> {
  switch (kind) {
    case "exercise_demo":
    case "set_video":
      return ALLOWED_VIDEO_MIME;
    case "body_photo":
      return ALLOWED_IMAGE_MIME;
  }
}

function pathFor(kind: UploadKind, fileId: string, mime: string): string {
  switch (kind) {
    case "exercise_demo":
      return exerciseDemoPath(fileId, mime);
    case "set_video":
      return setVideoPath(fileId, mime);
    case "body_photo":
      return bodyPhotoPath(fileId, mime);
  }
}

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * Validate, write to storage, and insert the `files` row. On any failure the
 * partial file (if any) is removed via the cleanup queue if provided. The DB
 * insert runs in the caller's transaction if a tx is passed as `db`.
 */
export async function uploadFile(
  db: Db,
  input: UploadFileInput,
  cleanup?: UploadCleanupQueue,
): Promise<UploadedFileRecord> {
  const { file, kind, owner, uploadedBy } = input;
  if (file.size === 0) {
    throw new UploadError("empty file", "Plik jest pusty.");
  }
  const maxBytes = getEnv().MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) {
    throw new UploadError(
      `file too large: ${file.size} > ${maxBytes}`,
      `Plik za duży (limit: ${Math.floor(maxBytes / 1_000_000)} MB).`,
    );
  }
  const declaredMime = file.type;
  const allowed = allowedMimesFor(kind);
  if (!allowed.has(declaredMime)) {
    throw new UploadError(
      `disallowed mime ${declaredMime} for ${kind}`,
      `Nieobsługiwany format pliku: ${declaredMime || "nieznany"}.`,
    );
  }

  // Buffer the file once — used for both magic-byte inspection and disk write.
  const fileBuffer = new Uint8Array(await file.arrayBuffer());

  // Verify the file's actual content matches the declared MIME. The library
  // returns null for unrecognized formats — for our allowed set (mp4, mov,
  // webm, jpg, png, webp) recognition is reliable, so a null result means
  // the file isn't actually one of our supported types.
  const header = fileBuffer.subarray(0, Math.min(MAGIC_BYTE_INSPECT_SIZE, fileBuffer.byteLength));
  const detected = await fileTypeFromBuffer(header);
  if (!detected || !allowed.has(detected.mime)) {
    throw new UploadError(
      `magic-byte mismatch: declared=${declaredMime} detected=${detected?.mime ?? "unknown"}`,
      `Zawartość pliku nie zgadza się z typem (${declaredMime}). Wybierz inny plik.`,
    );
  }
  // Use the *detected* MIME from here on, so a JPEG renamed to .png still gets
  // the right content-type when served back.
  const mime = detected.mime;

  const fileId = newFileId();
  const storagePath = pathFor(kind, fileId, mime);

  // Write to disk first; if the DB insert fails, unlink immediately.
  // If a cleanup queue is passed, register the (fileId, path) pair so a later
  // failure in the orchestrating action also rolls this row + blob back.
  const storage = getStorage();
  let bytes: number;
  try {
    bytes = (await storage.write(storagePath, fileBuffer)).bytes;
  } catch (err: unknown) {
    // EACCES / EPERM almost always means DATA_DIR exists but is not writable
    // by the runtime user — usually a Railway volume mount that wasn't
    // chowned to `node` at container start. Surface a clean error instead of
    // a 500 so the trainee sees an actionable message.
    const code =
      typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
    if (code === "EACCES" || code === "EPERM") {
      throw new UploadError(
        `${code} writing to ${storagePath} (DATA_DIR not writable by runtime user)`,
        "Serwer nie może zapisać pliku — uprawnienia woluminu. Skontaktuj się z administratorem.",
      );
    }
    if (code === "ENOSPC") {
      throw new UploadError(
        `ENOSPC writing to ${storagePath}`,
        "Brak miejsca na dysku serwera. Skontaktuj się z administratorem.",
      );
    }
    throw err;
  }

  try {
    const [row] = await db
      .insert(schema.files)
      .values({
        id: fileId,
        ...ownerColumns(owner),
        uploadedBy,
        kind,
        mimeType: mime,
        bytes,
        storagePath,
      })
      .returning();
    if (!row) throw new Error("file insert returned no row");
    cleanup?.track({ fileId: row.id, storagePath: row.storagePath });
    return {
      id: row.id,
      storagePath: row.storagePath,
      mimeType: row.mimeType,
      bytes: row.bytes,
    };
  } catch (err) {
    // Insert failed: blob has no row pointing at it, so it's strictly an orphan
    // we own — unlink it regardless of the cleanup queue.
    await storage.delete(storagePath);
    throw err;
  }
}

/**
 * Tx-safe: deletes the `files` row and returns its `storage_path` so the caller
 * can delete the blob AFTER the transaction commits. Returns null if no row.
 *
 * Calling `getStorage().delete()` inside a transaction would orphan the file on
 * disk if the transaction rolls back (the DB row would be restored, but the
 * blob would already be gone). Always pair with `deleteFileBlob` post-commit.
 */
export async function deleteFileRow(db: Db, fileId: string): Promise<string | null> {
  const rows = await db
    .delete(schema.files)
    .where(eq(schema.files.id, fileId))
    .returning({ storagePath: schema.files.storagePath });
  return rows[0]?.storagePath ?? null;
}

/** Physically remove the blob. Call AFTER the transaction that owned the file row commits. */
export async function deleteFileBlob(storagePath: string): Promise<void> {
  await getStorage().delete(storagePath);
}

/**
 * Convenience wrapper for callers that aren't inside a transaction. Do NOT call
 * inside `db.transaction(...)` — rollback would leave the blob deleted.
 */
export async function deleteFile(db: Db, fileId: string): Promise<void> {
  const storagePath = await deleteFileRow(db, fileId);
  if (storagePath) await deleteFileBlob(storagePath);
}
