import { describe, expect, it, vi } from "vitest";

// `trainees.ts` importuje `file-uploads.ts` (`deleteFileBlob`), a ten czyta `getEnv()`
// w `maxUploadBytesFor`. Bez mocka test wysadza się na braku zmiennych środowiskowych.
vi.mock("~/lib/env", () => ({
  getEnv: () => ({
    MAX_UPLOAD_BYTES: 250_000_000,
    MAX_VIDEO_UPLOAD_BYTES: 30_000_000,
    API_URL: "http://be.internal",
    API_PUBLIC_URL: "https://api.kalisthenos.test",
  }),
}));

import { createApiClient } from "./api/client";
import { listClientsForTrainer } from "./trainees";

function klient(reguly: (req: Request) => Response | Promise<Response>) {
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

const PODOPIECZNY = {
  id: "t-1",
  displayName: "Anna Kowalska",
  sessionCount: 12,
  lastSessionOn: "2026-08-30",
  hasActivePlan: true,
};

function strona(items: unknown[], page = 1, totalPages = 1, total = items.length) {
  return { items, page, totalPages, total };
}

describe("listClientsForTrainer — lista podopiecznych na kontrakcie", () => {
  it("idzie pod `/v1/trainees` z sortowaniem, filtrem planu, szukajką i stroną bez tłumaczenia", async () => {
    // Pięć wartości `sort` i trzy `plan` są w kontrakcie DOKŁADNIE tymi z zakładkowalnego
    // adresu listy — słownika nie ma, test pilnuje, żeby nikt go nie dopisał.
    let sciezka = "";
    let zapytanie = "";
    const api = klient((req) => {
      const url = new URL(req.url);
      sciezka = url.pathname;
      zapytanie = url.search;
      return json(200, strona([PODOPIECZNY]));
    });

    await listClientsForTrainer(api, { page: 2, sort: "most_sessions", q: "anna", plan: "with" });

    expect(sciezka).toBe("/v1/trainees");
    expect(zapytanie).toContain("page=2");
    expect(zapytanie).toContain("sort=most_sessions");
    expect(zapytanie).toContain("q=anna");
    expect(zapytanie).toContain("plan=with");
  });

  it("`plan: all` i puste `q` nie trafiają do zapytania", async () => {
    // `all` to brak zawężenia, a puste `q=` znaczy w kontrakcie „szukaj pustego
    // łańcucha", nie „bez filtra" — dlatego oba muszą zniknąć z zapytania.
    let zapytanie = "";
    const api = klient((req) => {
      zapytanie = new URL(req.url).search;
      return json(200, strona([PODOPIECZNY]));
    });

    await listClientsForTrainer(api, { page: 1, sort: "name_asc", q: "", plan: "all" });

    expect(zapytanie).not.toContain("plan=");
    expect(zapytanie).not.toContain("q=");
  });

  it("strona i licznik przychodzą razem — moduł nie liczy stron", async () => {
    // Do integracji trasa robiła dwa zapytania (`countClientsForTrainer` + lista)
    // i liczyła `safePage` sama; rozmiar strony (30) należy teraz do BE.
    const api = klient(() => json(200, strona([PODOPIECZNY], 2, 2, 31)));

    const wynik = await listClientsForTrainer(api, { page: 9, sort: "name_asc" });

    expect(wynik.page).toBe(2);
    expect(wynik.totalPages).toBe(2);
    expect(wynik.total).toBe(31);
    expect(wynik.items[0]?.hasActivePlan).toBe(true);
  });
});
