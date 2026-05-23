# Kalisthenos V1 — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a React Router v7 framework-mode app on TypeScript + Postgres + Drizzle with custom session-cookie auth, an invite flow, and empty trainer/trainee layout shells, deployable locally via `pnpm dev` and CI-tested.

**Architecture:** Single Node process. RR7 SSR with loaders/actions. Postgres via Drizzle. Argon2id password hashing. Server-side session store keyed by an HttpOnly cookie. Invite tokens hashed with SHA-256; plain token in URL only. App-level tenant scoping enforced via TypeScript-typed repository functions.

**Tech Stack:** React Router v7 (framework mode), TypeScript 5.4+ (strict), Vite, Drizzle ORM + drizzle-kit, postgres-js, @node-rs/argon2, Zod, Vitest, Playwright, Biome, testcontainers for integration test Postgres.

---

## Phase context — where this fits

This is **Phase 1 of 6**. Each phase ships independently testable software. After Phase 1, the spec is implemented as far as: a person can register via invite, log in, see an empty role-specific dashboard, log out.

| Phase | Scope | Plan file |
|---|---|---|
| **1. Foundation** *(this plan)* | Repo scaffold, RR7+TS+Drizzle, users/sessions/invites schema, custom session auth, invite flow, role-based layout shells | this file |
| 2. Exercise library + files | FileStorage interface, LocalVolumeStorage, signed-URL serving, exercises CRUD with optional demo-video upload | TBD after Phase 1 |
| 3. Plan editor + versioning | Plans/sessions/blocks/items schema, draft→active→archived rules, full editor UI ported from `prototype/trainer-plan-editor.jsx` | TBD |
| 4. Workout logging | Workout logs schema, per-set video upload + serving, log form + history views | TBD |
| 5. Body photos | Body photo schema, upload + gallery, trainer review timeline | TBD |
| 6. PWA + deploy | vite-plugin-pwa, manifest + icons, Dockerfile, railway.toml, GitHub Actions CI, Sentry, backup script, production cutover | TBD |

Do not skip phases or merge them: each phase has its own self-review and ship moment.

---

## ⚠️ Execution overrides

**No git operations.** The user manages git themselves. Skip every `git` command in every task. Leave changes uncommitted.

**Code-first, review-last.** Write production code only during the per-task passes. Skip:
- test files (`.test.ts`, `.itest.ts`, `.spec.ts`)
- test-only helpers (e.g. `tests/helpers/db.ts`, `tests/helpers/request.ts`)
- running the dev server / `npm run dev` smoke tests
- `npm run typecheck` and `npm run lint` between tasks
- spec compliance + code quality reviewer subagent dispatches

After Task 16's production code is written, a final pass writes the tests, runs typecheck/lint/test/e2e, performs code review, and starts the app. The "Commit", "Test", and "Run" steps in each task are deferred to this final pass.

**npm, not pnpm.** This project uses npm. Translate every `pnpm <cmd>` in the plan to its npm equivalent:
- `pnpm install` → `npm install`
- `pnpm dev` → `npm run dev`
- `pnpm typecheck` → `npm run typecheck`
- `pnpm lint` → `npm run lint`
- `pnpm test:unit` → `npm run test:unit`
- `pnpm test:itest` → `npm run test:itest`
- `pnpm e2e` → `npm run e2e`
- `pnpm db:generate` / `db:migrate` / `db:studio` → `npm run db:generate` etc.
- `pnpm exec <bin>` → `npx <bin>`

Lockfile is `package-lock.json` (commit later, not in this session). The `prototype` move in Task 1 Step 3 was already done by the controller using a regular file move.

## Conventions used throughout this plan

- **Indent / quotes:** project uses 2-space indent, double quotes in TS, trailing commas. Biome enforces.
- **Test naming:** `*.test.ts` for unit, `*.itest.ts` for integration (DB-touching), `*.spec.ts` for Playwright E2E.
- **Package manager:** `pnpm` (lockfile committed).
- **Node:** 22 LTS (`.nvmrc` pinned).
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `refactor:`, `docs:`).
- **Test discipline:** every feature task ends with `pnpm test --run` + `pnpm typecheck` + `pnpm lint` all green before the commit step.

---

## File structure created by this phase

```
/                                       # the existing working directory
├── prototype/                          # moved from current top-level files (Task 1)
│   ├── app.jsx, data.jsx, store.jsx, ...
├── app/
│   ├── root.tsx                        # Task 3
│   ├── routes.ts                       # Task 3
│   ├── routes/
│   │   ├── _index.tsx                  # Task 3 — redirects by role
│   │   ├── login.tsx                   # Task 9
│   │   ├── wyloguj.tsx                 # Task 10
│   │   ├── zaproszenie.$token.tsx      # Task 12
│   │   ├── trener/
│   │   │   ├── _layout.tsx             # Task 13
│   │   │   └── _index.tsx              # Task 13
│   │   └── podopieczny/
│   │       ├── _layout.tsx             # Task 14
│   │       └── _index.tsx              # Task 14
│   ├── lib/
│   │   ├── db/
│   │   │   ├── client.ts               # Task 4
│   │   │   ├── schema.ts               # Tasks 5-7
│   │   │   └── migrations/             # Tasks 5-7 (drizzle-kit generated)
│   │   ├── auth/
│   │   │   ├── password.ts             # Task 8
│   │   │   ├── session.ts              # Task 9
│   │   │   └── invite.ts               # Task 11
│   │   ├── authz.ts                    # Task 15
│   │   └── env.ts                      # Task 2
│   └── styles/
│       └── tokens.css                  # Task 13 — ported :root vars from prototype/styles.css
├── tests/
│   ├── helpers/
│   │   ├── db.ts                       # Task 4 — testcontainers-backed test DB
│   │   └── request.ts                  # Task 9 — supertest-like helper hitting the RR7 handler
│   └── ... (per-feature *.itest.ts)
├── drizzle.config.ts                   # Task 4
├── react-router.config.ts              # Task 3
├── vite.config.ts                      # Task 3
├── biome.json                          # Task 2
├── vitest.config.ts                    # Task 2
├── playwright.config.ts                # Task 2
├── tsconfig.json                       # Task 2
├── package.json                        # Task 2
├── pnpm-lock.yaml                      # generated
├── .env.example                        # Task 2
├── .gitignore                          # Task 1
├── .nvmrc                              # Task 2
└── README.md                           # Task 16
```

---

## Task 1: Initialize the git repo and move the prototype aside

**Files:**
- Create: `.gitignore`
- Move: every current top-level file (`*.jsx`, `*.html`, `*.css`, `.thumbnail`) → `prototype/`

- [ ] **Step 1: Init the git repo at the working dir**

```bash
git init
git branch -m main
```

Expected: `Initialized empty Git repository in D:/praca/calisthenos/.git/`. Verify with `git status`.

- [ ] **Step 2: Create `.gitignore`**

```
# deps
node_modules/
.pnpm-store/

# build artefacts
build/
dist/
.cache/
.react-router/

# env
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# test artefacts
playwright-report/
test-results/
coverage/

# local data
data/
*.log
```

- [ ] **Step 3: Move prototype files into `prototype/`**

```bash
mkdir prototype
git mv app.jsx body-views.jsx data.jsx icons.jsx index.html kalisthenos.html store.jsx styles.css trainee-views.jsx trainer-plan-editor.jsx trainer-views.jsx tweaks-panel.jsx ui.jsx .thumbnail prototype/
```

Verify:
```bash
ls prototype/
```
Expected: 14 entries (the 13 source files + `.thumbnail`).

- [ ] **Step 4: Initial commit**

```bash
git add .gitignore prototype/ docs/
git commit -m "chore: move prototype into prototype/, add .gitignore, keep design docs"
```

Verify: `git log --oneline` shows 1 commit.

---

## Task 2: Scaffold package, TypeScript, Biome, Vitest, Playwright config

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.nvmrc`
- Create: `.env.example`
- Create: `app/lib/env.ts`

- [ ] **Step 1: Pin Node version**

```bash
echo "22" > .nvmrc
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "kalisthenos",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "react-router dev",
    "build": "react-router build",
    "start": "react-router-serve ./build/server/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "biome lint .",
    "format": "biome format --write .",
    "test": "vitest",
    "test:unit": "vitest run --exclude '**/*.itest.ts'",
    "test:itest": "vitest run --testTimeout=60000 '**/*.itest.ts'",
    "e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@react-router/node": "^7.1.0",
    "@react-router/serve": "^7.1.0",
    "@node-rs/argon2": "^2.0.0",
    "drizzle-orm": "^0.36.0",
    "isbot": "^5.1.0",
    "postgres": "^3.4.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router": "^7.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@playwright/test": "^1.49.0",
    "@react-router/dev": "^7.1.0",
    "@testcontainers/postgresql": "^10.13.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "drizzle-kit": "^0.28.0",
    "happy-dom": "^15.0.0",
    "testcontainers": "^10.13.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Install dependencies**

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` created. If any package above isn't yet at the requested version on npm, pnpm will pick the latest compatible — no action needed.

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "baseUrl": ".",
    "paths": { "~/*": ["app/*"] },
    "types": ["@react-router/node", "vite/client"]
  },
  "include": ["app/**/*", "tests/**/*", "*.config.ts"],
  "exclude": ["node_modules", "build", ".react-router", "prototype"]
}
```

- [ ] **Step 5: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "files": { "ignore": ["build", "node_modules", ".react-router", "prototype", "coverage"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noNonNullAssertion": "off" },
      "suspicious": { "noExplicitAny": "warn" }
    }
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "trailingCommas": "all", "semicolons": "always" }
  }
}
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "tests/**/*.itest.ts"],
    setupFiles: [],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { "~": new URL("./app", import.meta.url).pathname } },
});
```

- [ ] **Step 7: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: devices["Desktop Chrome"] },
    { name: "mobile",  use: devices["Pixel 7"] },
  ],
});
```

- [ ] **Step 8: Create `.env.example`**

```
DATABASE_URL=postgres://kalisthenos:kalisthenos@localhost:5432/kalisthenos
SESSION_SECRET=replace-me-32-bytes-base64
FILE_SIGNING_SECRET=replace-me-32-bytes-base64
BASE_URL=http://localhost:3000
DATA_DIR=./data
MAX_UPLOAD_BYTES=250000000
MAX_REQUEST_BYTES=1000000000
NODE_ENV=development
```

- [ ] **Step 9: Create `app/lib/env.ts` — single source of truth for env vars**

```ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  FILE_SIGNING_SECRET: z.string().min(32),
  BASE_URL: z.string().url(),
  DATA_DIR: z.string().default("./data"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(250_000_000),
  MAX_REQUEST_BYTES: z.coerce.number().int().positive().default(1_000_000_000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
```

- [ ] **Step 10: Verify everything resolves**

```bash
pnpm typecheck
pnpm lint
```

Expected: both pass (no source files to check yet, but config must parse).

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json biome.json vitest.config.ts playwright.config.ts .nvmrc .env.example app/lib/env.ts
git commit -m "chore: scaffold ts, biome, vitest, playwright, env loader"
```

---

## Task 3: Scaffold React Router v7 framework mode

**Files:**
- Create: `vite.config.ts`
- Create: `react-router.config.ts`
- Create: `app/root.tsx`
- Create: `app/routes.ts`
- Create: `app/routes/_index.tsx`

- [ ] **Step 1: Create `vite.config.ts`**

```ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
  server: { port: 3000 },
});
```

- [ ] **Step 2: Create `react-router.config.ts`**

```ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  appDirectory: "app",
  buildDirectory: "build",
} satisfies Config;
```

- [ ] **Step 3: Create `app/root.tsx`**

```tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
```

- [ ] **Step 4: Create `app/routes.ts`**

```ts
import { type RouteConfig, index, route, layout, prefix } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("wyloguj", "routes/wyloguj.tsx"),
  route("zaproszenie/:token", "routes/zaproszenie.$token.tsx"),
  ...prefix("trener", [
    layout("routes/trener/_layout.tsx", [
      index("routes/trener/_index.tsx"),
    ]),
  ]),
  ...prefix("podopieczny", [
    layout("routes/podopieczny/_layout.tsx", [
      index("routes/podopieczny/_index.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
```

- [ ] **Step 5: Create `app/routes/_index.tsx` — temporary "hello, kalisthenos" before auth lands**

```tsx
import type { LoaderFunctionArgs } from "react-router";

export async function loader(_args: LoaderFunctionArgs) {
  return { greeting: "kalisthenos" };
}

export default function Index() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>kalisthenos</h1>
      <p>Foundation up. Auth wires in Task 9.</p>
    </main>
  );
}
```

- [ ] **Step 6: Stub the four routes referenced from `routes.ts` so type-check passes**

Create `app/routes/login.tsx`:
```tsx
export default function Login() { return <p>login — stub</p>; }
```

Create `app/routes/wyloguj.tsx`:
```tsx
export default function Logout() { return <p>logout — stub</p>; }
```

Create `app/routes/zaproszenie.$token.tsx`:
```tsx
export default function Invite() { return <p>invite — stub</p>; }
```

Create `app/routes/trener/_layout.tsx`:
```tsx
import { Outlet } from "react-router";
export default function TrenerLayout() { return <Outlet />; }
```

Create `app/routes/trener/_index.tsx`:
```tsx
export default function TrenerIndex() { return <p>trener — stub</p>; }
```

Create `app/routes/podopieczny/_layout.tsx`:
```tsx
import { Outlet } from "react-router";
export default function PodopiecznyLayout() { return <Outlet />; }
```

Create `app/routes/podopieczny/_index.tsx`:
```tsx
export default function PodopiecznyIndex() { return <p>podopieczny — stub</p>; }
```

- [ ] **Step 7: Run the dev server**

```bash
pnpm dev
```

Expected: server starts on `http://localhost:3000`. Browse there → see "kalisthenos / Foundation up." Browse to `/login`, `/wyloguj`, `/zaproszenie/anything`, `/trener`, `/podopieczny` → each shows its stub text. Kill server with Ctrl-C.

- [ ] **Step 8: Typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```

Both pass.

- [ ] **Step 9: Commit**

```bash
git add vite.config.ts react-router.config.ts app/
git commit -m "feat: scaffold react-router v7 framework mode with route stubs"
```

---

## Task 4: Drizzle setup + test DB helper

**Files:**
- Create: `drizzle.config.ts`
- Create: `app/lib/db/client.ts`
- Create: `tests/helpers/db.ts`
- Modify: `package.json` scripts already point at drizzle-kit (added in Task 2)

- [ ] **Step 1: Create `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./app/lib/db/schema.ts",
  out: "./app/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 2: Create `app/lib/db/client.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "~/lib/env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 20 });
export const db = drizzle(client, { schema, logger: env.NODE_ENV === "development" });
export type Db = typeof db;
```

- [ ] **Step 3: Create a placeholder `app/lib/db/schema.ts` (real tables in Tasks 5-7)**

```ts
// Placeholder. Real schema arrives in Tasks 5-7.
export const _placeholder = true;
```

This file must exist for `client.ts` to import it.

- [ ] **Step 4: Create the integration-test DB helper at `tests/helpers/db.ts`**

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";

export interface TestDb {
  url: string;
  db: ReturnType<typeof drizzle>;
  sql: ReturnType<typeof postgres>;
  stop: () => Promise<void>;
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "app/lib/db/migrations");

export async function startTestDb(): Promise<TestDb> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("kalisthenos_test")
    .withUsername("test")
    .withPassword("test")
    .start();
  const url = container.getConnectionUri();
  const sql = postgres(url, { max: 5 });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return {
    url,
    db,
    sql,
    stop: async () => {
      await sql.end();
      await container.stop();
    },
  };
}
```

- [ ] **Step 5: Smoke-test the helper**

Create `tests/helpers/db.itest.ts`:
```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, type TestDb } from "./db";

let tdb: TestDb;
beforeAll(async () => { tdb = await startTestDb(); }, 60_000);
afterAll(async () => { await tdb.stop(); });

test("test container starts and answers SELECT 1", async () => {
  const result = await tdb.sql`SELECT 1 as one`;
  expect(result[0]).toEqual({ one: 1 });
});
```

- [ ] **Step 6: Run the integration test**

```bash
pnpm test:itest
```

Expected: PASS. (First run may pull the `postgres:16-alpine` Docker image — give it a minute. If Docker isn't running, the test fails fast — start Docker Desktop.)

If Docker is unavailable on this machine, document it in the README and fall back to an externally-running Postgres via `DATABASE_URL`. For Phase 1 we require Docker for itests.

- [ ] **Step 7: Commit**

```bash
git add drizzle.config.ts app/lib/db/ tests/helpers/db.ts tests/helpers/db.itest.ts
git commit -m "feat: drizzle config + testcontainers-backed integration DB helper"
```

---

## Task 5: Schema — users + sessions

**Files:**
- Modify: `app/lib/db/schema.ts`
- Generate: `app/lib/db/migrations/0000_*.sql`

- [ ] **Step 1: Replace `app/lib/db/schema.ts` with real users + sessions**

```ts
import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, uuid, text, timestamp, date, check, index, uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// citext is not built into drizzle-orm; declare it as a custom type
const citext = customType<{ data: string; driverData: string }>({
  dataType() { return "citext"; },
});

export const userRole = pgEnum("user_role", ["trainer", "trainee"]);

export const users = pgTable(
  "users",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    email:         citext("email").notNull(),
    passwordHash:  text("password_hash"),
    displayName:   text("display_name").notNull(),
    role:          userRole("role").notNull(),
    trainerId:     uuid("trainer_id"),
    joinedOn:      date("joined_on"),
    archivedAt:    timestamp("archived_at", { withTimezone: true }),
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailUniq: uniqueIndex("users_email_uniq").on(t.email),
    roleCheck: check(
      "users_role_check",
      sql`(${t.role} = 'trainer' AND ${t.trainerId} IS NULL) OR
          (${t.role} = 'trainee' AND ${t.trainerId} IS NOT NULL)`,
    ),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id:             text("id").primaryKey(),               // 32-byte base64url
    userId:         uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    userAgentHint:  text("user_agent_hint"),
    expiresAt:      timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx:    index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
```

- [ ] **Step 2: Generate the migration**

```bash
pnpm db:generate
```

Expected: a file like `app/lib/db/migrations/0000_<adjective>_<noun>.sql` and a `_meta/0000_snapshot.json`. Open the SQL and verify it contains `CREATE EXTENSION IF NOT EXISTS citext;` — if it doesn't, prepend that line by hand (drizzle-kit 0.28 doesn't yet auto-add extensions for citext):

```sql
CREATE EXTENSION IF NOT EXISTS citext;
```

The file should also CREATE the `user_role` enum, the `users` table with the CHECK constraint, the `sessions` table, and the indexes.

Also manually add this line after the `users` table is created (to set up the self-referencing FK that drizzle's API doesn't model cleanly):

```sql
ALTER TABLE "users"
  ADD CONSTRAINT "users_trainer_id_fk"
  FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT;
```

- [ ] **Step 3: Verify the migration runs cleanly in a fresh container**

The test from Task 4 already migrates on startup. Run:

```bash
pnpm test:itest
```

Expected: PASS (the helper migrates against the new schema; the smoke test from Task 4 still passes; no schema errors).

- [ ] **Step 4: Add an explicit migration test**

Create `app/lib/db/schema.itest.ts`:
```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, type TestDb } from "../../../tests/helpers/db";

let tdb: TestDb;
beforeAll(async () => { tdb = await startTestDb(); }, 60_000);
afterAll(async () => { await tdb.stop(); });

test("users CHECK constraint rejects trainer with non-null trainer_id", async () => {
  const promise = tdb.sql`
    INSERT INTO users (email, display_name, role, trainer_id)
    VALUES ('a@x.pl', 'A', 'trainer', gen_random_uuid())
  `;
  await expect(promise).rejects.toThrow(/users_role_check/);
});

test("users CHECK constraint rejects trainee with null trainer_id", async () => {
  const promise = tdb.sql`
    INSERT INTO users (email, display_name, role, trainer_id)
    VALUES ('a@x.pl', 'A', 'trainee', NULL)
  `;
  await expect(promise).rejects.toThrow(/users_role_check/);
});

test("users insert with valid role passes", async () => {
  const [trainer] = await tdb.sql<{ id: string }[]>`
    INSERT INTO users (email, display_name, role)
    VALUES ('t@x.pl', 'T', 'trainer')
    RETURNING id
  `;
  const trainee = await tdb.sql`
    INSERT INTO users (email, display_name, role, trainer_id)
    VALUES ('p@x.pl', 'P', 'trainee', ${trainer.id})
    RETURNING id
  `;
  expect(trainee).toHaveLength(1);
});
```

- [ ] **Step 5: Run it**

```bash
pnpm test:itest
```

Expected: 3 new tests PASS (in addition to the db helper smoke).

- [ ] **Step 6: Commit**

```bash
git add app/lib/db/
git commit -m "feat(db): users + sessions schema with role check"
```

---

## Task 6: Schema — invites

**Files:**
- Modify: `app/lib/db/schema.ts`
- Generate: `app/lib/db/migrations/0001_*.sql`

- [ ] **Step 1: Append the invites table to `app/lib/db/schema.ts`**

```ts
// append below sessions:

export const invites = pgTable(
  "invites",
  {
    id:              uuid("id").primaryKey().defaultRandom(),
    trainerId:       uuid("trainer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    displayName:     text("display_name").notNull(),
    email:           citext("email"),
    tokenHash:       text("token_hash").notNull(),
    expiresAt:       timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt:      timestamp("consumed_at", { withTimezone: true }),
    consumedByUser:  uuid("consumed_by_user").references(() => users.id),
    replacesUserId:  uuid("replaces_user_id").references(() => users.id),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUniq: uniqueIndex("invites_token_hash_uniq").on(t.tokenHash),
    trainerIdx:    index("invites_trainer_idx").on(t.trainerId),
  }),
);

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
```

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```

Expected: `0001_*.sql` containing only the `invites` table (additive, no users changes).

- [ ] **Step 3: Run integration tests**

```bash
pnpm test:itest
```

Expected: all existing tests PASS (new migration auto-applied).

- [ ] **Step 4: Add a basic invites insertion test**

Create `app/lib/db/invites.itest.ts`:
```ts
import { afterAll, beforeAll, expect, test } from "vitest";
import { startTestDb, type TestDb } from "../../../tests/helpers/db";

let tdb: TestDb;
beforeAll(async () => { tdb = await startTestDb(); }, 60_000);
afterAll(async () => { await tdb.stop(); });

test("invite row stores token_hash uniquely", async () => {
  const [trainer] = await tdb.sql<{ id: string }[]>`
    INSERT INTO users (email, display_name, role)
    VALUES ('t1@x.pl', 'T', 'trainer') RETURNING id
  `;
  await tdb.sql`
    INSERT INTO invites (trainer_id, display_name, token_hash, expires_at)
    VALUES (${trainer.id}, 'P', 'hash-abc', NOW() + INTERVAL '14 days')
  `;
  const dup = tdb.sql`
    INSERT INTO invites (trainer_id, display_name, token_hash, expires_at)
    VALUES (${trainer.id}, 'Q', 'hash-abc', NOW() + INTERVAL '14 days')
  `;
  await expect(dup).rejects.toThrow(/invites_token_hash_uniq/);
});
```

- [ ] **Step 5: Run it**

```bash
pnpm test:itest
```

Expected: 1 new test PASS.

- [ ] **Step 6: Commit**

```bash
git add app/lib/db/
git commit -m "feat(db): invites schema with token-hash uniqueness"
```

---

## Task 7: Password hashing module

**Files:**
- Create: `app/lib/auth/password.ts`
- Create: `app/lib/auth/password.test.ts`

- [ ] **Step 1: Write the failing test at `app/lib/auth/password.test.ts`**

```ts
import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "./password";

test("hashPassword produces a verifiable argon2id hash", async () => {
  const hash = await hashPassword("correct horse battery staple");
  expect(hash).toMatch(/^\$argon2id\$/);
  expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  expect(await verifyPassword(hash, "wrong password")).toBe(false);
});

test("hashes for the same password differ (salt)", async () => {
  const a = await hashPassword("pw");
  const b = await hashPassword("pw");
  expect(a).not.toBe(b);
});
```

- [ ] **Step 2: Run it (must fail with "module not found")**

```bash
pnpm test --run app/lib/auth/password.test.ts
```

Expected: FAIL — `Cannot find module './password'`.

- [ ] **Step 3: Implement `app/lib/auth/password.ts`**

```ts
import { hash, verify } from "@node-rs/argon2";

const ARGON2_OPTS = {
  memoryCost: 19_456,    // 19 MiB — OWASP 2023 minimum
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 1) throw new Error("password cannot be empty");
  return hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(stored: string, plain: string): Promise<boolean> {
  try {
    return await verify(stored, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the test (must pass)**

```bash
pnpm test --run app/lib/auth/password.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/auth/password.ts app/lib/auth/password.test.ts
git commit -m "feat(auth): argon2id password hashing module"
```

---

## Task 8: Session module — create, read, delete, sliding refresh

**Files:**
- Create: `app/lib/auth/session.ts`
- Create: `app/lib/auth/session.itest.ts`

- [ ] **Step 1: Write the failing integration test at `app/lib/auth/session.itest.ts`**

```ts
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { startTestDb, type TestDb } from "../../../tests/helpers/db";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import { createSession, readSession, destroySession, refreshIfNearExpiry } from "./session";

let tdb: TestDb;
let db: ReturnType<typeof drizzle<typeof schema>>;
let trainerId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  db = drizzle(tdb.sql, { schema });
}, 60_000);
afterAll(async () => { await tdb.stop(); });

beforeEach(async () => {
  await tdb.sql`TRUNCATE users, sessions, invites RESTART IDENTITY CASCADE`;
  const [t] = await tdb.sql<{ id: string }[]>`
    INSERT INTO users (email, display_name, role) VALUES ('t@x.pl', 'T', 'trainer') RETURNING id
  `;
  trainerId = t.id;
});

test("createSession inserts a row and returns its id and expiry", async () => {
  const { id, expiresAt } = await createSession(db, { userId: trainerId, userAgentHint: "test" });
  expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
  expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600_000);
});

test("readSession returns user when session valid", async () => {
  const { id } = await createSession(db, { userId: trainerId });
  const r = await readSession(db, id);
  expect(r?.user.id).toBe(trainerId);
});

test("readSession returns null for unknown id", async () => {
  const r = await readSession(db, "nope");
  expect(r).toBeNull();
});

test("readSession returns null for expired session", async () => {
  const { id } = await createSession(db, { userId: trainerId });
  await tdb.sql`UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = ${id}`;
  const r = await readSession(db, id);
  expect(r).toBeNull();
});

test("destroySession removes the row", async () => {
  const { id } = await createSession(db, { userId: trainerId });
  await destroySession(db, id);
  expect(await readSession(db, id)).toBeNull();
});

test("refreshIfNearExpiry rotates id when within 7 days", async () => {
  const { id } = await createSession(db, { userId: trainerId });
  await tdb.sql`UPDATE sessions SET expires_at = NOW() + INTERVAL '3 days' WHERE id = ${id}`;
  const after = await refreshIfNearExpiry(db, id);
  expect(after).not.toBeNull();
  expect(after!.id).not.toBe(id);
  expect(await readSession(db, id)).toBeNull();          // old gone
  expect(await readSession(db, after!.id)).not.toBeNull(); // new exists
});

test("refreshIfNearExpiry is no-op when far from expiry", async () => {
  const { id } = await createSession(db, { userId: trainerId });
  const after = await refreshIfNearExpiry(db, id);
  expect(after).toBeNull();
});
```

- [ ] **Step 2: Run it (must fail with module not found)**

```bash
pnpm test:itest
```

Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 3: Implement `app/lib/auth/session.ts`**

```ts
import { randomBytes } from "node:crypto";
import { eq, and, gt } from "drizzle-orm";
import type { drizzle as drizzleFactory } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";

export type Db = ReturnType<typeof drizzleFactory<typeof schema>>;

const SESSION_DURATION_DAYS = 30;
const REFRESH_WHEN_DAYS_LEFT = 7;

function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

function inDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 3600 * 1000);
}

export interface CreateSessionInput {
  userId: string;
  userAgentHint?: string | null;
}

export async function createSession(db: Db, input: CreateSessionInput) {
  const id = newSessionId();
  const expiresAt = inDays(SESSION_DURATION_DAYS);
  await db.insert(schema.sessions).values({
    id,
    userId: input.userId,
    userAgentHint: input.userAgentHint ?? null,
    expiresAt,
  });
  return { id, expiresAt };
}

export async function readSession(db: Db, id: string) {
  const rows = await db
    .select({
      session: schema.sessions,
      user: schema.users,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.user.archivedAt) return null;
  return row;
}

export async function destroySession(db: Db, id: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
}

export async function refreshIfNearExpiry(db: Db, id: string) {
  const current = await readSession(db, id);
  if (!current) return null;
  const msLeft = current.session.expiresAt.getTime() - Date.now();
  if (msLeft > REFRESH_WHEN_DAYS_LEFT * 24 * 3600 * 1000) return null;
  await destroySession(db, id);
  return createSession(db, { userId: current.user.id, userAgentHint: current.session.userAgentHint });
}
```

- [ ] **Step 4: Run the test**

```bash
pnpm test:itest
```

Expected: all 7 session tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/auth/session.ts app/lib/auth/session.itest.ts
git commit -m "feat(auth): server-side session module with sliding refresh"
```

---

## Task 9: Cookie helper + login & logout routes

**Files:**
- Create: `app/lib/auth/cookie.ts`
- Create: `app/lib/auth/cookie.test.ts`
- Modify: `app/routes/login.tsx`
- Modify: `app/routes/wyloguj.tsx`
- Create: `tests/helpers/request.ts`
- Create: `app/routes/login.itest.ts`

- [ ] **Step 1: Write the cookie unit test at `app/lib/auth/cookie.test.ts`**

```ts
import { expect, test } from "vitest";
import { buildSetCookie, parseSessionId } from "./cookie";

test("buildSetCookie includes HttpOnly, Secure (in prod), SameSite=Lax, Path=/", () => {
  const c = buildSetCookie("abc", new Date("2030-01-01T00:00:00Z"));
  expect(c).toContain("__kth_session=abc");
  expect(c).toContain("HttpOnly");
  expect(c).toContain("SameSite=Lax");
  expect(c).toContain("Path=/");
  expect(c).toContain("Expires=");
});

test("buildSetCookie with empty id and past expires clears cookie", () => {
  const c = buildSetCookie("", new Date(0));
  expect(c).toContain("__kth_session=;");
  expect(c).toMatch(/Expires=Thu, 01 Jan 1970/);
});

test("parseSessionId reads from Cookie header", () => {
  expect(parseSessionId("__kth_session=abc; other=foo")).toBe("abc");
  expect(parseSessionId("other=foo")).toBeNull();
  expect(parseSessionId(null)).toBeNull();
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm test --run app/lib/auth/cookie.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `app/lib/auth/cookie.ts`**

```ts
import { env } from "~/lib/env";

const COOKIE_NAME = "__kth_session";

export function buildSetCookie(sessionId: string, expiresAt: Date): string {
  const parts = [
    `${COOKIE_NAME}=${sessionId}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function parseSessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const [k, ...rest] = part.split("=");
    if (k === COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}
```

- [ ] **Step 4: Run, see pass**

```bash
pnpm test --run app/lib/auth/cookie.test.ts
```

Expected: 3 PASS.

- [ ] **Step 5: Create the request helper at `tests/helpers/request.ts`**

This lets integration tests hit RR7 route loaders/actions directly without an HTTP server.

```ts
import type { Db } from "../../app/lib/auth/session";

export interface TestRequest {
  url: string;
  method?: "GET" | "POST";
  body?: FormData | string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}

export function buildRequest(req: TestRequest): Request {
  const url = req.url.startsWith("http") ? req.url : `http://localhost${req.url}`;
  const headers = new Headers(req.headers);
  if (req.cookies) {
    headers.set(
      "Cookie",
      Object.entries(req.cookies).map(([k, v]) => `${k}=${v}`).join("; "),
    );
  }
  return new Request(url, {
    method: req.method ?? "GET",
    body: req.body,
    headers,
  });
}

export function readSetCookie(headers: Headers): string | null {
  return headers.get("set-cookie");
}

export function extractSessionId(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const m = setCookie.match(/__kth_session=([^;]+)/);
  return m?.[1] ?? null;
}

// inject a Db into the route's context — we'll wire this in Step 7 below
export const TEST_DB_CTX_KEY = Symbol("test-db");
export interface TestContext { [TEST_DB_CTX_KEY]?: Db }
```

- [ ] **Step 6: Implement `app/routes/login.tsx`** (replace the stub)

```tsx
import {
  redirect, Form, useActionData,
  type ActionFunctionArgs, type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { verifyPassword } from "~/lib/auth/password";
import { createSession, readSession } from "~/lib/auth/session";
import { buildSetCookie, parseSessionId } from "~/lib/auth/cookie";

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

function dbFrom(args: { context?: { db?: typeof defaultDb } }) {
  return args.context?.db ?? defaultDb;
}

export async function loader(args: LoaderFunctionArgs) {
  const sid = parseSessionId(args.request.headers.get("cookie"));
  if (sid) {
    const session = await readSession(dbFrom(args), sid);
    if (session) {
      return redirect(session.user.role === "trainer" ? "/trener" : "/podopieczny");
    }
  }
  return null;
}

export async function action(args: ActionFunctionArgs) {
  const db = dbFrom(args);
  const formData = await args.request.formData();
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Niepoprawne dane logowania." };
  }
  const { email, password } = parsed.data;
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const user = rows[0];
  if (!user || !user.passwordHash || user.archivedAt) {
    return { error: "Niepoprawne dane logowania." };
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    return { error: "Niepoprawne dane logowania." };
  }
  const { id, expiresAt } = await createSession(db, {
    userId: user.id,
    userAgentHint: args.request.headers.get("user-agent"),
  });
  return redirect(user.role === "trainer" ? "/trener" : "/podopieczny", {
    headers: { "Set-Cookie": buildSetCookie(id, expiresAt) },
  });
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 360 }}>
      <h1>Zaloguj się</h1>
      <Form method="post" style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" style={{ display: "block", width: "100%" }} />
        </label>
        <label>
          Hasło
          <input name="password" type="password" required autoComplete="current-password" style={{ display: "block", width: "100%" }} />
        </label>
        {actionData && "error" in actionData && (
          <p role="alert" style={{ color: "crimson" }}>{actionData.error}</p>
        )}
        <button type="submit">Zaloguj</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 7: Implement `app/routes/wyloguj.tsx`** (replace the stub)

```tsx
import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { db as defaultDb } from "~/lib/db/client";
import { destroySession } from "~/lib/auth/session";
import { buildSetCookie, parseSessionId } from "~/lib/auth/cookie";

function dbFrom(args: { context?: { db?: typeof defaultDb } }) {
  return args.context?.db ?? defaultDb;
}

async function performLogout(args: LoaderFunctionArgs | ActionFunctionArgs) {
  const sid = parseSessionId(args.request.headers.get("cookie"));
  if (sid) await destroySession(dbFrom(args), sid);
  return redirect("/login", {
    headers: { "Set-Cookie": buildSetCookie("", new Date(0)) },
  });
}

export const loader = performLogout;
export const action = performLogout;
```

- [ ] **Step 8: Write the login integration test at `app/routes/login.itest.ts`**

```ts
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { startTestDb, type TestDb } from "../../tests/helpers/db";
import { buildRequest, readSetCookie, extractSessionId } from "../../tests/helpers/request";
import * as schema from "~/lib/db/schema";
import { hashPassword } from "~/lib/auth/password";
import { action as loginAction, loader as loginLoader } from "./login";
import { action as logoutAction } from "./wyloguj";

let tdb: TestDb;
let db: ReturnType<typeof drizzle<typeof schema>>;
beforeAll(async () => {
  tdb = await startTestDb();
  db = drizzle(tdb.sql, { schema });
}, 60_000);
afterAll(async () => { await tdb.stop(); });

beforeEach(async () => {
  await tdb.sql`TRUNCATE users, sessions, invites RESTART IDENTITY CASCADE`;
  const passwordHash = await hashPassword("hunter2");
  await db.insert(schema.users).values({
    email: "trainer@x.pl",
    displayName: "T",
    role: "trainer",
    passwordHash,
  });
});

test("POST /login with valid creds returns 302 to /trener and sets cookie", async () => {
  const fd = new FormData();
  fd.set("email", "trainer@x.pl");
  fd.set("password", "hunter2");
  const result = await loginAction({
    request: buildRequest({ url: "/login", method: "POST", body: fd }),
    params: {},
    context: { db },
  } as any);
  expect(result).toBeInstanceOf(Response);
  const res = result as Response;
  expect(res.status).toBe(302);
  expect(res.headers.get("Location")).toBe("/trener");
  expect(readSetCookie(res.headers)).toMatch(/__kth_session=/);
});

test("POST /login with wrong password returns error object", async () => {
  const fd = new FormData();
  fd.set("email", "trainer@x.pl");
  fd.set("password", "wrong");
  const result = await loginAction({
    request: buildRequest({ url: "/login", method: "POST", body: fd }),
    params: {},
    context: { db },
  } as any);
  expect(result).toEqual({ error: "Niepoprawne dane logowania." });
});

test("POST /login with archived user returns error object", async () => {
  await tdb.sql`UPDATE users SET archived_at = NOW() WHERE email = 'trainer@x.pl'`;
  const fd = new FormData();
  fd.set("email", "trainer@x.pl");
  fd.set("password", "hunter2");
  const result = await loginAction({
    request: buildRequest({ url: "/login", method: "POST", body: fd }),
    params: {},
    context: { db },
  } as any);
  expect(result).toEqual({ error: "Niepoprawne dane logowania." });
});

test("GET /login with existing session redirects to role dashboard", async () => {
  // arrange: log in to get a cookie
  const fd = new FormData();
  fd.set("email", "trainer@x.pl");
  fd.set("password", "hunter2");
  const loginRes = (await loginAction({
    request: buildRequest({ url: "/login", method: "POST", body: fd }),
    params: {},
    context: { db },
  } as any)) as Response;
  const sid = extractSessionId(readSetCookie(loginRes.headers));
  expect(sid).toBeTruthy();

  const result = await loginLoader({
    request: buildRequest({ url: "/login", cookies: { __kth_session: sid! } }),
    params: {},
    context: { db },
  } as any);
  expect(result).toBeInstanceOf(Response);
  expect((result as Response).status).toBe(302);
  expect((result as Response).headers.get("Location")).toBe("/trener");
});

test("POST /wyloguj destroys session and clears cookie", async () => {
  const fd = new FormData();
  fd.set("email", "trainer@x.pl");
  fd.set("password", "hunter2");
  const loginRes = (await loginAction({
    request: buildRequest({ url: "/login", method: "POST", body: fd }),
    params: {},
    context: { db },
  } as any)) as Response;
  const sid = extractSessionId(readSetCookie(loginRes.headers))!;

  const logoutRes = (await logoutAction({
    request: buildRequest({
      url: "/wyloguj", method: "POST", cookies: { __kth_session: sid },
    }),
    params: {},
    context: { db },
  } as any)) as Response;
  expect(logoutRes.status).toBe(302);
  expect(logoutRes.headers.get("Location")).toBe("/login");
  expect(readSetCookie(logoutRes.headers)).toMatch(/__kth_session=;/);

  const remaining = await tdb.sql`SELECT count(*)::int as n FROM sessions WHERE id = ${sid}`;
  expect(remaining[0].n).toBe(0);
});
```

- [ ] **Step 9: Run all integration tests**

```bash
pnpm test:itest
```

Expected: all login + logout tests PASS along with previous tests.

- [ ] **Step 10: Manual smoke**

```bash
pnpm dev
```

In another terminal:
```bash
# seed a trainer via psql or via a one-off SQL — example using docker:
# (skip if you already have a running postgres; this is just to manual-smoke)
```

Open `http://localhost:3000/login`, see the form. Submit anything → "Niepoprawne dane logowania." Kill server.

- [ ] **Step 11: Commit**

```bash
git add app/lib/auth/cookie.ts app/lib/auth/cookie.test.ts app/routes/login.tsx app/routes/wyloguj.tsx tests/helpers/request.ts app/routes/login.itest.ts
git commit -m "feat(auth): login + logout routes with cookie sessions and integration tests"
```

---

## Task 10: requireUser / getOptionalUser middleware-style helpers

**Files:**
- Create: `app/lib/auth/index.ts`
- Create: `app/lib/auth/require.test.ts`

- [ ] **Step 1: Failing test at `app/lib/auth/require.test.ts`**

Note: this is a unit test that stubs the DB — it just verifies the contract.

```ts
import { describe, expect, test } from "vitest";
import { getOptionalUser, requireUser } from "./index";
import { buildRequest } from "../../../tests/helpers/request";

function fakeDb(session: { id: string; user: { id: string; role: "trainer" | "trainee" } } | null) {
  return {
    __isFake: true,
    __session: session,
  } as any;
}

describe("getOptionalUser", () => {
  test("returns null when no cookie", async () => {
    const u = await getOptionalUser(buildRequest({ url: "/" }), fakeDb(null));
    expect(u).toBeNull();
  });

  test("returns user when cookie maps to a valid session", async () => {
    const session = { id: "abc", user: { id: "u1", role: "trainer" as const } };
    const u = await getOptionalUser(
      buildRequest({ url: "/", cookies: { __kth_session: "abc" } }),
      fakeDb(session),
    );
    expect(u?.id).toBe("u1");
  });
});

describe("requireUser", () => {
  test("throws redirect Response to /login when no user", async () => {
    try {
      await requireUser(buildRequest({ url: "/trener" }), fakeDb(null));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(302);
      expect((e as Response).headers.get("Location")).toBe("/login");
    }
  });

  test("returns user when present", async () => {
    const session = { id: "abc", user: { id: "u1", role: "trainer" as const } };
    const u = await requireUser(
      buildRequest({ url: "/trener", cookies: { __kth_session: "abc" } }),
      fakeDb(session),
    );
    expect(u.id).toBe("u1");
  });

  test("rejects with redirect when required role doesn't match", async () => {
    const session = { id: "abc", user: { id: "u1", role: "trainee" as const } };
    try {
      await requireUser(
        buildRequest({ url: "/trener", cookies: { __kth_session: "abc" } }),
        fakeDb(session),
        { role: "trainer" },
      );
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      expect((e as Response).status).toBe(302);
      expect((e as Response).headers.get("Location")).toBe("/podopieczny");
    }
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm test --run app/lib/auth/require.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/lib/auth/index.ts`**

```ts
import { redirect } from "react-router";
import type { Db } from "./session";
import { readSession } from "./session";
import { parseSessionId } from "./cookie";

export type Role = "trainer" | "trainee";
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  trainerId: string | null;
}

function toAuthUser(u: { id: string; email: string; displayName: string; role: Role; trainerId: string | null }): AuthUser {
  return { id: u.id, email: u.email, displayName: u.displayName, role: u.role, trainerId: u.trainerId };
}

// Internal: support both real Db and the fake used in unit tests
async function loadUser(request: Request, db: any): Promise<AuthUser | null> {
  const sid = parseSessionId(request.headers.get("cookie"));
  if (!sid) return null;

  if (db.__isFake) {
    const s = db.__session;
    if (!s || s.id !== sid) return null;
    return { ...s.user, email: "fake", displayName: "fake", trainerId: null };
  }

  const session = await readSession(db as Db, sid);
  return session ? toAuthUser(session.user as any) : null;
}

export async function getOptionalUser(request: Request, db: Db | any): Promise<AuthUser | null> {
  return loadUser(request, db);
}

export interface RequireOptions {
  role?: Role;
}

export async function requireUser(request: Request, db: Db | any, opts: RequireOptions = {}): Promise<AuthUser> {
  const user = await loadUser(request, db);
  if (!user) {
    throw redirect("/login");
  }
  if (opts.role && opts.role !== user.role) {
    throw redirect(user.role === "trainer" ? "/trener" : "/podopieczny");
  }
  return user;
}
```

- [ ] **Step 4: Run, see pass**

```bash
pnpm test --run app/lib/auth/require.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/auth/index.ts app/lib/auth/require.test.ts
git commit -m "feat(auth): getOptionalUser + requireUser helpers"
```

---

## Task 11: Invite generation + acceptance module (no UI yet)

**Files:**
- Create: `app/lib/auth/invite.ts`
- Create: `app/lib/auth/invite.itest.ts`

- [ ] **Step 1: Failing integration test at `app/lib/auth/invite.itest.ts`**

```ts
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { startTestDb, type TestDb } from "../../../tests/helpers/db";
import * as schema from "../db/schema";
import { createInvite, consumeInvite } from "./invite";
import { hashPassword } from "./password";

let tdb: TestDb;
let db: ReturnType<typeof drizzle<typeof schema>>;
let trainerId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  db = drizzle(tdb.sql, { schema });
}, 60_000);
afterAll(async () => { await tdb.stop(); });

beforeEach(async () => {
  await tdb.sql`TRUNCATE users, sessions, invites RESTART IDENTITY CASCADE`;
  const [t] = await tdb.sql<{ id: string }[]>`
    INSERT INTO users (email, display_name, role) VALUES ('t@x.pl', 'T', 'trainer') RETURNING id
  `;
  trainerId = t.id;
});

test("createInvite returns a plaintext token and stores its hash", async () => {
  const { token, invite } = await createInvite(db, {
    trainerId,
    displayName: "Mateusz",
    email: "m@x.pl",
  });
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(invite.id).toBeTruthy();

  const found = await tdb.sql<{ token_hash: string }[]>`SELECT token_hash FROM invites WHERE id = ${invite.id}`;
  expect(found[0].token_hash).not.toBe(token); // hashed, not plain
});

test("consumeInvite (new user path) creates trainee linked to trainer", async () => {
  const { token } = await createInvite(db, { trainerId, displayName: "Mateusz" });
  const result = await consumeInvite(db, {
    token,
    chosenEmail: "m@x.pl",
    chosenDisplayName: "Mateusz Kozłowski",
    newPasswordHash: await hashPassword("hunter2"),
  });
  expect(result.kind).toBe("created");
  expect(result.user.role).toBe("trainee");
  expect(result.user.trainerId).toBe(trainerId);

  const inv = await tdb.sql<{ consumed_at: Date | null }[]>`
    SELECT consumed_at FROM invites WHERE token_hash != ${token}
  `;
  expect(inv[0].consumed_at).not.toBeNull();
});

test("consumeInvite rejects expired invite", async () => {
  const { token, invite } = await createInvite(db, { trainerId, displayName: "M" });
  await tdb.sql`UPDATE invites SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = ${invite.id}`;
  await expect(consumeInvite(db, {
    token, chosenEmail: "m@x.pl", chosenDisplayName: "M",
    newPasswordHash: await hashPassword("p"),
  })).rejects.toThrow(/expired/);
});

test("consumeInvite rejects already-used invite", async () => {
  const { token } = await createInvite(db, { trainerId, displayName: "M" });
  await consumeInvite(db, {
    token, chosenEmail: "m@x.pl", chosenDisplayName: "M",
    newPasswordHash: await hashPassword("p"),
  });
  await expect(consumeInvite(db, {
    token, chosenEmail: "m@x.pl", chosenDisplayName: "M",
    newPasswordHash: await hashPassword("p"),
  })).rejects.toThrow(/used|not.found/i);
});

test("consumeInvite with replaces_user_id updates that user's password instead of creating", async () => {
  // existing trainee
  const [existing] = await tdb.sql<{ id: string }[]>`
    INSERT INTO users (email, display_name, role, trainer_id, password_hash)
    VALUES ('m@x.pl', 'M', 'trainee', ${trainerId}, 'old-hash')
    RETURNING id
  `;
  const { token } = await createInvite(db, {
    trainerId, displayName: "M", replacesUserId: existing.id,
  });
  const result = await consumeInvite(db, {
    token,
    chosenEmail: "m@x.pl",
    chosenDisplayName: "M",
    newPasswordHash: "new-hash",
  });
  expect(result.kind).toBe("replaced");
  expect(result.user.id).toBe(existing.id);

  const [u] = await tdb.sql<{ password_hash: string }[]>`SELECT password_hash FROM users WHERE id = ${existing.id}`;
  expect(u.password_hash).toBe("new-hash");
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm test:itest
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/lib/auth/invite.ts`**

```ts
import { randomBytes, createHash } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Db } from "./session";

const TOKEN_BYTES = 32;
const INVITE_DURATION_DAYS = 14;

function newToken(): { token: string; hash: string } {
  const buf = randomBytes(TOKEN_BYTES);
  const token = buf.toString("base64url");
  const hash = createHash("sha256").update(buf).digest("hex");
  return { token, hash };
}

function hashToken(token: string): string {
  const buf = Buffer.from(token, "base64url");
  return createHash("sha256").update(buf).digest("hex");
}

export interface CreateInviteInput {
  trainerId: string;
  displayName: string;
  email?: string | null;
  replacesUserId?: string | null;
}

export async function createInvite(db: Db, input: CreateInviteInput) {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + INVITE_DURATION_DAYS * 24 * 3600 * 1000);
  const [invite] = await db.insert(schema.invites).values({
    trainerId: input.trainerId,
    displayName: input.displayName,
    email: input.email ?? null,
    tokenHash: hash,
    replacesUserId: input.replacesUserId ?? null,
    expiresAt,
  }).returning();
  return { token, invite };
}

export interface ConsumeInviteInput {
  token: string;
  chosenEmail: string;
  chosenDisplayName: string;
  newPasswordHash: string;
}

export type ConsumeInviteResult =
  | { kind: "created"; user: schema.User }
  | { kind: "replaced"; user: schema.User };

export async function consumeInvite(db: Db, input: ConsumeInviteInput): Promise<ConsumeInviteResult> {
  const hash = hashToken(input.token);
  return await db.transaction(async (tx) => {
    const rows = await tx.select().from(schema.invites)
      .where(and(
        eq(schema.invites.tokenHash, hash),
        isNull(schema.invites.consumedAt),
        gt(schema.invites.expiresAt, new Date()),
      ))
      .limit(1);
    const invite = rows[0];
    if (!invite) {
      // distinguish for the test
      const any = await tx.select().from(schema.invites).where(eq(schema.invites.tokenHash, hash)).limit(1);
      if (any[0]?.consumedAt) throw new Error("invite already used");
      if (any[0] && any[0].expiresAt.getTime() < Date.now()) throw new Error("invite expired");
      throw new Error("invite not found");
    }

    let user: schema.User;
    if (invite.replacesUserId) {
      const updated = await tx.update(schema.users)
        .set({ passwordHash: input.newPasswordHash, archivedAt: null })
        .where(eq(schema.users.id, invite.replacesUserId))
        .returning();
      user = updated[0]!;
    } else {
      const created = await tx.insert(schema.users).values({
        email: input.chosenEmail,
        displayName: input.chosenDisplayName,
        role: "trainee",
        trainerId: invite.trainerId,
        passwordHash: input.newPasswordHash,
        joinedOn: new Date().toISOString().slice(0, 10),
      }).returning();
      user = created[0]!;
    }

    await tx.update(schema.invites)
      .set({ consumedAt: new Date(), consumedByUser: user.id })
      .where(eq(schema.invites.id, invite.id));

    return { kind: invite.replacesUserId ? "replaced" as const : "created" as const, user };
  });
}
```

- [ ] **Step 4: Run, see pass**

```bash
pnpm test:itest
```

Expected: 5 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/auth/invite.ts app/lib/auth/invite.itest.ts
git commit -m "feat(auth): invite create + consume with replaces-user path"
```

---

## Task 12: Invite acceptance route

**Files:**
- Modify: `app/routes/zaproszenie.$token.tsx`
- Create: `app/routes/zaproszenie.$token.itest.ts`

- [ ] **Step 1: Failing integration test at `app/routes/zaproszenie.$token.itest.ts`**

```ts
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { startTestDb, type TestDb } from "../../tests/helpers/db";
import { buildRequest, readSetCookie } from "../../tests/helpers/request";
import * as schema from "~/lib/db/schema";
import { createInvite } from "~/lib/auth/invite";
import { loader, action } from "./zaproszenie.$token";

let tdb: TestDb;
let db: ReturnType<typeof drizzle<typeof schema>>;
let trainerId: string;

beforeAll(async () => {
  tdb = await startTestDb();
  db = drizzle(tdb.sql, { schema });
}, 60_000);
afterAll(async () => { await tdb.stop(); });

beforeEach(async () => {
  await tdb.sql`TRUNCATE users, sessions, invites RESTART IDENTITY CASCADE`;
  const [t] = await tdb.sql<{ id: string }[]>`
    INSERT INTO users (email, display_name, role) VALUES ('t@x.pl', 'T', 'trainer') RETURNING id
  `;
  trainerId = t.id;
});

test("GET /zaproszenie/<bad-token> throws 404", async () => {
  await expect(loader({
    request: buildRequest({ url: "/zaproszenie/badtoken" }),
    params: { token: "badtoken" },
    context: { db },
  } as any)).rejects.toMatchObject({ status: 404 });
});

test("GET /zaproszenie/<good-token> returns displayName + email hint", async () => {
  const { token } = await createInvite(db, { trainerId, displayName: "Mateusz", email: "m@x.pl" });
  const result = await loader({
    request: buildRequest({ url: `/zaproszenie/${token}` }),
    params: { token },
    context: { db },
  } as any);
  expect(result).toMatchObject({ displayName: "Mateusz", emailHint: "m@x.pl" });
});

test("POST /zaproszenie/<good-token> creates trainee, sets cookie, redirects", async () => {
  const { token } = await createInvite(db, { trainerId, displayName: "Mateusz" });
  const fd = new FormData();
  fd.set("email", "m@x.pl");
  fd.set("displayName", "Mateusz Kozłowski");
  fd.set("password", "verylongstrongpw");
  const result = (await action({
    request: buildRequest({ url: `/zaproszenie/${token}`, method: "POST", body: fd }),
    params: { token },
    context: { db },
  } as any)) as Response;
  expect(result.status).toBe(302);
  expect(result.headers.get("Location")).toBe("/podopieczny");
  expect(readSetCookie(result.headers)).toMatch(/__kth_session=/);

  const rows = await tdb.sql<{ display_name: string }[]>`
    SELECT display_name FROM users WHERE role = 'trainee'
  `;
  expect(rows[0]?.display_name).toBe("Mateusz Kozłowski");
});

test("POST /zaproszenie/<expired-token> returns error", async () => {
  const { token, invite } = await createInvite(db, { trainerId, displayName: "M" });
  await tdb.sql`UPDATE invites SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = ${invite.id}`;
  const fd = new FormData();
  fd.set("email", "m@x.pl");
  fd.set("displayName", "M");
  fd.set("password", "verylongstrongpw");
  const result = await action({
    request: buildRequest({ url: `/zaproszenie/${token}`, method: "POST", body: fd }),
    params: { token },
    context: { db },
  } as any);
  expect(result).toMatchObject({ error: expect.stringMatching(/wygas/i) });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm test:itest
```

Expected: FAIL (the stub doesn't export `loader`/`action`).

- [ ] **Step 3: Implement `app/routes/zaproszenie.$token.tsx`** (replace the stub)

```tsx
import { createHash } from "node:crypto";
import {
  redirect, Form, useActionData, useLoaderData,
  type ActionFunctionArgs, type LoaderFunctionArgs,
} from "react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { consumeInvite } from "~/lib/auth/invite";
import { hashPassword } from "~/lib/auth/password";
import { createSession } from "~/lib/auth/session";
import { buildSetCookie } from "~/lib/auth/cookie";

function dbFrom(args: { context?: { db?: typeof defaultDb } }) {
  return args.context?.db ?? defaultDb;
}

function tokenHashOf(token: string): string {
  return createHash("sha256").update(Buffer.from(token, "base64url")).digest("hex");
}

const AcceptSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().min(1).max(80),
  password: z.string().min(8).max(200),
});

export async function loader(args: LoaderFunctionArgs) {
  const db = dbFrom(args);
  const token = args.params.token ?? "";
  const hash = tokenHashOf(token);
  const rows = await db.select().from(schema.invites).where(eq(schema.invites.tokenHash, hash)).limit(1);
  const invite = rows[0];
  if (!invite || invite.consumedAt || invite.expiresAt.getTime() < Date.now()) {
    throw new Response("invite not found", { status: 404 });
  }
  return { displayName: invite.displayName, emailHint: invite.email };
}

export async function action(args: ActionFunctionArgs) {
  const db = dbFrom(args);
  const token = args.params.token ?? "";
  const fd = await args.request.formData();
  const parsed = AcceptSchema.safeParse({
    email: fd.get("email"),
    displayName: fd.get("displayName"),
    password: fd.get("password"),
  });
  if (!parsed.success) {
    return { error: "Sprawdź pola formularza." };
  }
  const passwordHash = await hashPassword(parsed.data.password);
  let user: schema.User;
  try {
    const result = await consumeInvite(db, {
      token,
      chosenEmail: parsed.data.email,
      chosenDisplayName: parsed.data.displayName,
      newPasswordHash: passwordHash,
    });
    user = result.user;
  } catch (e: any) {
    if (/expired/i.test(e?.message)) return { error: "Zaproszenie wygasło." };
    if (/used/i.test(e?.message)) return { error: "Zaproszenie już użyte." };
    return { error: "Zaproszenie nieprawidłowe." };
  }
  const { id, expiresAt } = await createSession(db, {
    userId: user.id,
    userAgentHint: args.request.headers.get("user-agent"),
  });
  return redirect(user.role === "trainer" ? "/trener" : "/podopieczny", {
    headers: { "Set-Cookie": buildSetCookie(id, expiresAt) },
  });
}

export default function InviteAccept() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 360 }}>
      <h1>Witaj, {loaderData.displayName}</h1>
      <p>Trener Cię zaprosił. Ustaw email i hasło.</p>
      <Form method="post" style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue={loaderData.emailHint ?? ""}
            autoComplete="email"
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label>
          Nazwa wyświetlana
          <input
            name="displayName"
            type="text"
            required
            defaultValue={loaderData.displayName}
            style={{ display: "block", width: "100%" }}
          />
        </label>
        <label>
          Hasło (min. 8 znaków)
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            style={{ display: "block", width: "100%" }}
          />
        </label>
        {actionData && "error" in actionData && (
          <p role="alert" style={{ color: "crimson" }}>{actionData.error}</p>
        )}
        <button type="submit">Załóż konto</button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 4: Run, see pass**

```bash
pnpm test:itest
```

Expected: 4 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/routes/zaproszenie.$token.tsx app/routes/zaproszenie.$token.itest.ts
git commit -m "feat(auth): invite acceptance route with form + integration tests"
```

---

## Task 13: Trainer layout shell + dashboard placeholder

**Files:**
- Create: `app/styles/tokens.css`
- Modify: `app/root.tsx` (link the stylesheet)
- Modify: `app/routes/trener/_layout.tsx`
- Modify: `app/routes/trener/_index.tsx`

- [ ] **Step 1: Port the design tokens from prototype**

Read `prototype/styles.css` lines 1-80 and copy the `:root { ... }` and `.theme-dark` blocks into `app/styles/tokens.css`. They define `--bg`, `--ink`, `--accent`, `--line`, etc. — the rest of the visual system in later phases depends on these tokens existing.

Also include the base reset + body typography. Total file size: ~120-150 lines.

```css
/* app/styles/tokens.css — ported from prototype/styles.css */

:root {
  --bg: #FAFAF8;
  --surface: #FFFFFF;
  --surface-2: #F4F4F0;
  --ink: #0E1116;
  --ink-2: #2A2F36;
  --muted: #6B7280;
  --muted-2: #9CA3AF;
  --line: #E5E7EB;
  --line-2: #D1D5DB;
  --accent: #C7F23C;
  --accent-ink: #0E1116;
  --ok: #22C55E;
  --warn: #F59E0B;
  --danger: #EF4444;
  --shadow-lg: 0 12px 32px rgba(14, 17, 22, .08);
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}

body.theme-dark {
  --bg: #0E1116;
  --surface: #15191F;
  --surface-2: #1B2028;
  --ink: #FAFAF8;
  --ink-2: #C4C8CE;
  --muted: #8B919A;
  --muted-2: #6B7280;
  --line: #252B33;
  --line-2: #353C46;
}

body.accent-orange { --accent: #FF7A3D; --accent-ink: #FFFFFF; }

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "DM Sans", -apple-system, system-ui, sans-serif;
  background: var(--bg);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
button { font-family: inherit; }
```

(Trim further from prototype if it pulls in too much; we only need tokens + body baseline. The full UI port happens phase-by-phase.)

- [ ] **Step 2: Update `app/root.tsx` to include the stylesheet**

Add `import "~/styles/tokens.css";` at the top of the file:

```tsx
import "~/styles/tokens.css";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
```

- [ ] **Step 3: Implement `app/routes/trener/_layout.tsx`**

```tsx
import { Outlet, Form, Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  return { user };
}

export default function TrenerLayout() {
  const loaderData = useLoaderData<typeof loader>();
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 24px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
          gap: 16,
        }}
      >
        <strong style={{ letterSpacing: ".02em" }}>kalisthenos</strong>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>· trener</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13 }}>{loaderData.user.displayName}</span>
        <Form method="post" action="/wyloguj">
          <button type="submit" style={{ padding: "6px 12px" }}>Wyloguj</button>
        </Form>
      </header>
      <div style={{ display: "flex" }}>
        <nav
          style={{
            width: 220,
            padding: 16,
            borderRight: "1px solid var(--line)",
            minHeight: "calc(100vh - 49px)",
            background: "var(--surface)",
          }}
        >
          <Link to="/trener" style={{ display: "block", padding: "8px 10px", borderRadius: 8 }}>
            Pulpit
          </Link>
          <div style={{ color: "var(--muted-2)", fontSize: 11, padding: "16px 10px 4px" }}>
            (więcej w Phase 2-5)
          </div>
        </nav>
        <main style={{ flex: 1, padding: 24 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `app/routes/trener/_index.tsx`**

```tsx
export default function TrenerIndex() {
  return (
    <div>
      <h1 style={{ fontSize: 24 }}>Pulpit</h1>
      <p style={{ color: "var(--muted)" }}>
        Phase 1 ships layout + auth. Pulpit content arrives in Phase 2-5.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Verify auth gate works**

```bash
pnpm dev
```

Visit `http://localhost:3000/trener` → redirected to `/login`. Visit `http://localhost:3000/podopieczny` → also redirected to `/login` (still stubbed, that route's _layout gets done in Task 14).

- [ ] **Step 6: Add a Playwright E2E smoke**

Create `tests/e2e/auth.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("unauthenticated visit to /trener redirects to /login", async ({ page }) => {
  const response = await page.goto("/trener");
  await expect(page).toHaveURL(/\/login$/);
  expect(page.getByRole("heading", { name: /Zaloguj się/i })).toBeVisible();
});
```

Run it:
```bash
pnpm e2e
```

Expected: 2 projects (`desktop`, `mobile`) × 1 test = 2 PASS. (Playwright spawns `pnpm dev` per the config.)

- [ ] **Step 7: Commit**

```bash
git add app/styles/tokens.css app/root.tsx app/routes/trener/ tests/e2e/auth.spec.ts
git commit -m "feat(ui): trener layout shell + auth gate + e2e smoke"
```

---

## Task 14: Trainee layout shell + dashboard placeholder

**Files:**
- Modify: `app/routes/podopieczny/_layout.tsx`
- Modify: `app/routes/podopieczny/_index.tsx`

- [ ] **Step 1: Implement `app/routes/podopieczny/_layout.tsx`**

```tsx
import { Outlet, Form, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  return { user };
}

export default function PodopiecznyLayout() {
  const loaderData = useLoaderData<typeof loader>();
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
          gap: 12,
        }}
      >
        <strong style={{ letterSpacing: ".02em" }}>kalisthenos</strong>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13 }}>{loaderData.user.displayName}</span>
        <Form method="post" action="/wyloguj">
          <button type="submit" style={{ padding: "6px 10px" }}>Wyloguj</button>
        </Form>
      </header>
      <main style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Implement `app/routes/podopieczny/_index.tsx`**

```tsx
export default function PodopiecznyIndex() {
  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Cześć!</h1>
      <p style={{ color: "var(--muted)" }}>
        Phase 1 ships layout + auth. Twój plan i sesje wjadą w Phase 3-4.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Extend the E2E smoke to cover trainee redirect too**

Append to `tests/e2e/auth.spec.ts`:

```ts
test("unauthenticated visit to /podopieczny redirects to /login", async ({ page }) => {
  await page.goto("/podopieczny");
  await expect(page).toHaveURL(/\/login$/);
});
```

Run it:
```bash
pnpm e2e
```

Expected: 4 PASS (2 projects × 2 tests).

- [ ] **Step 4: Commit**

```bash
git add app/routes/podopieczny/ tests/e2e/auth.spec.ts
git commit -m "feat(ui): podopieczny layout shell + auth gate + e2e smoke"
```

---

## Task 15: Authorize helper (single function for all later phases)

**Files:**
- Create: `app/lib/authz.ts`
- Create: `app/lib/authz.test.ts`

- [ ] **Step 1: Failing test at `app/lib/authz.test.ts`**

```ts
import { expect, test } from "vitest";
import { canRead, ownsTrainerScope } from "./authz";
import type { AuthUser } from "./auth";

const trainerA: AuthUser = { id: "ta", email: "a@x", displayName: "A", role: "trainer", trainerId: null };
const trainerB: AuthUser = { id: "tb", email: "b@x", displayName: "B", role: "trainer", trainerId: null };
const traineeOfA: AuthUser = { id: "p1", email: "p@x", displayName: "P", role: "trainee", trainerId: "ta" };
const traineeOfB: AuthUser = { id: "p2", email: "q@x", displayName: "Q", role: "trainee", trainerId: "tb" };

test("ownsTrainerScope: trainer A owns scope ta", () => {
  expect(ownsTrainerScope(trainerA, "ta")).toBe(true);
  expect(ownsTrainerScope(trainerA, "tb")).toBe(false);
});

test("ownsTrainerScope: trainee of A owns scope ta", () => {
  expect(ownsTrainerScope(traineeOfA, "ta")).toBe(true);
  expect(ownsTrainerScope(traineeOfA, "tb")).toBe(false);
});

test("canRead: trainer can read own resources", () => {
  expect(canRead(trainerA, { trainerId: "ta" })).toBe(true);
  expect(canRead(trainerA, { trainerId: "tb" })).toBe(false);
});

test("canRead: trainee can read own-trainer-scope resources but only their own when ownerId given", () => {
  expect(canRead(traineeOfA, { trainerId: "ta" })).toBe(true);
  expect(canRead(traineeOfA, { trainerId: "ta", ownedByUserId: "p1" })).toBe(true);
  expect(canRead(traineeOfA, { trainerId: "ta", ownedByUserId: "p2" })).toBe(false);
});

test("canRead: across tenants is always false", () => {
  expect(canRead(traineeOfA, { trainerId: "tb" })).toBe(false);
  expect(canRead(traineeOfB, { trainerId: "ta" })).toBe(false);
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm test --run app/lib/authz.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/lib/authz.ts`**

```ts
import type { AuthUser } from "./auth";

export function ownsTrainerScope(user: AuthUser, trainerId: string): boolean {
  if (user.role === "trainer") return user.id === trainerId;
  return user.trainerId === trainerId;
}

export interface Resource {
  trainerId: string;
  /** When set, restricts trainee access to only resources belonging to that user id. */
  ownedByUserId?: string | null;
}

export function canRead(user: AuthUser, resource: Resource): boolean {
  if (!ownsTrainerScope(user, resource.trainerId)) return false;
  if (user.role === "trainer") return true;
  // trainee: if ownedByUserId is specified, must equal this trainee's id
  if (resource.ownedByUserId == null) return true;
  return resource.ownedByUserId === user.id;
}

export function canWrite(user: AuthUser, resource: Resource): boolean {
  // For Phase 1 the rule is identical to read. Each subsequent phase can refine
  // per-resource by passing a `kind` discriminator. Keep this dumb for now.
  return canRead(user, resource);
}
```

- [ ] **Step 4: Run, see pass**

```bash
pnpm test --run app/lib/authz.test.ts
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/authz.ts app/lib/authz.test.ts
git commit -m "feat(authz): single canRead/canWrite/ownsTrainerScope helper"
```

---

## Task 16: README + final smoke pass

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# kalisthenos

Polish-language web app for calisthenics trainer ↔ trainee collaboration.
This branch is Phase 1 of 6 (foundation: auth + invites + layout shells).
Spec: `docs/superpowers/specs/2026-05-23-kalisthenos-fullstack-v1-design.md`
Plan: `docs/superpowers/plans/2026-05-23-kalisthenos-v1-phase-1-foundation.md`

## Local setup

Requires Node 22, pnpm, Docker (for integration tests' testcontainers Postgres).

```bash
pnpm install
cp .env.example .env
# fill SESSION_SECRET and FILE_SIGNING_SECRET with `openssl rand -base64 32`
```

Run a local Postgres any way you like (e.g. `docker run -p 5432:5432 -e POSTGRES_PASSWORD=kalisthenos -e POSTGRES_USER=kalisthenos -e POSTGRES_DB=kalisthenos postgres:16-alpine`) and point `DATABASE_URL` at it.

Apply migrations:
```bash
pnpm db:migrate
```

Seed a trainer (until Phase 2 ships a UI for it):
```sql
INSERT INTO users (email, display_name, role, password_hash)
VALUES ('trener@kalisthenos.app', 'Adam', 'trainer',
        '<paste argon2 hash from `pnpm exec node -e "import('./app/lib/auth/password.ts').then(m => m.hashPassword(process.argv[1])).then(console.log)" hunter2`>');
```

Run dev server:
```bash
pnpm dev
# → http://localhost:3000
```

## Testing

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # biome
pnpm test:unit     # vitest unit tests (no DB)
pnpm test:itest    # integration tests against ephemeral Postgres in Docker
pnpm e2e           # Playwright across desktop + mobile
```

## Project structure

See `docs/superpowers/plans/2026-05-23-kalisthenos-v1-phase-1-foundation.md` for the file map.
The original React+Babel prototype is at `prototype/` and remains as a reference for UI ports in later phases.
```

- [ ] **Step 2: Final pass — run everything**

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:itest
pnpm e2e
```

All five must pass before commit. If any fails, fix the underlying issue rather than skipping it.

- [ ] **Step 3: Tag Phase 1**

```bash
git add README.md
git commit -m "docs: add README with Phase 1 setup instructions"
git tag phase-1-foundation
```

- [ ] **Step 4: Announce next phase**

Output: "Phase 1 complete. Ready for Phase 2 (Exercise Library + Files)? If yes, invoke writing-plans again with the Phase 2 scope."

---

## Self-review against the spec

Mapping spec requirements → Phase 1 tasks:

| Spec section | Coverage in this plan |
|---|---|
| §3 Tech stack | Tasks 2–4 (TS, Biome, Vite, RR7, Drizzle, Postgres, Vitest, Playwright) |
| §4 High-level architecture | Tasks 3 (single Node process, SSR) + 13–14 (layout shells) |
| §5.1 Identity schema (users, sessions, invites) | Tasks 5–6 |
| §6.1 Session auth flow | Tasks 8, 9 |
| §6.2 Invite flow | Tasks 11, 12 |
| §6.3 Password reset via `replaces_user_id` | Tasks 11 (data model + tests) — UI for trainer-issued resets is Phase 2 |
| §6.4 Authorize() function | Task 15 |
| §11 Configuration & env | Task 2 (`env.ts`) |
| §12 Testing strategy | Tasks 4, 7, 13 (3 layers stood up; phase-by-phase coverage thereafter) |
| Spec §5.2-5.6 (exercises, plans, logs, photos, files) | **Deferred to Phases 2-5** — out of Phase 1 scope by design |
| Spec §9 PWA, §15 deployment | **Deferred to Phase 6** |

**Spec gaps surfaced for later phases:** none in Phase 1's scope.

**Placeholder scan:** no "TBD", "TODO", "fill in details", "similar to Task N" — every step has explicit code or commands. Future-phase plans are listed by name only, which is the intended decomposition.

**Type consistency:** `Db` is defined in `app/lib/auth/session.ts` and reused throughout. `AuthUser` defined in `app/lib/auth/index.ts` and imported into `authz.ts`. `User`, `NewUser`, `Session`, `Invite` exported from `schema.ts`.

**Scope:** 16 tasks, ~95 steps. Independently shippable: at the end of Task 16 you have a running app where a trainer (seeded) can log in, see an empty dashboard, log out; an invited trainee can accept a token URL, set credentials, see their empty dashboard, log out. No other features ship in this phase by design.
