// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { RouterContextProvider } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { apiContext } from "~/lib/api/context";
import { action, loader } from "./integracje.google";

const TRENER = {
  id: "u-1",
  email: "t@example.pl",
  displayName: "Trener",
  roles: ["trainer"] as const,
  trainerId: null,
  trainerName: null,
};

function scenariusz(odpowiedz: (req: Request) => Response) {
  const context = new RouterContextProvider();
  context.set(apiContext, {
    api: createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "T",
      fetch: (async (req: Request) => odpowiedz(req)) as unknown as typeof fetch,
    }),
    user: TRENER as never,
  });
  return context;
}

function formularz(intent: string): Request {
  const body = new URLSearchParams({ intent });
  return new Request("https://fe.test/trener/integracje/google", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
}

describe("integracje.google — ekran na kontrakcie", () => {
  it("loader oddaje stan połączenia z kontraktu", async () => {
    const context = scenariusz(
      () =>
        new Response(
          JSON.stringify({ status: "connected", provider: "google", accountLabel: "a@b.pl" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const wynik = (await loader({
      request: new Request("https://fe.test/trener/integracje/google"),
      params: {},
      context,
    } as never)) as { connection: { accountLabel: string | null } };

    expect(wynik.connection.accountLabel).toBe("a@b.pl");
  });

  it("loader oddaje stan `broken` nietknięty — to jest połączenie, nie awaria", async () => {
    // Kontrakt zna trzy stany: `disconnected`, `connected`, `broken`. Ekran
    // liczy połączenie przez `status !== "disconnected"`, więc `broken`
    // pokazuje ten sam ekran co `connected` — z przyciskiem „Rozłącz", bo to
    // JEDYNA droga wyjścia z zepsutego połączenia (ten sam podział, co przed
    // integracją z kontraktem, gdzie o połączeniu decydowała sama obecność
    // wiersza). Bez tego przypadku zmiana warunku na `=== "connected"`
    // przeszłaby cały ten plik i zostawiła trenera z zepsutym połączeniem
    // bez żadnego sposobu, żeby je usunąć.
    const context = scenariusz(
      () =>
        new Response(
          JSON.stringify({ status: "broken", provider: "google", accountLabel: "a@b.pl" }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const wynik = (await loader({
      request: new Request("https://fe.test/trener/integracje/google"),
      params: {},
      context,
    } as never)) as { connection: { status: string } };

    expect(wynik.connection.status).toBe("broken");
  });

  it("Połącz przekierowuje na zgodę i PRZEKAZUJE oba ciastka", async () => {
    // Bez tego przekazania ciastko z nonce'em zostaje u serwera FE, a każda
    // zgoda kończy się `reason=state` — objawem nieodróżnialnym od poprawnie
    // zadziałanej bramki CSRF. To jest jedyny test, który tego pilnuje.
    const context = scenariusz(
      () =>
        new Response(JSON.stringify({ url: "https://accounts.google.test/auth?state=S" }), {
          status: 200,
          headers: [
            ["content-type", "application/json"],
            ["set-cookie", "kal_calendar_nonce=N; Path=/v1/calendar/connection/callback"],
            ["set-cookie", "drugie=2"],
          ],
        }),
    );

    const res = (await action({
      request: formularz("connect"),
      params: {},
      context,
    } as never)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://accounts.google.test/auth?state=S");
    expect(res.headers.getSetCookie()).toEqual([
      "kal_calendar_nonce=N; Path=/v1/calendar/connection/callback",
      "drugie=2",
    ]);
  });

  it("wyłączona integracja wraca komunikatem z kontraktu, nie granicą błędu", async () => {
    const context = scenariusz(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: "CALENDAR_NOT_CONFIGURED",
              message: "Integracja kalendarza nie jest włączona na tym serwerze.",
            },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
    );

    const wynik = (await action({
      request: formularz("connect"),
      params: {},
      context,
    } as never)) as { error: string };

    expect(wynik.error).toContain("nie jest włączona");
  });

  it("Rozłącz woła DELETE i wraca komunikatem", async () => {
    let metoda = "";
    const context = scenariusz((req) => {
      metoda = req.method;
      return new Response(null, { status: 204 });
    });

    const wynik = (await action({
      request: formularz("disconnect"),
      params: {},
      context,
    } as never)) as { success: string };

    expect(metoda).toBe("DELETE");
    expect(wynik.success).toContain("odłączone");
  });
});
