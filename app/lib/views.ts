import {
  traineeViewsControllerNavigation,
  trainerViewsControllerDashboard,
  trainerViewsControllerNavigation,
} from "@kalisthenos/api-client";
import type { TraineeNavView, TrainerHomeView, TrainerNavView } from "@kalisthenos/api-client";
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
 * Pulpit trenera: klienci, ostatnie treningi, liczniki. Do czasu przepięcia
 * obszaru dziennika pulpit czyta stąd wyłącznie `activePlans` i `drafts`, a resztę
 * nadal z bazy — cena jednego pełnego widoku za dwie liczby, przyjęta świadomie,
 * bo dziennik jest następny w kolejce i zdejmie ją, biorąc pozostałe pola stąd.
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
