import { describe, expect, it } from "vitest";
import { exerciseCategoriesControllerList } from "@kalisthenos/api-client";
import { ApiError } from "./errors";
import { createApiClient, orNull } from "./client";

function odpowiedz(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("dokłada token do nagłówka przy każdym wywołaniu", async () => {
    let widziany: string | null = null;
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "TOKEN-A",
      fetch: async (req) => {
        widziany = (req as Request).headers.get("authorization");
        return odpowiedz(200, []);
      },
    });

    await exerciseCategoriesControllerList({ client: api });

    expect(widziany).toBe("Bearer TOKEN-A");
  });

  it("czyta token przy KAŻDYM wywołaniu, nie przy tworzeniu klienta", async () => {
    // Klient powstaje raz na żądanie, a token może się w jego trakcie zmienić
    // (odświeżenie w interceptorze). Gdyby fabryka domknęła wartość zamiast
    // funkcji, ponowione żądanie poszłoby ze starym, właśnie unieważnionym
    // tokenem — i pętla 401 → odśwież → 401 nigdy by się nie zamknęła.
    let biezacy = "STARY";
    const widziane: (string | null)[] = [];
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => biezacy,
      fetch: async (req) => {
        widziane.push((req as Request).headers.get("authorization"));
        return odpowiedz(200, []);
      },
    });

    await exerciseCategoriesControllerList({ client: api });
    biezacy = "NOWY";
    await exerciseCategoriesControllerList({ client: api });

    expect(widziane).toEqual(["Bearer STARY", "Bearer NOWY"]);
  });

  it("zamienia kopertę błędu na ApiError", async () => {
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "T",
      fetch: async () =>
        odpowiedz(409, {
          error: { code: "CATEGORY_NAME_TAKEN", message: "Kategoria o tej nazwie już istnieje." },
        }),
    });

    const blad = await exerciseCategoriesControllerList({ client: api }).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect((blad as ApiError).status).toBe(409);
    expect((blad as ApiError).code).toBe("CATEGORY_NAME_TAKEN");
  });

  it("awarię sieci zamienia na ApiError 502, nie na surowy TypeError", async () => {
    // Bez tego zerwane połączenie do BE wychodzi z modułu jako `TypeError:
    // fetch failed` i granica błędu trasy pokazuje komunikat, którego nie
    // napisał nikt po polsku.
    const api = createApiClient({
      baseUrl: "http://be.test",
      getToken: () => "T",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });

    const blad = await exerciseCategoriesControllerList({ client: api }).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect((blad as ApiError).status).toBe(502);
  });
});

describe("orNull — reguła D3", () => {
  it("404 zamienia na null", async () => {
    // 37 funkcji w `app/lib` deklaruje `Promise<… | null>`, a 40 miejsc w trasach
    // robi z tego `404`. Gdyby `404` leciał wyjątkiem, te 40 miejsc stałoby się
    // martwym kodem — i krok 3 Etapu 2 przestałby być mechaniczny.
    const wynik = await orNull(
      Promise.reject(new ApiError(404, "NOT_FOUND", "Nie znaleziono.")),
    );

    expect(wynik).toBeNull();
  });

  it("każdy inny status przepuszcza", async () => {
    // Reguła ma być wąska. `orNull` łykający wszystko zamieniałby błędną ścieżkę
    // w kliencie i awarię BE w pusty ekran bez śladu, co się stało.
    await expect(
      orNull(Promise.reject(new ApiError(500, "SERVER", "Awaria."))),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("wartość przepuszcza bez zmian", async () => {
    expect(await orNull(Promise.resolve({ id: "x" }))).toEqual({ id: "x" });
  });
});
