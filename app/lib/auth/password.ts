import { hash, verify } from "@node-rs/argon2";

export const ARGON2_OPTS = {
  memoryCost: 19_456, // 19 MiB — OWASP 2023 minimum
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

// Lazy-computed dummy hash used by the login action to keep request latency
// constant whether or not the looked-up user exists. Computed once on first
// access (~50 ms argon2) and cached for the lifetime of the process.
//
// Lazy (not top-level await) because Vite's SSR build targets ES2020 which
// rejects TLA. The first login attempt incurs a one-time ~50 ms cost; every
// subsequent login uses the cached promise.
let dummyHashCache: Promise<string> | null = null;
export function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashCache) {
    dummyHashCache = hash("this-is-not-a-real-password-just-a-timing-padding-value", ARGON2_OPTS);
  }
  return dummyHashCache;
}

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 1) throw new Error("password cannot be empty");
  return hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}
