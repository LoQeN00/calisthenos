import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    include: [
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "scripts/**/*.test.ts",
      "tests/**/*.itest.ts",
    ],
    setupFiles: [],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) } },
});
