import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import { ApiError } from "./api/errors";
import {
  currentVariationOf,
  loadMySkillMap,
  loadTraineeSkillMap,
  recordAdvancement,
  setStartingLevel,
} from "./skill-progression";
import { SkillError } from "./skills";

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

function pusto(status: number): Response {
  return new Response(null, { status });
}

function odmowa(status: number, code: string, message: string, details?: unknown): Response {
  return json(status, { error: { code, message, details } });
}

const WPIS = {
  skillId: "s-2",
  skillName: "Front Lever",
  tier: "advanced" as const,
  variations: [
    { id: "v-1", exerciseId: "e-1", exerciseName: "Tuck FL", unit: "SEC" as const, ordinal: 1 },
    { id: "v-2", exerciseId: "e-2", exerciseName: "Adv Tuck FL", unit: "SEC" as const, ordinal: 2 },
  ],
  currentVariationId: "v-2",
  lastAdvancedOn: "2026-08-20",
  history: [
    { fromVariationId: "v-1", toVariationId: "v-2", advancedOn: "2026-08-20", note: null },
    { fromVariationId: null, toVariationId: "v-1", advancedOn: "2026-07-01", note: "start" },
  ],
};

describe("loadMySkillMap / loadTraineeSkillMap — mapa postępu", () => {
  it("własna mapa idzie pod `/v1/me/skill-progress` i wraca nietknięta", async () => {
    // Kontrakt niesie drabiny, bieżący poziom i historię w jednej odpowiedzi
    // („historia jest w mapie") — bez sugestii awansu (luka L S1-1).
    let sciezka = "";
    let metoda = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      metoda = req.method;
      return json(200, [WPIS]);
    });

    const wynik = await loadMySkillMap(api);

    expect(metoda).toBe("GET");
    expect(sciezka).toBe("/v1/me/skill-progress");
    expect(wynik).toEqual([WPIS]);
  });

  it("mapa podopiecznego idzie pod `/v1/trainees/{id}/skill-progress`", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, [WPIS]);
    });

    const wynik = await loadTraineeSkillMap(api, "t-1");

    expect(sciezka).toBe("/v1/trainees/t-1/skill-progress");
    expect(wynik[0]?.history).toHaveLength(2);
  });

  it("`404` (cudzy podopieczny) przelatuje jako ApiError — o 404 decyduje trasa wcześniej", async () => {
    // Bez `| null` w sygnaturze: pusta mapa i cudzy podopieczny to dwie różne
    // rzeczy, a trasa trenera pyta o parę zanim spyta o mapę.
    const api = klient(() => odmowa(404, "TRAINEE_NOT_FOUND", "Nie znaleziono podopiecznego."));

    const blad = await loadTraineeSkillMap(api, "t-x").catch((e) => e);

    expect(blad).toBeInstanceOf(ApiError);
  });
});

describe("currentVariationOf — bieżący wariant z wpisu mapy", () => {
  it("wskazuje wariant o `id` równym `currentVariationId`", () => {
    // Kontrakt trzyma bieżący poziom na wpisie, nie flagą per wariant; z bieżącego
    // wariantu trasy biorą `exerciseId` do wykresu.
    expect(currentVariationOf(WPIS)?.exerciseId).toBe("e-2");
  });

  it("`null`, gdy poziom nieustalony albo bieżący wariant zniknął z drabiny", () => {
    expect(currentVariationOf({ ...WPIS, currentVariationId: null })).toBeNull();
    expect(currentVariationOf({ ...WPIS, currentVariationId: "v-usuniety" })).toBeNull();
  });
});

describe("setStartingLevel / recordAdvancement — zdarzenia awansu", () => {
  it("poziom startowy to `POST …/skills/{skillId}/starting-level` z ciałem `{ toVariationId, advancedOn, note }`", async () => {
    // `trainerId`, `traineeId` i `advancedBy` nie wchodzą do ciała — para jest
    // w ścieżce, autor w tokenie; pole spoza DTO to `400`.
    let sciezka = "";
    let metoda = "";
    let cialo: unknown;
    const api = klient(async (req) => {
      sciezka = new URL(req.url).pathname;
      metoda = req.method;
      cialo = await req.json();
      return pusto(204);
    });

    await setStartingLevel(api, "t-1", "s-2", "v-1", "2026-07-01", "start");

    expect(metoda).toBe("POST");
    expect(sciezka).toBe("/v1/trainees/t-1/skills/s-2/starting-level");
    expect(cialo).toEqual({ toVariationId: "v-1", advancedOn: "2026-07-01", note: "start" });
  });

  it("`409 SKILL_PROGRESS_ALREADY_STARTED` idzie do formularza jako SkillError", async () => {
    // Reguła „dozwolone raz", której FE nie miał — teraz zdanie należy do BE.
    const api = klient(() =>
      odmowa(409, "SKILL_PROGRESS_ALREADY_STARTED", "Poziom startowy jest już ustalony."),
    );

    const blad = await setStartingLevel(api, "t-1", "s-2", "v-1", "2026-07-01", null).catch(
      (e) => e,
    );

    expect(blad).toBeInstanceOf(SkillError);
    expect((blad as SkillError).userMessage).toBe("Poziom startowy jest już ustalony.");
  });

  it("awans to `POST …/skills/{skillId}/advancements`, bez `fromVariationId` w ciele", async () => {
    // `from` wylicza BE z bieżącego poziomu; dawne `currentLevelFromEvents`
    // przed zapisem zniknęło z modułu.
    let sciezka = "";
    let cialo: unknown;
    const api = klient(async (req) => {
      sciezka = new URL(req.url).pathname;
      cialo = await req.json();
      return pusto(204);
    });

    await recordAdvancement(api, "t-1", "s-2", "v-2", "2026-08-20", null);

    expect(sciezka).toBe("/v1/trainees/t-1/skills/s-2/advancements");
    expect(cialo).toEqual({ toVariationId: "v-2", advancedOn: "2026-08-20", note: null });
  });

  it("`409` (bez poziomu startowego, ten sam poziom) to SkillError z komunikatem BE", async () => {
    const api = klient(() =>
      odmowa(409, "SKILL_PROGRESS_NOT_STARTED", "Najpierw ustal poziom startowy."),
    );

    const blad = await recordAdvancement(api, "t-1", "s-2", "v-2", "2026-08-20", null).catch(
      (e) => e,
    );

    expect(blad).toBeInstanceOf(SkillError);
    expect((blad as SkillError).userMessage).toBe("Najpierw ustal poziom startowy.");
  });

  it("`500` przelatuje jako ApiError — awaria BE ma zostać awarią", async () => {
    const api = klient(() => odmowa(500, "INTERNAL", "Coś poszło nie tak."));

    const blad = await recordAdvancement(api, "t-1", "s-2", "v-2", "2026-08-20", null).catch(
      (e) => e,
    );

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(SkillError);
  });
});
