// @vitest-environment node
//
// `node`, nie happy-dom: trasa czyta ciastko sesji z nagłówka żądania, a
// konstruktor `Request` w happy-dom usuwa `cookie` jako nagłówek zakazany —
// test badałby wtedy ścieżkę bez sesji, twierdząc co innego.
import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { RouterContextProvider } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { apiContext } from "~/lib/api/context";
import { buildSessionCookie } from "~/lib/api/session";
import { loader } from "./wyloguj";

function scenariusz(odpowiedz: () => Response, zSesja = true) {
  const trafienia: string[] = [];
  const context = new RouterContextProvider();
  context.set(apiContext, {
    api: createApiClient({
      baseUrl: "http://be.test",
      getToken: () => undefined,
      fetch: (async (req: Request) => {
        trafienia.push(new URL(req.url).pathname);
        return odpowiedz();
      }) as unknown as typeof fetch,
    }),
    user: null,
  });

  const naglowki = new Headers();
  if (zSesja) {
    naglowki.set(
      "cookie",
      buildSessionCookie({
        accessToken: "A1",
        refreshToken: "R1",
        accessExpiresAt: Date.now() + 900_000,
      }).split(";")[0]!,
    );
  }

  return {
    trafienia,
    context,
    request: new Request("https://fe.test/wyloguj", { headers: naglowki }),
  };
}

describe("wyloguj — gasi sesję po obu stronach", () => {
  it("woła BE i czyści ciastko", async () => {
    const s = scenariusz(() => new Response(null, { status: 204 }));

    const res = (await loader({
      request: s.request,
      params: {},
      context: s.context,
    } as never)) as Response;

    expect(s.trafienia).toEqual(["/v1/auth/logout"]);
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("czyści ciastko TAKŻE gdy BE odmawia", async () => {
    // Sedno D5: wylogowanie, które nie wylogowuje przez chwilową awarię
    // backendu, zostawia użytkownika zalogowanego wbrew jego kliknięciu.
    // Sesję osieroconą po tamtej stronie zamknie wygaśnięcie; ciastka
    // w przeglądarce nie zamknie nic.
    const s = scenariusz(() => new Response(null, { status: 503 }));

    const res = (await loader({
      request: s.request,
      params: {},
      context: s.context,
    } as never)) as Response;

    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("bez ciastka nie woła BE, ale i tak czyści", async () => {
    // Wejście na `/wyloguj` bez sesji nie ma czego gasić — a wywołanie BE
    // z pustym tokenem byłoby żądaniem, które i tak skończy się odmową.
    const s = scenariusz(() => new Response(null, { status: 204 }), false);

    const res = (await loader({
      request: s.request,
      params: {},
      context: s.context,
    } as never)) as Response;

    expect(s.trafienia).toEqual([]);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
