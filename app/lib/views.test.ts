import { describe, expect, it } from "vitest";
import { createApiClient } from "./api/client";
import { loadTraineeNavigation, loadTrainerDashboard, loadTrainerNavigation } from "./views";

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

const NAW_TRENERA = { trainees: 4, activeExercises: 12, plans: 3, newFeatureRequests: 1 };
const PULPIT_TRENERA = { clients: [], recentLogs: [], activePlans: 2, drafts: 1, weekSessions: 5 };
const NAW_PODOPIECZNEGO = {
  activePlanSessions: null,
  workoutLogs: 7,
  bodyPhotos: 2,
  pendingConsultations: 0,
  featureRequests: 1,
};

// Trzy widoki, jeden wzorzec: moduł nie liczy, nie sumuje i nie mapuje — oddaje
// widok BE takim, jaki przyszedł. Test pilnuje ADRESU, bo to jedyne, co tu może
// się rozjechać w ciszy (zła ścieżka to `404` zamieniony przez interceptor na
// ApiError, ale dopiero w czasie wykonania).
describe("views — widoki przekrojowe BE", () => {
  it("nawigacja trenera to `GET /v1/trainer/nav`", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, NAW_TRENERA);
    });

    expect(await loadTrainerNavigation(api)).toEqual(NAW_TRENERA);
    expect(sciezka).toBe("/v1/trainer/nav");
  });

  it("pulpit trenera to `GET /v1/trainer/home`", async () => {
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, PULPIT_TRENERA);
    });

    expect(await loadTrainerDashboard(api)).toEqual(PULPIT_TRENERA);
    expect(sciezka).toBe("/v1/trainer/home");
  });

  it("nawigacja podopiecznego to `GET /v1/me/nav`, a brak planu zostaje `null`", async () => {
    // `activePlanSessions: null` znaczy „nie ma aktywnego planu", a `0` — „plan
    // bez sesji". Kontrakt rozróżnia te stany celowo; moduł ich nie skleja,
    // robi to dopiero powłoka, która pokazuje w obu przypadkach zero.
    let sciezka = "";
    const api = klient((req) => {
      sciezka = new URL(req.url).pathname;
      return json(200, NAW_PODOPIECZNEGO);
    });

    const wynik = await loadTraineeNavigation(api);

    expect(wynik.activePlanSessions).toBeNull();
    expect(sciezka).toBe("/v1/me/nav");
  });
});
