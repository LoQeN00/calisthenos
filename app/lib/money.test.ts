import { describe, it, expect } from "vitest";
import { fmtMoney, parsePlnToGrosze, parseMoneyToMinor, MonthlyAmountSchema } from "~/lib/money";

describe("fmtMoney", () => {
  it("formatuje grosze jako PLN po polsku (domyślne)", () => {
    expect(fmtMoney(12345)).toMatch(/123,45/);
    expect(fmtMoney(20000)).toMatch(/200,00/);
    expect(fmtMoney(0)).toMatch(/0,00/);
  });
  it("wynik PLN/pl-PL zawiera 'zł'", () => {
    expect(fmtMoney(12345)).toMatch(/zł/);
  });
});

describe("fmtMoney (Intl, multi-currency)", () => {
  it("PLN/pl-PL (domyślne)", () => {
    expect(fmtMoney(12345)).toMatch(/123,45/);
  });
  it("EUR/fr-FR", () => {
    const s = fmtMoney(12345, "fr-FR", "eur");
    expect(s).toMatch(/123,45/);
    expect(s).toMatch(/€/);
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

describe("parseMoneyToMinor", () => {
  it("przecinek i kropka", () => {
    expect(parseMoneyToMinor("123,45")).toBe(12345);
    expect(parseMoneyToMinor("123.45")).toBe(12345);
  });
  it("śmieci → null", () => {
    expect(parseMoneyToMinor("abc")).toBeNull();
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
