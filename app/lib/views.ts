import {
  traineeViewsControllerDashboard,
  traineeViewsControllerNavigation,
  trainerViewsControllerDashboard,
  trainerViewsControllerNavigation,
} from "@kalisthenos/api-client";
import type {
  TraineeHomeView,
  TraineeNavView,
  TrainerHomeView,
  TrainerNavView,
} from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";

/**
 * Widoki przekrojowe BE — nawigacja i pulpit obu ról. Po tamtej stronie mieszkają
 * w `analytics` (ADR-0009: model odczytu przekraczający granicę kontekstu), po tej
 * są jednym wywołaniem NA EKRAN, nie na licznik.
 *
 * Wzorzec migracji layoutów: obszar, który przepina swój moduł, USUWA z layoutu
 * funkcję liczącą i bierze pole z już pobranego widoku. Nic więcej — widok jest
 * pobrany od tego obszaru (plany), niezależnie od tego, ile pól layout już czyta.
 * To wycofanie decyzji A5 z obszaru ćwiczeń (wołanie `nav` z czterech funkcji
 * modułów dałoby cztery żądania; wołanie z layoutu daje jedno).
 */
export async function loadTrainerNavigation(api: Api): Promise<TrainerNavView> {
  const { data } = await trainerViewsControllerNavigation({ client: api, throwOnError: true });
  return data;
}

/**
 * Pulpit trenera: klienci (`sessionCount` liczony WYŁĄCZNIE z treningów u tego
 * trenera), sześć ostatnich treningów, liczniki planów i sesje tygodnia — od
 * `dziś − 7 dni` włącznie, tak samo jak liczył dawny `countLogsForTrainerSince`.
 * Jedno wywołanie na ekran; trasa nie dotyka już bazy.
 */
export async function loadTrainerDashboard(api: Api): Promise<TrainerHomeView> {
  const { data } = await trainerViewsControllerDashboard({ client: api, throwOnError: true });
  return data;
}

/**
 * `activePlanSessions` jest `null`, gdy nie ma aktywnego planu, a `0`, gdy plan
 * jest, ale bez sesji — kontrakt rozróżnia te stany celowo. Moduł ich nie skleja;
 * powłoka pokazuje w obu przypadkach zero, ale decyzja należy do niej.
 */
export async function loadTraineeNavigation(api: Api): Promise<TraineeNavView> {
  const { data } = await traineeViewsControllerNavigation({ client: api, throwOnError: true });
  return data;
}

/**
 * Pulpit podopiecznego: aktywny plan z liczbą wykonań per sesja, pięć ostatnich
 * treningów, wskaźniki (hero, ten tydzień, mapa aktywności, bilans wysiłku)
 * i miesiące z gotowym podsumowaniem — wszystko, co `podopieczny/_index` do
 * integracji składał z ośmiu zapytań trzech modułów. `activePlan` jest `null`,
 * gdy trener nic nie opublikował; moduł tego nie skleja.
 */
export async function loadTraineeDashboard(api: Api): Promise<TraineeHomeView> {
  const { data } = await traineeViewsControllerDashboard({ client: api, throwOnError: true });
  return data;
}
