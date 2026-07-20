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
      ).toMatchObject({
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
      ).toMatchObject({
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
      ).toMatchObject({
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
      ).toMatchObject({
        label: "udokumentowany",
        tone: "done",
      });
    }
  });

  it('podopieczny: planned (przyszły i miniony) zawsze "do potwierdzenia"', () => {
    for (const at of [FUTURE, PAST]) {
      expect(
        consultationPresentation({
          status: "planned",
          scheduledAtISO: at,
          nowMs: NOW,
          viewer: "trainee",
        }),
      ).toMatchObject({ label: "do potwierdzenia", tone: "pending" });
    }
  });

  it('trener: planned przyszły = "zaplanowany", miniony = "do udokumentowania"', () => {
    expect(
      consultationPresentation({
        status: "planned",
        scheduledAtISO: FUTURE,
        nowMs: NOW,
        viewer: "trainer",
      }),
    ).toMatchObject({ label: "zaplanowany", tone: "scheduled" });
    expect(
      consultationPresentation({
        status: "planned",
        scheduledAtISO: PAST,
        nowMs: NOW,
        viewer: "trainer",
      }),
    ).toMatchObject({ label: "do udokumentowania", tone: "pending" });
  });

  it("zwraca poprawne labelKey dla reprezentatywnych stanów", () => {
    expect(
      consultationPresentation({
        status: "confirmed",
        scheduledAtISO: FUTURE,
        nowMs: NOW,
        viewer: "trainer",
      }).labelKey,
    ).toBe("konsultacje:status.confirmed");

    expect(
      consultationPresentation({
        status: "change_requested",
        scheduledAtISO: FUTURE,
        nowMs: NOW,
        viewer: "trainer",
      }).labelKey,
    ).toBe("konsultacje:status.change");

    expect(
      consultationPresentation({
        status: "cancelled",
        scheduledAtISO: FUTURE,
        nowMs: NOW,
        viewer: "trainer",
      }).labelKey,
    ).toBe("konsultacje:status.cancelled");

    expect(
      consultationPresentation({
        status: "documented",
        scheduledAtISO: PAST,
        nowMs: NOW,
        viewer: "trainer",
      }).labelKey,
    ).toBe("konsultacje:status.done");

    expect(
      consultationPresentation({
        status: "planned",
        scheduledAtISO: FUTURE,
        nowMs: NOW,
        viewer: "trainee",
      }).labelKey,
    ).toBe("konsultacje:status.pending");

    expect(
      consultationPresentation({
        status: "planned",
        scheduledAtISO: PAST,
        nowMs: NOW,
        viewer: "trainer",
      }).labelKey,
    ).toBe("konsultacje:status.pendingDoc");

    expect(
      consultationPresentation({
        status: "planned",
        scheduledAtISO: FUTURE,
        nowMs: NOW,
        viewer: "trainer",
      }).labelKey,
    ).toBe("konsultacje:status.scheduled");
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
