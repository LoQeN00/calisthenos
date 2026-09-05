import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import { ApiError } from "./api/errors";
import {
  comparisonSkipReasonLabel,
  loadMyExerciseProgression,
  loadMyProgressionComparison,
  loadTraineeExerciseProgression,
  loadTraineeProgressionComparison,
  toChartPoints,
  todayIso,
} from "./progression";

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

describe("todayIso", () => {
  it("oddaje dzisiejszy dzień jako `YYYY-MM-DD`", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

const WIDOK = {
  exercise: { id: "e-1", name: "Pull-up", unit: "REPS" as const },
  range: "3m" as const,
  granularity: "session" as const,
  unitChanged: false,
  status: "up" as const,
  points: [
    { on: "2026-08-01", best: 8, avgRpe: 7.5, volume: 24, isPr: true },
    { on: "2026-08-15", best: 10, avgRpe: null, volume: 30, isPr: true },
  ],
  kpis: {
    pr: 10,
    prAchievedOn: "2026-08-15",
    lastBest: 10,
    lastDelta: 2,
    periodChangePct: 25,
    sessionsInRange: 2,
    avgRpeInRange: 7.5,
  },
};

describe("loadMyExerciseProgression / loadTraineeExerciseProgression — progresja ćwiczenia", () => {
  it("własna progresja idzie pod `/v1/me/progression/{exerciseId}` z `range`", async () => {
    // Nazwa kontrolera myli (`traineeProgression…`), ścieżka nie: to trasa WŁASNA.
    let sciezka = "";
    let metoda = "";
    let zapytanie = "";
    const api = klient((req) => {
      const url = new URL(req.url);
      sciezka = url.pathname;
      metoda = req.method;
      zapytanie = url.search;
      return json(200, WIDOK);
    });

    const wynik = await loadMyExerciseProgression(api, "e-1", "6m");

    expect(metoda).toBe("GET");
    expect(sciezka).toBe("/v1/me/progression/e-1");
    expect(zapytanie).toContain("range=6m");
    expect(wynik?.kpis).toEqual(WIDOK.kpis);
    expect(wynik?.granularity).toBe("session");
  });

  it("punkty kontraktu stają się `ChartPoint`: `key` z `on`, etykieta „DD.MM”, reszta bez zmian", async () => {
    // Jedyne, co moduł jeszcze liczy — wykresy czytają `key`/`label`, a kontrakt
    // niesie `on`. Rekord w serii (`isPr`) i ujęcie tygodniowe przychodzą policzone.
    const api = klient(() => json(200, WIDOK));

    const wynik = await loadMyExerciseProgression(api, "e-1", "3m");

    expect(wynik?.points).toEqual([
      { key: "2026-08-01", label: "01.08", best: 8, avgRpe: 7.5, volume: 24, isPr: true },
      { key: "2026-08-15", label: "15.08", best: 10, avgRpe: null, volume: 30, isPr: true },
    ]);
    expect(toChartPoints([])).toEqual([]);
  });

  it("`404` (brak logów, cudze, zarchiwizowane) daje `null` — sygnatura z `| null` łapie brak zasobu", async () => {
    // Szczegół ćwiczenia robi z tego ekran 404, węzeł umiejętności — „brak
    // danych na bieżącym wariancie"; dawna flaga `currentHasLogs` jest zbędna.
    const api = klient(() => odmowa(404, "EXERCISE_NOT_FOUND", "Nie znaleziono ćwiczenia."));

    expect(await loadMyExerciseProgression(api, "e-x", "3m")).toBeNull();
  });

  it("progresja podopiecznego idzie pod `/v1/trainees/{id}/progression/{exerciseId}`", async () => {
    let sciezka = "";
    let zapytanie = "";
    const api = klient((req) => {
      const url = new URL(req.url);
      sciezka = url.pathname;
      zapytanie = url.search;
      return json(200, WIDOK);
    });

    const wynik = await loadTraineeExerciseProgression(api, "t-1", "e-1", "4w");

    expect(sciezka).toBe("/v1/trainees/t-1/progression/e-1");
    expect(zapytanie).toContain("range=4w");
    expect(wynik?.exercise.name).toBe("Pull-up");
    expect(wynik?.points[1]?.label).toBe("15.08");
  });

  it("`500` przelatuje jako ApiError, nie jako `null` — awaria BE nie jest pustym ekranem", async () => {
    const api = klient(() => odmowa(500, "INTERNAL", "Coś poszło nie tak."));

    const blad = await loadTraineeExerciseProgression(api, "t-1", "e-1", "3m").catch((e) => e);

    expect(blad).toBeInstanceOf(ApiError);
  });
});

const POROWNANIE = {
  range: "3m" as const,
  series: [
    {
      exerciseId: "e-1",
      name: "Pull-up",
      unit: "REPS" as const,
      unitChanged: false,
      startValue: 8,
      endValue: 10,
      points: [
        { on: "2026-08-01", pct: 0 },
        { on: "2026-08-15", pct: 25 },
      ],
    },
  ],
  skipped: [{ exerciseId: "e-x", name: null, reason: "NO_DATA" as const }],
};

describe("loadMyProgressionComparison / loadTraineeProgressionComparison — porównanie ćwiczeń", () => {
  it("`ex` idzie jako parametr POWTARZANY (`?ex=a&ex=b`), razem z `range`", async () => {
    // Tak serializuje tablicę klient (`explode`, styl `form`) i tak czyta ją BE
    // — jeden `ex=a,b` byłby jednym nieznanym identyfikatorem.
    let sciezka = "";
    let metoda = "";
    let zapytanie = new URLSearchParams();
    const api = klient((req) => {
      const url = new URL(req.url);
      sciezka = url.pathname;
      metoda = req.method;
      zapytanie = url.searchParams;
      return json(200, POROWNANIE);
    });

    const wynik = await loadMyProgressionComparison(api, ["e-1", "e-2"], "3m");

    expect(metoda).toBe("GET");
    expect(sciezka).toBe("/v1/me/progression/comparison");
    expect(zapytanie.getAll("ex")).toEqual(["e-1", "e-2"]);
    expect(zapytanie.get("range")).toBe("3m");
    expect(wynik).toEqual(POROWNANIE);
  });

  it("porównanie podopiecznego idzie pod `/v1/trainees/{id}/progression/comparison`", async () => {
    let sciezka = "";
    let zapytanie = new URLSearchParams();
    const api = klient((req) => {
      const url = new URL(req.url);
      sciezka = url.pathname;
      zapytanie = url.searchParams;
      return json(200, POROWNANIE);
    });

    const wynik = await loadTraineeProgressionComparison(api, "t-1", ["e-1", "e-2"], "all");

    expect(sciezka).toBe("/v1/trainees/t-1/progression/comparison");
    expect(zapytanie.getAll("ex")).toEqual(["e-1", "e-2"]);
    expect(zapytanie.get("range")).toBe("all");
    expect(wynik.skipped[0]?.name).toBeNull();
  });

  it("`400` (poza 2–8, duplikat) przelatuje jako ApiError — trasa ma nie dopuścić do takiego wywołania", async () => {
    const api = klient(() =>
      odmowa(400, "VALIDATION_FAILED", "Porównać można od 2 do 8 różnych ćwiczeń."),
    );

    const blad = await loadMyProgressionComparison(api, ["e-1"], "3m").catch((e) => e);

    expect(blad).toBeInstanceOf(ApiError);
  });
});

describe("comparisonSkipReasonLabel — powody pominięcia po polsku", () => {
  it("każdy kod kontraktu ma zdanie, a dawne dwa zdania FE zostały przy swoich kodach", () => {
    expect(comparisonSkipReasonLabel("NO_DATA")).toBe("brak danych");
    expect(comparisonSkipReasonLabel("NOT_ENOUGH_POINTS")).toBe("za mało danych do porównania");
    expect(comparisonSkipReasonLabel("ZERO_START")).toContain("0");
  });
});
