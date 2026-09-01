// @vitest-environment node
//
// Środowisko `node` wspólnie z resztą tej warstwy: `Request`/`Response` mają się
// zachowywać jak na serwerze, a nie jak w atrapie przeglądarki z happy-dom.
import { describe, expect, it, vi } from "vitest";

// `createApiClient` sięga po `getEnv().API_URL` tylko wtedy, gdy `baseUrl` nie
// zostanie podany — testy podają go jawnie. Mock stoi tu mimo to, bo import
// modułu wciąga `~/lib/env` i brak zmiennych wywróciłby plik na `ZodError`
// jeszcze przed pierwszą asercją.
vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { createApiClient } from "./client";
import { ApiError } from "./errors";
import { AuthError, startSession } from "./auth-session";

const PROFIL = {
  partyId: "p-1",
  displayName: "Anna Kowalska",
  email: "anna@example.pl",
  roles: ["trainer"],
  coach: null,
};

const TERAZ = new Date("2026-09-01T10:00:00Z");

function klient(reguly: (req: Request) => Response | Promise<Response>) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => undefined,
    fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
  });
}

function json(status: number, cialo: unknown, naglowki: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json", ...naglowki },
  });
}

describe("startSession — wystawienie sesji na tokenach BE", () => {
  it("jedno wywołanie daje i sesję, i użytkownika", async () => {
    // Kontrakt oddaje profil RAZEM z tokenami, więc logowanie nie potrzebuje
    // osobnego `/v1/me`. Asercja stoi na LIŚCIE trafień, nie na samym wyniku —
    // dołożone drugie wywołanie przeszłoby test patrzący tylko na wynik.
    const trafienia: string[] = [];
    const api = klient((req) => {
      trafienia.push(new URL(req.url).pathname);
      return json(200, { accessToken: "A1", refreshToken: "R1", expiresIn: 900, profile: PROFIL });
    });

    const { session, user } = await startSession(
      api,
      { email: "anna@example.pl", password: "tajne123" },
      () => TERAZ,
    );

    expect(trafienia).toEqual(["/v1/auth/login"]);
    expect(session.refreshToken).toBe("R1");
    expect(session.accessExpiresAt).toBe(TERAZ.getTime() + 900_000);
    expect(user.id).toBe("p-1");
    expect(user.roles).toEqual(["trainer"]);
  });

  it("401 daje JEDEN komunikat, niezależnie od kształtu odmowy", async () => {
    // Trasa nie może odróżnić „nie ma konta" od „złe hasło" — BE ich nie
    // odróżnia i to jest celowe. Dwa różne kształty odpowiedzi, jedno wyjście.
    const bezKoperty = klient(() => json(401, {}));
    const zKoperta = klient(() =>
      json(401, { error: { code: "UNAUTHENTICATED", message: "Zły adres albo hasło." } }),
    );

    for (const api of [bezKoperty, zKoperta]) {
      const blad = await startSession(api, { email: "a@e.pl", password: "x" }).catch(
        (e: unknown) => e,
      );
      expect(blad).toBeInstanceOf(AuthError);
      expect((blad as AuthError).userMessage).toBe("Niepoprawne dane logowania.");
    }
  });

  it("429 niesie liczbę minut z nagłówka", async () => {
    // 900 s to 15 min — dokładnie okno throttlera BE. Bez `retryAfter`
    // komunikat mówiłby „za chwilę", a użytkownik próbowałby od razu i dostał
    // to samo.
    const api = klient(() =>
      json(
        429,
        { error: { code: "RATE_LIMITED", message: "Za dużo prób." } },
        { "retry-after": "900" },
      ),
    );

    const blad = await startSession(api, { email: "a@e.pl", password: "x" }).catch(
      (e: unknown) => e,
    );

    expect(blad).toBeInstanceOf(AuthError);
    expect((blad as AuthError).userMessage).toBe("Za dużo prób. Spróbuj ponownie za 15 min.");
  });

  it("429 bez nagłówka mówi ogólnie, nie „za NaN min”", async () => {
    const api = klient(() => json(429, { error: { code: "RATE_LIMITED", message: "Za dużo." } }));

    const blad = await startSession(api, { email: "a@e.pl", password: "x" }).catch(
      (e: unknown) => e,
    );

    expect((blad as AuthError).userMessage).toBe("Za dużo prób. Spróbuj ponownie za chwilę.");
  });

  it("awaria BE NIE jest błędem poświadczeń", async () => {
    // Gdyby moduł łykał każdy status, awaria backendu pokazałaby się jako
    // „niepoprawne dane logowania" — czyli kazałaby użytkownikowi sprawdzać
    // hasło w odpowiedzi na cudzą usterkę, ukrywając usterkę przed nami.
    const api = klient(() => json(500, { error: { code: "INTERNAL", message: "Ups." } }));

    const blad = await startSession(api, { email: "a@e.pl", password: "x" }).catch(
      (e: unknown) => e,
    );

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(AuthError);
  });
});
