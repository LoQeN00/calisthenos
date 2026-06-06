import { vi } from "vitest";

// Mock DB: select().from().where().limit() → [] (użytkownik nie istnieje → ścieżka generic error).
vi.mock("~/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
  },
}));

// Mock auth: verify zawsze false; reszta nieistotna dla ścieżki blokady.
vi.mock("~/lib/auth", () => ({
  buildSetCookie: () => "cookie",
  createSession: async () => ({ id: "s", expiresAt: new Date() }),
  getDummyPasswordHash: async () => "$dummy$",
  parseSessionId: () => null,
  readSession: async () => null,
  verifyPassword: async () => false,
}));

import { describe, expect, it } from "vitest";
import { action } from "~/routes/login";

function loginReq(ip: string): Request {
  const body = new URLSearchParams({ email: "a@b.com", password: "x" });
  return new Request("http://localhost/login", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

async function call(ip: string) {
  return action({ request: loginReq(ip), params: {}, context: {} } as never);
}

// KONTRAKT: rate-limiter używa wspólnego singletona store'a w procesie (app/lib/rate-limit.ts).
// Dlatego KAŻDY test poniżej MUSI używać UNIKALNEGO IP — inaczej liczniki przeciekają
// między testami i kolejność wykonania robi się znacząca (flaky).
describe("login action — rate limit", () => {
  it("11. próba z tego samego IP zwraca 429 + Retry-After", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < 10; i++) {
      const r = (await call(ip)) as { data?: unknown; init?: ResponseInit };
      // pierwsze 10: zwykła ścieżka (generic error), bez 429
      expect((r as { init?: ResponseInit }).init?.status ?? 200).not.toBe(429);
    }
    const blocked = (await call(ip)) as { init: ResponseInit };
    expect(blocked.init.status).toBe(429);
    expect((blocked.init.headers as Record<string, string>)["Retry-After"]).toBeDefined();
  });

  it("inne IP nie jest zablokowane", async () => {
    const r = (await call("198.51.100.99")) as { init?: ResponseInit };
    expect(r.init?.status ?? 200).not.toBe(429);
  });
});
