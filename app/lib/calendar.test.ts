// @vitest-environment node
//
// `node`, nie happy-dom: ten moduł czyta nagłówki `Set-Cookie` z odpowiedzi BE,
// a happy-dom traktuje je jako nagłówki zakazane i `getSetCookie()` oddaje pod
// nim pustą tablicę — test przechodziłby albo padał z powodu, który nie ma nic
// wspólnego z badanym kodem. Ten sam powód, co w `app/routes/wyloguj.test.ts`.
import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import { disconnectCalendar, getCalendarConnection, startCalendarAuthorization } from "./calendar";

function klient(reguly: (req: Request) => Response) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => "T",
    fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
  });
}

function json(status: number, cialo: unknown, naglowki: [string, string][] = []): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: [["content-type", "application/json"], ...naglowki],
  });
}

describe("calendar — kalendarz zewnętrzny na kontrakcie", () => {
  it("stan połączenia przychodzi z kontraktu bez identyfikatora trenera", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, { status: "connected", provider: "google", accountLabel: "a@b.pl" });
    });

    const wynik = await getCalendarConnection(api);

    expect(sciezka).toBe("/v1/calendar/connection");
    expect(wynik.status).toBe("connected");
    expect(wynik.accountLabel).toBe("a@b.pl");
  });

  it("rozpoczęcie zgody oddaje adres RAZEM z ciastkiem", async () => {
    // To jest sedno całego projektu. Ciastko z nonce'em powstaje w odpowiedzi
    // na to wywołanie i wiąże je ze `state` w adresie zgody; przy wołaniu
    // serwer-do-serwera trafia do serwera FE, a nie do przeglądarki. Moduł
    // wydobywa je, żeby trasa mogła podać je dalej.
    const api = klient(() =>
      json(200, { url: "https://accounts.google.test/o/oauth2/auth?state=S" }, [
        ["set-cookie", "kal_calendar_nonce=N; Path=/v1/calendar/connection/callback"],
      ]),
    );

    const wynik = await startCalendarAuthorization(api);

    expect(wynik.url).toContain("accounts.google.test");
    expect(wynik.setCookie).toEqual([
      "kal_calendar_nonce=N; Path=/v1/calendar/connection/callback",
    ]);
  });

  it("dwa nagłówki Set-Cookie przechodzą oba", async () => {
    // `getSetCookie()` jest jedynym czytnikiem, który nie skleja powtórzonego
    // nagłówka w jeden napis. Gdyby moduł sięgnął po `headers.get`, drugie
    // ciastko zniknęłoby po cichu.
    const api = klient(() =>
      json(200, { url: "https://accounts.google.test/o/oauth2/auth" }, [
        ["set-cookie", "a=1"],
        ["set-cookie", "b=2"],
      ]),
    );

    const wynik = await startCalendarAuthorization(api);

    expect(wynik.setCookie).toEqual(["a=1", "b=2"]);
  });

  it("brak ciastka daje pustą listę, nie wyjątek", async () => {
    // Odpowiedź bez `Set-Cookie` jest błędem konfiguracji po stronie BE,
    // ale trasa ma się wtedy wywrócić na odmowie zgody, a nie na `undefined`
    // w miejscu, w którym nikt się tego nie spodziewa.
    const api = klient(() => json(200, { url: "https://accounts.google.test/o/oauth2/auth" }));

    expect((await startCalendarAuthorization(api)).setCookie).toEqual([]);
  });

  it("rozłączenie idzie metodą DELETE", async () => {
    let metoda = "";
    let sciezka = "";
    const api = klient((req) => {
      metoda = req.method;
      sciezka = new URL(req.url).pathname;
      return new Response(null, { status: 204 });
    });

    await disconnectCalendar(api);

    expect(metoda).toBe("DELETE");
    expect(sciezka).toBe("/v1/calendar/connection");
  });
});
