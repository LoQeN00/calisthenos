import {
  exerciseCategoriesControllerCreate,
  exerciseCategoriesControllerList,
  exerciseCategoriesControllerRemove,
} from "@kalisthenos/api-client";
import type { ExerciseCategoryView } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";

const MAX_NAME_LEN = 32;

/** Normalize a raw category name. Returns null when it's empty or too long. */
export function normalizeCategoryName(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LEN) return null;
  return trimmed;
}

/**
 * Bez `trainerId`: zakres tenanta niesie token dostępowy, a BE go egzekwuje.
 * Argument zostawiony dla symetrii ze starą sygnaturą podtrzymywałby złudzenie,
 * że FE cokolwiek tu pilnuje.
 *
 * Kolejność też przeszła na drugą stronę — do integracji robił ją `ORDER BY
 * ordinal, name` w tym pliku, teraz przychodzi z kontraktu wraz z `ordinal`.
 */
export async function listCategoriesForTrainer(api: Api): Promise<ExerciseCategoryView[]> {
  // `throwOnError: true` jawnie, choć klient ma je w konfiguracji: generyk
  // funkcji SDK domyślnie schodzi do `false`, więc bez tego `data` typuje się
  // jako `… | undefined`. Zero zmiany w czasie wykonania.
  const { data } = await exerciseCategoriesControllerList({ client: api, throwOnError: true });
  return data;
}

export class CategoryError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export async function addCategory(api: Api, rawName: string): Promise<ExerciseCategoryView> {
  const name = normalizeCategoryName(rawName);
  if (name == null) {
    throw new CategoryError("invalid name", "Nazwa kategorii jest pusta lub za długa.");
  }

  try {
    const { data } = await exerciseCategoriesControllerCreate({
      client: api,
      body: { name },
      throwOnError: true,
    });
    return data;
  } catch (e) {
    // Moduł zachowuje własny typ błędu, choć źródło się zmieniło: do integracji
    // był nim kod `23505` z Postgresa, teraz `409` z kontraktu. Trasa łapie
    // `CategoryError` i pokazuje `userMessage` — gdyby przeszedł `ApiError`,
    // formularz zamiast komunikatu dostałby granicę błędu, czyli inny ekran.
    // Wąsko, wyłącznie `409`: awaria BE ma zostać awarią, a nie zamienić się
    // w „nazwa zajęta" każące poprawiać coś, co jest dobre.
    if (e instanceof ApiError && e.status === 409) {
      throw new CategoryError("duplicate", e.message);
    }
    throw e;
  }
}

export async function deleteCategory(api: Api, categoryId: string): Promise<void> {
  await exerciseCategoriesControllerRemove({
    client: api,
    path: { id: categoryId },
    throwOnError: true,
  });
}

/** Filter an incoming list of category names down to those that are known for this trainer. */
export function filterToKnownCategoryNames(
  categories: ExerciseCategoryView[],
  names: string[],
): string[] {
  const known = new Set(categories.map((c) => c.name));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const norm = normalizeCategoryName(raw);
    if (norm == null) continue;
    if (!known.has(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    result.push(norm);
  }
  return result;
}
