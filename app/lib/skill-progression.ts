import {
  mySkillProgressControllerMine,
  traineeSkillProgressControllerAdvance,
  traineeSkillProgressControllerForTrainee,
  traineeSkillProgressControllerStart,
} from "@kalisthenos/api-client";
import type { SkillProgressItem, SkillVariationView } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
import { toSkillError } from "~/lib/skills";

// Kształty dla tras — bez importu pakietu kontraktu poza `app/lib` (patrz `skills.ts`).
export type {
  AdvancementView,
  SkillProgressItem,
  SkillVariationView,
} from "@kalisthenos/api-client";

// ============================================================
// Mapa postępu — kontrakt rozdziela trasy, więc jedna dawna funkcja to dwie
// ============================================================

/**
 * Własna mapa postępu podopiecznego (`GET /v1/me/skill-progress`): każda aktywna
 * umiejętność trenera z drabiną wariantów, bieżącym poziomem, datą ostatniego
 * awansu i historią zdarzeń. Docblok kontraktu: „to samo, co widzi trener, bez
 * sugestii awansu". Cztery pola dawnego `SkillMapEntry` zniknęły z kształtu:
 * `isCurrent` na wariancie i `currentExerciseId` wyprowadza `currentVariationOf`,
 * `currentHasLogs` zastąpiło `| null` szczegółu progresji (`404` = brak logów,
 * stan normalny), a `suggestion` jest luką L S1-1 — kontrakt nie niesie żadnego
 * z sygnałów, na których stała (liczba sesji na bieżącym wariancie, status,
 * „łatwiej przy tych samych powtórzeniach", stagnacja, ostatnie RPE), więc
 * moduł przestał ją liczyć zamiast składać ją z N wywołań progresji.
 */
export async function loadMySkillMap(api: Api): Promise<SkillProgressItem[]> {
  const { data } = await mySkillProgressControllerMine({ client: api, throwOnError: true });
  return data;
}

/**
 * Mapa podopiecznego oglądana przez trenera — ten sam kształt. Cudzy
 * podopieczny to `404`, które leci dalej jako `ApiError` (bez `| null`):
 * trasa trenera pyta o parę wcześniej (`findTraineeRef` z `trainees.ts`) i to
 * ona decyduje o `404` z nazwą do nagłówka.
 */
export async function loadTraineeSkillMap(
  api: Api,
  traineeId: string,
): Promise<SkillProgressItem[]> {
  const { data } = await traineeSkillProgressControllerForTrainee({
    client: api,
    path: { traineeId },
    throwOnError: true,
  });
  return data;
}

/**
 * Bieżący wariant wpisu mapy. Kontrakt trzyma bieżący poziom na WPISIE
 * (`currentVariationId`), nie flagą per wariant — trasy potrzebują z niego
 * `exerciseId` (wykres bieżącego wariantu) i `ordinal`; jedno miejsce zamiast
 * `find` powtarzanego w dwóch loaderach i dwóch komponentach.
 */
export function currentVariationOf(entry: SkillProgressItem): SkillVariationView | null {
  if (entry.currentVariationId == null) return null;
  return entry.variations.find((v) => v.id === entry.currentVariationId) ?? null;
}

// ============================================================
// Zdarzenia awansu — wyłącznie trener, wyłącznie na parze
// ============================================================

/**
 * Poziom startowy (`POST …/starting-level`). Dozwolony RAZ: drugie ustalenie to
 * `409 SKILL_PROGRESS_ALREADY_STARTED` — reguła, której FE nie miał (drugi
 * „poziom startowy" wchodził jako kolejne zdarzenie z `from = null`).
 * Przynależność wariantu do umiejętności, podopiecznego do pary i stan
 * umiejętności (`409 SKILL_ARCHIVED`) sprawdza BE; `trainerId`/`advancedBy`
 * wyprowadza z tokenu. `note` jest polem DTO (nullable), więc idzie zawsze.
 */
export async function setStartingLevel(
  api: Api,
  traineeId: string,
  skillId: string,
  toVariationId: string,
  advancedOn: string,
  note: string | null,
): Promise<void> {
  try {
    await traineeSkillProgressControllerStart({
      client: api,
      path: { traineeId, skillId },
      body: { toVariationId, advancedOn, note },
      throwOnError: true,
    });
  } catch (e) {
    toSkillError(e);
  }
}

/**
 * Awans albo cofnięcie jako NOWE zdarzenie (`POST …/advancements`). „Bez poziomu
 * startowego" i „awans na poziom bieżący" to `409` z BE — dawne `currentLevelFromEvents`
 * przed insertem zniknęło z tego modułu. `from` wylicza BE z bieżącego poziomu;
 * `AdvancementDto` nie ma tego pola, więc FE go nie wysyła.
 */
export async function recordAdvancement(
  api: Api,
  traineeId: string,
  skillId: string,
  toVariationId: string,
  advancedOn: string,
  note: string | null,
): Promise<void> {
  try {
    await traineeSkillProgressControllerAdvance({
      client: api,
      path: { traineeId, skillId },
      body: { toVariationId, advancedOn, note },
      throwOnError: true,
    });
  } catch (e) {
    toSkillError(e);
  }
}
