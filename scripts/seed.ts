import { hash } from "@node-rs/argon2";
import { and, count, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ARGON2_OPTS } from "../app/lib/auth/password";
import * as schema from "../app/lib/db/schema";
import { promoteTrainerCatalogToBrand } from "../app/lib/catalog";
import {
  assignUserToOrgRegion,
  ensureBrandAdmin,
  ensureOrganization,
  ensureRegion,
} from "../app/lib/organizations";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[seed] DATABASE_URL not set");
    process.exit(1);
  }

  const trainerEmail = process.env.SEED_TRAINER_EMAIL?.trim();
  const trainerPassword = process.env.SEED_TRAINER_PASSWORD;
  const trainerName = process.env.SEED_TRAINER_NAME?.trim();
  if (!trainerEmail || !trainerPassword || !trainerName) {
    console.error(
      "[seed] SEED_TRAINER_EMAIL, SEED_TRAINER_PASSWORD and SEED_TRAINER_NAME must be set",
    );
    process.exit(1);
  }
  if (trainerPassword.length < 8) {
    console.error("[seed] SEED_TRAINER_PASSWORD must be at least 8 characters");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql, { schema });

  // Trainer bootstrap only. We deliberately do NOT seed exercises — the trainer
  // builds the library from scratch in production.
  const userCountRows = await db.select({ value: count() }).from(schema.users);
  const userCount = userCountRows[0]?.value ?? 0;

  if (userCount === 0) {
    const passwordHash = await hash(trainerPassword, ARGON2_OPTS);
    await db.insert(schema.users).values({
      email: trainerEmail,
      displayName: trainerName,
      role: "trainer",
      passwordHash,
    });
    console.log("[seed] Created default trainer:");
    console.log(`[seed]   email:    ${trainerEmail}`);
    console.log("[seed]   password: <from SEED_TRAINER_PASSWORD>");
    console.log("[seed]   CHANGE THIS PASSWORD AFTER FIRST LOGIN.");
  } else {
    console.log(`[seed] users table has ${userCount} row(s); nothing to seed.`);
    // Make sure at least one trainer exists; if not, something is off but we
    // don't try to recover automatically.
    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.role, "trainer"))
      .limit(1);
    if (existing.length === 0) {
      console.warn("[seed] WARNING: users exist but no trainer row found.");
    }
  }

  // ---- Bootstrap tenancy marki (plasterek #1) — idempotentny ----
  const brandName = process.env.BRAND_NAME?.trim();
  const brandAdminEmail = process.env.BRAND_ADMIN_EMAIL?.trim();
  const brandAdminPassword = process.env.BRAND_ADMIN_PASSWORD;
  const brandAdminName = process.env.BRAND_ADMIN_NAME?.trim() || brandName;

  if (brandName && brandAdminEmail && brandAdminPassword) {
    if (brandAdminPassword.length < 8) {
      console.error("[seed] BRAND_ADMIN_PASSWORD must be at least 8 characters");
      process.exit(1);
    }
    const orgId = await ensureOrganization(db, brandName);
    const regionId = await ensureRegion(db, {
      organizationId: orgId,
      name: "Polska",
      country: "PL",
      currency: "pln",
      locale: "pl-PL",
    });
    await ensureRegion(db, {
      organizationId: orgId,
      name: "France",
      country: "FR",
      currency: "eur",
      locale: "fr-FR",
    });

    // Backfill: przypisz tylko jeszcze-nieprzypisanych userów (nie nadpisujemy ręcznych zmian).
    const trainers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.role, "trainer"), isNull(schema.users.organizationId)));
    for (const t of trainers) await assignUserToOrgRegion(db, t.id, orgId, regionId);

    const trainees = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.role, "trainee"), isNull(schema.users.organizationId)));
    for (const t of trainees) await assignUserToOrgRegion(db, t.id, orgId, null);

    await ensureBrandAdmin(db, {
      organizationId: orgId,
      email: brandAdminEmail,
      displayName: brandAdminName ?? brandName,
      password: brandAdminPassword,
    });

    // Promocja katalogu trenera-założyciela do poziomu marki (idempotentna).
    const [founder] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.role, "trainer"), eq(schema.users.organizationId, orgId)))
      .limit(1);
    if (founder) {
      const promoted = await promoteTrainerCatalogToBrand(db, {
        trainerId: founder.id,
        organizationId: orgId,
      });
      console.log(
        `[seed] Promowano do marki: ${promoted.exercises} ćwiczeń, ${promoted.skills} umiejętności, ${promoted.prerequisites} krawędzi.`,
      );
    }

    console.log("[seed] Tenancy marki gotowa:");
    console.log(`[seed]   organizacja: ${brandName}`);
    console.log("[seed]   region:      Polska (PL, pln, pl-PL)");
    console.log("[seed]   region:      France (FR, eur, fr-FR)");
    console.log(`[seed]   brand_admin: ${brandAdminEmail}`);
    console.log("[seed]   ZMIEŃ HASŁO PREZESA PO PIERWSZYM LOGOWANIU.");
  } else {
    console.log(
      "[seed] BRAND_NAME/BRAND_ADMIN_EMAIL/BRAND_ADMIN_PASSWORD nie ustawione — pomijam bootstrap marki.",
    );
  }

  await sql.end();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
