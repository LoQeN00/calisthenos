import { and, eq } from "drizzle-orm";
import { hashPassword } from "./auth";
import type { Db } from "./db/client";
import * as schema from "./db/schema";
import { type RegionInput, RegionInputSchema } from "./organizations-types";

/** Singleton w #1: zwraca istniejącą organizację albo tworzy nową o podanej nazwie. */
export async function ensureOrganization(db: Db, name: string): Promise<string> {
  const existing = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db
    .insert(schema.organizations)
    .values({ name })
    .returning({ id: schema.organizations.id });
  return row!.id;
}

/** Idempotentne po (organization_id, country). Waliduje wejście Zodem. */
export async function ensureRegion(db: Db, input: RegionInput): Promise<string> {
  const v = RegionInputSchema.parse(input);
  const existing = await db
    .select({ id: schema.regions.id })
    .from(schema.regions)
    .where(
      and(
        eq(schema.regions.organizationId, v.organizationId),
        eq(schema.regions.country, v.country),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db.insert(schema.regions).values(v).returning({ id: schema.regions.id });
  return row!.id;
}

export async function assignUserToOrgRegion(
  db: Db,
  userId: string,
  organizationId: string,
  regionId: string | null,
): Promise<void> {
  await db
    .update(schema.users)
    .set({ organizationId, regionId })
    .where(eq(schema.users.id, userId));
}

export interface EnsureBrandAdminInput {
  organizationId: string;
  email: string;
  displayName: string;
  password: string;
}

/** Idempotentne po email: nie duplikuje konta prezesa. Region/trainer = NULL (globalny). */
export async function ensureBrandAdmin(db: Db, input: EnsureBrandAdminInput): Promise<string> {
  const existing = await db
    .select({ id: schema.users.id, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .limit(1);
  if (existing[0]) {
    // Nie nadpisuj cicho istniejącego konta o innej roli — to byłaby pułapka
    // (seed twierdziłby „brand_admin gotowy", a konto pozostałoby np. trenerem).
    if (existing[0].role !== "brand_admin") {
      throw new Error(
        `Konto z adresem ${input.email} istnieje z rolą "${existing[0].role}" — nie tworzę brand_admin z tym emailem.`,
      );
    }
    return existing[0].id;
  }
  const passwordHash = await hashPassword(input.password);
  const [row] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      displayName: input.displayName,
      role: "brand_admin",
      passwordHash,
      organizationId: input.organizationId,
    })
    .returning({ id: schema.users.id });
  return row!.id;
}
