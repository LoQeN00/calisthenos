import { eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { getEnv, type Env } from "~/lib/env";
import { errorMeta, logger } from "~/lib/logger";
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
import { filesControllerConfirm, filesControllerExerciseDemo } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";

/**
 * `file-type` library inspects the first ~4100 bytes to identify common formats
 * by their binary signature (magic bytes). This guards against a client lying
 * about `Content-Type` (sending `video/mp4` for a malicious PHP file, etc.).
 */
const MAGIC_BYTE_INSPECT_SIZE = 4100;

export type UploadKind = "exercise_demo" | "set_video" | "body_photo";

export interface UploadFileInput {
  file: File;
  kind: UploadKind;
  trainerId: string;
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

/**
 * Limit rozmiaru zależny od rodzaju pliku. Wideo (nagrania serii, demo ćwiczeń)
 * ma osobny, niższy limit niż zdjęcia sylwetki — duże/długie nagrania z telefonu
 * są główną przyczyną zrywanych uploadów (timeout proxy / OOM), więc trzymamy je
 * krótko. Domyślnie czyta bieżące env; przyjmuje limity wprost dla testów.
 */
export function maxUploadBytesFor(
  kind: UploadKind,
  limits: Pick<Env, "MAX_UPLOAD_BYTES" | "MAX_VIDEO_UPLOAD_BYTES"> = getEnv(),
): number {
  // `exercise_demo` chodzi limitem OGÓLNYM, nie wideo — to lustro decyzji BE
  // (`UPLOAD_LIMIT_SOURCE.exercise_demo === 'maxUploadBytes'`, `libs/files/.../upload-limits.ts`):
  // demo instruktażowe trenera jest dokładnie tym plikiem, dla którego ten wyższy
  // limit powstał. Do integracji FE BYŁO serwerem i niższy limit był prawdą; teraz
  // FE jest klientem, a limit surowszy od kontraktu odrzucałby w przeglądarce pliki,
  // które BE przyjmie. `set_video` (nagranie serii podopiecznego) zostaje przy
  // niższym limicie wideo — tam FE nadal rządzi, bo ta ścieżka jest na bazie.
  return kind === "set_video" ? limits.MAX_VIDEO_UPLOAD_BYTES : limits.MAX_UPLOAD_BYTES;
}

/**
 * Streamuje zawartość pliku porcjami z `File.stream()` na dysk, bez robienia
 * pełnej drugiej kopii w pamięci (dawny `new Uint8Array(await file.arrayBuffer())`).
 *
 * Uwaga: `request.formData()` w akcji i tak buforuje całe ciało żądania (w tym
 * plik) jako `File`, zanim `uploadFile` wystartuje — więc to obniża szczyt
 * pamięci z ~2× do ~1× rozmiaru pliku, a NIE eliminuje bufora bazowego. Pełne
 * usunięcie kopii bazowej wymagałoby streamującego parsera multipart (poza tym
 * FIX-em); tu drugą linią obrony jest niski limit `MAX_VIDEO_UPLOAD_BYTES`.
 */
export async function* iterateFileChunks(file: File): AsyncGenerator<Uint8Array> {
  const reader = file.stream().getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
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
  const { file, kind, trainerId, uploadedBy } = input;
  if (file.size === 0) {
    throw new UploadError("empty file", "Plik jest pusty.");
  }
  const maxBytes = maxUploadBytesFor(kind);
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

  // Read ONLY the header for magic-byte inspection — `Blob.slice` returns a view
  // over the first bytes, so `arrayBuffer()` here copies at most ~4100 bytes, not
  // the whole file. The full content is streamed to disk below (see the write),
  // so a large video never gets a second full in-memory copy.
  //
  // Verify the file's actual content matches the declared MIME. The library
  // returns null for unrecognized formats — for our allowed set (mp4, mov,
  // webm, jpg, png, webp) recognition is reliable, so a null result means
  // the file isn't actually one of our supported types.
  const header = new Uint8Array(await file.slice(0, MAGIC_BYTE_INSPECT_SIZE).arrayBuffer());
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
    bytes = (await storage.write(storagePath, iterateFileChunks(file))).bytes;
  } catch (err: unknown) {
    // Streaming może zostawić częściowy plik na dysku, jeśli źródło padnie w
    // trakcie pompowania — usuń go, zanim zmapujemy/rzucimy błąd. Kolejka
    // sprzątająca jeszcze go nie zna (track() następuje po udanym insercie),
    // więc musimy to zrobić tutaj. Best-effort: brak pliku też łykamy.
    await storage.delete(storagePath).catch(() => {});
    const code =
      typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
    // KAŻDA awaria zapisu na wolumen musi zostawić ślad — bez tego zapełniony dysk
    // albo źle zamontowany wolumen objawia się wyłącznie komunikatem u użytkownika,
    // a właściciel nie dostaje żadnego sygnału. `storagePath` niesie tylko UUID pliku.
    // `code` PO spreadzie celowo: `errorMeta` czyta `code` tylko z instancji Error,
    // a tu chcemy je mieć również gdy storage rzuci czymś innym niż Error.
    logger.error("upload.storage_write_failed", {
      kind,
      storagePath,
      ...errorMeta(err),
      code,
    });
    // EACCES / EPERM almost always means DATA_DIR exists but is not writable
    // by the runtime user — usually a Railway volume mount that wasn't
    // chowned to `node` at container start. Surface a clean error instead of
    // a 500 so the trainee sees an actionable message.
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
        trainerId,
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

/** Wiersz pliku po identyfikatorze. Autoryzację (podpis + scope trenera) robi trasa. */
export async function findFileById(db: Db, fileId: string): Promise<schema.File | null> {
  const rows = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Ścieżka `exercise_demo` **na kontrakcie**: dwie fazy z §8 kroku 4 specu —
 * `POST /v1/files/exercise-demo` (bajty idą przez serwer BE) i `POST /v1/files/{id}/confirm`.
 * Pozostałe dwa rodzaje (`set_video`, `body_photo`) zostają na bazie do kroku 4.
 *
 * **Czego tu NIE MA i dlaczego:**
 * - kontroli deklarowanego MIME — BE sprawdza typ PO ZAWARTOŚCI w locie, co jest
 *   mocniejsze niż `file.type` od klienta, a źródło stałych (`app/lib/files.ts`)
 *   znika w kroku 4;
 * - `UploadCleanupQueue` — sprzątanie po nieudanym zapisie przejął BE
 *   (`orphan-files-sweep`, 24 h karencji dla pliku, na który nic nie wskazuje).
 *
 * `confirm` niczego dziś nie zapisuje (`FilesService.confirm` sprawdza istnienie
 * i tenant) — plik przed zamiataczem ratuje dopiero PODPIĘCIE do ćwiczenia.
 */
export async function uploadExerciseDemo(api: Api, file: File): Promise<string> {
  if (file.size === 0) {
    throw new UploadError("empty file", "Plik jest pusty.");
  }
  const maxBytes = maxUploadBytesFor("exercise_demo");
  if (file.size > maxBytes) {
    throw new UploadError(
      `file too large: ${file.size} > ${maxBytes}`,
      `Plik za duży (limit: ${Math.floor(maxBytes / 1_000_000)} MB).`,
    );
  }

  let fileId: string;
  try {
    const { data } = await filesControllerExerciseDemo({
      client: api,
      body: { file },
      throwOnError: true,
    });
    fileId = data.id;
  } catch (e) {
    // Wąsko: trzy statusy, dla których BE ma komunikat o SAMYM PLIKU i dla których
    // trasa pokazuje tekst w formularzu. `401`/`403`/`404` to sprawa sesji i tenanta —
    // te lecą dalej i obsługuje je warstwa klienta.
    if (e instanceof ApiError && (e.status === 400 || e.status === 409 || e.status === 413)) {
      throw new UploadError(`upload rejected: ${e.code}`, e.message);
    }
    throw e;
  }

  await filesControllerConfirm({ client: api, path: { id: fileId }, throwOnError: true });
  return fileId;
}
