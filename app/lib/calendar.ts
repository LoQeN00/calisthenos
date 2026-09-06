import {
  calendarConnectionControllerAuthorize,
  calendarConnectionControllerDisconnect,
  calendarConnectionControllerGet,
} from "@kalisthenos/api-client";
import type { CalendarConnectionView } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";

/**
 * Kalendarz zewnętrzny — jedyne wejście FE do tego obszaru.
 *
 * **Nie `google.ts`**: dostawca jest WARTOŚCIĄ pola `provider`, nigdy częścią
 * nazwy (ADR-0012 po stronie BE). Kontrakt typuje `provider` jako `string`,
 * a nie enum, dokładnie po to, żeby drugi dostawca był zmianą addytywną.
 */

/** Adres ekranu zgody wraz z ciastkiem, które musi trafić do przeglądarki. */
export interface CalendarAuthorization {
  readonly url: string;
  readonly setCookie: string[];
}

export async function getCalendarConnection(api: Api): Promise<CalendarConnectionView> {
  // `throwOnError: true` jawnie, choć klient ma je w konfiguracji: generyk
  // funkcji SDK domyślnie schodzi do `false`, więc bez tego `data` typuje się
  // jako `… | undefined`. Zero zmiany w czasie wykonania.
  const { data } = await calendarConnectionControllerGet({ client: api, throwOnError: true });
  return data;
}

/**
 * Rozpoczyna zgodę i wydobywa ciastko, które BE ustawił przy tej odpowiedzi.
 *
 * **Jedyne miejsce w tej warstwie, które przenosi ciastko BE dalej**, i jest to
 * wyjątek świadomy. Reguła („token w ciele, nie w ciastku") istnieje, bo FE woła
 * BE serwer-do-serwera i ciastka BE do niczego mu się nie przydają. Tutaj jest
 * odwrotnie: ciastko z nonce'em jest przeznaczone dla PRZEGLĄDARKI, a serwer FE
 * jest po drodze. Rozdzielenie adresu zgody od ciastka nie wchodzi w grę —
 * wiąże je ze sobą `state`, a docblock `CalendarAuthorizeResponse.url` w
 * kontrakcie mówi to wprost.
 *
 * `getSetCookie()`, nie `headers.get("set-cookie")`: tylko ono nie skleja
 * powtórzonego nagłówka w jeden napis.
 */
export async function startCalendarAuthorization(api: Api): Promise<CalendarAuthorization> {
  const { data, response } = await calendarConnectionControllerAuthorize({
    client: api,
    throwOnError: true,
  });
  return { url: data.url, setCookie: response.headers.getSetCookie() };
}

export async function disconnectCalendar(api: Api): Promise<void> {
  await calendarConnectionControllerDisconnect({ client: api, throwOnError: true });
}
