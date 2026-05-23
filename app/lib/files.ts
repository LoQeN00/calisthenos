import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getEnv } from "~/lib/env";

const URL_TTL_SECONDS = 24 * 3600;

function payload(fileId: string, exp: number, userId: string): string {
  return `${fileId}:${exp}:${userId}`;
}

/** Generate a short-lived URL that authorizes the given user to GET this file. */
export function signFileUrl(fileId: string, currentUserId: string): string {
  const exp = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS;
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
