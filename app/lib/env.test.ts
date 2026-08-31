import { afterEach, describe, expect, it } from "vitest";

const BAZA = {
  DATABASE_URL: "postgres://localhost:5432/test",
  SESSION_SECRET: "x".repeat(32),
  FILE_SIGNING_SECRET: "x".repeat(32),
  BASE_URL: "https://example.test",
};

afterEach(() => {
  // biome-ignore lint/performance/noDelete: process.env wymaga delete — przypisanie `undefined` stringifikuje się do "undefined", nie usuwa klucza
  delete process.env.API_URL;
  // biome-ignore lint/performance/noDelete: jak wyżej
  delete process.env.API_PUBLIC_URL;
});

describe("EnvSchema — adresy BE", () => {
  it("wymaga API_URL", async () => {
    const { EnvSchema } = await import("./env");
    expect(() => EnvSchema.parse({ ...BAZA })).toThrow();
  });

  it("bez API_PUBLIC_URL przyjmuje adres wewnętrzny", async () => {
    // Lokalnie i w testach jeden adres wystarcza. Wymuszanie dwóch tworzyłoby
    // klasę błędu „działa lokalnie, 502 na produkcji" w drugą stronę: rozjazd
    // konfiguracji między środowiskami, którego nikt nie zauważa do wdrożenia.
    const { EnvSchema } = await import("./env");
    const env = EnvSchema.parse({ ...BAZA, API_URL: "http://api.internal:3000" });
    expect(env.API_PUBLIC_URL).toBe("http://api.internal:3000");
  });

  it("gdy oba są ustawione, zachowuje je rozdzielnie", async () => {
    const { EnvSchema } = await import("./env");
    const env = EnvSchema.parse({
      ...BAZA,
      API_URL: "http://api.internal:3000",
      API_PUBLIC_URL: "https://api.kalisthenos.pl",
    });
    expect(env.API_URL).toBe("http://api.internal:3000");
    expect(env.API_PUBLIC_URL).toBe("https://api.kalisthenos.pl");
  });
});
