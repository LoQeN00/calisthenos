import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = join(process.cwd(), "app");
const ROUTES_DIR = join(APP_DIR, "routes");

// Poza katalogiem tras sprawdzamy też te dwa pliki wejściowe. `root.tsx` nie
// dotyka już bazy w ogóle: obie leniwe sprzątaczki, dla których trzymał `db`,
// przeszły do BE (sesje w kroku 2 Etapu 2, pliki-sieroty w S4 fali 2). Asercje
// niżej mają dla niego przechodzić tak samo jak dla tras.
const EXTRA_FILES = [join(APP_DIR, "root.tsx"), join(APP_DIR, "entry.server.tsx")];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    // Nie skanuj testów tego szwu (i innych) — inaczej ten plik łapałby sam siebie.
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) return [];
    return entry.endsWith(".tsx") || entry.endsWith(".ts") ? [full] : [];
  });
}

describe("szew app/lib — trasy nie sięgają do bazy bezpośrednio", () => {
  const files = [...routeFiles(ROUTES_DIR), ...EXTRA_FILES];

  it("znajduje pliki tras", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("żadna trasa nie importuje schematu bazy (poza `import type`)", () => {
    // `import type { X } from "~/lib/db/schema"` nie generuje kodu w runtime i nie
    // sięga do bazy — to tylko typy. Zakazujemy importu wartości (np. `db`, enumów).
    const forbidden = /import\s+(?!type\s)[^;]+from\s+"~\/lib\/db\/schema"/;
    const offenders = files.filter((f) => forbidden.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("żadna trasa nie buduje zapytania ani nie otwiera transakcji", () => {
    // `db` wolno przekazywać do funkcji z lib/ — to konwencja wstrzykiwania.
    // Nie wolno na nim wołać budowniczych zapytań, relacyjnego API (`db.query.*`),
    // `db.execute(...)` ani transakcji.
    // Aliasowanie (`const d = db; d.select(...)`) jest CELOWO poza zasięgiem tej
    // reguły — regexem nie da się tego rzetelnie wykryć, a udawana ochrona byłaby
    // gorsza niż jej brak.
    const forbidden =
      /\bdb\s*\)?\s*\.\s*(select|insert|update|delete|transaction|\$with|execute)\s*\(|\bdb\s*\)?\s*\.\s*query\s*\./;
    const offenders = files.filter((f) => forbidden.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
