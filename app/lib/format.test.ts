import { describe, expect, it } from "vitest";
import { fmtDateTime, fmtTime } from "~/lib/format";

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
});
