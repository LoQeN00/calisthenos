import { traineeOverviewControllerQuery } from "@kalisthenos/api-client";
import type { TraineeHeatmapDayItem, TraineeOverviewView } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";

// ============================================================
// Przegląd klienta (widok trenera) — **jedno** wywołanie kontraktu.
//
// Do integracji ten ekran robił osiem równoległych zapytań przez siedem funkcji
// tego modułu (kondycja współpracy, stagnacja, rozkład tagów, wykorzystanie sesji
// planu, sumy planu, pokrycie nagraniami, pokrycie zdjęciami) plus mapę
// aktywności. `GET /v1/trainees/{traineeId}/overview` oddaje wszystko poza mapą
// jednym widokiem (`docs/04` §Modele odczytu: „cały drugi plaster rodziny 2 poza
// mapą aktywności"), więc siedem funkcji i siedem własnych typów znika na rzecz
// jednej `loadTraineeOverview`.
//
// LUKA L S5-1 — **mapa aktywności zniknęła z tego ekranu.** `TraineeOverviewView`
// jej nie niesie, a `docs/03` („Klient — przegląd") mówi o niej wprost *„jeszcze
// nie zbudowane"*. `TraineeHomeView.heatmap` to widok WŁASNY podopiecznego, nie
// trenera patrzącego na podopiecznego, więc nie zastępuje jej ani trochę.
// Świadomie NIE składamy jej z dziennika treningowego: to byłoby N żądań po dane,
// które BE i tak liczy obok.
// ============================================================

/**
 * Typy przeglądu biorą się z kontraktu, nie z własnych kopii. Nazwy pól różnią
 * się miejscami od dawnych (`PlateauItemView.name` zamiast `exerciseName`,
 * `recentBest` zamiast `recentAvgReps`, `PlanSessionUsageView.name` zamiast
 * `sessionName`) — to ustalenia BE i to one są nadrzędne.
 */
export type {
  ActivePlanUsageView,
  BodyPhotoCoverageView,
  HealthView,
  PlanExerciseUsageView,
  PlanRef,
  PlanSessionUsageView,
  PlanTotals,
  PlateauItemView,
  TagDistributionView,
  TagShareView,
  TraineeOverviewView,
  VideoCoverageView,
} from "@kalisthenos/api-client";

/**
 * Jedyny typ tego modułu, który nie należy do przeglądu klienta: dzień mapy
 * aktywności. Mapa żyje dziś WYŁĄCZNIE na pulpicie podopiecznego
 * (`TraineeHomeView.heatmap` z `views.ts`), ale rysują ją komponenty
 * (`stat-widgets.tsx`, `trainee-stats.tsx`) importujące ten alias stąd od
 * czasów, gdy dane liczył `getActivityHeatmap`. Alias zostaje, żeby przepięcie
 * nie ruszało dwóch komponentów bez powodu; jest re-eksportem kontraktu, nie
 * własnym kształtem.
 */
export type HeatmapDay = TraineeHeatmapDayItem;

/**
 * Przegląd klienta jednym żądaniem. Bez `orNull`: cudzy i nieistniejący
 * podopieczny to `404`, a ta trasa ma z niego zrobić `404` ekranu — sygnatura
 * bez `| null` przepuszcza więc `ApiError` do granicy błędu (reguła D3 specu).
 *
 * **Dwa horyzonty najemcy w jednej odpowiedzi** (`docs/04` §Modele odczytu):
 * stagnacja (`plateau`) liczy się z CAŁEJ historii podopiecznego, jak progresja,
 * a pozostałe bloki — kondycja, tagi, pokrycia, plan — wyłącznie z PARY
 * trener↔podopieczny. Dawne funkcje tego modułu nie rozróżniały tych horyzontów
 * w ogóle: filtrowały po samym `traineeId`.
 */
export async function loadTraineeOverview(
  api: Api,
  traineeId: string,
): Promise<TraineeOverviewView> {
  const { data } = await traineeOverviewControllerQuery({
    client: api,
    path: { traineeId },
    throwOnError: true,
  });
  return data;
}
