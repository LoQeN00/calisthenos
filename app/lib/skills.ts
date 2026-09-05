import {
  skillsControllerArchive,
  skillsControllerById,
  skillsControllerCreate,
  skillsControllerCreatePrerequisite,
  skillsControllerCreateVariation,
  skillsControllerDeletePrerequisite,
  skillsControllerDeleteVariation,
  skillsControllerList,
  skillsControllerPutOrder,
  skillsControllerUpdate,
} from "@kalisthenos/api-client";
import type {
  CreatedSkillView,
  SkillDetailView,
  SkillListGroup,
  UpdatedSkillView,
} from "@kalisthenos/api-client";
import { orNull } from "~/lib/api/client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";
import type { SkillTier } from "~/lib/skill-tier";

// Kształty, które czytają trasy i komponenty, wychodzą stąd, nie z pakietu
// kontraktu: trasa nie ma wiedzieć, skąd biorą się dane (ten sam szew, który
// pilnuje `no-direct-db`), więc nie importuje `@kalisthenos/api-client` wprost.
export type {
  AssignableExerciseView,
  SkillDetailView,
  SkillListGroup,
  SkillListItem,
  SkillRefView,
  SkillVariationView,
  TierConflictView,
} from "@kalisthenos/api-client";

/**
 * Własny typ błędu obszaru, bo trasy pokazują `userMessage` w formularzu edytora
 * i przy awansach (precedens: `PlanError`, `ExerciseError`). Źródłem
 * `userMessage` jest `message` z koperty BE — po polsku i dla użytkownika.
 * Dawne zdania składane w FE („Umiejętność o tej nazwie już istnieje.",
 * „To połączenie utworzyłoby cykl w drzewie.") należą teraz do BE.
 */
export class SkillError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * Wąski `catch` zapisów edytora i awansów — wspólny dla `skills.ts`
 * i `skill-progression.ts`. Trasa pokazuje `userMessage` w formularzu, więc
 * własny typ dostają: `400` (DTO — Zod stoi pierwszy, ale reguły BE bywają
 * ostrzejsze, np. lista kolejności niezgodna z drabiną), `404` (umiejętność,
 * wariant, prerekwizyt albo ćwiczenie z ciała spoza tenanta — §2 `docs/04`
 * rozciąga „cudzy = nieistniejący" na identyfikatory w ciele; do integracji
 * te przypadki były zdaniem w formularzu, nie ekranem błędu) oraz `409`
 * (niezmienniki: cykl, prerekwizyt o wyższym stopniu, ćwiczenie już wariantem
 * albo zarchiwizowane, wariant użyty w historii awansów, drugi poziom startowy,
 * awans na poziom bieżący). Reszta leci dalej — awaria BE ma zostać awarią.
 */
export function toSkillError(e: unknown): never {
  if (e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 409)) {
    throw new SkillError(e.code, e.message);
  }
  throw e;
}

// ---------------- Reads ----------------

/**
 * Aktywne umiejętności trenera POGRUPOWANE po stopniu (`docs/04` §Umiejętności —
 * definicje), bez stronicowania, każda z liczbą wariantów. Kontrakt nie ma
 * sortowania ani filtra stopnia, więc obie kontrolki listy zostają w trasie —
 * lista i tak przychodzi w całości, a słownik „dla symetrii" byłby zmyślony.
 * `tier` stoi na grupie, nie na pozycji: dawny płaski `SkillListRow` zniknął.
 */
export async function listSkillsForTrainer(api: Api): Promise<SkillListGroup[]> {
  const { data } = await skillsControllerList({ client: api, throwOnError: true });
  return data;
}

/**
 * Szczegół do edytora — RAZEM z listami pomocniczymi: prerekwizyty, kandydaci
 * na prerekwizyt (liczeni po tamtej stronie „tą samą regułą, którą waliduje
 * dodanie" — docblok kontraktu, więc picker nie proponuje niczego, co akcja
 * odrzuci), konflikty stopni powstałe przez późniejszą zmianę stopnia oraz
 * ćwiczenia wolne do przypięcia jako wariant. Cztery dawne funkcje
 * (`listPrerequisitesForSkill`, `listAssignablePrerequisites`,
 * `listConflictingPrerequisites`, `listAssignableExercises`) są polami tej
 * odpowiedzi — jedno wywołanie zamiast pięciu. Nazwa została dla wołających;
 * `| null` w sygnaturze mapuje `404` przez `orNull` (cudza umiejętność jest
 * nieodróżnialna od nieistniejącej).
 */
export async function getSkillWithVariations(
  api: Api,
  skillId: string,
): Promise<SkillDetailView | null> {
  return await orNull(
    skillsControllerById({ client: api, path: { id: skillId }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
}

// ---------------- Writes ----------------

/**
 * Unikat nazwy w obrębie trenera pilnuje BE — do integracji był to kod
 * Postgresa łapany po nazwie indeksu `skills_trainer_name_uniq`; teraz to `409`
 * z komunikatem z koperty. Ciało składane jawnie pole po polu: BE odrzuca pola
 * spoza DTO, a `trainerId` nie jest już żadnym z nich.
 */
export async function createSkill(
  api: Api,
  name: string,
  description: string,
  tier: SkillTier,
): Promise<CreatedSkillView> {
  try {
    const { data } = await skillsControllerCreate({
      client: api,
      body: { name, description, tier },
      throwOnError: true,
    });
    return data;
  } catch (e) {
    return toSkillError(e);
  }
}

/**
 * `PATCH` jest tu PEŁNYM zastąpieniem: wszystkie trzy pola wymagane, pominięte
 * daje `400` (`docs/04`) — inaczej niż `PATCH /v1/exercises/{id}`. Zmiana stopnia
 * celowo nie jest blokowana przy istniejących krawędziach (spec §6.2 — tak samo
 * jak dotychczas); konflikty wracają w odpowiedzi i tak samo w szczególe, skąd
 * czyta je ostrzeżenie edytora.
 */
export async function updateSkill(
  api: Api,
  skillId: string,
  name: string,
  description: string,
  tier: SkillTier,
): Promise<UpdatedSkillView> {
  try {
    const { data } = await skillsControllerUpdate({
      client: api,
      path: { id: skillId },
      body: { name, description, tier },
      throwOnError: true,
    });
    return data;
  } catch (e) {
    return toSkillError(e);
  }
}

/**
 * Archiwizacja czyści krawędzie prerekwizytów po stronie BE (docblok kontraktu)
 * — dawna transakcja z `DELETE skill_prerequisites` w tym module zniknęła.
 * Historia awansów podopiecznych zostaje.
 */
export async function archiveSkill(api: Api, skillId: string): Promise<void> {
  try {
    await skillsControllerArchive({ client: api, path: { id: skillId }, throwOnError: true });
  } catch (e) {
    toSkillError(e);
  }
}

/**
 * Dołącza ćwiczenie na koniec drabiny. Własność ćwiczenia, jego stan
 * (zarchiwizowane → `409`) i unikat „ćwiczenie jest wariantem jednej
 * umiejętności" (`409`) są regułami BE — picker w szczególe pokazuje wyłącznie
 * wolne i aktywne, ale POST wprost trafia na te same sprawdzenia. Wyścig na
 * `ordinal` przestał być sprawą FE.
 */
export async function addVariation(api: Api, skillId: string, exerciseId: string): Promise<void> {
  try {
    await skillsControllerCreateVariation({
      client: api,
      path: { id: skillId },
      body: { exerciseId },
      throwOnError: true,
    });
  } catch (e) {
    toSkillError(e);
  }
}

/**
 * Usuwa wariant; przepakowanie kolejności bez dziur robi BE. `409`, gdy istnieją
 * zdarzenia awansu wskazujące ten wariant — dawniej FE dopisywał do tego zdania
 * „Zarchiwizuj umiejętność zamiast tego", teraz treść należy do koperty BE.
 */
export async function removeVariation(
  api: Api,
  skillId: string,
  variationId: string,
): Promise<void> {
  try {
    await skillsControllerDeleteVariation({
      client: api,
      path: { id: skillId, variationId },
      throwOnError: true,
    });
  } catch (e) {
    toSkillError(e);
  }
}

/**
 * Ustala kolejność drabiny wg listy identyfikatorów. Lista musi zawierać
 * DOKŁADNIE bieżące warianty — porównanie zbiorów i dwufazową zmianę ordinali
 * (obejście `UNIQUE(skill_id, ordinal)`) trzyma teraz BE.
 */
export async function reorderVariations(
  api: Api,
  skillId: string,
  variationIds: string[],
): Promise<void> {
  try {
    await skillsControllerPutOrder({
      client: api,
      path: { id: skillId },
      body: { order: variationIds },
      throwOnError: true,
    });
  } catch (e) {
    toSkillError(e);
  }
}

/**
 * Dodaje krawędź „skillId wymaga requiresSkillId". BEZ pre-checków: samopętla,
 * cykl, prerekwizyt o wyższym stopniu i duplikat wracają jako `409` z BE
 * (docblok: „409 przy cyklu oraz przy prerekwizycie o wyższym stopniu").
 * Dawne `wouldCreateCycle` i `canBePrerequisite` w tym module zniknęły —
 * kandydatów w pickerze liczy BE tą samą regułą, więc obie strony nie mogą
 * się rozjechać.
 */
export async function addPrerequisite(
  api: Api,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  try {
    await skillsControllerCreatePrerequisite({
      client: api,
      path: { id: skillId },
      body: { requiresSkillId },
      throwOnError: true,
    });
  } catch (e) {
    toSkillError(e);
  }
}

/** Usuwa krawędź prerekwizytu. Cudza umiejętność to `404`, tu `SkillError` do formularza. */
export async function removePrerequisite(
  api: Api,
  skillId: string,
  requiresSkillId: string,
): Promise<void> {
  try {
    await skillsControllerDeletePrerequisite({
      client: api,
      path: { id: skillId, requiresSkillId },
      throwOnError: true,
    });
  } catch (e) {
    toSkillError(e);
  }
}
