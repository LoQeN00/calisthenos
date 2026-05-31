import { and, eq } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

const MAX_NAME_LEN = 32;

/** Normalize a raw category name. Returns null when it's empty or too long. */
export function normalizeCategoryName(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LEN) return null;
  return trimmed;
}

export async function listCategoriesForTrainer(
  db: Db,
  trainerId: string,
): Promise<schema.ExerciseCategory[]> {
  return await db
    .select()
    .from(schema.exerciseCategories)
    .where(eq(schema.exerciseCategories.trainerId, trainerId))
    .orderBy(schema.exerciseCategories.ordinal, schema.exerciseCategories.name);
}

export class CategoryError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export async function addCategory(
  db: Db,
  trainerId: string,
  rawName: string,
): Promise<schema.ExerciseCategory> {
  const name = normalizeCategoryName(rawName);
  if (name == null) {
    throw new CategoryError("invalid name", "Nazwa kategorii jest pusta lub za długa.");
  }
  try {
    const [row] = await db
      .insert(schema.exerciseCategories)
      .values({ trainerId, name })
      .returning();
    return row!;
  } catch (e) {
    // 23505 = unique_violation; surfaced as a normal Error from postgres driver.
    if (e instanceof Error && e.message.includes("exercise_categories_trainer_name_uniq")) {
      throw new CategoryError("duplicate", "Kategoria o tej nazwie już istnieje.");
    }
    throw e;
  }
}

export async function deleteCategory(db: Db, trainerId: string, categoryId: string): Promise<void> {
  await db
    .delete(schema.exerciseCategories)
    .where(
      and(
        eq(schema.exerciseCategories.id, categoryId),
        eq(schema.exerciseCategories.trainerId, trainerId),
      ),
    );
}

/** Filter an incoming list of category names down to those that are known for this trainer. */
export function filterToKnownCategoryNames(
  categories: schema.ExerciseCategory[],
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
