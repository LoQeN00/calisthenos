import { describe, expect, it } from "vitest";
import { daysAgo, fmtDate, fmtDateShort, fmtDateTime, fmtTime } from "~/lib/format";

describe("fmtDateTime / fmtTime (UTC, v1)", () => {
  it("formatuje datę i godzinę w UTC", () => {
    expect(fmtDateTime("2026-06-11T18:00:00.000Z")).toBe("11 cze 2026, 18:00");
  });
  it("zeruje godzinę/minutę do dwóch cyfr", () => {
    expect(fmtDateTime("2026-01-05T09:05:00.000Z")).toBe("5 sty 2026, 09:05");
  });
  it("fmtTime zwraca samą godzinę UTC", () => {
    expect(fmtTime("2026-06-11T18:30:00.000Z")).toBe("18:30");
  });
  it("fr-FR lokalizuje miesiąc i nie rzuca (UTC)", () => {
    const s = fmtDateTime("2026-06-11T18:00:00.000Z", "fr-FR");
    expect(s).toMatch(/juin/i);
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/18:00/);
    expect(s).not.toBe(fmtDateTime("2026-06-11T18:00:00.000Z"));
  });
});

describe("fmtDate (Intl, locale)", () => {
  it("pl-PL (domyślne) zawiera rok i skrócony miesiąc", () => {
    const s = fmtDate("2026-06-11");
    expect(s).toMatch(/2026/);
    expect(s).toMatch(/cze|jun/i);
  });
  it("fr-FR zwraca inny format niż pl-PL (nazwa miesiąca)", () => {
    const pl = fmtDate("2026-06-11", "pl-PL");
    const fr = fmtDate("2026-06-11", "fr-FR");
    // Nie rzuca i różni się od pl — fr użyje "juin" zamiast "cze"
    expect(fr).not.toBe(pl);
    expect(fr).toMatch(/juin|juin/i);
  });
});

describe("fmtDateShort (locale)", () => {
  it("fr-FR różni się od pl-PL", () => {
    expect(fmtDateShort("2026-06-11", "fr-FR")).not.toBe(fmtDateShort("2026-06-11", "pl-PL"));
  });
});

describe("daysAgo (locale, relatywnie)", () => {
  const isoDaysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
  it("pl-PL (domyślne): miesiące temu", () => {
    expect(daysAgo(isoDaysAgo(100))).toMatch(/mies/);
  });
  it("fr-FR lokalizuje i różni się od pl", () => {
    const fr = daysAgo(isoDaysAgo(100), "fr-FR");
    expect(fr).toMatch(/mois/);
    expect(fr).not.toBe(daysAgo(isoDaysAgo(100), "pl-PL"));
  });
});
