import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    // `tests/**/*.itest.ts` zniknęło w S6 razem z bazą: testy integracyjne na
    // testcontainerach nie mają czego integrować, a przepływy przez sieć
    // pokryje Playwright (`tests/e2e`, spec §10).
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "scripts/**/*.test.ts"],
    setupFiles: [],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
});
