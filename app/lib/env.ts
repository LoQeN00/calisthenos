import { z } from "zod";

// Po segmencie S6 nie ma tu ani `DATABASE_URL` (baza zniknęła z FE), ani
// `SESSION_SECRET` i `FILE_SIGNING_SECRET` (sesja to tokeny BE w ciastku
// `__Host-kth_api`, a odnośniki do plików podpisuje BE), ani `DATA_DIR`
// (bajty leżą w R2 po tamtej stronie). Każda z tych czterech straciła
// czytelnika wcześniej — S6 tylko zdjął je ze schematu.
const BaseEnvSchema = z.object({
  BASE_URL: z.string().url(),
  /** Adres BE z serwera FE, server-do-serwera. Na Railway może być siecią prywatną. */
  API_URL: z.string().url(),
  /**
   * Adres BE trafiający do HTML-a: `src` obrazków i wideo spod podpisanego
   * `GET /v1/files/{id}`. Domyślnie równy wewnętrznemu — w developmencie
   * i w testach jeden adres wystarcza.
   *
   * `z.preprocess` zamienia `""` na `undefined` PRZED walidacją `.url()`.
   * Konieczne, bo `react-router dev` czyta `.env` przez Vite `loadEnv` z
   * pustym prefiksem — kopiuje CAŁY plik do `process.env`, więc pusta linia
   * `API_PUBLIC_URL=` w `.env.example`/`.env` trafia tu jako `""`, nie jako
   * nieobecny klucz. `.optional()` reaguje wyłącznie na `undefined` — bez
   * tego przepisania pusty string wysypywałby `.url()`, a razem z nim całe
   * `getEnv()` na starcie aplikacji.
   */
  API_PUBLIC_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(250_000_000),
  // Osobny, niższy limit dla wideo (nagrania serii, demo ćwiczeń). Długie nagrania
  // z telefonu to główna przyczyna zrywanych uploadów (timeout proxy / OOM przy
  // buforowaniu w pamięci), więc trzymamy je krótko. Domyślne 30 MB mieści się w
  // 5-min limicie żądań Railway nawet na słabym łączu (~1 Mbps ≈ 240 s).
  // Kalibrowalne bez redeployu.
  MAX_VIDEO_UPLOAD_BYTES: z.coerce.number().int().positive().default(30_000_000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const EnvSchema = BaseEnvSchema.transform((env) => ({
  ...env,
  API_PUBLIC_URL: env.API_PUBLIC_URL ?? env.API_URL,
}));

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
