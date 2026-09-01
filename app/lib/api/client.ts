import { createClient, createConfig } from "@kalisthenos/api-client";
import type { Client } from "@kalisthenos/api-client";
import { getEnv } from "~/lib/env";
import { ApiError, parseApiError } from "./errors";

/**
 * Nazwa, którą moduły `app/lib` biorą pierwszym parametrem — dokładnie tam,
 * gdzie do integracji stało `Db`. Konwencja wstrzykiwania zostaje ta sama;
 * zmienia się wyłącznie to, co po drugiej stronie odpowiada na pytanie.
 */
export type Api = Client;

export interface ApiClientOptions {
  /** Domyślnie `API_URL` z konfiguracji. Jawny wyłącznie w testach. */
  baseUrl?: string;
  /**
   * **Funkcja, nie wartość.** Klient powstaje raz na żądanie, a token może się
   * w jego trakcie zmienić — odświeżenie w interceptorze podmienia go w uchwycie
   * sesji. Domknięta wartość sprawiłaby, że ponowienie idzie ze starym tokenem.
   */
  getToken: () => string | undefined;
  /** Podstawiany wyłącznie w testach; produkcyjnie `globalThis.fetch`. */
  fetch?: typeof fetch;
}

export function createApiClient({ baseUrl, getToken, fetch: transport }: ApiClientOptions): Api {
  const api = createClient(
    createConfig({
      baseUrl: baseUrl ?? getEnv().API_URL,
      // Moduły domenowe nie rozbierają `{ data, error }`. Błąd leci wyjątkiem
      // do trasy, gdzie `toRouteResponse` zamienia go na `Response`.
      throwOnError: true,
      auth: () => getToken(),
      ...(transport ? { fetch: transport } : {}),
    }),
  );

  api.interceptors.error.use((error, response) => {
    // Już zamieniony — ścieżka ponowienia po odświeżeniu przechodzi tędy drugi raz.
    if (error instanceof ApiError) return error;

    // `response` jest niezdefiniowane, gdy `fetch` w ogóle nie doszedł do skutku.
    // `502` zamiast `0`, bo `0` nie jest poprawnym statusem `Response` i wysadziłby
    // `toRouteResponse` w miejscu, które ma ratować sytuację, a nie ją pogarszać.
    return parseApiError(response?.status ?? 502, error);
  });

  return api;
}

/**
 * Reguła D3 specu: **funkcja deklarująca `Promise<… | null>` łapie `404`;
 * każda inna pozwala mu lecieć.**
 *
 * Regułę wyznacza sygnatura, nie ocena piszącego — dzięki temu przepięcie
 * 24 modułów nie wymaga decyzji przy żadnym z nich. Wąska celowo: `orNull`
 * łykający wszystko zamieniałby błędną ścieżkę w kliencie i awarię BE w pusty
 * ekran, czyli w objaw nie do odróżnienia od „nic tu nie ma".
 */
export async function orNull<T>(call: Promise<T>): Promise<T | null> {
  try {
    return await call;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
