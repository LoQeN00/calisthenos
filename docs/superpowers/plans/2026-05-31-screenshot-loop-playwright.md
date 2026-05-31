# Screenshot-loop na Playwright — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **UWAGA REPO:** Claude nigdy nie wykonuje operacji git ani Dockera. Zamiast kroków „commit" każdy task kończy się **review per task** (`/code-review`). Commity, migracje i deploy wykonuje właściciel w handoffie. Testy integracyjne/E2E pod Dockerem uruchamia właściciel.

**Goal:** Lekkie narzędzie deweloperskie — skrypt, który loguje się jako seedowany trener, renderuje realne trasy na viewportach desktop+mobile i zapisuje screenshoty, które Claude odczytuje toolem `Read`, plus zrzut pojedynczej trasy na żądanie.

**Architecture:** Samodzielny skrypt Node (`scripts/shots.ts`) importujący `chromium`/`devices` z już zainstalowanego `@playwright/test` (zero nowych zależności), **bez** test-runnera. Czysta logika (slug, parser argów, filtr manifestu) wydzielona do `scripts/shots-lib.ts` i pokryta testami jednostkowymi Vitest. Lista tras w `scripts/shots.manifest.ts`. Output PNG do `screenshots/` (gitignore). Auth przez realny formularz `/login` danymi z env, `storageState` cache'owany na dysku.

**Tech Stack:** TypeScript, `tsx` (runner skryptu, jak `db:seed`), Playwright (`@playwright/test`), Vitest (testy jednostkowe).

Spec: `docs/superpowers/specs/2026-05-31-screenshot-loop-playwright-design.md`

---

## Struktura plików

| Plik | Odpowiedzialność | Akcja |
| --- | --- | --- |
| `scripts/shots-lib.ts` | Czyste funkcje: `slugForPath`, `parseShotArgs`, `selectTargets`, typy `Role`/`ShotTarget`. Bez I/O. | Create |
| `scripts/shots-lib.test.ts` | Testy jednostkowe powyższych (Vitest). | Create |
| `scripts/shots.manifest.ts` | `manifest: ShotTarget[]` — konkretne URL-e + rola. | Create |
| `scripts/shots.ts` | Orchestrator: env-guard, server-check, login+storageState, pętla zrzutów, raport. | Create |
| `vitest.config.ts` | Dodać `scripts/**/*.test.ts` do `include`. | Modify |
| `package.json` | Skrypt `shots`. | Modify |
| `.gitignore` | Dodać `screenshots/`. | Modify |
| `scripts/README.md` | Dopisać nowe pliki. | Modify |
| `README.md` (root) | `npm run shots` + opis pętli. | Modify |
| `CLAUDE.md` | Wzmianka o pętli wizualnej w „Proces AI-developmentu". | Modify |

---

## Task 1: Wpięcie testów skryptów w Vitest

Vitest łapie tylko `app/**` i `tests/**/*.itest.ts`. Bez tej zmiany testy z `scripts/` nie odpalą się przez `npm test`.

**Files:**
- Modify: `vitest.config.ts:8`

- [ ] **Step 1: Dodać glob `scripts/**/*.test.ts` do `include`**

W `vitest.config.ts` zmień linię `include`:

```ts
    include: [
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "scripts/**/*.test.ts",
      "tests/**/*.itest.ts",
    ],
```

- [ ] **Step 2: Sanity-check, że konfiguracja się parsuje**

Run: `npm test -- --run`
Expected: PASS (istniejące testy `app/**` przechodzą; brak błędu konfiguracji). Brak testów w `scripts/` na tym etapie — to OK.

- [ ] **Step 3: Review per task**

Uruchom `/code-review` na zmianie w `vitest.config.ts`. Zaadresuj uwagi przed kolejnym taskiem.

---

## Task 2: Czyste funkcje `shots-lib.ts` (TDD)

**Files:**
- Create: `scripts/shots-lib.ts`
- Test: `scripts/shots-lib.test.ts`

- [ ] **Step 1: Napisz failujące testy**

`scripts/shots-lib.test.ts` (config ma `globals: false` → importujemy z `vitest`):

```ts
import { describe, expect, it } from "vitest";
import { parseShotArgs, selectTargets, slugForPath, type ShotTarget } from "./shots-lib";

describe("slugForPath", () => {
  it("zamienia ścieżkę na slug z podkreśleniami", () => {
    expect(slugForPath("/trener/biblioteka")).toBe("trener_biblioteka");
  });
  it("obsługuje pojedynczy segment", () => {
    expect(slugForPath("/trener")).toBe("trener");
  });
  it("korzeń '/' to 'root'", () => {
    expect(slugForPath("/")).toBe("root");
  });
  it("ścina końcowy slash i kropki w segmentach", () => {
    expect(slugForPath("/trener/biblioteka/nowe/")).toBe("trener_biblioteka_nowe");
  });
});

describe("parseShotArgs", () => {
  it("brak argów → null (pełny przebieg)", () => {
    expect(parseShotArgs([])).toBeNull();
  });
  it("zwraca podane ścieżki", () => {
    expect(parseShotArgs(["/trener", "/trener/biblioteka"])).toEqual([
      "/trener",
      "/trener/biblioteka",
    ]);
  });
  it("dopisuje wiodący slash i ignoruje flagi", () => {
    expect(parseShotArgs(["trener", "--foo"])).toEqual(["/trener"]);
  });
});

describe("selectTargets", () => {
  const manifest: ShotTarget[] = [
    { path: "/trener", role: "trainer" },
    { path: "/trener/biblioteka", role: "trainer" },
    { path: "/podopieczny", role: "trainee" },
  ];

  it("pełny przebieg: tylko trasy zalogowanej roli, reszta do skipped", () => {
    const { targets, skipped } = selectTargets({ manifest, paths: null, role: "trainer" });
    expect(targets.map((t) => t.path)).toEqual(["/trener", "/trener/biblioteka"]);
    expect(skipped.map((t) => t.path)).toEqual(["/podopieczny"]);
  });

  it("on-demand: ścieżka z manifestu dziedziczy rolę z manifestu", () => {
    const { targets, skipped } = selectTargets({
      manifest,
      paths: ["/podopieczny"],
      role: "trainer",
    });
    expect(targets).toEqual([]);
    expect(skipped).toEqual([{ path: "/podopieczny", role: "trainee" }]);
  });

  it("on-demand: ścieżka spoza manifestu dostaje rolę zalogowaną i jest zrzucana", () => {
    const { targets } = selectTargets({
      manifest,
      paths: ["/trener/plany"],
      role: "trainer",
    });
    expect(targets).toEqual([{ path: "/trener/plany", role: "trainer" }]);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npm test -- --run scripts/shots-lib.test.ts`
Expected: FAIL — `Cannot find module './shots-lib'` / brak eksportów.

- [ ] **Step 3: Zaimplementuj `shots-lib.ts`**

```ts
export type Role = "trainer" | "trainee";

export interface ShotTarget {
  path: string;
  role: Role;
}

/** "/trener/biblioteka" → "trener_biblioteka"; "/" → "root". */
export function slugForPath(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return "root";
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Argumenty pozycyjne → lista ścieżek (z wiodącym slashem) albo null = pełny manifest. */
export function parseShotArgs(argv: string[]): string[] | null {
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  if (positional.length === 0) return null;
  return positional.map((p) => (p.startsWith("/") ? p : `/${p}`));
}

/** Dobiera trasy do zrzutu wg zalogowanej roli. Cel jest pomijany, gdy jego rola ≠ zalogowana. */
export function selectTargets(input: {
  manifest: ShotTarget[];
  paths: string[] | null;
  role: Role;
}): { targets: ShotTarget[]; skipped: ShotTarget[] } {
  const { manifest, paths, role } = input;
  const candidates: ShotTarget[] =
    paths === null
      ? manifest
      : paths.map((path) => manifest.find((m) => m.path === path) ?? { path, role });

  const targets = candidates.filter((c) => c.role === role);
  const skipped = candidates.filter((c) => c.role !== role);
  return { targets, skipped };
}
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Run: `npm test -- --run scripts/shots-lib.test.ts`
Expected: PASS (10 testów zielonych).

- [ ] **Step 5: Review per task**

`/code-review` na `shots-lib.ts` + `shots-lib.test.ts`.

---

## Task 3: Manifest tras

Konkretne, bezparametrowe trasy z `app/routes.ts`. Trasy trenera (osiągalne sesją seedowanego trenera) jako `role: "trainer"`; kilka tras podopiecznego jako `role: "trainee"` (w MVP pomijane — brak zaproszonego podopiecznego).

**Files:**
- Create: `scripts/shots.manifest.ts`

- [ ] **Step 1: Utwórz manifest**

```ts
import type { ShotTarget } from "./shots-lib";

/**
 * Docelowe trasy do zrzutu. Tylko URL-e bez parametrów ścieżki.
 * `role` decyduje, którą sesją trasa jest osiągalna; w MVP logujemy tylko
 * trenera, więc trasy `trainee` są pomijane (wymagają zaproszonego podopiecznego).
 * Dodanie trasy = jedna linijka tutaj.
 */
export const manifest: ShotTarget[] = [
  { path: "/trener", role: "trainer" },
  { path: "/trener/biblioteka", role: "trainer" },
  { path: "/trener/biblioteka/nowe", role: "trainer" },
  { path: "/trener/plany", role: "trainer" },
  { path: "/trener/plany/nowy", role: "trainer" },
  { path: "/trener/podopieczni", role: "trainer" },
  // Trasy podopiecznego — pomijane w MVP (brak seedowanego podopiecznego):
  { path: "/podopieczny", role: "trainee" },
  { path: "/podopieczny/sesje", role: "trainee" },
  { path: "/podopieczny/historia", role: "trainee" },
  { path: "/podopieczny/statystyki", role: "trainee" },
  { path: "/podopieczny/sylwetka", role: "trainee" },
];
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (manifest typuje się względem `ShotTarget`).

- [ ] **Step 3: Review per task**

`/code-review` na `shots.manifest.ts`.

---

## Task 4: Orchestrator `shots.ts` + wiring

**Files:**
- Create: `scripts/shots.ts`
- Modify: `package.json:8-23` (sekcja `scripts`)
- Modify: `.gitignore`

- [ ] **Step 1: Dodaj skrypt npm**

W `package.json`, w obiekcie `scripts`, po linii `db:studio` dodaj:

```json
    "shots": "tsx --env-file-if-exists=.env scripts/shots.ts"
```

(Pamiętaj o przecinku po poprzednim wpisie.)

- [ ] **Step 2: Zignoruj output w gicie**

W `.gitignore`, w sekcji `# local data`, dodaj linię:

```gitignore
screenshots/
```

- [ ] **Step 3: Zaimplementuj `scripts/shots.ts`**

```ts
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type Browser, chromium, devices } from "@playwright/test";
import { manifest } from "./shots.manifest";
import { parseShotArgs, selectTargets, slugForPath, type Role } from "./shots-lib";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = "screenshots";
const AUTH_FILE = path.join(OUT_DIR, ".auth", "trainer.json");
const ROLE: Role = "trainer"; // MVP: logujemy tylko trenera.

const VIEWPORTS = [
  { name: "desktop", options: { viewport: { width: 1440, height: 900 } } },
  { name: "mobile", options: devices["Pixel 7"] },
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[shots] Brak zmiennej środowiskowej ${name}. Ustaw ją w .env (te same, co db:seed).`);
    process.exit(1);
  }
  return value;
}

async function ensureServer(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/login`, { method: "HEAD" });
  } catch {
    console.error(
      `[shots] Dev server nie odpowiada na ${BASE_URL}.\n` +
        `[shots] Uruchom 'npm run dev' i upewnij się, że Postgres działa.`,
    );
    process.exit(1);
  }
}

async function login(browser: Browser): Promise<void> {
  const email = requireEnv("SEED_TRAINER_EMAIL");
  const password = requireEnv("SEED_TRAINER_PASSWORD");
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
  await mkdir(path.dirname(AUTH_FILE), { recursive: true });
  await context.storageState({ path: AUTH_FILE });
  await context.close();
  console.log("[shots] Zalogowano i zapisano sesję.");
}

async function capture(browser: Browser, targetPath: string): Promise<string[]> {
  const written: string[] = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ ...vp.options, storageState: AUTH_FILE });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: "networkidle" });

    if (page.url().endsWith("/login")) {
      console.warn(`[shots] ${targetPath}: sesja wygasła — przeloguj (uruchom ponownie po skasowaniu ${AUTH_FILE}).`);
      await context.close();
      continue;
    }

    const file = path.join(OUT_DIR, `${slugForPath(targetPath)}__${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    written.push(file);
    await context.close();
  }
  return written;
}

async function main(): Promise<void> {
  await ensureServer();

  const paths = parseShotArgs(process.argv.slice(2));
  const { targets, skipped } = selectTargets({ manifest, paths, role: ROLE });

  if (targets.length === 0) {
    console.error("[shots] Brak tras do zrzutu dla roli 'trainer'. Sprawdź argumenty/manifest.");
    process.exit(1);
  }
  for (const s of skipped) {
    console.warn(`[shots] Pomijam ${s.path} (rola ${s.role} — wymaga zaproszonego podopiecznego).`);
  }

  const browser = await chromium.launch();
  try {
    if (!existsSync(AUTH_FILE)) {
      await login(browser);
    }
    const written: string[] = [];
    for (const t of targets) {
      written.push(...(await capture(browser, t.path)));
    }
    console.log(`\n[shots] Zapisano ${written.length} zrzutów:`);
    for (const f of written) console.log(`  ${f}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[shots] błąd:", err);
  process.exit(1);
});
```

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run lint`
Expected: PASS (Biome czysty; ewentualne uwagi popraw).

- [ ] **Step 5: Review per task**

`/code-review` na `shots.ts`, `package.json`, `.gitignore`.

> **Weryfikacja ręczna (właściciel / Claude przy działającym stacku):** przy podniesionym Postgresie i `npm run dev` uruchom `npm run shots -- /trener/biblioteka`; sprawdź, że powstały `screenshots/trener_biblioteka__desktop.png` i `__mobile.png`. To NIE jest test automatyczny — pętla wymaga działającego serwera.

---

## Task 5: Dokumentacja

**Files:**
- Modify: `scripts/README.md`
- Modify: `README.md` (root)
- Modify: `CLAUDE.md`

- [ ] **Step 1: `scripts/README.md` — dopisz pliki do tabeli**

Dodaj wiersze pod istniejącym `seed.ts`:

```markdown
| `shots.ts` | Screenshot-loop (`npm run shots [-- /trasa ...]`). Loguje się jako seedowany trener (`SEED_TRAINER_EMAIL`/`PASSWORD`), renderuje trasy na viewportach desktop+mobile i zapisuje PNG do `screenshots/` (gitignore). Wymaga działającego dev servera + Postgresa. |
| `shots.manifest.ts` | Lista docelowych tras (`{ path, role }`) dla pełnego przebiegu `npm run shots`. |
| `shots-lib.ts` | Czyste funkcje narzędzia (slug, parser argów, filtr manifestu); pokryte `shots-lib.test.ts`. |
```

- [ ] **Step 2: `README.md` (root) — dodaj komendę i opis pętli**

W bloku „Useful commands", po linii `npm run e2e`, dodaj:

```bash
npm run shots         # screenshot-loop: zrzuty realnych tras (desktop+mobile) do screenshots/
```

Oraz krótka sekcja nad „Useful commands" lub pod „Run the app":

```markdown
### Screenshot-loop (dev/AI)

Wizualna pętla zwrotna do iteracji nad UI. Wymaga działającego Postgresa i dev
servera. `npm run shots` zrzuca cały manifest tras; `npm run shots -- /trener/biblioteka`
zrzuca pojedynczą trasę na desktop+mobile. PNG-i lądują w `screenshots/`
(gitignore). Logowanie używa `SEED_TRAINER_EMAIL` / `SEED_TRAINER_PASSWORD` z `.env`.
```

- [ ] **Step 3: `CLAUDE.md` — wzmianka w „Proces AI-developmentu"**

W sekcji o `frontend-design`, dodaj zdanie:

```markdown
Do iteracji nad warstwą wizualną dostępna jest pętla zrzutów ekranu
`npm run shots` (skrypt `scripts/shots.ts`) — renderuje realne trasy na
viewportach desktop+mobile do `screenshots/`; wymaga działającego stacku.
```

- [ ] **Step 4: Review per task**

`/code-review` na zmianach dokumentacji. Sprawdź, czy żaden README nie wprowadza w błąd (reguła utrzymania dokumentacji z `CLAUDE.md`).

---

## Task 6: Bramki końcowe + handoff

- [ ] **Step 1: Pełne bramki „done"**

Run: `npm test -- --run`  → Expected: PASS (w tym `scripts/shots-lib.test.ts`).
Run: `npm run typecheck`  → Expected: PASS.
Run: `npm run lint`       → Expected: PASS.
Run: `npm run build`      → Expected: PASS.

- [ ] **Step 2: `/code-review` na całości diffu**

Uruchom `/code-review`. `/security-review` NIE dotyczy (brak zmian w auth/`trainer_id`/podpisanych URL/uploadzie — skrypt jedynie loguje się istniejącą ścieżką jako narzędzie dev).

- [ ] **Step 3: Handoff (granica gita)**

Wypisz: podsumowanie + listę zmienionych plików, proponowany komunikat commita, brak migracji/seed/env, oraz ścieżkę ręcznej weryfikacji (`npm run dev` + `npm run shots -- /trener/biblioteka`). Git/commit/push — właściciel.

---

## Self-review (autor planu)

- **Pokrycie spec:** model uruchomienia → Task 4 (ensureServer, login z env) + docs; pliki → Task 1–4; auth+storageState → Task 4 `login`/`capture`; kontrakt wywołania → Task 4 `parseShotArgs`/`selectTargets`; obsługa błędów → Task 4 (`requireEnv`, `ensureServer`, redirect na /login, skipped trainee); testy → Task 2; dokumentacja → Task 5; bramki → Task 6. Bez luk.
- **Placeholdery:** brak „TBD"/„TODO"; każdy krok ma konkretny kod/komendę.
- **Spójność typów:** `Role`/`ShotTarget` zdefiniowane w `shots-lib.ts` (Task 2), używane spójnie w `shots.manifest.ts` (Task 3) i `shots.ts` (Task 4); `slugForPath`/`parseShotArgs`/`selectTargets` mają te same sygnatury w testach i implementacji.
