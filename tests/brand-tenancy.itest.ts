// Uruchamia właściciel pod Dockerem: npm run test:itest
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import {
  ensureOrganization,
  ensureRegion,
  ensureBrandAdmin,
  assignUserToOrgRegion,
} from "~/lib/organizations";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("ensureOrganization / ensureRegion — idempotencja", () => {
  it("ensureOrganization dwukrotnie → ten sam id, jeden wiersz", async () => {
    const id1 = await ensureOrganization(db, "Marka Globalna");
    const id2 = await ensureOrganization(db, "Marka Globalna");
    expect(id1).toBe(id2);
    const rows = await db.select({ id: schema.organizations.id }).from(schema.organizations);
    expect(rows.length).toBe(1);
  });

  it("ensureRegion dwukrotnie (PL) → ten sam id", async () => {
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .limit(1);
    const r1 = await ensureRegion(db, {
      organizationId: org!.id,
      name: "Polska",
      country: "PL",
      currency: "pln",
      locale: "pl-PL",
    });
    const r2 = await ensureRegion(db, {
      organizationId: org!.id,
      name: "Polska",
      country: "PL",
      currency: "pln",
      locale: "pl-PL",
    });
    expect(r1).toBe(r2);
  });
});

describe("assignUserToOrgRegion + ensureBrandAdmin", () => {
  it("przypisuje trenera do org+region; brand_admin globalny (region NULL)", async () => {
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .limit(1);
    const regionId = await ensureRegion(db, {
      organizationId: org!.id,
      name: "Polska",
      country: "PL",
      currency: "pln",
      locale: "pl-PL",
    });
    const [trainer] = await db
      .insert(schema.users)
      .values({ email: "amb@example.com", displayName: "Ambasador", role: "trainer" })
      .returning({ id: schema.users.id });
    await assignUserToOrgRegion(db, trainer!.id, org!.id, regionId);

    const [tRow] = await db
      .select({ orgId: schema.users.organizationId, regionId: schema.users.regionId })
      .from(schema.users)
      .where(eq(schema.users.id, trainer!.id));
    expect(tRow!.orgId).toBe(org!.id);
    expect(tRow!.regionId).toBe(regionId);

    const adminId1 = await ensureBrandAdmin(db, {
      organizationId: org!.id,
      email: "prezes@example.com",
      displayName: "Prezes",
      password: "supertajne1",
    });
    const adminId2 = await ensureBrandAdmin(db, {
      organizationId: org!.id,
      email: "prezes@example.com",
      displayName: "Prezes",
      password: "supertajne1",
    });
    expect(adminId1).toBe(adminId2); // idempotencja po email

    const [aRow] = await db
      .select({
        role: schema.users.role,
        orgId: schema.users.organizationId,
        regionId: schema.users.regionId,
        trainerId: schema.users.trainerId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, adminId1));
    expect(aRow!.role).toBe("brand_admin");
    expect(aRow!.orgId).toBe(org!.id);
    expect(aRow!.regionId).toBeNull();
    expect(aRow!.trainerId).toBeNull();
  });
});

describe("CHECK users_role_check — kształt wierszy per rola", () => {
  it("odrzuca brand_admin z trainer_id", async () => {
    const [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .limit(1);
    const [someTrainer] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.role, "trainer"))
      .limit(1);
    await expect(
      db.insert(schema.users).values({
        email: "bad-admin@example.com",
        displayName: "Zły admin",
        role: "brand_admin",
        organizationId: org!.id,
        trainerId: someTrainer!.id, // niedozwolone dla brand_admin
      }),
    ).rejects.toThrow();
  });

  it("odrzuca trainee bez trainer_id", async () => {
    await expect(
      db.insert(schema.users).values({
        email: "bad-trainee@example.com",
        displayName: "Zły podopieczny",
        role: "trainee",
        // brak trainerId
      }),
    ).rejects.toThrow();
  });
});
