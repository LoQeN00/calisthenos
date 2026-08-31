import { redirect } from "react-router";

/**
 * Tłumaczenie błędu BE na coś, co React Router umie pokazać.
 *
 * Kontrakt BE to `{ error: { code, message, details } }`, gdzie `message` jest
 * **już po polsku i dla użytkownika**, a `code` stabilny dla logiki (`docs/04`).
 * FE nie układa komunikatów od nowa — niesie tamte dalej; własne zostawia
 * wyłącznie tam, gdzie odpowiedź w ogóle nie pochodzi z BE.
 */

/** Kod zastępczy dla odpowiedzi, która nie niesie koperty kontraktu. */
const UNKNOWN = "UNKNOWN";

const FALLBACK_MESSAGE =
  "Nie udało się połączyć z serwerem. Spróbuj ponownie za chwilę.";

export interface ApiErrorDetails {
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorDetails,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Nigdy nie rzuca. Na drodze do BE stoją rzeczy, które nie są BE — proxy, load
 * balancer, przerwane połączenie — a każde z nich oddaje ciało innego kształtu.
 * Wyjątek przy rozbiorze błędu zamienia czytelny komunikat w `500` bez śladu.
 */
export function parseApiError(status: number, payload: unknown): ApiError {
  const koperta = kopertaZ(payload);

  if (!koperta) return new ApiError(status, UNKNOWN, FALLBACK_MESSAGE);

  const { code, message, details } = koperta;

  return new ApiError(
    status,
    typeof code === "string" && code !== "" ? code : UNKNOWN,
    typeof message === "string" && message !== "" ? message : FALLBACK_MESSAGE,
    typeof details === "object" && details !== null
      ? (details as ApiErrorDetails)
      : undefined,
  );
}

/**
 * Dwie bramki przenoszą się tu z zapytań do bazy na kody HTTP (§4 specu):
 * `403 ONBOARDING_FORM_PENDING` na przekierowanie, `404` na `404`. Reszta idzie
 * dalej z komunikatem BE — obsługuje ją granica błędu trasy.
 */
export function toRouteResponse(error: ApiError): Response {
  // Wyłącznie po nieudanym odświeżeniu: token unieważniony po tamtej stronie.
  if (error.status === 401) return redirect("/login");

  // Po kodzie, nie po samym statusie. `403` znaczy też „nie ta rola", a
  // przekierowanie na formularz w odpowiedzi na brak roli zapętliłoby
  // nawigację — formularz odmówiłby tak samo i odesłał z powrotem.
  if (error.status === 403 && error.code === "ONBOARDING_FORM_PENDING") {
    return redirect("/podopieczny/formularz");
  }

  return new Response(error.message, {
    status: error.status,
    statusText: error.code,
  });
}

function kopertaZ(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;

  const { error } = payload as Record<string, unknown>;
  if (!error || typeof error !== "object") return null;

  return error as Record<string, unknown>;
}
