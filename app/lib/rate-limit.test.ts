import { describe, expect, it } from "vitest";
import {
  clientIp,
  enforceRateLimit,
  fixedWindowHit,
  InMemoryRateLimitStore,
  RATE_LIMITS,
  rateLimited,
  resetRateLimit,
} from "~/lib/rate-limit";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/login", { method: "POST", headers });
}

const WIN = 15 * 60_000; // 15 min

describe("fixedWindowHit", () => {
  it("pierwsze trafienie otwiera okno i przepuszcza", () => {
    const r = fixedWindowHit(undefined, 1000, 10, WIN);
    expect(r.allowed).toBe(true);
    expect(r.state).toEqual({ count: 1, windowStartMs: 1000 });
    expect(r.retryAfterSec).toBe(0);
  });

  it("w granicy limitu przepuszcza, zachowuje windowStart", () => {
    const r = fixedWindowHit({ count: 9, windowStartMs: 1000 }, 5000, 10, WIN);
    expect(r.allowed).toBe(true);
    expect(r.state).toEqual({ count: 10, windowStartMs: 1000 });
  });

  it("po przekroczeniu blokuje i liczy retryAfter do końca okna", () => {
    const start = 1000;
    const now = start + 60_000; // 1 min w oknie
    const r = fixedWindowHit({ count: 10, windowStartMs: start }, now, 10, WIN);
    expect(r.allowed).toBe(false);
    // pozostało 14 min = 840 s
    expect(r.retryAfterSec).toBe(840);
    expect(r.state.windowStartMs).toBe(start); // okno się NIE przesuwa
  });

  it("po wygaśnięciu okna otwiera nowe i przepuszcza", () => {
    const start = 1000;
    const r = fixedWindowHit({ count: 999, windowStartMs: start }, start + WIN, 10, WIN);
    expect(r.allowed).toBe(true);
    expect(r.state).toEqual({ count: 1, windowStartMs: start + WIN });
  });
});

describe("clientIp", () => {
  it("bierze leftmost IP z X-Forwarded-For", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("przycina białe znaki", () => {
    expect(clientIp(req({ "x-forwarded-for": "  198.51.100.2  " }))).toBe("198.51.100.2");
  });
  it("obsługuje IPv6", () => {
    expect(clientIp(req({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" }))).toBe("2001:db8::1");
  });
  it("brak nagłówka → 'unknown'", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("InMemoryRateLimitStore", () => {
  it("przepuszcza do limitu, potem blokuje; reset czyści", () => {
    const now = 0;
    const store = new InMemoryRateLimitStore(() => now);
    for (let i = 0; i < 10; i++) {
      expect(store.hit("login:1.1.1.1", 10, 1000).allowed).toBe(true);
    }
    const blocked = store.hit("login:1.1.1.1", 10, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    store.reset("login:1.1.1.1");
    expect(store.hit("login:1.1.1.1", 10, 1000).allowed).toBe(true);
  });

  it("różne klucze są niezależne", () => {
    const store = new InMemoryRateLimitStore(() => 0);
    for (let i = 0; i < 10; i++) store.hit("login:A", 10, 1000);
    expect(store.hit("login:A", 10, 1000).allowed).toBe(false);
    expect(store.hit("login:B", 10, 1000).allowed).toBe(true);
  });

  it("sweep usuwa wygasłe wpisy po przekroczeniu progu", () => {
    let now = 0;
    const store = new InMemoryRateLimitStore(() => now, 2); // sweepThreshold=2
    store.hit("a", 10, 1000);
    store.hit("b", 10, 1000);
    store.hit("c", 10, 1000); // size=3 > sweepThreshold=2
    now = 15 * 60_000; // wszystkie wygasłe (>= MAX_WINDOW_MS użytego w sweepie)
    store.hit("d", 10, 1000); // size>2 → sweep usuwa wygasłe a/b/c, zostaje tylko d
    expect(store.size).toBe(1); // dokładnie: a/b/c usunięte, d dodane
  });

  it("nie sweepuje wpisów wciąż w oknie", () => {
    let now = 0;
    const store = new InMemoryRateLimitStore(() => now, 2);
    store.hit("a", 10, 1000);
    store.hit("b", 10, 1000);
    store.hit("c", 10, 1000);
    now = 1000; // > windowMs, ale < MAX_WINDOW_MS → NIE wygasłe wg sweepu
    store.hit("d", 10, 1000); // sweep nic nie usuwa
    expect(store.size).toBe(4);
  });
});

describe("rateLimited", () => {
  it("zwraca 429 + Retry-After + komunikat PL", () => {
    const r = rateLimited(120) as { data: { error: string }; init: ResponseInit };
    expect(r.init.status).toBe(429);
    expect((r.init.headers as Record<string, string>)["Retry-After"]).toBe("120");
    expect(r.data.error).toContain("2 min");
  });
});

describe("RATE_LIMITS", () => {
  it("login i invite: 10 prób / 15 min", () => {
    expect(RATE_LIMITS.login).toMatchObject({ limit: 10, windowMs: 15 * 60_000 });
    expect(RATE_LIMITS.invite).toMatchObject({ limit: 10, windowMs: 15 * 60_000 });
  });

  it("niezmiennik sweepu: żadne okno bucketu nie przekracza 15 min (MAX_WINDOW_MS)", () => {
    // Sweep używa stałego MAX_WINDOW_MS=15min; dłuższe okno zostałoby usunięte
    // przedwcześnie. Ten test pilnuje, by nikt nie dodał bucketu z dłuższym oknem
    // bez aktualizacji MAX_WINDOW_MS.
    const maxWindow = Math.max(...Object.values(RATE_LIMITS).map((r) => r.windowMs));
    expect(maxWindow).toBeLessThanOrEqual(15 * 60_000);
  });
});

describe("enforceRateLimit + resetRateLimit (singleton procesu)", () => {
  // KONTRAKT: helpery używają wspólnego singletona store'a w procesie, więc każdy
  // test MUSI używać UNIKALNEGO IP, żeby liczniki się nie przeplatały.
  function loginReq(ip: string): Request {
    return new Request("http://localhost/login", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
    });
  }

  it("przepuszcza do limitu, blokuje 11. próbę, a reset odblokowuje", () => {
    const ip = "192.0.2.77";
    for (let i = 0; i < 10; i++) {
      expect(enforceRateLimit(loginReq(ip), RATE_LIMITS.login)).toBeNull();
    }
    const blocked = enforceRateLimit(loginReq(ip), RATE_LIMITS.login);
    expect(blocked).not.toBeNull();
    expect(typeof blocked).toBe("number");

    resetRateLimit("login", loginReq(ip)); // np. po udanym logowaniu
    expect(enforceRateLimit(loginReq(ip), RATE_LIMITS.login)).toBeNull();
  });
});
