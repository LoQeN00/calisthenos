import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  FILE_SIGNING_SECRET: z.string().min(32),
  BASE_URL: z.string().url(),
  DATA_DIR: z.string().default("./data"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(250_000_000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
