// Integration test — run under Docker via testcontainers (owner runs; NOT run in the inner dev loop).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import * as schema from "~/lib/db/schema";
import {
  SkillError,
  addPrerequisite,
  createSkill,
  getSkillWithVariations,
  listAssignablePrerequisites,
  listConflictingPrerequisites,
  updateSkill,
} from "~/lib/skills";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let trainerA = "";
let trainerB = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [tA] = await db
    .insert(schema.users)
    .values({ email: "trenera@skill-tier.example.com", displayName: "Trener A", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerA = tA!.id;

  const [tB] = await db
    .insert(schema.users)
    .values({ email: "trenerb@skill-tier.example.com", displayName: "Trener B", role: "trainer" })
    .returning({ id: schema.users.id });
  trainerB = tB!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

describe("zapis i odczyt tieru", () => {
  it("createSkill zapisuje podany tier", async () => {
    const s = await createSkill(db, trainerA, "Planche tier", "", "expert");
    const detail = await getSkillWithVariations(db, trainerA, s.id);
    expect(detail?.tier).toBe("expert");
  });

  it("updateSkill zmienia tier", async () => {
    const s = await createSkill(db, trainerA, "Dip tier", "", "basic");
    await updateSkill(db, trainerA, s.id, "Dip tier", "", "advanced");
    const detail = await getSkillWithVariations(db, trainerA, s.id);
    expect(detail?.tier).toBe("advanced");
  });

  it("kolumna ma DEFAULT 'basic' — insert bez tieru daje basic", async () => {
    const [row] = await db
      .insert(schema.skills)
      .values({ trainerId: trainerA, name: "Bez tieru", description: "" })
      .returning({ id: schema.skills.id, tier: schema.skills.tier });
    expect(row!.tier).toBe("basic");
    await db.delete(schema.skills).where(eq(schema.skills.id, row!.id));
  });

  it("tenant-scope: trener B nie odczyta umiejętności trenera A", async () => {
    const s = await createSkill(db, trainerA, "Tenant tier skill", "", "advanced");
    expect(await getSkillWithVariations(db, trainerB, s.id)).toBeNull();
  });

  it("tenant-scope: updateSkill trenera B nie zmienia tieru umiejętności trenera A", async () => {
    const s = await createSkill(db, trainerA, "Tenant tier skill 2", "", "basic");
    await updateSkill(db, trainerB, s.id, "Przejęte", "", "expert");
    const detail = await getSkillWithVariations(db, trainerA, s.id);
    expect(detail?.tier).toBe("basic");
    expect(detail?.name).toBe("Tenant tier skill 2");
  });
});

describe("walidacja prerekwizytu wg tieru", () => {
  it("odrzuca prereq z WYŻSZEGO tieru", async () => {
    const low = await createSkill(db, trainerA, "Push-up reguła", "", "basic");
    const high = await createSkill(db, trainerA, "Planche reguła", "", "expert");
    const err = await addPrerequisite(db, trainerA, low.id, high.id).catch((e) => e);
    expect(err).toBeInstanceOf(SkillError);
    expect(err.message).toBe("tier order");
    expect(err.userMessage).toContain("EKSPERT");
    expect(err.userMessage).toContain("PODSTAWOWY");
  });

  it("przyjmuje prereq z NIŻSZEGO tieru", async () => {
    const base = await createSkill(db, trainerA, "Pull-up niższy", "", "basic");
    const top = await createSkill(db, trainerA, "Front Lever wyższy", "", "advanced");
    await expect(addPrerequisite(db, trainerA, top.id, base.id)).resolves.toBeUndefined();
  });

  it("przyjmuje prereq z RÓWNEGO tieru (podrzędy w pasie)", async () => {
    const a = await createSkill(db, trainerA, "Równy A", "", "intermediate");
    const b = await createSkill(db, trainerA, "Równy B", "", "intermediate");
    await expect(addPrerequisite(db, trainerA, a.id, b.id)).resolves.toBeUndefined();
  });

  it("listAssignablePrerequisites nie proponuje kandydata z wyższego tieru", async () => {
    const low = await createSkill(db, trainerA, "Picker niski", "", "basic");
    const high = await createSkill(db, trainerA, "Picker wysoki", "", "expert");
    const ok = await createSkill(db, trainerA, "Picker rowny", "", "basic");
    const options = await listAssignablePrerequisites(db, trainerA, low.id);
    expect(options.some((o) => o.id === high.id)).toBe(false);
    expect(options.some((o) => o.id === ok.id)).toBe(true);
  });

  it("listAssignablePrerequisites dla obcej umiejętności zwraca pustą listę", async () => {
    const s = await createSkill(db, trainerA, "Picker obcy", "", "basic");
    await createSkill(db, trainerB, "Obcy basic B", "", "basic");
    expect(await listAssignablePrerequisites(db, trainerB, s.id)).toEqual([]);
  });

  it("obcy trener nie poznaje tieru cudzej umiejętności przez komunikat błędu", async () => {
    // Niezmiennik: własność sprawdzana PRZED porównaniem tierów. Gdyby kolejność
    // się odwróciła, trener B dostałby komunikat nazywający tier umiejętności A.
    const wysoki = await createSkill(db, trainerA, "Wyciek tieru szczyt", "", "expert");
    const niski = await createSkill(db, trainerB, "Wyciek tieru baza", "", "basic");

    const err = await addPrerequisite(db, trainerB, niski.id, wysoki.id).catch((e) => e);
    expect(err).toBeInstanceOf(SkillError);
    expect(err.message).toBe("not found");
    expect(err.userMessage).not.toContain("EKSPERT");
  });
});

describe("kolizja po zmianie tieru", () => {
  it("podniesienie tieru prereka zostawia krawędź i raportuje kolizję", async () => {
    const base = await createSkill(db, trainerA, "Kolizja baza", "", "basic");
    const top = await createSkill(db, trainerA, "Kolizja szczyt", "", "advanced");
    await addPrerequisite(db, trainerA, top.id, base.id);

    // Bez kolizji na starcie.
    expect(await listConflictingPrerequisites(db, trainerA, top.id)).toEqual([]);

    // Prereq staje się trudniejszy niż to, co odblokowuje — zmiana MUSI przejść.
    await updateSkill(db, trainerA, base.id, "Kolizja baza", "", "expert");

    const conflicts = await listConflictingPrerequisites(db, trainerA, top.id);
    expect(conflicts.map((c) => c.id)).toEqual([base.id]);
  });

  it("tenant-scope: konflikt widzi tylko właściciel", async () => {
    const base = await createSkill(db, trainerA, "Kolizja tenant baza", "", "basic");
    const top = await createSkill(db, trainerA, "Kolizja tenant szczyt", "", "advanced");
    await addPrerequisite(db, trainerA, top.id, base.id);
    await updateSkill(db, trainerA, base.id, "Kolizja tenant baza", "", "expert");

    expect((await listConflictingPrerequisites(db, trainerA, top.id)).map((c) => c.id)).toEqual([
      base.id,
    ]);
    expect(await listConflictingPrerequisites(db, trainerB, top.id)).toEqual([]);
  });
});
