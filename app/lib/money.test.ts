import { describe, it, expect } from "vitest";
import { parsePlnToGrosze, MonthlyAmountSchema } from "~/lib/money";

describe("parsePlnToGrosze", () => {
  it("zamienia złotówki (string) na grosze", () => {
    expect(parsePlnToGrosze("200")).toBe(20000);
    expect(parsePlnToGrosze("200,50")).toBe(20050);
    expect(parsePlnToGrosze("200.50")).toBe(20050);
  });
  it("odrzuca śmieci jako null", () => {
    expect(parsePlnToGrosze("abc")).toBeNull();
    expect(parsePlnToGrosze("")).toBeNull();
  });
});

describe("MonthlyAmountSchema", () => {
  it("przyjmuje kwotę w groszach w dozwolonym zakresie", () => {
    expect(MonthlyAmountSchema.parse(20000)).toBe(20000);
  });
  it("odrzuca poniżej minimum (200 gr = 2 zł) i wartości niecałkowite", () => {
    expect(MonthlyAmountSchema.safeParse(100).success).toBe(false);
    expect(MonthlyAmountSchema.safeParse(199).success).toBe(false);
    expect(MonthlyAmountSchema.safeParse(1.5).success).toBe(false);
  });
});
