# Fundament tenancy marki (plasterek #1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: użyj `superpowers:subagent-driven-development` (rekomendowane) do implementacji task-po-tasku. Kroki używają checkboxów (`- [ ]`).
>
> **Reguły repo (NADRZĘDNE):** nigdy `git`/`docker`; **brak kroków commit** — review per task, na końcu handoff. `npm` nie `pnpm`. UI po polsku, brand `kalisthenos` małą literą. `db:generate`/`db:migrate`/`db:seed` odpala **właściciel** (handoff). Aktualizacja docs = część „done".

**Goal:** Dołożyć trzeci poziom hierarchii (organizacja → region → trener → podopieczny) i rolę `brand_admin`, z migracją istniejących danych i logowaniem prezesa do placeholdera `/marka`.

**Architecture:** Wariant A ze specu — `regions` jako osobny byt; tabele domenowe bez `organization_id` (org wyprowadzalna przez `trainer_id`). Org/region nullable w DB, inwariant kształtu wierszy egzekwowany w aplikacji + teście. `authz.ts` bez zmian (prezes nie ma dostępu domenowego w #1).

**Tech Stack:** React Router v7 (framework mode), Drizzle ORM + Postgres 16, Zod, Vitest (unit `*.test.ts`, integ `*.itest.ts` testcontainers), Biome.

**Spec:** `docs/superpowers/specs/2026-06-07-tenancy-marki-fundament-design.md`

---

## Mapa plików (co powstaje / co modyfikujemy)

| Plik | Odpowiedzialność | Akcja |
|---|---|---|
| `app/lib/db/schema.ts` | tabele `organizations`, `regions`; kolumny + enum + CHECK na `users` | Modyfikacja |
| `app/lib/auth/roles.ts` | typ `Role` (+`brand_admin`) i czysta `defaultPathForRole` | Utworzenie |
| `app/lib/auth/roles.test.ts` | unit test `defaultPathForRole` | Utworzenie |
| `app/lib/auth/index.ts` | `AuthUser` (+org/region), re-export `Role`/`defaultPathForRole`, `requireUser` | Modyfikacja |
| `app/routes/_index.tsx` | redirect po roli | Modyfikacja |
| `app/routes/login.tsx` | redirect po roli (loader+action) | Modyfikacja |
| `app/lib/organizations-types.ts` | `RegionInputSchema` (Zod, pure) | Utworzenie |
| `app/lib/organizations-types.test.ts` | unit test walidatora | Utworzenie |
| `app/lib/organizations.ts` | `ensureOrganization`/`ensureRegion`/`assignUserToOrgRegion`/`ensureBrandAdmin` | Utworzenie |
| `scripts/seed.ts` | idempotentny bootstrap marki + backfill userów | Modyfikacja |
| `app/routes/marka/_layout.tsx` | layout prezesa (`requireUser` brand_admin) | Utworzenie |
| `app/routes/marka/_index.tsx` | placeholder „Panel marki — wkrótce" | Utworzenie |
| `app/routes/marka/README.md` | opis obszaru `/marka` | Utworzenie |
| `app/routes.ts` | rejestracja `/marka` | Modyfikacja |
| `.env.example` | `BRAND_NAME`, `BRAND_ADMIN_EMAIL/PASSWORD/NAME` | Modyfikacja |
| README-e + `CLAUDE.md` | dokumentacja | Modyfikacja |
| `tests/brand-tenancy.itest.ts` | integ: org/region/brand_admin + CHECK (PISANY, NIE uruchamiany) | Utworzenie |

---

## Task 1: Schemat — organizacja, region, rola, CHECK

**Files:**
- Modify: `app/lib/db/schema.ts`

**Reguły projektowe (checklista):** schema = źródło prawdy (nie edytujemy `migrations/` ręcznie); `currency` małymi literami; `locale` BCP-47; tabele domenowe **bez** `organization_id`.

- [ ] **Step 1: Dodaj `brand_admin` do enuma roli**

W `app/lib/db/schema.ts` zmień:
```ts
export const userRole = pgEnum("user_role", ["trainer", "trainee"]);
```
na:
```ts
export const userRole = pgEnum("user_role", ["trainer", "trainee", "brand_admin"]);
```

- [ ] **Step 2: Dodaj tabele `organizations` i `regions` BEZPOŚREDNIO PRZED `export const users`**

(deklaracja przed `users`, bo `users` będzie je referencować):
```ts
// ---------------- Organizations + Regions (tenancy marki) ----------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const regions = pgTable(
  "regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    country: text("country").notNull(), // ISO-3166 alpha-2: PL, FR
    currency: text("currency").notNull(), // małymi literami: pln, eur
    locale: text("locale").notNull(), // BCP-47: pl-PL, fr-FR
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCountryUniq: uniqueIndex("regions_org_country_uniq").on(t.organizationId, t.country),
    orgIdx: index("regions_org_idx").on(t.organizationId),
  }),
);
```

- [ ] **Step 3: Dodaj kolumny `organization_id` i `region_id` do `users`**

W definicji kolumn `users` (po `trainerId`, przed `joinedOn`) dodaj:
```ts
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    regionId: uuid("region_id").references(() => regions.id, {
      onDelete: "restrict",
    }),
```

- [ ] **Step 4: Rozszerz CHECK `users_role_check` o `brand_admin`**

Zamień blok `roleCheck` na:
```ts
    roleCheck: check(
      "users_role_check",
      sql`(${t.role} = 'trainer' AND ${t.trainerId} IS NULL) OR
          (${t.role} = 'trainee' AND ${t.trainerId} IS NOT NULL) OR
          (${t.role} = 'brand_admin' AND ${t.trainerId} IS NULL)`,
    ),
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (schemat się kompiluje; `users.role` ma teraz typ `"trainer"|"trainee"|"brand_admin"`).

- [ ] **Step 6: Lint dotkniętego pliku**

Run: `npx biome format --write app/lib/db/schema.ts`
Expected: plik sformatowany, bez błędów.

- [ ] **Step 7: Review per task** — `superpowers:requesting-code-review` na diffie `schema.ts`.

> **Migracja = HANDOFF (właściciel):** po tym tasku właściciel uruchomi `npm run db:generate` (w TTY — jeśli drizzle-kit zapyta, wybiera „create column/table/enum value"; **plików w `migrations/` nie edytujemy ręcznie**) i `npm run db:migrate`. W tym tasku NIE generujemy migracji.

**Krytyczny przepływ:** TAK (model tenant-scope) → pokrycie w Task 7 (integ).

---

## Task 2: Auth wiring — `Role`, `defaultPathForRole`, `AuthUser`, redirecty

**Files:**
- Create: `app/lib/auth/roles.ts`
- Create: `app/lib/auth/roles.test.ts`
- Modify: `app/lib/auth/index.ts`
- Modify: `app/routes/_index.tsx`
- Modify: `app/routes/login.tsx`

**Reguły projektowe:** jedno źródło prawdy dla „dokąd po roli" (DRY); brak zmian w `authz.ts`.

- [ ] **Step 1: Napisz failujący unit test `defaultPathForRole`**

Utwórz `app/lib/auth/roles.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { defaultPathForRole } from "./roles";

describe("defaultPathForRole", () => {
  it("trener → /trener", () => {
    expect(defaultPathForRole("trainer")).toBe("/trener");
  });
  it("podopieczny → /podopieczny", () => {
    expect(defaultPathForRole("trainee")).toBe("/podopieczny");
  });
  it("brand_admin → /marka", () => {
    expect(defaultPathForRole("brand_admin")).toBe("/marka");
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAILOWAĆ**

Run: `npx vitest run app/lib/auth/roles.test.ts`
Expected: FAIL („Cannot find module './roles'" lub „defaultPathForRole is not a function").

- [ ] **Step 3: Utwórz `app/lib/auth/roles.ts`**

```ts
export type Role = "trainer" | "trainee" | "brand_admin";

/** Jedyne źródło prawdy: dokąd kierujemy użytkownika po zalogowaniu / przy guardzie roli. */
export function defaultPathForRole(role: Role): string {
  switch (role) {
    case "trainer":
      return "/trener";
    case "trainee":
      return "/podopieczny";
    case "brand_admin":
      return "/marka";
  }
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npx vitest run app/lib/auth/roles.test.ts`
Expected: PASS (3 testy).

- [ ] **Step 5: Przełącz `index.ts` na `roles.ts` i rozszerz `AuthUser`**

W `app/lib/auth/index.ts`:
- usuń lokalną definicję `export type Role = "trainer" | "trainee";`,
- dodaj na górze import: `import { type Role, defaultPathForRole } from "./roles";`
- dodaj do `AuthUser` dwa pola:
```ts
  organizationId: string | null;
  regionId: string | null;
```
- w `getOptionalUser` dodaj do zwracanego obiektu (po `trainerId: u.trainerId,`):
```ts
    organizationId: u.organizationId,
    regionId: u.regionId,
```
- w `requireUser` zamień:
```ts
    throw redirect(user.role === "trainer" ? "/trener" : "/podopieczny");
```
na:
```ts
    throw redirect(defaultPathForRole(user.role));
```
- w bloku re-exportów dodaj:
```ts
export { type Role, defaultPathForRole } from "./roles";
```

- [ ] **Step 6: Zaktualizuj redirect w `app/routes/_index.tsx`**

Dodaj import i zamień ternary:
```ts
import { defaultPathForRole, getOptionalUser } from "~/lib/auth";
```
```ts
  throw redirect(defaultPathForRole(user.role));
```

- [ ] **Step 7: Zaktualizuj redirecty w `app/routes/login.tsx`**

Dodaj `defaultPathForRole` do importu z `~/lib/auth` i zamień oba miejsca:
- w `loader`:
```ts
      return redirect(defaultPathForRole(session.user.role));
```
- w `action` (zachowaj nagłówek Set-Cookie):
```ts
  return redirect(defaultPathForRole(user.role), {
    headers: { "Set-Cookie": buildSetCookie(id, expiresAt) },
  });
```

- [ ] **Step 8: Typecheck + lint + unit**

Run: `npm run typecheck` → PASS
Run: `npx biome format --write app/lib/auth/roles.ts app/lib/auth/index.ts app/routes/_index.tsx app/routes/login.tsx`
Run: `npx vitest run app/lib/auth/roles.test.ts` → PASS

- [ ] **Step 9: Review per task** — `/code-review` na diffie.

**Krytyczny przepływ:** TAK (auth) → pokrycie: unit (mapowanie ścieżek) + Task 7 (enum/CHECK).

---

## Task 3: Moduł `organizations` — walidator (TDD) + funkcje DB

**Files:**
- Create: `app/lib/organizations-types.ts`
- Create: `app/lib/organizations-types.test.ts`
- Create: `app/lib/organizations.ts`

**Reguły projektowe:** czysta walidacja oddzielona od DB (jak inne `*-types.ts`); funkcje DB idempotentne; `currency ∈ {pln,eur}`, `locale ∈ {pl-PL,fr-FR}`.

- [ ] **Step 1: Napisz failujący unit test walidatora**

Utwórz `app/lib/organizations-types.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { RegionInputSchema } from "./organizations-types";

const base = {
  organizationId: "11111111-1111-1111-1111-111111111111",
  name: "Polska",
  country: "PL",
  currency: "pln",
  locale: "pl-PL",
};

describe("RegionInputSchema", () => {
  it("akceptuje poprawny region PL", () => {
    expect(RegionInputSchema.safeParse(base).success).toBe(true);
  });
  it("akceptuje region FR (eur, fr-FR)", () => {
    expect(
      RegionInputSchema.safeParse({ ...base, name: "France", country: "FR", currency: "eur", locale: "fr-FR" })
        .success,
    ).toBe(true);
  });
  it("odrzuca walutę wielkimi literami (PLN)", () => {
    expect(RegionInputSchema.safeParse({ ...base, currency: "PLN" }).success).toBe(false);
  });
  it("odrzuca country inne niż 2 wielkie litery", () => {
    expect(RegionInputSchema.safeParse({ ...base, country: "Pl" }).success).toBe(false);
  });
  it("odrzuca nieznane locale", () => {
    expect(RegionInputSchema.safeParse({ ...base, locale: "en-US" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom — ma FAILOWAĆ**

Run: `npx vitest run app/lib/organizations-types.test.ts`
Expected: FAIL („Cannot find module './organizations-types'").

- [ ] **Step 3: Utwórz `app/lib/organizations-types.ts`**

```ts
import { z } from "zod";

/** Waluty/locale wspierane w plasterku #1 (PL teraz, FR przygotowane pod #2). */
export const RegionInputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(64),
  country: z.string().regex(/^[A-Z]{2}$/), // ISO-3166 alpha-2
  currency: z.enum(["pln", "eur"]),
  locale: z.enum(["pl-PL", "fr-FR"]),
});

export type RegionInput = z.infer<typeof RegionInputSchema>;
```

- [ ] **Step 4: Uruchom — ma przejść**

Run: `npx vitest run app/lib/organizations-types.test.ts`
Expected: PASS (5 testów).

- [ ] **Step 5: Utwórz `app/lib/organizations.ts` (funkcje DB, idempotentne)**

```ts
import { and, eq } from "drizzle-orm";
import { hashPassword } from "./auth";
import type { Db } from "./db/client";
import * as schema from "./db/schema";
import { type RegionInput, RegionInputSchema } from "./organizations-types";

/** Singleton w #1: zwraca istniejącą organizację albo tworzy nową o podanej nazwie. */
export async function ensureOrganization(db: Db, name: string): Promise<string> {
  const existing = await db.select({ id: schema.organizations.id }).from(schema.organizations).limit(1);
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
    .where(and(eq(schema.regions.organizationId, v.organizationId), eq(schema.regions.country, v.country)))
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
  await db.update(schema.users).set({ organizationId, regionId }).where(eq(schema.users.id, userId));
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
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .limit(1);
  if (existing[0]) return existing[0].id;
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
```

- [ ] **Step 6: Typecheck + lint + unit**

Run: `npm run typecheck` → PASS
Run: `npx biome format --write app/lib/organizations.ts app/lib/organizations-types.ts app/lib/organizations-types.test.ts`
Run: `npx vitest run app/lib/organizations-types.test.ts` → PASS

- [ ] **Step 7: Review per task** — `/code-review` na diffie.

**Krytyczny przepływ:** TAK (zapisy/tenant model) → integ w Task 7.

---

## Task 4: Seed — bootstrap marki + backfill userów

**Files:**
- Modify: `scripts/seed.ts`

**Reguły projektowe:** seed idempotentny; nie nadpisuje już-przypisanych userów (`isNull` guard); env tylko-seedowe (jak `SEED_TRAINER_*`).

- [ ] **Step 1: Rozszerz importy w `scripts/seed.ts`**

Zmień linię importów drizzle i dodaj moduł organizacji:
```ts
import { count, eq, isNull, and } from "drizzle-orm";
```
```ts
import { ensureBrandAdmin, ensureOrganization, ensureRegion, assignUserToOrgRegion } from "../app/lib/organizations";
```

- [ ] **Step 2: Dodaj blok bootstrapu marki PRZED `await sql.end();`**

```ts
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

    console.log("[seed] Tenancy marki gotowa:");
    console.log(`[seed]   organizacja: ${brandName}`);
    console.log("[seed]   region:      Polska (PL, pln, pl-PL)");
    console.log(`[seed]   brand_admin: ${brandAdminEmail}`);
    console.log("[seed]   ZMIEŃ HASŁO PREZESA PO PIERWSZYM LOGOWANIU.");
  } else {
    console.log("[seed] BRAND_NAME/BRAND_ADMIN_EMAIL/BRAND_ADMIN_PASSWORD nie ustawione — pomijam bootstrap marki.");
  }
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck` → PASS
Run: `npx biome format --write scripts/seed.ts`

- [ ] **Step 4: Review per task** — `/code-review` na diffie.

> **Uruchomienie seeda = HANDOFF (właściciel):** `npm run db:seed` po migracji, z ustawionym `BRAND_*` w env.

**Krytyczny przepływ:** TAK (backfill tenant) → integ w Task 7 (idempotencja `ensure*`).

---

## Task 5: Obszar `/marka` — layout + placeholder

**Files:**
- Create: `app/routes/marka/_layout.tsx`
- Create: `app/routes/marka/_index.tsx`
- Create: `app/routes/marka/README.md`
- Modify: `app/routes.ts`

**Reguły projektowe:** trasa = plik + wpis w `app/routes.ts`; UI po polsku, brand małą literą; **warstwa wizualna → `frontend-design:frontend-design`**, trzymaj się design-systemu (`app/styles/tokens.css`, klasy jak w `trener/_layout.tsx`: `app`, `topbar`, `brand`, `topbar-eyebrow`, `main view-fade`). `requireUser({ role: "brand_admin" })`.

- [ ] **Step 1: Zarejestruj trasę w `app/routes.ts`**

Po bloku `...prefix("podopieczny", [...])` (przed zamykającym `] satisfies RouteConfig;`) dodaj:
```ts
  ...prefix("marka", [
    layout("routes/marka/_layout.tsx", [index("routes/marka/_index.tsx")]),
  ]),
```

- [ ] **Step 2: Utwórz layout `app/routes/marka/_layout.tsx`**

(minimalny topbar + Outlet; wzorzec z `trener/_layout.tsx`, ale bez sidenav/liczników)
```tsx
import { Outlet, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { UserMenu } from "~/components/user-menu";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  return { user };
}

export default function MarkaLayout() {
  const { user } = useLoaderData<typeof loader>();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>kalisthenos</span>
          <span className="brand-dot" />
        </div>
        <span className="topbar-eyebrow">MARKA</span>
        <div className="topbar-spacer" />
        <UserMenu displayName={user.displayName} />
      </header>
      <main className="main view-fade">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Utwórz placeholder `app/routes/marka/_index.tsx`**

```tsx
export default function MarkaIndex() {
  return (
    <section style={{ maxWidth: 640, margin: "0 auto", textAlign: "center", paddingTop: 48 }}>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        Panel marki
      </div>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Wkrótce</h1>
      <p style={{ color: "var(--muted)" }}>
        Tu powstanie przegląd sieci ambasadorów i podopiecznych. Na razie konto
        prezesa służy do potwierdzenia, że hierarchia marki działa.
      </p>
    </section>
  );
}
```
> Jeśli klasy/zmienne (`eyebrow`, `--muted`) nie istnieją w `app/styles/tokens.css`, dobierz istniejące odpowiedniki przez `frontend-design` — nie wymyślaj nowych tokenów.

- [ ] **Step 4: Utwórz `app/routes/marka/README.md`** (konwencja katalogu-liścia):
```md
# app/routes/marka — widoki prezesa marki (`/marka/*`)

Obszar `brand_admin` (prezes). Layout wymaga roli `brand_admin`
(`requireUser({ role: "brand_admin" })`); inne role są odbijane przez
`defaultPathForRole`.

| Plik | URL | Opis |
|---|---|---|
| `_layout.tsx` | `/marka` | Layout (topbar + UserMenu + Outlet), guard roli prezesa. |
| `_index.tsx` | `/marka` | Placeholder „Panel marki — wkrótce" (dashboard sieci → plasterek #4). |
```

- [ ] **Step 5: Typecheck + lint + build**

Run: `npm run typecheck` → PASS
Run: `npx biome format --write app/routes.ts app/routes/marka/_layout.tsx app/routes/marka/_index.tsx`
Run: `npm run build` → PASS (trasa wkompilowana).

- [ ] **Step 6: Review per task** — `/code-review` na diffie warstwy UI.

**Krytyczny przepływ:** dostęp/rola — zachowanie guardów pokryte przez `defaultPathForRole` (unit, Task 2) + enum (Task 7).

---

## Task 6: Env + dokumentacja

**Files:**
- Modify: `.env.example`
- Modify: `app/lib/db/README.md`, `app/lib/README.md`, `app/lib/auth/README.md`, `app/routes/README.md`, `scripts/README.md`, root `README.md`, `CLAUDE.md`

**Reguły projektowe:** dokumentacja = część „done"; env tylko-seedowe nie idzie do `app/lib/env.ts` (spójnie z `SEED_TRAINER_*`, które też są tylko w seedzie/`.env.example`).

- [ ] **Step 1: Dopisz zmienne do `.env.example`**

Dodaj sekcję:
```
# Bootstrap tenancy marki (używane TYLKO przez scripts/seed.ts; aplikacja działa bez nich)
BRAND_NAME=
BRAND_ADMIN_EMAIL=
BRAND_ADMIN_PASSWORD=
# opcjonalne; domyślnie = BRAND_NAME
BRAND_ADMIN_NAME=
```

- [ ] **Step 2: Zaktualizuj `app/lib/db/README.md`** — dopisz tabele `organizations`, `regions` oraz nowe kolumny `users.organization_id`/`region_id` i rozszerzony enum `user_role` o `brand_admin`.

- [ ] **Step 3: Zaktualizuj `app/lib/README.md`** — dopisz moduł `organizations.ts` (+`organizations-types.ts`) w tabeli plików.

- [ ] **Step 4: Zaktualizuj `app/lib/auth/README.md`** — `roles.ts` (`Role`, `defaultPathForRole`), nowe pola `AuthUser.organizationId/regionId`, rola `brand_admin`.

- [ ] **Step 5: Zaktualizuj `app/routes/README.md`** — dodaj obszar `/marka` (link do `app/routes/marka/README.md`).

- [ ] **Step 6: Zaktualizuj `scripts/README.md`** — bootstrap marki + nowe env `BRAND_*`.

- [ ] **Step 7: Zaktualizuj root `README.md`** — sekcja env: nowe `BRAND_*` (seedowe).

- [ ] **Step 8: Zaktualizuj `CLAUDE.md`** — mapa projektu: nowy katalog tras `app/routes/marka/` oraz nowe moduły `app/lib/organizations.ts` / `app/lib/organizations-types.ts` / `app/lib/auth/roles.ts`.

- [ ] **Step 9: Review per task** — `/code-review` na diffie docs.

**Krytyczny przepływ:** NIE.

---

## Task 7: Test integracyjny — tenancy marki (PISANY, NIE uruchamiany)

**Files:**
- Create: `tests/brand-tenancy.itest.ts`

**Reguły projektowe:** `*.itest.ts` pisze Claude, **uruchamia właściciel** pod Dockerem (`npm run test:itest`). Wzorzec z `tests/lists-sort-filter-tenant-scope.itest.ts` (testcontainers + `migrate`).

- [ ] **Step 1: Utwórz `tests/brand-tenancy.itest.ts`**

```ts
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
    const [org] = await db.select({ id: schema.organizations.id }).from(schema.organizations).limit(1);
    const r1 = await ensureRegion(db, {
      organizationId: org!.id, name: "Polska", country: "PL", currency: "pln", locale: "pl-PL",
    });
    const r2 = await ensureRegion(db, {
      organizationId: org!.id, name: "Polska", country: "PL", currency: "pln", locale: "pl-PL",
    });
    expect(r1).toBe(r2);
  });
});

describe("assignUserToOrgRegion + ensureBrandAdmin", () => {
  it("przypisuje trenera do org+region; brand_admin globalny (region NULL)", async () => {
    const [org] = await db.select({ id: schema.organizations.id }).from(schema.organizations).limit(1);
    const regionId = await ensureRegion(db, {
      organizationId: org!.id, name: "Polska", country: "PL", currency: "pln", locale: "pl-PL",
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
      organizationId: org!.id, email: "prezes@example.com", displayName: "Prezes", password: "supertajne1",
    });
    const adminId2 = await ensureBrandAdmin(db, {
      organizationId: org!.id, email: "prezes@example.com", displayName: "Prezes", password: "supertajne1",
    });
    expect(adminId1).toBe(adminId2); // idempotencja po email

    const [aRow] = await db
      .select({ role: schema.users.role, orgId: schema.users.organizationId, regionId: schema.users.regionId, trainerId: schema.users.trainerId })
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
    const [org] = await db.select({ id: schema.organizations.id }).from(schema.organizations).limit(1);
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
```

- [ ] **Step 2: Typecheck + lint (bez uruchamiania testu — wymaga Dockera)**

Run: `npm run typecheck` → PASS
Run: `npx biome format --write tests/brand-tenancy.itest.ts`

- [ ] **Step 3: Dopisz wiersz do `tests/README.md`** (tabela plików): `brand-tenancy.itest.ts` — idempotencja `ensureOrganization/ensureRegion/ensureBrandAdmin`, `assignUserToOrgRegion`, CHECK roli (brand_admin z trainer_id / trainee bez trainer_id → odrzucone).

- [ ] **Step 4: Review per task** — `/code-review` na diffie.

> **Uruchomienie = HANDOFF (właściciel):** `npm run test:itest` pod Dockerem.

**Krytyczny przepływ:** TAK (auth + tenant model).

---

## Bramki końcowe (po wszystkich taskach — z dowodem)

1. `npm run test:unit` (unit; NIE `npm test` — to watch) → zielone
2. `npm run typecheck` → zielone
3. `npm run lint` → zielone
4. `npm run build` → zielone
5. Dokumentacja zaktualizowana (Task 6)
6. `/code-review` na całości diffu
7. `/security-review` — **wymagane** (dotyka roli/auth/tenant-scope)
8. Testy integ: zaraportować i poprosić właściciela o `npm run test:itest`

## Handoff (granica gita)
- Lista zmienionych/utworzonych plików.
- Proponowany komunikat commita (tekst).
- Migracje: **właściciel** uruchamia `npm run db:generate` (TTY; wybór „create" przy promptach), potem `npm run db:migrate`.
- Seed: **właściciel** ustawia `BRAND_NAME`/`BRAND_ADMIN_EMAIL`/`BRAND_ADMIN_PASSWORD` (opc. `BRAND_ADMIN_NAME`) i uruchamia `npm run db:seed`.
- Testy do odpalenia: `npm run test:itest` (Docker) — w tym nowy `tests/brand-tenancy.itest.ts`.
- Ręczna weryfikacja: zaloguj się jako prezes → ląduje na `/marka`; wejście na `/trener` lub `/podopieczny` odbija na `/marka`; istniejący trener/podopieczny działają jak dotąd.

---

## Self-review (pokrycie specu)

- §3 Schemat → Task 1 ✔ (tabele, kolumny, enum, CHECK).
- §4 Auth/authz → Task 2 ✔ (`AuthUser`, `defaultPathForRole`, redirecty; `authz.ts` świadomie bez zmian) + Task 5 ✔ (`/marka` guard).
- §5 Migracja/seed → Task 1 (handoff generate/migrate) + Task 4 ✔ (seed) ; env → Task 6 ✔.
  - **Odchylenie od specu (świadome):** env `BRAND_*` są **tylko-seedowe** (czytane w `scripts/seed.ts` przez `process.env`), nie dodajemy ich do `app/lib/env.ts` — spójnie z istniejącymi `SEED_TRAINER_*`. Inwariant org/region (nullable + app-enforced) bez zmian względem specu.
- §6 Repo/trasy/docs → repo bez zmian ✔; `/marka` w `routes.ts` (Task 5) ✔; docs (Task 6) ✔.
- §7 Testy → unit `defaultPathForRole` (Task 2) + `RegionInputSchema` (Task 3); integ `brand-tenancy.itest.ts` (Task 7) ✔.
- Placeholdery: brak — każdy krok ma realny kod/komendę.
- Spójność nazw: `defaultPathForRole`, `ensureOrganization/ensureRegion/ensureBrandAdmin/assignUserToOrgRegion`, `RegionInputSchema` użyte spójnie w Task 2–7.
