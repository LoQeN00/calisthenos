import { describe, expect, it } from "vitest";
import { consultationToEvent } from "~/lib/google/calendar";

describe("consultationToEvent", () => {
  const base = {
    id: "c-1",
    title: "Konsultacja — 11.06.2026",
    summary: "Notatki",
    scheduledAtISO: "2026-06-11T18:00:00.000Z",
    durationMin: 45,
    attendeeEmail: "podopieczny@example.com",
  };

  it("ustawia start/end w UTC wg durationMin", () => {
    const ev = consultationToEvent(base);
    expect(ev.start).toEqual({ dateTime: "2026-06-11T18:00:00.000Z", timeZone: "Etc/UTC" });
    expect(ev.end).toEqual({ dateTime: "2026-06-11T18:45:00.000Z", timeZone: "Etc/UTC" });
  });

  it("dodaje uczestnika (zaproszenie mailowe)", () => {
    const ev = consultationToEvent(base);
    expect(ev.attendees).toEqual([{ email: "podopieczny@example.com" }]);
  });

  it("żąda konferencji Meet z unikalnym requestId", () => {
    const ev = consultationToEvent(base);
    expect(ev.conferenceData?.createRequest?.conferenceSolutionKey).toEqual({ type: "hangoutsMeet" });
    expect(ev.conferenceData?.createRequest?.requestId).toBe("kalisthenos-c-1");
  });

  it("summary zdarzenia = tytuł terminu, description = podsumowanie", () => {
    const ev = consultationToEvent(base);
    expect(ev.summary).toBe("Konsultacja — 11.06.2026");
    expect(ev.description).toBe("Notatki");
  });
});
