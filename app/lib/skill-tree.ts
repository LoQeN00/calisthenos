import {
  traineeDevelopmentByTrainerControllerForTrainee,
  traineeDevelopmentControllerOwn,
} from "@kalisthenos/api-client";
import type { DevelopmentView, SkillTreeNodeView, SkillTreeView } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";

// Kształty dla tras i komponentów — bez importu pakietu kontraktu poza `app/lib`
// (patrz `skills.ts`).
export type {
  DevelopmentView,
  ProgressionListItemView,
  ProgressionListView,
  SkillTreeEdgeView,
  SkillTreeSummaryView,
} from "@kalisthenos/api-client";

/**
 * Nazwy, pod którymi `components/skill-tree.tsx` zna drzewo. Kształt jest
 * kontraktu: `state` węzła jest od teraz WYMAGANE (do integracji było
 * opcjonalne, bo istniał jeszcze widok autora bez stanów — `getSkillTreeForTrainer`
 * — którego żadna trasa nie wołała), a krawędź `{ from, requires }` to ta sama
 * para, którą zna `skill-tree-math`.
 */
export type SkillTree = SkillTreeView;
export type TreeNode = SkillTreeNodeView;

export type DevelopmentSort = "recent" | "attention";

export interface DevelopmentQuery {
  sort: DevelopmentSort;
  /** `all` / puste / brak = bez zawężenia; wtedy parametr nie idzie do kontraktu. */
  tag?: string;
}

/**
 * Sortowanie z zakładkowalnego adresu (`?sort=`) na wartość kontraktu, z domyślną
 * PER ROLĘ — trener domyślnie ogląda „wymaga uwagi", podopieczny „ostatnio
 * trenowane" — bo kontrakt zna tylko jedną domyślną (`recent`), a trasa musi
 * wysłać sortowanie JAWNIE zanim zbuduje kontrolki: opcje tagów przychodzą
 * dopiero z odpowiedzią. Wartości są identyczne z kontraktem, więc bez słownika.
 */
export function developmentSortFrom(
  raw: string | null,
  fallback: DevelopmentSort,
): DevelopmentSort {
  return raw === "recent" || raw === "attention" ? raw : fallback;
}

function developmentQuery(opts: DevelopmentQuery) {
  return {
    sort: opts.sort,
    // `all` to BRAK parametru (wzorzec `status` w planach): kontrakt zawęża
    // wyłącznie do jednego tagu, a nieznaną wartość ignoruje sam (`docs/04` §5),
    // więc to, co BE zastosował, zgadza się z tym, co `parseListControls` pokaże.
    // Rozłożone warunkowo: klucz z `undefined` i brak klucza to dla serializatora
    // zapytań dwie różne rzeczy.
    ...(opts.tag != null && opts.tag !== "" && opts.tag !== "all" ? { tag: opts.tag } : {}),
  };
}

/**
 * Cały ekran Rozwoju jednym wywołaniem (`GET /v1/me/development`): drzewo ze
 * stanami węzłów policzonymi po tamtej stronie (porządek topologiczny, `mastered`
 * prereków — dawne `nodeState`/`topoOrder` w tym module), nagłówek `summary`
 * oraz lista „pozostałych ćwiczeń" już posortowana i przefiltrowana, z
 * `tagOptions` do kontrolek. Ćwiczenia będące wariantem AKTYWNEJ umiejętności
 * nie wchodzą na listę — robi to BE, więc `listExerciseSkillMap` z `skills.ts`
 * i `excludeByExerciseId` w trasie zniknęły. Bez stronicowania (zasób nie ma
 * rozmiaru strony w `docs/01`).
 */
export async function loadMyDevelopment(
  api: Api,
  opts: DevelopmentQuery,
): Promise<DevelopmentView> {
  const { data } = await traineeDevelopmentControllerOwn({
    client: api,
    query: developmentQuery(opts),
    throwOnError: true,
  });
  return data;
}

/**
 * To samo dla wskazanego podopiecznego. Cudzy podopieczny to `404`, które leci
 * dalej jako `ApiError` (bez `| null`) — trasa trenera pyta o parę wcześniej
 * (`findTraineeRef` z `trainees.ts`) i to ona oddaje `404` z nazwą do nagłówka.
 */
export async function loadTraineeDevelopment(
  api: Api,
  traineeId: string,
  opts: DevelopmentQuery,
): Promise<DevelopmentView> {
  const { data } = await traineeDevelopmentByTrainerControllerForTrainee({
    client: api,
    path: { traineeId },
    query: developmentQuery(opts),
    throwOnError: true,
  });
  return data;
}
