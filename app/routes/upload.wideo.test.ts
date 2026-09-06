// @vitest-environment node
//
// `node`, nie happy-dom: trasa buduje `Request` z `FormData` i czyta nagłówki
// odpowiedzi — w happy-dom `Request`/`Response` różnią się od Node-owych
// (patrz `wyloguj.test.ts`).
import { describe, expect, it, vi } from "vitest";

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
}));

vi.mock("~/lib/env", () => ({
  getEnv: () => ({
    API_URL: "http://be.test",
    MAX_UPLOAD_BYTES: 250_000_000,
    MAX_VIDEO_UPLOAD_BYTES: 30_000_000,
  }),
}));
vi.mock("~/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: loggerErrorMock },
  errorMeta: () => ({}),
}));

import { RouterContextProvider, redirect } from "react-router";
import { createApiClient } from "~/lib/api/client";
import { type AuthUser, apiContext } from "~/lib/api/context";
import { action } from "./upload.wideo";

const PODOPIECZNY: AuthUser = {
  id: "u-1",
  email: "anna@example.pl",
  displayName: "Anna Kowalska",
  roles: ["trainee"],
  trainerId: "t-1",
  trainerName: "Trener",
};

function scenariusz(
  odpowiedz: (req: Request) => Response,
  plik: File | null = new File([new Uint8Array(3)], "s.mp4", { type: "video/mp4" }),
) {
  const trafienia: string[] = [];
  const context = new RouterContextProvider();
  context.set(apiContext, {
    api: createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "A1",
      fetch: (async (req: Request) => {
        trafienia.push(`${req.method} ${new URL(req.url).pathname}`);
        return odpowiedz(req);
      }) as unknown as typeof fetch,
    }),
    user: PODOPIECZNY,
  });
  const fd = new FormData();
  if (plik) fd.append("file", plik);
  return {
    trafienia,
    args: {
      request: new Request("https://fe.test/upload/wideo", { method: "POST", body: fd }),
      params: {},
      context,
    },
  };
}

function odmowa(
  status: number,
  code: string,
  message: string,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("upload.wideo — trasa zasobowa nad kontraktem", () => {
  it("wgrywa dwufazowo i oddaje czysty JSON `{ fileId }` ze statusem 200", async () => {
    // Konsumentem jest surowy XHR (`components/video-upload-field.tsx`), który robi
    // `JSON.parse` na `responseText` i czyta `fileId` — kształt odpowiedzi jest
    // kontraktem z komponentem, nie z React Routerem.
    const s = scenariusz((req) =>
      new URL(req.url).pathname === "/v1/files/set-video"
        ? new Response(JSON.stringify({ id: "f-1", bytes: 3, mimeType: "video/mp4" }), {
            status: 201,
            headers: { "content-type": "application/json" },
          })
        : new Response(null, { status: 204 }),
    );

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(await res.text())).toEqual({ fileId: "f-1", bytes: 3 });
    expect(s.trafienia).toEqual(["POST /v1/files/set-video", "POST /v1/files/f-1/confirm"]);
  });

  it("`403 ONBOARDING_FORM_PENDING` z BE wraca jako JSON 403 z komunikatem BE", async () => {
    // Bramka formularza startowego przeszła do BE (`OnboardingGuard` obejmuje
    // wysyłki); trasa nie ma już własnej kopii i nie tłumaczy komunikatu.
    const s = scenariusz(() =>
      odmowa(403, "ONBOARDING_FORM_PENDING", "Najpierw wypełnij formularz startowy."),
    );

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(403);
    expect(JSON.parse(await res.text())).toEqual({
      error: "Najpierw wypełnij formularz startowy.",
    });
  });

  it("`429` z BE niesie `Retry-After` dalej do XHR", async () => {
    // Limit wysyłek liczy BE, kluczowany tożsamością (ADR-0031). Sekundy z nagłówka
    // przechodzą przez `ApiError.retryAfter` — bez tego klient nie wie, ile czekać.
    const s = scenariusz(() =>
      odmowa(429, "TOO_MANY_REQUESTS", "Za dużo wysyłek.", { "retry-after": "30" }),
    );

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(JSON.parse(await res.text())).toEqual({ error: "Za dużo wysyłek." });
  });

  it("bez pliku odpowiada 400 bez wołania BE", async () => {
    // Brak pola `file` to błąd klienta, nie BE — odpowiedź nie może kosztować
    // żądania sieciowego ani zdradzać, czy sesja żyje.
    const s = scenariusz(() => new Response(null, { status: 500 }), null);

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(400);
    expect(s.trafienia).toEqual([]);
  });

  it("`Response` z interceptora (martwa sesja → przekierowanie) przechodzi nietknięty", async () => {
    // Decyzja C13: middleware kończy martwą sesję rzucając `Response` PRZEZ
    // interceptor klienta. Gdyby `catch` mapował ją jak `ApiError`, `/login`
    // zamieniłoby się w JSON 500 „nie udało się wgrać" — a XHR pokazałby
    // użytkownikowi awarię zamiast poinformować o wylogowaniu.
    const s = scenariusz(() => {
      throw redirect("/login");
    });

    await expect(action(s.args as never)).rejects.toBeInstanceOf(Response);
  });

  it("plik ponad limit wideo odpowiada 400 bez wołania BE", async () => {
    // Limit sprawdza moduł PRZED wysyłką (`UploadError`), żeby nie słać
    // 30 MB po to, by usłyszeć `413`. Trasa mapuje to na 400 z komunikatem.
    // Prawdziwe bajty, nie podmieniony `size`: plik idzie przez rzeczywisty
    // multipart `FormData`/`Request`, więc `request.formData()` w akcji odtwarza
    // `File` z FAKTYCZNEGO rozmiaru zawartości po deserializacji — podmieniona
    // przez `Object.defineProperty` właściwość na oryginalnym obiekcie tego
    // rozjazdu (1 bajt treści vs. zadeklarowany rozmiar) by nie przetrwała.
    const zaDuzy = new File([new Uint8Array(30_000_001)], "s.mp4", { type: "video/mp4" });
    const s = scenariusz(() => new Response(null, { status: 201 }), zaDuzy);

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(400);
    expect(JSON.parse(await res.text()).error).toContain("Plik za duży");
    expect(s.trafienia).toEqual([]);
  });

  it("awaria BE (`5xx`) wraca jako generyczne 500 i trafia do logu", async () => {
    // Komunikat `5xx` z BE nie jest tekstem dla użytkownika; awaria ma zostać
    // awarią z logiem `upload.set_video.failed`, nie zdaniem o pliku.
    const s = scenariusz(() => odmowa(503, "UPSTREAM_DOWN", "R2 nie odpowiada."));

    const res = (await action(s.args as never)) as Response;

    expect(res.status).toBe(500);
    expect(JSON.parse(await res.text())).toEqual({
      error: "Nie udało się wgrać nagrania. Spróbuj ponownie.",
    });
    expect(loggerErrorMock).toHaveBeenCalledWith("upload.set_video.failed", expect.anything());
  });
});
