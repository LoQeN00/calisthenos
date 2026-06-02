import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

/**
 * Klucz AES-256 z `GOOGLE_TOKEN_ENC_KEY` (base64, 32 bajty).
 * Czytany z `process.env` bezpośrednio (nie przez getEnv), by testy round-tripu
 * nie wymagały pełnego env. Rzuca, gdy klucz nieobecny lub złej długości.
 */
function key(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!raw) throw new Error("GOOGLE_TOKEN_ENC_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENC_KEY must decode to exactly 32 bytes (base64)",
    );
  }
  return k;
}

/** Szyfruje sekret do formatu "ivB64.tagB64.cipherB64". */
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/** Odszyfrowuje format "ivB64.tagB64.cipherB64". Rzuca przy naruszeniu integralności. */
export function decryptToken(blob: string): string {
  const [ivB64, tagB64, dataB64] = blob.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("malformed token blob");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
