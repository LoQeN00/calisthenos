import { hash } from "@node-rs/argon2";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ARGON2_OPTS } from "../app/lib/auth/password";
import * as schema from "../app/lib/db/schema";

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

  await sql.end();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
