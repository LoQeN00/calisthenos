import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as healthz from "~/routes/healthz";

/**
 * Szew między `railway.toml` a trasą healthchecka.
 *
 * Railway uznaje deploy za zdrowy WYŁĄCZNIE po odpowiedzi 200 — każdą inną
 * (w tym 3xx) raportuje jako „failed with service unavailable". `/` przekierowuje
 * zawsze (`_index.tsx`), więc nie nadaje się na `healthcheckPath`. Ten test
 * pilnuje, żeby nikt nie przestawił go z powrotem.
 */
describe("healthcheck", () => {
  it("odpowiada 200 bez sesji i bez bazy", async () => {
    const res = await healthz.loader();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("jest trasą zasobową (bez komponentu) — nie odpala loadera root.tsx ani bazy", () => {
    expect("default" in healthz).toBe(false);
  });

  it("railway.toml wskazuje healthcheckPath na tę trasę, nie na przekierowujące /", () => {
    const toml = readFileSync(join(process.cwd(), "railway.toml"), "utf8");
    const match = toml.match(/^\s*healthcheckPath\s*=\s*"([^"]+)"/m);
    expect(match?.[1]).toBe("/healthz");
  });

  it("trasa jest zarejestrowana w routes.ts", () => {
    const routes = readFileSync(join(process.cwd(), "app", "routes.ts"), "utf8");
    expect(routes).toContain('route("healthz", "routes/healthz.tsx")');
  });
});
