import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import { ApiError } from "./api/errors";
import { developmentSortFrom, loadMyDevelopment, loadTraineeDevelopment } from "./skill-tree";

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

function odmowa(status: number, code: string, message: string, details?: unknown): Response {
  return json(status, { error: { code, message, details } });
}

const ROZWOJ = {
  tree: {
    nodes: [
      {
        skillId: "s-1",
        name: "Pull-up",
        tier: "basic" as const,
        state: "mastered" as const,
        variationCount: 3,
        currentVariationId: "v-3",
        currentExerciseId: "e-3",
        currentOrdinal: 3,
      },
      {
        skillId: "s-2",
        name: "Front Lever",
        tier: "advanced" as const,
        state: "available" as const,
        variationCount: 4,
        currentVariationId: null,
        currentExerciseId: null,
        currentOrdinal: null,
      },
    ],
    edges: [{ from: "s-2", requires: "s-1" }],
    summary: { total: 2, mastered: 1, inProgress: 0, highestEarnedTier: "basic" as const },
  },
  exercises: {
    items: [
      {
        exerciseId: "e-9",
        name: "Dip",
        unit: "REPS" as const,
        tags: ["push"],
        sessionCount: 6,
        lastPerformedOn: "2026-08-30",
        pr: 12,
        prAchievedOn: "2026-08-30",
        sparkline: [8, 10, 12],
        status: "up" as const,
      },
    ],
    summary: { up: 1, flat: 0, down: 0, new: 0 },
    tagOptions: ["push"],
  },
};

describe("loadMyDevelopment / loadTraineeDevelopment — jeden widok na ekran Rozwoju", () => {
  it("własny rozwój idzie pod `/v1/me/development` z `sort` i `tag`", async () => {
    let sciezka = "";
    let metoda = "";
    let zapytanie = new URLSearchParams();
    const api = klient((req) => {
      const url = new URL(req.url);
      sciezka = url.pathname;
      metoda = req.method;
      zapytanie = url.searchParams;
      return json(200, ROZWOJ);
    });

    await loadMyDevelopment(api, { sort: "attention", tag: "push" });

    expect(metoda).toBe("GET");
    expect(sciezka).toBe("/v1/me/development");
    expect(zapytanie.get("sort")).toBe("attention");
    expect(zapytanie.get("tag")).toBe("push");
  });

  it("`tag=all` i pusty tag nie trafiają do zapytania, `sort` idzie zawsze", async () => {
    // `all` to brak zawężenia (wzorzec `status` w planach), a `sort` musi iść
    // jawnie, bo domyślna kontraktu (`recent`) różni się od domyślnej trenera.
    const zapytania: string[] = [];
    const api = klient((req) => {
      zapytania.push(new URL(req.url).search);
      return json(200, ROZWOJ);
    });

    await loadMyDevelopment(api, { sort: "recent", tag: "all" });
    await loadMyDevelopment(api, { sort: "recent", tag: "" });
    await loadMyDevelopment(api, { sort: "recent" });

    for (const q of zapytania) {
      expect(q).toContain("sort=recent");
      expect(q).not.toContain("tag=");
    }
  });

  it("drzewo, lista, podsumowanie i opcje tagów wracają z jednej odpowiedzi, nietknięte", async () => {
    // Do integracji ekran składał to z trzech zapytań (drzewo, lista progresji,
    // mapa ćwiczenie→umiejętność) i sam wykluczał warianty z listy. Stany węzłów
    // i wykluczenie liczy teraz BE — moduł niczego nie przelicza.
    const api = klient(() => json(200, ROZWOJ));

    const wynik = await loadMyDevelopment(api, { sort: "recent" });

    expect(wynik.tree.nodes.map((n) => n.state)).toEqual(["mastered", "available"]);
    expect(wynik.tree.edges).toEqual([{ from: "s-2", requires: "s-1" }]);
    expect(wynik.tree.summary.highestEarnedTier).toBe("basic");
    expect(wynik.exercises.items[0]?.exerciseId).toBe("e-9");
    expect(wynik.exercises.summary).toEqual({ up: 1, flat: 0, down: 0, new: 0 });
    expect(wynik.exercises.tagOptions).toEqual(["push"]);
  });

  it("rozwój podopiecznego idzie pod `/v1/trainees/{id}/development`", async () => {
    let sciezka = "";
    let zapytanie = "";
    const api = klient((req) => {
      const url = new URL(req.url);
      sciezka = url.pathname;
      zapytanie = url.search;
      return json(200, ROZWOJ);
    });

    await loadTraineeDevelopment(api, "t-1", { sort: "attention" });

    expect(sciezka).toBe("/v1/trainees/t-1/development");
    expect(zapytanie).toContain("sort=attention");
  });

  it("`404` (cudzy podopieczny) przelatuje jako ApiError — o 404 decyduje trasa wcześniej", async () => {
    const api = klient(() => odmowa(404, "TRAINEE_NOT_FOUND", "Nie znaleziono podopiecznego."));

    const blad = await loadTraineeDevelopment(api, "t-x", { sort: "attention" }).catch((e) => e);

    expect(blad).toBeInstanceOf(ApiError);
  });
});

describe("developmentSortFrom — sortowanie z adresu", () => {
  it("zna wartości kontraktu, a nieznaną zastępuje domyślną roli", () => {
    // Wartości w adresie są identyczne z kontraktem, więc bez słownika; domyślna
    // jest PER ROLĘ (trener „wymaga uwagi", podopieczny „ostatnio trenowane").
    expect(developmentSortFrom("recent", "attention")).toBe("recent");
    expect(developmentSortFrom("attention", "recent")).toBe("attention");
    expect(developmentSortFrom("zmyslone", "attention")).toBe("attention");
    expect(developmentSortFrom(null, "recent")).toBe("recent");
  });
});
