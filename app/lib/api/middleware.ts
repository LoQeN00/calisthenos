import { redirect } from "react-router";
import type { RouterContextProvider } from "react-router";
import { authControllerRefresh, meControllerMe } from "@kalisthenos/api-client";
import type { MeDto } from "@kalisthenos/api-client";
import { getEnv } from "~/lib/env";
import { type Api, createApiClient } from "./client";
import { type AuthUser, apiContext } from "./context";
import { ApiError } from "./errors";
import { refreshOnce } from "./refresh";
import {
  type ApiSession,
  buildSessionCookie,
  clearSessionCookie,
  needsRefresh,
  readSessionCookie,
} from "./session";

/**
 * Limit czasu na `POST /v1/auth/refresh` wołane z `exchange`.
 *
 * Bez własnego timeoutu zawieszone wywołanie nie zwalnia się nigdy: mapa
 * odświeżeń w locie (`refresh.ts`) usuwa wpis wyłącznie w `.finally()`, więc
 * pojedyncze zawieszone żądanie przypina wpis na stałe — i każde kolejne
 * żądanie tego samego użytkownika dostaje tę samą, wiecznie oczekującą
 * obietnicę. Awaria jednego żądania zamieniłaby się w niedostępność całego
 * konta. 10 s, bo to wywołanie serwer-do-serwera, które blokuje wyświetlenie
 * czegokolwiek — nie ma tu komu czekać dłużej.
 */
const REFRESH_TIMEOUT_MS = 10_000;

/** Wstrzykiwane wyłącznie w testach; produkcyjnie wartości domyślne. */
export interface MiddlewareDeps {
  fetch?: typeof fetch;
  now?: () => Date;
}

interface MiddlewareArgs {
  request: Request;
  // `Readonly<...>`, nie goły `RouterContextProvider` — to dokładnie to, co
  // niesie `DataFunctionArgs` w prawdziwej sygnaturze `MiddlewareFunction`
  // z react-router. `Readonly` blokuje tylko PODMIANĘ metod `get`/`set`, nie
  // ich WOŁANIE — `context.set(...)` niżej działa tak samo. Bez tego typu
  // `apiMiddleware` nie przechodzi kontroli wobec `MiddlewareFunction<Response>`
  // (patrz jawny typ eksportu w `app/root.tsx`) — ciche niedopasowanie
  // ujawniłoby się dopiero w runtime routera, nie na `tsc`.
  context: Readonly<RouterContextProvider>;
}

/**
 * Jedyne miejsce, które dotyka sesji.
 *
 * Biegnie raz na żądanie HTTP i **wokół** loaderów: ma moment przed nimi
 * (odświeżenie wyprzedzające) i drogę powrotną (`Set-Cookie`). Loader tego
 * drugiego nie ma — dlatego rotacja tokenu nie mogła zamieszkać w loaderze.
 */
export async function apiMiddleware(
  { request, context }: MiddlewareArgs,
  next: () => Promise<Response>,
  deps: MiddlewareDeps = {},
): Promise<Response> {
  const transport = deps.fetch ?? globalThis.fetch;
  const now = deps.now ?? (() => new Date());
  const baseUrl = getEnv().API_URL;

  const zapisana = readSessionCookie(request.headers.get("cookie"));

  if (!zapisana) {
    context.set(apiContext, {
      api: createApiClient({ baseUrl, getToken: () => undefined, fetch: transport }),
      user: null,
    });
    return next();
  }

  /**
   * UCHWYT, nie wartość. Odświeżenie, które zajdzie w interceptorze w środku
   * loadera, musi być widoczne tutaj, w drodze powrotnej — inaczej nowy token
   * odświeżający nie trafi do ciastka, a stary jest już po tamtej stronie zużyty.
   */
  const uchwyt = { session: zapisana, zmieniona: false };

  const odswiez = async (): Promise<void> => {
    const swieza = await refreshOnce(uchwyt.session.refreshToken, {
      exchange: async (refreshToken) => {
        const { data } = await authControllerRefresh({
          client: createApiClient({ baseUrl, getToken: () => undefined, fetch: transport }),
          body: { refreshToken },
          signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
          // Zgodne z `throwOnError: true` już ustawionym w `createApiClient` —
          // tu odtwarza to na poziomie TYPU, żeby `data` nie było `| undefined`.
          // Klient i tak rzuca na błędzie; to tylko każe `tsc` w to uwierzyć.
          throwOnError: true,
        });
        return data;
      },
      now,
    });
    uchwyt.session = swieza;
    uchwyt.zmieniona = true;
  };

  /**
   * Klon każdego żądania, które klient faktycznie wysyła — zrobiony PRZED
   * wysyłką. Realny `fetch` zużywa strumień ciała żądania nawet wtedy, gdy
   * połączenie się nie udaje (zmierzone: `TypeError` po zwykłym `fetch()`
   * na nieistniejący port zostawia `bodyUsed === true`) — więc `request_`,
   * które interceptor odpowiedzi dostaje niżej, to już zużyty obiekt.
   * Ponowna budowa `new Request(request_, …)` z NIEGO rzuciłaby `TypeError:
   * … already been used` dla każdego żądania z ciałem (POST/PUT/PATCH).
   * Mapa słaba, bo kopia ma żyć dokładnie tak długo jak oryginał: gdy nikt
   * już nie trzyma referencji do wysłanego żądania, kopia znika razem z nim
   * — bez ręcznego sprzątania i bez ryzyka pomieszania kopii między
   * równoległymi żądaniami na tym samym kliencie.
   */
  const kopieZadan = new WeakMap<Request, Request>();

  const transportZKopia: typeof fetch = async (input, init) => {
    if (input instanceof Request) kopieZadan.set(input, input.clone());
    return transport(input, init);
  };

  const api: Api = createApiClient({
    baseUrl,
    getToken: () => uchwyt.session.accessToken,
    fetch: transportZKopia,
  });

  // Siatka na token, który umarł w locie między sprawdzeniem niżej a wywołaniem.
  // Ponowienie idzie przez `refreshOnce`, więc N loaderów naraz to nadal jedna
  // rotacja. Ponowione żądanie leci przez `transport`, czyli z pominięciem
  // interceptorów — druga runda jest niemożliwa z konstrukcji, nie z flagi.
  api.interceptors.response.use(async (response, request_) => {
    if (response.status !== 401) return response;

    try {
      await odswiez();
    } catch (blad) {
      // Middleware biegnie wewnątrz wywołania klienta (`meControllerMe`/
      // przyszłe wywołania trasy przez `api`), więc nie ma jak stąd zwyczajnie
      // `return` — trzeba **rzucić**. Rzut wychodzi z tego interceptora przez
      // `client.ts`, gdzie osobna gałąź (`error instanceof Response`) puszcza
      // `Response` dalej nietknięty — to ONA, nie sam fakt rzucenia, chroni
      // przed przemieleniem na `401/UNKNOWN` przez `parseApiError`. Stąd
      // `Response` leci już bez przeszkód do miejsca, które umie potraktować
      // rzucony `Response` jak zwróconą odpowiedź (`apiMiddleware` przez
      // swój `catch` niżej, docelowo React Router). Moduł domenowy nic o tym
      // nie wie — to jest granica między błędem sesji a błędem danych.
      if (blad instanceof ApiError && blad.status === 401) throw wyloguj(request);
      throw blad;
    }

    // Kopia, nie `request_` — patrz komentarz przy `kopieZadan` wyżej.
    const kopia = kopieZadan.get(request_) ?? request_;
    return transport(new Request(kopia, { headers: naglowkiZTokenem(kopia, uchwyt.session) }));
  });

  try {
    if (needsRefresh(uchwyt.session, now())) await odswiez();

    // `throwOnError: true`: jak wyżej — zgodne z konfiguracją `api`, tu tylko
    // uwidocznione dla `tsc`, żeby `data` nie było `MeDto | undefined`.
    const { data } = await meControllerMe({ client: api, throwOnError: true });
    context.set(apiContext, { api, user: zUzytkownika(data) });
  } catch (blad) {
    // WYŁĄCZNIE `401`: odświeżenie odrzucone albo `/me` odmawia mimo świeżego
    // tokenu. Jedno i drugie znaczy dla użytkownika „sesja się skończyła".
    // Awaria BE (`502`, `500`) NIE jest wylogowaniem — odesłanie na logowanie
    // kazałoby użytkownikowi wpisywać hasło w odpowiedzi na cudzą usterkę,
    // a po zalogowaniu i tak nie zadziałałoby nic.
    if (blad instanceof ApiError && blad.status === 401) return wyloguj(request);
    throw blad;
  }

  const response = await next();

  if (uchwyt.zmieniona) {
    response.headers.append("Set-Cookie", buildSessionCookie(uchwyt.session));
  }

  return response;
}

function naglowkiZTokenem(request_: Request, session: ApiSession): Headers {
  const naglowki = new Headers(request_.headers);
  naglowki.set("authorization", `Bearer ${session.accessToken}`);
  return naglowki;
}

function zUzytkownika(me: MeDto): AuthUser {
  return {
    id: me.partyId,
    email: me.email,
    displayName: me.displayName,
    roles: me.roles,
    trainerId: me.coach?.partyId ?? null,
    trainerName: me.coach?.displayName ?? null,
  };
}

/** Bez pętli: gdy celem już jest `/login`, samo czyszczenie wystarczy. */
function wyloguj(request: Request): Response {
  const naglowki = { "Set-Cookie": clearSessionCookie() };

  if (new URL(request.url).pathname === "/login") {
    return new Response(null, { status: 200, headers: naglowki });
  }

  return redirect("/login", { headers: naglowki });
}
