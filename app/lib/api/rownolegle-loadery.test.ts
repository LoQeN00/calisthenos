// @vitest-environment node
//
// Ten sam powód co w `middleware.test.ts`: domyślne `happy-dom` filtruje
// nagłówek `cookie` już w konstruktorze `Request`, więc żądanie nigdy nie
// niosłoby sesji i middleware brałby gałąź anonima — test udawałby, że
// przechodzi, nie dotykając ani razu badanego mechanizmu.
import { beforeEach, describe, expect, it, vi } from "vitest";

// `apiMiddleware` czyta `getEnv().API_URL` bezpośrednio; bez mocka każdy
// przypadek padałby na `ZodError` przed dotarciem do asercji.
vi.mock("~/lib/env", () => ({
  getEnv: () => ({ API_URL: "http://be.test" }),
}));

import { exerciseCategoriesControllerList } from "@kalisthenos/api-client";
import { RouterContextProvider } from "react-router";
import { apiContext } from "./context";
import { apiMiddleware } from "./middleware";
import { resetRefreshState } from "./refresh";
import { buildSessionCookie, readSessionCookie } from "./session";

const TERAZ = new Date("2026-08-31T10:00:00Z");

const ME = {
  partyId: "p-1",
  displayName: "Anna",
  email: "a@e.pl",
  roles: ["trainer"],
  coach: null,
};

function json(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Mapy `refresh.ts` są stanem modułowym współdzielonym przez wszystkie pliki
// testowe — bez tego wynik zależałby od kolejności ich uruchomienia.
beforeEach(() => resetRefreshState());

describe("równoległe loadery jednej nawigacji", () => {
  it("token wygasły w locie: pięć loaderów, JEDNA rotacja, JEDNO ciastko", async () => {
    // To jest defekt objawiający się losowym wylogowaniem ze WSZYSTKICH
    // urządzeń — `SessionService.rotate` przy ponownym użyciu tokenu woła
    // `deleteChain`. React Router uruchamia loadery jednej nawigacji
    // równolegle Z ZAŁOŻENIA, więc bez tej gwarancji trafiałoby to każdą
    // nawigację, w której token akurat wygasł. Nie do odtworzenia przy
    // pojedynczym żądaniu, więc musi stać tutaj.
    const trafienia: string[] = [];
    let tokenWazny = false;

    const fetchAtrapa = (async (req: Request) => {
      const url = new URL(req.url).pathname;
      trafienia.push(url);

      if (url === "/v1/auth/refresh") {
        tokenWazny = true;
        return json(200, { accessToken: "A2", refreshToken: "R2", expiresIn: 900 });
      }
      if (url === "/v1/me") return json(200, ME);

      // Zasoby domenowe odmawiają, dopóki token nie zostanie wymieniony.
      return tokenWazny
        ? json(200, [])
        : json(401, { error: { code: "TOKEN_EXPIRED", message: "Token wygasł." } });
      // Rzutowanie jak w `middleware.test.ts`: middleware woła `transport`
      // wyłącznie obiektem `Request`, atrapa przyjmuje tylko ten kształt.
    }) as unknown as typeof fetch;

    const context = new RouterContextProvider();
    const cookie = buildSessionCookie({
      accessToken: "A1",
      refreshToken: "R1",
      // Dalej niż margines: middleware NIE odświeża wyprzedzająco, więc
      // odświeżenie musi zajść w interceptorze, w pięciu loaderach naraz.
      accessExpiresAt: TERAZ.getTime() + 900_000,
    }).split(";")[0]!;

    const res = await apiMiddleware(
      {
        request: new Request("https://fe.test/trener/biblioteka", {
          headers: new Headers({ cookie }),
        }),
        context,
      },
      async () => {
        const { api } = context.get(apiContext);
        // Pięć loaderów jednej nawigacji: layout, liść i trzy fetchery.
        await Promise.all(
          Array.from({ length: 5 }, () => exerciseCategoriesControllerList({ client: api })),
        );
        return new Response("ok");
      },
      { fetch: fetchAtrapa, now: () => TERAZ },
    );

    const rotacje = trafienia.filter((t) => t === "/v1/auth/refresh");
    expect(rotacje).toHaveLength(1);

    const ciastka = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean);
    expect(ciastka).toHaveLength(1);
    // Nie sama obecność ciastka, tylko jego TREŚĆ. Middleware, który ustawia
    // `zmieniona`, ale nie podmienia sesji w uchwycie, wpisałby z powrotem
    // zużyty `R1` — a wtedy następna nawigacja przedstawia token ponownie
    // użyty i BE gasi cały łańcuch. Czyli dokładnie ta awaria, przed którą ten
    // plik stoi, tyle że o jedno żądanie później.
    expect(readSessionCookie(ciastka[0]!.split(";")[0]!)?.refreshToken).toBe("R2");
  });
});
