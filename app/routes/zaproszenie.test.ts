// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { RouterContextProvider } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { apiContext } from "~/lib/api/context";
import { action, loader } from "./zaproszenie.$token";

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

function przyjecie(pola: Record<string, string>): Request {
  return new Request("https://fe.test/zaproszenie/tok-1", {
    method: "POST",
    body: new URLSearchParams(pola),
  });
}

const POPRAWNE = { email: "ola@e.pl", displayName: "Ola", password: "tajne123" };

describe("zaproszenie — podgląd i przyjęcie przez kontrakt", () => {
  it("podgląd oddaje nazwę i podpowiedź adresu", async () => {
    const context = kontekst(() => json(200, { displayName: "Ola", email: "ola@e.pl" }));

    const dane = await loader({
      request: new Request("https://fe.test/zaproszenie/tok-1"),
      params: { token: "tok-1" },
      context,
    } as never);

    expect(dane).toEqual({ displayName: "Ola", emailHint: "ola@e.pl" });
  });

  it("nieznane zaproszenie daje 404, nie wyjątek techniczny", async () => {
    // Jeden kształt odpowiedzi dla nieistniejącego, zużytego i wygasłego —
    // inaczej sonda odróżniłaby „zły token" od „dobry, ale już użyty".
    const context = kontekst(() =>
      json(404, { error: { code: "RESOURCE_NOT_FOUND", message: "Brak." } }),
    );

    const blad = await loader({
      request: new Request("https://fe.test/zaproszenie/tok-1"),
      params: { token: "tok-1" },
      context,
    } as never).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(Response);
    expect((blad as Response).status).toBe(404);
  });

  it("awaria BE w podglądzie NIE udaje braku zaproszenia", async () => {
    // `404` znaczy „nie ma czego przyjąć" i kończy ścieżkę użytkownika.
    // Gdyby awaria backendu wyglądała tak samo, trener dostawałby zgłoszenia
    // o „zepsutych linkach", które w rzeczywistości są sprawne.
    const context = kontekst(() => json(502, {}));

    const blad = await loader({
      request: new Request("https://fe.test/zaproszenie/tok-1"),
      params: { token: "tok-1" },
      context,
    } as never).catch((e: unknown) => e);

    expect(blad).not.toBeInstanceOf(Response);
  });

  it("przyjęcie wystawia ciastko i odsyła na / (nie do sekcji)", async () => {
    // D4 specu: odpowiedź przyjęcia typuje `roles` jako `Array<string>`, więc
    // o sekcji rozstrzyga `_index.tsx` na wąskim `/v1/me`, nie ta trasa.
    const context = kontekst(() =>
      json(200, {
        accessToken: "A1",
        refreshToken: "R1",
        expiresIn: 900,
        profile: {
          partyId: "p-2",
          displayName: "Ola",
          email: "ola@e.pl",
          roles: ["trainee"],
          coach: null,
        },
      }),
    );

    const res = (await action({
      request: przyjecie(POPRAWNE),
      params: { token: "tok-1" },
      context,
    } as never)) as Response;

    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("set-cookie")).toContain("__Host-kth_api=");
  });

  it("zajęty adres wraca jako komunikat formularza", async () => {
    const context = kontekst(() =>
      json(409, { error: { code: "EMAIL_ALREADY_TAKEN", message: "Zajęty." } }),
    );

    const wynik = await action({
      request: przyjecie(POPRAWNE),
      params: { token: "tok-1" },
      context,
    } as never);

    expect(wynik).toEqual({ error: "Ten adres e-mail jest już zajęty." });
  });

  it("za krótkie hasło odbija się od walidacji, bez wywołania BE", async () => {
    // Kształt formularza to nadal sprawa FE — BE waliduje też, ale odesłanie
    // żądania po to, żeby usłyszeć to samo, byłoby marnotrawstwem.
    let wywolan = 0;
    const context = kontekst(() => {
      wywolan += 1;
      return json(200, {});
    });

    const wynik = await action({
      request: przyjecie({ ...POPRAWNE, password: "krotkie" }),
      params: { token: "tok-1" },
      context,
    } as never);

    expect(wynik).toEqual({ error: "Sprawdź pola formularza." });
    expect(wywolan).toBe(0);
  });
});
