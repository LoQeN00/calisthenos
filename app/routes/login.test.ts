// @vitest-environment node
//
// `node`, nie happy-dom: akcja buduje ciastko `__Host-…`, a konstruktor
// `Request` w happy-dom usuwa nagłówki zakazane spec Fetch — test cicho
// badałby wtedy co innego niż deklaruje.
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { RouterContextProvider } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { apiContext } from "~/lib/api/context";
import { action, loader } from "./login";

const PROFIL = {
  partyId: "p-1",
  displayName: "Anna",
  email: "anna@e.pl",
  roles: ["trainer"],
  coach: null,
};

function kontekst(reguly: (req: Request) => Response) {
  const context = new RouterContextProvider();
  context.set(apiContext, {
    api: createApiClient({
      baseUrl: "http://be.test",
      getToken: () => undefined,
      fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
    }),
    user: null,
  });
  return context;
}

function json(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function zadanie(pola: Record<string, string>): Request {
  return new Request("https://fe.test/login", {
    method: "POST",
    body: new URLSearchParams(pola),
  });
}

describe("login — logowanie przez kontrakt BE", () => {
  it("udane logowanie wystawia ciastko sesji i odsyła do sekcji", async () => {
    const context = kontekst(() =>
      json(200, { accessToken: "A1", refreshToken: "R1", expiresIn: 900, profile: PROFIL }),
    );

    const res = (await action({
      request: zadanie({ email: "anna@e.pl", password: "tajne123" }),
      params: {},
      context,
    } as never)) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/trener");
    expect(res.headers.get("set-cookie")).toContain("__Host-kth_api=");
  });

  it("odmowa BE wraca jako komunikat formularza, nie wyjątek", async () => {
    // Trasa ma pokazać tekst pod polem, a nie granicę błędu — inaczej złe
    // hasło wygląda jak awaria aplikacji.
    const context = kontekst(() => json(401, {}));

    const wynik = await action({
      request: zadanie({ email: "anna@e.pl", password: "zle" }),
      params: {},
      context,
    } as never);

    expect(wynik).toEqual({ error: "Niepoprawne dane logowania." });
  });

  it("awaria BE NIE jest komunikatem formularza", async () => {
    // Druga strona tej samej granicy: `500` ma wylecieć do granicy błędu,
    // a nie kazać użytkownikowi poprawiać hasło w odpowiedzi na cudzą usterkę.
    const context = kontekst(() => json(500, { error: { code: "INTERNAL", message: "Ups." } }));

    await expect(
      action({
        request: zadanie({ email: "anna@e.pl", password: "tajne123" }),
        params: {},
        context,
      } as never),
    ).rejects.toBeTruthy();
  });

  it("zalogowany nie widzi formularza", () => {
    // Loader jest teraz SYNCHRONICZNY i nie dotyka sieci — użytkownika
    // załadował middleware raz na żądanie. Do integracji było to zapytanie
    // do bazy przy każdym wejściu na `/login`.
    const context = new RouterContextProvider();
    context.set(apiContext, {
      api: createApiClient({ baseUrl: "http://be.test", getToken: () => undefined }),
      user: {
        id: "p-1",
        email: "anna@e.pl",
        displayName: "Anna",
        roles: ["trainer"],
        trainerId: null,
        trainerName: null,
      },
    });

    let rzucone: unknown;
    try {
      loader({ request: new Request("https://fe.test/login"), params: {}, context } as never);
    } catch (e) {
      rzucone = e;
    }

    expect(rzucone).toBeInstanceOf(Response);
    expect((rzucone as Response).headers.get("location")).toBe("/trener");
  });
});
