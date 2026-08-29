/**
 * Sonda żywotności dla platformy hostingowej (Railway → `healthcheckPath`).
 *
 * Trasa ZASOBOWA (bez komponentu). Railway uznaje deploy za zdrowy wyłącznie po
 * odpowiedzi **200** — każdą inną, w tym przekierowanie, raportuje jako
 * „failed with service unavailable". `/` przekierowuje ZAWSZE (`_index.tsx`:
 * gość→`/login`, zalogowany→panel), więc na healthcheck się nie nadaje.
 *
 * Świadomie NIE dotyka bazy ani sesji: to sonda żywotności procesu, nie
 * gotowości zależności. Gdyby odpytywała Postgresa, każde mrugnięcie bazy
 * kładłoby kontener przez `restartPolicyType = "ON_FAILURE"` zamiast pozwolić
 * mu przeczekać. Brak eksportu `default` sprawia dodatkowo, że RR7 nie odpala
 * loaderów rodziców (`root.tsx`) — sonda nie budzi więc sprzątaczek sesji
 * (`maybePruneExpiredSessions`) ani plików (`maybeSweepOrphanSetVideos`).
 */
export async function loader(): Promise<Response> {
  return new Response("ok", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
