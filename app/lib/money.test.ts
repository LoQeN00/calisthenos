import { describe, it, expect } from "vitest";
import { fmtMoney, parsePlnToGrosze, MonthlyAmountSchema } from "~/lib/money";

describe("fmtMoney", () => {
  it("formatuje grosze jako PLN po polsku", () => {
    expect(fmtMoney(12345, "pln")).toBe("123,45 zł");
    expect(fmtMoney(20000, "pln")).toBe("200,00 zł");
    expect(fmtMoney(0, "pln")).toBe("0,00 zł");
  });
});

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
