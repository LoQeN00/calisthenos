import {
  traineeProgressionControllerCompare,
  traineeProgressionControllerProgression,
  trainerProgressionControllerCompare,
  trainerProgressionControllerProgression,
} from "@kalisthenos/api-client";
import type {
  ComparisonSkippedView,
  ExerciseProgressionView as ContractExerciseProgressionView,
  ProgressionComparisonView,
  ProgressionPointView,
} from "@kalisthenos/api-client";
import { orNull } from "~/lib/api/client";
import type { Api } from "~/lib/api/client";
import type { ChartPoint, ProgressionRange } from "./progression-math";

// Kształty dla tras i komponentów — bez importu pakietu kontraktu poza `app/lib`
// (patrz `skills.ts`).
export type {
  ComparisonSeriesView,
  ComparisonSkippedView,
  ProgressionComparisonView,
} from "@kalisthenos/api-client";

/** Dziś jako `YYYY-MM-DD` (UTC). Osobno, żeby wołający i testy mogli o tym rozumować. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// Progresja jednego ćwiczenia
// ============================================================

/**
 * Widok progresji dla trasy i `ExerciseProgressionPanel`: kształt kontraktu,
 * ale z punktami jako `ChartPoint` — jedyne, co ten moduł jeszcze przelicza.
 * Rekord w serii (`isPr`), ujęcie tygodniowe (`granularity`), KPI i status
 * przychodzą policzone; dawne `loadProgressionSessions`, `seriesForRange`,
 * `computePeriodChangePct` i `markPrs` nie mają tu już żadnego wywołania.
 */
export interface ExerciseProgressionView extends Omit<ContractExerciseProgressionView, "points"> {
  points: ChartPoint[];
}

/** „DD.MM" z daty ISO — etykieta osi X, której kontrakt nie niesie. */
function shortLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

/**
 * Punkty kontraktu (`on`, `best`, `avgRpe`, `volume`, `isPr`) → `ChartPoint`
 * wykresów. `key` to `on` — data sesji albo poniedziałek tygodnia w ujęciu
 * tygodniowym, jednoznaczna w serii, więc nadaje się na klucz Reacta i osi;
 * `label` to skrót „DD.MM". Komponenty wykresów zostają nietknięte.
 */
export function toChartPoints(points: ProgressionPointView[]): ChartPoint[] {
  return points.map((p) => ({
    key: p.on,
    label: shortLabel(p.on),
    best: p.best,
    avgRpe: p.avgRpe,
    volume: p.volume,
    isPr: p.isPr,
  }));
}

function toView(view: ContractExerciseProgressionView): ExerciseProgressionView {
  return { ...view, points: toChartPoints(view.points) };
}

/**
 * Własna progresja ćwiczenia (`GET /v1/me/progression/{exerciseId}`). `| null`
 * w sygnaturze mapuje `404` przez `orNull`, a `404` znaczy tu cztery rzeczy naraz
 * (`docs/04`): ćwiczenie nie istnieje, jest cudze, jest zarchiwizowane albo —
 * własne i aktywne — nie ma ani jednego logu. Szczegół ćwiczenia robi z tego
 * ekran 404 (jak dotąd), węzeł umiejętności — „brak danych na bieżącym wariancie",
 * więc dawna flaga `currentHasLogs` z mapy umiejętności przestała być potrzebna.
 * Nazwy kontrolerów mylą: `traineeProgression…` to trasa WŁASNA podopiecznego.
 */
export async function loadMyExerciseProgression(
  api: Api,
  exerciseId: string,
  range: ProgressionRange,
): Promise<ExerciseProgressionView | null> {
  const view = await orNull(
    traineeProgressionControllerProgression({
      client: api,
      path: { exerciseId },
      query: { range },
      throwOnError: true,
    }).then((r) => r.data),
  );
  return view == null ? null : toView(view);
}

/**
 * Progresja podopiecznego oglądana przez trenera
 * (`GET /v1/trainees/{traineeId}/progression/{exerciseId}`) — te same cztery
 * znaczenia `404` plus piąte: podopieczny spoza własnej pary.
 */
export async function loadTraineeExerciseProgression(
  api: Api,
  traineeId: string,
  exerciseId: string,
  range: ProgressionRange,
): Promise<ExerciseProgressionView | null> {
  const view = await orNull(
    trainerProgressionControllerProgression({
      client: api,
      path: { traineeId, exerciseId },
      query: { range },
      throwOnError: true,
    }).then((r) => r.data),
  );
  return view == null ? null : toView(view);
}

// ============================================================
// Porównanie kilku ćwiczeń
// ============================================================

/**
 * Własne porównanie 2–8 ćwiczeń znormalizowanych do „% od startu okresu"
 * (`GET /v1/me/progression/comparison`, `ex` powtarzany: `?ex=<id>&ex=<id>` —
 * tak serializuje tablicę klient). `400` poza zakresem 2–8 i przy powtórzonym
 * identyfikatorze — trasa nie woła przy mniej niż dwóch i deduplikuje zestaw
 * PRZED wywołaniem, bo ręcznie zedytowany adres nie ma prawa skończyć się
 * ekranem błędu. Ćwiczenie nieznane, cudze, zarchiwizowane albo z za małą
 * liczbą punktów ląduje w `skipped` z kodem powodu i nie przerywa żądania;
 * `name` jest tam `null` przy `NO_DATA` — reguła bezpieczeństwa kontraktu
 * (nazwa cudzego ćwiczenia nie wycieka poza tenant), nie brak danych.
 */
export async function loadMyProgressionComparison(
  api: Api,
  exerciseIds: string[],
  range: ProgressionRange,
): Promise<ProgressionComparisonView> {
  const { data } = await traineeProgressionControllerCompare({
    client: api,
    query: { ex: exerciseIds, range },
    throwOnError: true,
  });
  return data;
}

/** Porównanie dla podopiecznego trenera; spoza własnej pary to `404`, które leci dalej. */
export async function loadTraineeProgressionComparison(
  api: Api,
  traineeId: string,
  exerciseIds: string[],
  range: ProgressionRange,
): Promise<ProgressionComparisonView> {
  const { data } = await trainerProgressionControllerCompare({
    client: api,
    path: { traineeId },
    query: { ex: exerciseIds, range },
    throwOnError: true,
  });
  return data;
}

/**
 * Kody powodu pominięcia na zdania — w module, nie w dwóch trasach (ten sam
 * powód co `planDeleteOutcomeMessage`). Do integracji FE rozróżniał tylko „brak
 * danych" i „za mało danych do porównania"; `ZERO_START` był drugim z nich,
 * bo `normalizeToPctFromStart` oddawał `null` w obu przypadkach.
 */
export function comparisonSkipReasonLabel(reason: ComparisonSkippedView["reason"]): string {
  switch (reason) {
    case "NO_DATA":
      return "brak danych";
    case "NOT_ENOUGH_POINTS":
      return "za mało danych do porównania";
    case "ZERO_START":
      return "wynik na starcie okresu to 0 — brak punktu odniesienia dla zmiany procentowej";
  }
}
