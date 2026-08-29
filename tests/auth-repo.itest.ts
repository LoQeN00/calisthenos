// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "~/lib/db/schema";
import { createInvite, findInviteByToken } from "~/lib/auth/invite";
import { findDisplayName, findUserByEmail } from "~/lib/auth/users";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

// Trainer A — used for findUserByEmail (its own account) and findDisplayName
// (its own display name) and as the owner of the invite under test.
let trainerA = "";
let plainToken = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trener@example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;

  const created = await createInvite(db, {
    trainerId: trainerA,
    displayName: "Nowy podopieczny",
    email: "nowy@example.com",
  });
  plainToken = created.token;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("auth repo", () => {
  it("findUserByEmail znajduje po dokładnym adresie", async () => {
    expect(await findUserByEmail(db, "trener@example.com")).toMatchObject({ role: "trainer" });
    expect(await findUserByEmail(db, "nie-ma@example.com")).toBeNull();
  });

  it("findInviteByToken haszuje token i zwraca zaproszenie", async () => {
    const invite = await findInviteByToken(db, plainToken);
    expect(invite?.trainerId).toBe(trainerA);
    expect(await findInviteByToken(db, "zmyslony-token")).toBeNull();
  });

  it("findDisplayName zwraca null dla nieistniejącego użytkownika", async () => {
    expect(await findDisplayName(db, trainerA)).toBe("Trener A");
    expect(await findDisplayName(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
