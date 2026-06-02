import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  FILE_SIGNING_SECRET: z.string().min(32),
  BASE_URL: z.string().url(),
  DATA_DIR: z.string().default("./data"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(250_000_000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Integracja Google (opcjonalna — aplikacja działa bez niej).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  // base64 32 bajtów (klucz AES-256-GCM do szyfrowania tokenów at-rest).
  GOOGLE_TOKEN_ENC_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;
export function getEnv(): Env {
  if (!cached) cached = EnvSchema.parse(process.env);
  return cached;
}

// Backwards-compat alias for code that prefers `env.X` syntax:
// resolves lazily on first property access.
export const env = new Proxy({} as Env, {
  get(_t, prop) {
    return getEnv()[prop as keyof Env];
  },
});

/** True, gdy wszystkie sekrety integracji Google są ustawione (OAuth + klucz szyfrujący). */
export function googleConfigured(): boolean {
  const e = getEnv();
  return Boolean(
    e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GOOGLE_REDIRECT_URI && e.GOOGLE_TOKEN_ENC_KEY,
  );
}
