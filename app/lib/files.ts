import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getEnv } from "~/lib/env";

const URL_TTL_SECONDS = 24 * 3600;

/**
 * Długość kubełka stabilności `exp` (i zarazem `max-age` w `files/$fileId`).
 *
 * Bez kubełkowania `exp` liczone jest jako `now + TTL` przy KAŻDYM renderze, więc
 * URL tego samego pliku zmienia się co sekundę. Adres jest kluczem cache
 * przeglądarki — ruchomy `exp` oznacza, że `Cache-Control` nigdy nie zadziała
 * i trener oglądający te same nagrania trzeci raz ściąga je trzeci raz.
 * Zaokrąglenie do kubełka daje stały adres w oknie `FILE_URL_BUCKET_SECONDS`.
 *
 * UWAGA: to NIE jest `max-age` odpowiedzi — `files/$fileId` celowo trzyma 1 h
 * (patrz komentarz tam). Kubełek odpowiada wyłącznie za stabilność adresu.
 */
export const FILE_URL_BUCKET_SECONDS = 6 * 3600;

function payload(fileId: string, exp: number, userId: string): string {
  return `${fileId}:${exp}:${userId}`;
}

/**
 * Znacznik wygaśnięcia zaokrąglony w GÓRĘ do granicy kubełka, powiększony o pełne
 * TTL. Dzięki temu `exp` jest stałe w obrębie kubełka, a ważność podpisu nigdy nie
 * spada poniżej `URL_TTL_SECONDS` (w najgorszym razie — na końcu kubełka — wynosi
 * dokładnie TTL, w najlepszym TTL + długość kubełka).
 */
export function fileUrlExp(nowMs: number = Date.now()): number {
  const nowSec = Math.floor(nowMs / 1000);
  const bucketStart = Math.floor(nowSec / FILE_URL_BUCKET_SECONDS) * FILE_URL_BUCKET_SECONDS;
  return bucketStart + FILE_URL_BUCKET_SECONDS + URL_TTL_SECONDS;
}

/**
 * Generate a URL that authorizes the given user to GET this file.
 *
 * Świadomie BEZ parametru czasu: to funkcja podpisująca, a parametr sterujący
 * wygaśnięciem byłby furtką, gdyby kiedyś trafiła do niego wartość pochodząca z
 * żądania. Determinizm w testach uzyskujemy przez `fileUrlExp` (czysta) albo
 * `vi.setSystemTime`.
 */
export function signFileUrl(fileId: string, currentUserId: string): string {
  const exp = fileUrlExp();
  const sig = createHmac("sha256", getEnv().FILE_SIGNING_SECRET)
    .update(payload(fileId, exp, currentUserId))
    .digest("hex");
  return `/files/${fileId}?exp=${exp}&sig=${sig}`;
}

/** Constant-time signature check. Returns false for expired or tampered signatures. */
export function verifyFileUrl(
  fileId: string,
  exp: number,
  sig: string,
  currentUserId: string,
): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = createHmac("sha256", getEnv().FILE_SIGNING_SECRET)
    .update(payload(fileId, exp, currentUserId))
    .digest("hex");
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ---------- Storage path helpers ----------

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/quicktime", "video/webm"]);
export const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function extForMime(mime: string): string {
  const ext = MIME_TO_EXT[mime];
  if (!ext) throw new Error(`unsupported mime type: ${mime}`);
  return ext;
}

export function exerciseDemoPath(fileId: string, mime: string): string {
  return `exercises/${fileId}.${extForMime(mime)}`;
}

export function setVideoPath(fileId: string, mime: string): string {
  return `sets/${fileId}.${extForMime(mime)}`;
}

export function bodyPhotoPath(fileId: string, mime: string): string {
  return `body/${fileId}.${extForMime(mime)}`;
}

// ---------- Random file id (for storage path generation before DB insert) ----------

export function newFileId(): string {
  return randomUUID();
}
