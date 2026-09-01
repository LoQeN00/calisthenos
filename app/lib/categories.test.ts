import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import { ApiError } from "./api/errors";
import {
  CategoryError,
  addCategory,
  deleteCategory,
  filterToKnownCategoryNames,
  listCategoriesForTrainer,
} from "./categories";

function klient(reguly: (req: Request) => Response) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => "T",
    fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
  });
}

function json(status: number, cialo: unknown): Response {
  return new Response(JSON.stringify(cialo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const KATEGORIA = { id: "k-1", name: "nogi", ordinal: 0, exerciseCount: 3 };

describe("categories — moduł na kliencie kontraktu", () => {
  it("lista nie przekazuje już identyfikatora trenera", async () => {
    // Zakres tenanta niesie token, nie argument. Zostawienie `trainerId`
    // w sygnaturze podtrzymywałoby złudzenie, że FE go egzekwuje.
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, [KATEGORIA]);
    });

    const wynik = await listCategoriesForTrainer(api);

    expect(sciezka).toBe("/v1/exercise-categories");
    expect(wynik).toEqual([KATEGORIA]);
  });

  it("pustą nazwę odrzuca bez wywołania sieci", async () => {
    let wywolan = 0;
    const api = klient(() => {
      wywolan += 1;
      return json(201, KATEGORIA);
    });

    await expect(addCategory(api, "   ")).rejects.toBeInstanceOf(CategoryError);
    expect(wywolan).toBe(0);
  });

  it("409 z kontraktu wraca jako CategoryError z komunikatem BE", async () => {
    // Trasa łapie `CategoryError` i pokazuje `userMessage`. Gdyby moduł
    // przepuścił `ApiError`, formularz zamiast komunikatu dostałby granicę
    // błędu — a to jest inny ekran, nie inny tekst.
    const api = klient(() =>
      json(409, {
        error: { code: "CATEGORY_NAME_TAKEN", message: "Kategoria o tej nazwie już istnieje." },
      }),
    );

    const blad = await addCategory(api, "nogi").catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(CategoryError);
    expect((blad as CategoryError).userMessage).toBe("Kategoria o tej nazwie już istnieje.");
  });

  it("awaria BE NIE zamienia się w CategoryError", async () => {
    // Wąskość `catch` jest tą samą regułą co przy `orNull`: gdyby moduł łykał
    // każdy błąd, awaria serwera pokazałaby się w formularzu jako „nazwa
    // zajęta" — komunikat, który każe użytkownikowi poprawiać coś, co jest
    // dobre, i ukrywa usterkę przed nami.
    const api = klient(() => json(500, { error: { code: "INTERNAL", message: "Ups." } }));

    const blad = await addCategory(api, "nogi").catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(CategoryError);
  });

  it("usunięcie woła DELETE z identyfikatorem w ścieżce", async () => {
    let opis = "";
    const api = klient((req) => {
      opis = `${req.method} ${new URL(req.url).pathname}`;
      return new Response(null, { status: 204 });
    });

    await deleteCategory(api, "k-1");

    expect(opis).toBe("DELETE /v1/exercise-categories/k-1");
  });

  it("filtrowanie nazw pozostaje czyste — bez sieci", () => {
    const wynik = filterToKnownCategoryNames([KATEGORIA], ["Nogi", "brzuch", "nogi"]);
    expect(wynik).toEqual(["nogi"]);
  });
});
