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
 * loaderów rodziców (`root.tsx`) — co znaczyło kiedyś, że sonda nie budzi
 * leniwych sprzątaczek sesji i plików. Obie przeszły do BE, więc nie ma już
 * czego nie budzić; sam fakt o loaderach rodziców zostaje prawdziwy.
 *
 * **Middleware jednak biegnie**, i loaderów rodziców to nie dotyczy: RR7
 * przepuszcza przez potok middleware'u także trasy zasobowe. Sonda woła więc
 * `getEnv()` z `apiMiddleware`, czyli **bez ustawionego `API_URL` zwraca 500** —
 * a Railway raportuje to jako „failed with service unavailable" i deploy nigdy
 * nie wchodzi. Brakująca zmienna kładzie zdrowie, nie tylko trasy wołające BE.
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
