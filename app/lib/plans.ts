import {
  plansControllerCreate,
  plansControllerDetail,
  plansControllerDraft,
  plansControllerList,
  plansControllerPublish,
  plansControllerRemove,
  plansControllerSave,
  traineePlansControllerTraineePlans,
} from "@kalisthenos/api-client";
import type {
  PlanDeletedView,
  PlanDetailView,
  PlanListPage,
  SavePlanDto,
  TraineePlanItemView,
} from "@kalisthenos/api-client";
import { orNull } from "~/lib/api/client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";
import type { PlanForm } from "~/lib/plan-types";

/**
 * Własny typ błędu obszaru, bo trasy pokazują `userMessage` w formularzu albo
 * w pasku akcji (precedens: `CategoryError`, `ExerciseError`). Źródłem
 * `userMessage` jest `message` z koperty BE — po polsku i dla użytkownika.
 */
export class PlanError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

// ---------------- Reads ----------------

/**
 * Pełne drzewo planu z nazwą podopiecznego i nazwami ćwiczeń, `draftId` pary
 * i `editable` wyliczonym ze stanu (`docs/03` „Plan — edytor"). Cudzy plan jest
 * nieodróżnialny od nieistniejącego — `404`, tu `null`.
 */
export async function loadPlanForTrainer(api: Api, planId: string): Promise<PlanDetailView | null> {
  return await orNull(
    plansControllerDetail({ client: api, path: { id: planId }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
}

export type PlanSort = "newest" | "oldest" | "name_asc" | "published";
export type PlanStatusFilter = "all" | "active" | "draft";

export interface PlanListFilter {
  status: PlanStatusFilter;
  q?: string;
}

/**
 * Jedno żądanie zamiast trzech: kontrakt oddaje stronę RAZEM z `total` i z
 * licznikami zakładek `counts` — policzonymi niezależnie od `status` i `q`,
 * zawsze bez zarchiwizowanych (`docs/04` §Plany) — więc `countPlansForTrainer`
 * i `countPlansByStatusForTrainer` znikają bez zamiennika. Stronę spoza zakresu
 * przycina BE (`paginate`), dokładnie tak, jak robiła to `safePage` w trasie.
 *
 * Wartości `sort` są w kontrakcie DOKŁADNIE te, które stoją w zakładkowalnych
 * adresach list, więc — inaczej niż w ćwiczeniach — nie ma tu słownika.
 * Szukajka `q` obejmuje po tamtej stronie nazwę planu ALBO nazwę podopiecznego,
 * tak jak dotychczasowy `innerJoin` na `users`.
 */
export async function listPlansForTrainer(
  api: Api,
  opts: PlanListFilter & { sort: PlanSort; page: number },
): Promise<PlanListPage> {
  const { data } = await plansControllerList({
    client: api,
    query: {
      page: opts.page,
      sort: opts.sort,
      // `all` to BRAK parametru: lista i tak nigdy nie niesie zarchiwizowanych,
      // a `status` w kontrakcie zawęża wyłącznie do jednego stanu.
      ...(opts.status !== "all" ? { status: opts.status } : {}),
      // Rozłożone warunkowo, nie przez `q: opts.q`: klucz z wartością `undefined`
      // i BRAK klucza to dla serializatora zapytań dwie różne rzeczy, a puste
      // `q=` znaczy w kontrakcie „szukaj pustego łańcucha", nie „bez filtra".
      ...(opts.q != null && opts.q.length > 0 ? { q: opts.q } : {}),
    },
    throwOnError: true,
  });
  return data;
}

/**
 * Wszystkie plany pary, łącznie z zarchiwizowanymi, malejąco po numerze wersji
 * (`docs/04`: bez stronicowania — zasób nie ma rozmiaru strony). Cudzy
 * podopieczny daje PUSTĄ listę, nie `404` — tak zdecydował kontrakt.
 */
export async function listPlansForTrainee(
  api: Api,
  traineeId: string,
): Promise<TraineePlanItemView[]> {
  const { data } = await traineePlansControllerTraineePlans({
    client: api,
    path: { traineeId },
    throwOnError: true,
  });
  return data;
}

/**
 * Jedyne miejsce, które pyta o szkic pary bez szczegółu planu pod ręką, to
 * odbicie w loaderze `plany.nowy.tsx` przy `?traineeId=`. Edytor bierze szkic
 * z `PlanDetailView.draftId`, a tworzenie — z `409 PLAN_DRAFT_EXISTS`.
 */
export async function findDraftForTrainee(
  api: Api,
  traineeId: string,
): Promise<TraineePlanItemView | null> {
  const plans = await listPlansForTrainee(api, traineeId);
  return plans.find((p) => p.status === "draft") ?? null;
}

// ---------------- Writes ----------------

export interface CreateBlankPlanInput {
  traineeId: string;
  name: string;
}

export interface CreatePlanResult {
  id: string;
  /** `false`, gdy para miała już szkic — `id` wskazuje wtedy ten istniejący. */
  created: boolean;
}

/**
 * Pusty szkic dla podopiecznego. „Jeden szkic na parę" pilnuje unikat po stronie
 * BE: `409 PLAN_DRAFT_EXISTS` niesie w `details.planId` istniejący szkic (`docs/04`:
 * „odpowiedź wskazuje istniejący"), więc nie ma pre-checku i nie ma wyścigu.
 * Funkcja o nazwie „utwórz" oddająca cudzy identyfikator bez słowa wprowadzałaby
 * w błąd — stąd `created` w wyniku.
 */
export async function createBlankPlan(
  api: Api,
  input: CreateBlankPlanInput,
): Promise<CreatePlanResult> {
  try {
    const { data } = await plansControllerCreate({
      client: api,
      body: { traineeId: input.traineeId, name: input.name },
      throwOnError: true,
    });
    return { id: data.id, created: true };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.code === "PLAN_DRAFT_EXISTS") {
      const existingId = e.details?.planId;
      if (typeof existingId === "string") return { id: existingId, created: false };
    }
    // Cudzy/nieistniejący podopieczny (`404`) i każdy inny `409` (np.
    // `PLAN_DRAFT_EXISTS` bez `details.planId` — BE go zawsze niesie, ale odmowa
    // bez wskazania i tak ma zostać zdaniem w formularzu, nie ekranem błędu) —
    // do formularza, komunikatem BE.
    if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
      throw new PlanError(e.code, e.message);
    }
    throw e;
  }
}

/**
 * Formularz edytora → `SavePlanDto`. Trzy rzeczy, które do integracji robił
 * `saveDraftPlan` w transakcji:
 * 1. zdejmuje `id` sesji, bloków i pozycji — BE ma `forbidNonWhitelisted: true`,
 *    więc pole spoza DTO to `400`; a `PlanForm` jest strukturalnie szerszy niż
 *    DTO, więc TypeScript nadmiaru nie zgłosi;
 * 2. normalizuje tempo per rodzaj bloku: dropset niesie `sets`/`restSeconds` na
 *    bloku, a pozycje mają `null`; single/superset odwrotnie;
 * 3. `undefined` → `null`, bo `PlanItemDto` WYMAGA kluczy `sets`, `restSeconds`,
 *    `note` (nullable, nie opcjonalne).
 */
export function toSavePlanDto(form: PlanForm): SavePlanDto {
  return {
    name: form.name,
    sessions: form.sessions.map((session) => ({
      name: session.name,
      blocks: session.blocks.map((block) => {
        const isDropset = block.kind === "dropset";
        return {
          kind: block.kind,
          sets: isDropset ? (block.sets ?? null) : null,
          restSeconds: isDropset ? (block.restSeconds ?? null) : null,
          items: block.items.map((item) => ({
            exerciseId: item.exerciseId,
            reps: item.reps,
            unit: item.unit,
            sets: isDropset ? null : (item.sets ?? null),
            restSeconds: isDropset ? null : (item.restSeconds ?? null),
            note: item.note ?? null,
          })),
        };
      }),
    })),
  };
}

/**
 * Wąski `catch` zapisów edytora. Trasa pokazuje `userMessage` w formularzu, więc
 * własny typ dostają: `400` (reguły drzewa po stronie BE — Zod stoi pierwszy,
 * ale tamte bywają ostrzejsze), `404` (plan albo ćwiczenie spoza biblioteki —
 * §2 `docs/04` rozciąga „cudzy = nieistniejący" na identyfikatory w ciele) oraz
 * `409` (nie szkic, pusty plan, pusta sesja, nie aktywny). Reszta leci dalej.
 */
function toPlanError(e: unknown): never {
  if (e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 409)) {
    throw new PlanError(e.code, e.message);
  }
  throw e;
}

/**
 * Zapis całego drzewa szkicu — wipe & rewrite po stronie BE, identyfikatory sesji
 * nadawane od nowa. Dozwolone wyłącznie dla `draft` (`409 PLAN_NOT_DRAFT`).
 * Zakres tenanta ćwiczeń w drzewie sprawdza BE (`404`), nie ten moduł.
 */
export async function saveDraftPlan(api: Api, planId: string, form: PlanForm): Promise<void> {
  try {
    await plansControllerSave({
      client: api,
      path: { id: planId },
      body: toSavePlanDto(form),
      throwOnError: true,
    });
  } catch (e) {
    toPlanError(e);
  }
}

export interface DraftResult {
  id: string;
  /** `false`, gdy para miała już szkic — BE oddał go zamiast tworzyć drugi. */
  created: boolean;
}

/**
 * Głęboka kopia planu aktywnego jako nowy szkic. BE sprawdza po kolei: cudzy →
 * `404`; para ma szkic → `200` z istniejącym; źródło nie `active` → `409
 * PLAN_NOT_ACTIVE`. Jedno wywołanie zastępuje więc dawną dwuetapową sekwencję
 * „sprawdź, czy para ma już szkic" + „sklonuj z aktywnego"; `created` czyta się
 * z kodu odpowiedzi.
 */
export async function createDraftFromActive(api: Api, sourcePlanId: string): Promise<DraftResult> {
  try {
    const { data, response } = await plansControllerDraft({
      client: api,
      path: { id: sourcePlanId },
      throwOnError: true,
    });
    return { id: data.id, created: response.status === 201 };
  } catch (e) {
    return toPlanError(e);
  }
}

/**
 * Publikacja szkicu; poprzedni aktywny trafia do archiwum atomowo po stronie BE.
 * BE odmawia planowi bez sesji i z pustą sesją (`PLAN_EMPTY`, `PLAN_SESSION_EMPTY`)
 * — reguła, której FE nie miał; komunikat idzie do formularza jak każdy `409`.
 */
export async function publishPlan(api: Api, planId: string): Promise<void> {
  try {
    await plansControllerPublish({ client: api, path: { id: planId }, throwOnError: true });
  } catch (e) {
    toPlanError(e);
  }
}

export type PlanDeleteOutcome = PlanDeletedView["outcome"];

/**
 * Komunikat sukcesu usuwania — w module, nie w trasach: dwie trasy pokazują
 * to samo zdanie, a treść komunikatów tego obszaru mieszka już tutaj
 * (`PlanError.userMessage`). Zwraca napis, nie kształt danych akcji, żeby moduł
 * nie znał tras.
 */
export function planDeleteOutcomeMessage(outcome: PlanDeleteOutcome): string {
  return outcome === "deleted"
    ? "Plan usunięty."
    : "Plan zarchiwizowany — historia treningów została zachowana.";
}

/**
 * O wyniku decydują logi, nie status (`docs/04` §Plany): plan bez logów znika
 * trwale, plan z logami trafia do archiwum. Liczby logów kontrakt nie oddaje,
 * więc komunikat trasy przestał ją nieść. Plan już zarchiwizowany, mający logi,
 * daje `409 PLAN_NOT_ARCHIVABLE`. Wyścig z równolegle dopisanym treningiem jest
 * od teraz sprawą BE — dotychczasowe dopasowanie po nazwie constraintu FK znika.
 */
export async function deletePlan(api: Api, planId: string): Promise<PlanDeleteOutcome> {
  try {
    const { data } = await plansControllerRemove({
      client: api,
      path: { id: planId },
      throwOnError: true,
    });
    return data.outcome;
  } catch (e) {
    // Wąsko: trasa pokazuje `userMessage` w pasku akcji, więc własny typ dostają
    // wyłącznie odmowy z treścią dla użytkownika. Awaria BE ma zostać awarią.
    if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
      throw new PlanError(e.code, e.message);
    }
    throw e;
  }
}
