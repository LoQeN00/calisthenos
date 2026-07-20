/**
 * Testy integracyjne rozwiązywania locale: i18nServer.getLocale(request) na
 * realnym PostgreSQL (testcontainers). Sprawdzamy priorytety pickLang:
 *   region zalogowanego usera → region zapraszającego trenera (/zaproszenie/:token)
 *   → Accept-Language → fallback "pl".
 *
 * UWAGA: ten plik NIE jest uruchamiany przez CI automatycznie.
 * Uruchamia właściciel pod Dockerem: npm run test:itest
 *
 * Architektura testu: app/i18n.server.ts używa singletona `db` z
 * ~/lib/db/client (nie przyjmuje db parametrem). Singleton przy imporcie czyta
 * getEnv().DATABASE_URL i tworzy pulę postgres. Dlatego mockujemy
 * ~/lib/db/client tak, by jego eksport `db` był Proxy delegującym do
 * instancji drizzle podpiętej do kontenera w beforeAll — bez realnego
 * DATABASE_URL przy starcie modułu i bez edycji kodu produkcyjnego.
 */

import { vi } from "vitest";

// ---- Mock singletona db (PRZED importami aplikacji) ----
// Proxy delegujący do mutowalnego holdera. i18n.server.ts robi `db.select(...)`
// dopiero w findLocale (czas wywołania), więc podmiana w beforeAll wystarcza.
const dbHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("~/lib/db/client", () => ({
  db: new Proxy(
    {},
    {
      get(_t, prop) {
        const inner = dbHolder.current as Record<string | symbol, unknown> | null;
        if (!inner) throw new Error("db not initialized yet (beforeAll didn't run)");
        const value = inner[prop];
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(inner)
          : value;
      },
    },
  ),
}));

// ---- Importy aplikacji (po vi.mock) ----
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/lib/db/schema";
import { createSession, hashToken } from "~/lib/auth";
import { i18nServer } from "~/i18n.server";

const COOKIE_NAME = "__Host-kth_session";

let container: StartedPostgreSqlContainer;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

let orgId = "";
let regionPlId = "";
let regionFrId = "";

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16").start();
  sql = postgres(container.getConnectionUri());
  db = drizzle<typeof schema>(sql, { schema });
  // Podepnij singleton z ~/lib/db/client (przez mock) do kontenera.
  dbHolder.current = db;
  await sql`CREATE EXTENSION IF NOT EXISTS citext`;
  await migrate(db, { migrationsFolder: "app/lib/db/migrations" });

  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "Marka Globalna" })
    .returning({ id: schema.organizations.id });
  orgId = org!.id;

  const [rPl] = await db
    .insert(schema.regions)
    .values({
      organizationId: orgId,
      name: "Polska",
      country: "PL",
      currency: "pln",
      locale: "pl-PL",
    })
    .returning({ id: schema.regions.id });
  regionPlId = rPl!.id;

  const [rFr] = await db
    .insert(schema.regions)
    .values({
      organizationId: orgId,
      name: "France",
      country: "FR",
      currency: "eur",
      locale: "fr-FR",
    })
    .returning({ id: schema.regions.id });
  regionFrId = rFr!.id;
}, 120000);

afterAll(async () => {
  await sql?.end();
  await container?.stop();
});

// Czyszczenie między testami: usuwamy tylko byty per-test (sesje, zaproszenia,
// userzy). Organizacja i regiony są stałym fixture z beforeAll.
beforeEach(async () => {
  await db.delete(schema.sessions);
  await db.delete(schema.invites);
  await db.delete(schema.users);
});

// --- helpery ---

async function makeTrainer(regionId: string | null): Promise<string> {
  const [u] = await db
    .insert(schema.users)
    .values({
      email: `trener-${Math.random().toString(36).slice(2)}@example.com`,
      displayName: "Trener",
      role: "trainer",
      organizationId: orgId,
      regionId,
    })
    .returning({ id: schema.users.id });
  return u!.id;
}

async function makeTrainee(trainerId: string): Promise<string> {
  // Podopieczny dziedziczy region trenera — własny regionId zostaje null.
  const [u] = await db
    .insert(schema.users)
    .values({
      email: `pod-${Math.random().toString(36).slice(2)}@example.com`,
      displayName: "Podopieczny",
      role: "trainee",
      trainerId,
    })
    .returning({ id: schema.users.id });
  return u!.id;
}

async function makeBrandAdmin(): Promise<string> {
  const [u] = await db
    .insert(schema.users)
    .values({
      email: `prezes-${Math.random().toString(36).slice(2)}@example.com`,
      displayName: "Prezes",
      role: "brand_admin",
      organizationId: orgId,
      regionId: null,
    })
    .returning({ id: schema.users.id });
  return u!.id;
}

async function sessionCookieFor(userId: string): Promise<string> {
  const { id } = await createSession(db, { userId });
  return `${COOKIE_NAME}=${id}`;
}

function req(opts: { cookie?: string; acceptLanguage?: string; path?: string }): Request {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.acceptLanguage) headers["accept-language"] = opts.acceptLanguage;
  return new Request(`http://localhost${opts.path ?? "/"}`, { headers });
}

describe("getLocale — region zalogowanego usera", () => {
  it("trener z regionem PL → 'pl'", async () => {
    const trainer = await makeTrainer(regionPlId);
    const cookie = await sessionCookieFor(trainer);
    expect(await i18nServer.getLocale(req({ cookie }))).toBe("pl");
  });

  it("trener z regionem FR → 'fr'", async () => {
    const trainer = await makeTrainer(regionFrId);
    const cookie = await sessionCookieFor(trainer);
    expect(await i18nServer.getLocale(req({ cookie }))).toBe("fr");
  });

  it("podopieczny trenera FR (dziedziczy region trenera) → 'fr'", async () => {
    const trainer = await makeTrainer(regionFrId);
    const trainee = await makeTrainee(trainer);
    const cookie = await sessionCookieFor(trainee);
    expect(await i18nServer.getLocale(req({ cookie }))).toBe("fr");
  });
});

describe("getLocale — brand_admin bez regionu spada na Accept-Language/fallback", () => {
  it("brand_admin + Accept-Language: fr → 'fr'", async () => {
    const admin = await makeBrandAdmin();
    const cookie = await sessionCookieFor(admin);
    expect(await i18nServer.getLocale(req({ cookie, acceptLanguage: "fr" }))).toBe("fr");
  });

  it("brand_admin bez nagłówka → fallback 'pl'", async () => {
    const admin = await makeBrandAdmin();
    const cookie = await sessionCookieFor(admin);
    expect(await i18nServer.getLocale(req({ cookie }))).toBe("pl");
  });
});

describe("getLocale — /zaproszenie/:token: region zapraszającego trenera", () => {
  it("token trenera FR, anonim (bez sesji) → 'fr'", async () => {
    const trainer = await makeTrainer(regionFrId);
    // Zaproszenie: zapisujemy hash tokenu (jak createInvite), token jawny w URL.
    const token = "tok_fr_zaproszenie";
    await db.insert(schema.invites).values({
      trainerId: trainer,
      displayName: "Nowy podopieczny",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    });
    const locale = await i18nServer.getLocale(req({ path: `/zaproszenie/${token}` }));
    expect(locale).toBe("fr");
  });
});

describe("getLocale — anonim: Accept-Language", () => {
  it("Accept-Language: fr-CH,fr;q=0.9 → 'fr'", async () => {
    expect(await i18nServer.getLocale(req({ acceptLanguage: "fr-CH,fr;q=0.9" }))).toBe("fr");
  });

  it("Accept-Language: en-US,de → fallback 'pl'", async () => {
    expect(await i18nServer.getLocale(req({ acceptLanguage: "en-US,de" }))).toBe("pl");
  });
});
