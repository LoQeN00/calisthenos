import {
  featureRequestsControllerGet,
  featureRequestsControllerList,
  featureRequestsControllerRespond,
  myFeatureRequestsControllerCreate,
  myFeatureRequestsControllerList,
  myFeatureRequestsControllerRemove,
} from "@kalisthenos/api-client";
import type {
  FeatureRequestPage,
  FeatureRequestView,
  TrainerFeatureRequestPage,
  TrainerFeatureRequestView,
} from "@kalisthenos/api-client";
import { orNull } from "~/lib/api/client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";
import type { FeatureRequestKind, FeatureRequestStatus } from "~/lib/feature-request-types";

/**
 * Zgłoszenia podopiecznych („Pomysły") — w całości na kontrakcie. Zgłoszenie
 * jest PRYWATNE w parze: czyta je autor (`/v1/me/feature-requests`) i jego
 * trener (`/v1/feature-requests`). Kontrakt rozdziela te dwie perspektywy
 * trasami, więc moduł ma po dwie funkcje tam, gdzie do integracji miał jedną
 * z filtrem tenanta w `WHERE`. Samego filtra nie ma już w żadnej sygnaturze:
 * zakres niesie token dostępowy, egzekwuje go BE, a cudze zgłoszenie jest po
 * tamtej stronie nieodróżnialne od nieistniejącego (`404`).
 */

export type {
  FeatureRequestPage,
  FeatureRequestView,
  TrainerFeatureRequestPage,
  TrainerFeatureRequestView,
} from "@kalisthenos/api-client";

/**
 * Własny typ błędu obszaru, bo trasy pokazują `userMessage` w formularzu
 * (precedens: `PlanError`, `CategoryError`). Źródłem `userMessage` jest
 * `message` z koperty BE — po polsku i dla użytkownika.
 */
export class FeatureRequestError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * Wartości identyczne z kontraktem (`newest` domyślnie · `oldest`) i z
 * zakładkowalnym adresem listy, więc — jak w planach — słownika nie ma.
 */
export type FeatureRequestSort = "newest" | "oldest";
export type FeatureRequestStatusFilter = FeatureRequestStatus | "all";
export type FeatureRequestKindFilter = FeatureRequestKind | "all";

export interface TraineeRequestListOpts {
  page: number;
  sort: FeatureRequestSort;
  /** `all` (albo brak) to BRAK parametru — kontrakt zawęża wyłącznie do jednego stanu. */
  status?: FeatureRequestStatusFilter;
}

export interface TrainerRequestListOpts extends TraineeRequestListOpts {
  kind?: FeatureRequestKindFilter;
  /** Szukajka po tytule, treści i nazwie autora — escapowanie `%`/`_` robi BE. */
  q?: string;
}

/**
 * Obie listy biorą ten sam zestaw parametrów (`docs/04` §Zgłoszenia), więc jeden
 * budowniczy zapytania. Rozłożone warunkowo, nie przez `status: opts.status`:
 * klucz z wartością `undefined` i BRAK klucza to dla serializatora zapytań dwie
 * różne rzeczy, a `status=all` kontrakt zignorowałby jako nieznaną wartość.
 * Puste `q=` znaczy „szukaj pustego łańcucha", nie „bez filtra".
 */
function listQuery(opts: TrainerRequestListOpts) {
  return {
    page: opts.page,
    sort: opts.sort,
    ...(opts.status != null && opts.status !== "all" ? { status: opts.status } : {}),
    ...(opts.kind != null && opts.kind !== "all" ? { kind: opts.kind } : {}),
    ...(opts.q != null && opts.q.length > 0 ? { q: opts.q } : {}),
  };
}

// ---------------- Podopieczny (autor) ----------------

/**
 * Własne zgłoszenia z odpowiedziami trenera — cała strona z kontraktu (20/stronę,
 * `total` i `totalPages` razem z listą; stronę spoza zakresu przycina BE), więc
 * dawna para `listForTrainee` + `countForTrainee` to dziś jedno żądanie, a licznik
 * nawigacji bierze się z `TraineeNavView.featureRequests` (`views.ts`).
 * Wiersze są BEZ autora — autorem każdego jest pytający.
 */
export async function listForTrainee(
  api: Api,
  opts: TraineeRequestListOpts,
): Promise<FeatureRequestPage> {
  const { data } = await myFeatureRequestsControllerList({
    client: api,
    query: listQuery(opts),
    throwOnError: true,
  });
  return data;
}

export interface CreateFeatureRequestInput {
  kind: FeatureRequestKind;
  title: string;
  body: string;
}

/**
 * Trener wynika z konta autora, NIGDY z ładunku (`docs/04`) — stąd w ciele
 * wyłącznie trzy pola formularza, składane jawnie: BE odrzuca pola spoza DTO.
 * `400` dostaje własny typ, bo Zod w trasie stoi pierwszy, ale reguły po tamtej
 * stronie bywają ostrzejsze, a jedno zdanie w formularzu jest lepsze niż
 * granica błędu. Reszta leci dalej — awaria BE ma zostać awarią.
 */
export async function createFeatureRequest(
  api: Api,
  input: CreateFeatureRequestInput,
): Promise<FeatureRequestView> {
  try {
    const { data } = await myFeatureRequestsControllerCreate({
      client: api,
      body: { kind: input.kind, title: input.title, body: input.body },
      throwOnError: true,
    });
    return data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      throw new FeatureRequestError(e.code, e.message);
    }
    throw e;
  }
}

/**
 * Wycofanie WŁASNEGO zgłoszenia, dopóki ma status `new`. Warunek stanu jest
 * częścią `DELETE` po stronie BE (nie sprawdzeniem po odczycie), więc trener
 * odpowiadający w tej samej chwili nie przegrywa wyścigu — tak jak do integracji.
 *
 * Zero usuniętych wierszy BE oddaje jako `404`, nie `409`: „nie istnieje, cudze
 * albo już nie `new`" wygląda tam jednakowo, bo rozróżnienie zdradzałoby
 * istnienie zasobu. Trasa pokazuje `userMessage` przy liście, więc `404` dostaje
 * własny typ — ekran błędu za kliknięcie w nieaktualny przycisk byłby gorszy niż
 * zdanie. `409` obok na wypadek, gdyby kontrakt kiedyś nazwał tę odmowę osobno.
 */
export async function deleteFeatureRequest(api: Api, id: string): Promise<void> {
  try {
    await myFeatureRequestsControllerRemove({ client: api, path: { id }, throwOnError: true });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
      throw new FeatureRequestError(e.code, e.message);
    }
    throw e;
  }
}

// ---------------- Trener (skrzynka) ----------------

/**
 * Skrzynka wszystkich podopiecznych, każdy wiersz z autorem (`authorId`,
 * `authorName`) — dawny `innerJoin` na `users` przeszedł na drugą stronę razem
 * z szukajką po tytule, treści i nazwie autora. Cała strona z kontraktu, więc
 * `countForTrainer` zniknęło bez zamiennika.
 */
export async function listForTrainer(
  api: Api,
  opts: TrainerRequestListOpts,
): Promise<TrainerFeatureRequestPage> {
  const { data } = await featureRequestsControllerList({
    client: api,
    query: listQuery(opts),
    throwOnError: true,
  });
  return data;
}

/**
 * Szczegół z autorem. `| null` w sygnaturze mapuje `404` przez `orNull` —
 * cudze zgłoszenie jest po tamtej stronie nieodróżnialne od nieistniejącego,
 * a trasa robi z `null` własne `404`, jak do integracji.
 */
export async function getForTrainer(
  api: Api,
  id: string,
): Promise<TrainerFeatureRequestView | null> {
  return await orNull(
    featureRequestsControllerGet({ client: api, path: { id }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
}

export interface RespondToFeatureRequestInput {
  id: string;
  status: FeatureRequestStatus;
  /** `null` = skasuj odpowiedź. */
  response: string | null;
}

/**
 * Ustala stan i odpowiedź. Datę odpowiedzi stempluje BE — wyłącznie przy
 * niepustej treści, a pusta kasuje treść RAZEM z datą (`docs/04`): FE nie
 * stempluje nic samo. `null` z formularza to BRAK klucza `response` w ciele
 * (DTO zna wyłącznie `string`), nie `null` — to ta sama różnica, co przy
 * `demoFileId` w ćwiczeniach. `400` dostaje własny typ dla formularza; cudze
 * albo nieistniejące zgłoszenie (`404`) leci dalej — trasa robi z niego `404`,
 * tak jak do integracji robiła z pustego `UPDATE`.
 */
export async function respondToFeatureRequest(
  api: Api,
  input: RespondToFeatureRequestInput,
): Promise<TrainerFeatureRequestView> {
  try {
    const { data } = await featureRequestsControllerRespond({
      client: api,
      path: { id: input.id },
      body: {
        status: input.status,
        ...(input.response != null ? { response: input.response } : {}),
      },
      throwOnError: true,
    });
    return data;
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      throw new FeatureRequestError(e.code, e.message);
    }
    throw e;
  }
}
