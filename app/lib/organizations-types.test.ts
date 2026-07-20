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
      RegionInputSchema.safeParse({
        ...base,
        name: "France",
        country: "FR",
        currency: "eur",
        locale: "fr-FR",
      }).success,
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
