import { describe, expect, it } from "vitest";
import {
  type ConsultationTone,
  consultationPresentation,
  mostUrgentTone,
} from "~/lib/consultation-status";

const NOW = Date.parse("2026-06-15T12:00:00.000Z");
const FUTURE = "2026-06-20T18:00:00.000Z";
const PAST = "2026-06-10T18:00:00.000Z";

describe("consultationPresentation", () => {
  it("statusy końcowe są takie same dla obu ról", () => {
    for (const viewer of ["trainer", "trainee"] as const) {
      expect(
        consultationPresentation({
          status: "confirmed",
          scheduledAtISO: FUTURE,
          nowMs: NOW,
          viewer,
        }),
      ).toEqual({
        label: "potwierdzony",
        tone: "confirmed",
      });
      expect(
        consultationPresentation({
          status: "change_requested",
          scheduledAtISO: FUTURE,
          nowMs: NOW,
          viewer,
        }),
      ).toEqual({
        label: "prośba o zmianę",
        tone: "change",
      });
      expect(
        consultationPresentation({
          status: "cancelled",
          scheduledAtISO: FUTURE,
          nowMs: NOW,
          viewer,
        }),
      ).toEqual({
        label: "odwołany",
        tone: "cancelled",
      });
      expect(
        consultationPresentation({
          status: "documented",
          scheduledAtISO: PAST,
          nowMs: NOW,
          viewer,
        }),
      ).toEqual({
        label: "udokumentowany",
        tone: "done",
      });
    }
  });

  it("podopieczny: planned (przyszły i miniony) zawsze „do potwierdzenia”", () => {
    for (const at of [FUTURE, PAST]) {
      expect(
        consultationPresentation({
          status: "planned",
          scheduledAtISO: at,
          nowMs: NOW,
          viewer: "trainee",
        }),
      ).toEqual({ label: "do potwierdzenia", tone: "pending" });
    }
  });

  it("trener: planned przyszły = „zaplanowany”, miniony = „do udokumentowania”", () => {
    expect(
      consultationPresentation({
        status: "planned",
        scheduledAtISO: FUTURE,
        nowMs: NOW,
        viewer: "trainer",
      }),
    ).toEqual({ label: "zaplanowany", tone: "scheduled" });
    expect(
      consultationPresentation({
        status: "planned",
        scheduledAtISO: PAST,
        nowMs: NOW,
        viewer: "trainer",
      }),
    ).toEqual({ label: "do udokumentowania", tone: "pending" });
  });
});

describe("mostUrgentTone", () => {
  it("wybiera najważniejszy ton (pending > confirmed > done)", () => {
    const tones: ConsultationTone[] = ["done", "confirmed", "pending"];
    expect(mostUrgentTone(tones)).toBe("pending");
    expect(mostUrgentTone(["confirmed", "done"])).toBe("confirmed");
    expect(mostUrgentTone(["scheduled", "done"])).toBe("scheduled");
  });
  it("zwraca null dla pustej listy", () => {
    expect(mostUrgentTone([])).toBeNull();
  });
});
