import { describe, expect, it } from "vitest";
import { consultationToEvent, consultationToPatch } from "~/lib/google/calendar";

describe("consultationToEvent", () => {
  const base = {
    id: "c-1",
    title: "Konsultacja — 11.06.2026",
    summary: "Notatki",
    scheduledAtISO: "2026-06-11T18:00:00.000Z",
    durationMin: 45,
    attendeeEmail: "podopieczny@example.com",
  };

  it("wysyła czas ścienny bez offsetu + jawną strefę aplikacji", () => {
    const ev = consultationToEvent(base);
    expect(ev.start).toEqual({ dateTime: "2026-06-11T18:00:00", timeZone: "Europe/Warsaw" });
    expect(ev.end).toEqual({ dateTime: "2026-06-11T18:45:00", timeZone: "Europe/Warsaw" });
  });

  // Regresja: zgłoszenie „w aplikacji 18:30, w Google 20:30". Wcześniej wysyłaliśmy
  // ten sam czas ścienny z etykietą Etc/UTC, więc Google przesuwał go o offset strefy.
  it("nie przesuwa godziny (piątek 18:30 zostaje 18:30)", () => {
    const ev = consultationToEvent({ ...base, scheduledAtISO: "2026-06-12T18:30:00.000Z" });
    expect(ev.start?.dateTime).toBe("2026-06-12T18:30:00");
    expect(ev.start?.dateTime).not.toMatch(/Z$/);
    expect(ev.start?.timeZone).toBe("Europe/Warsaw");
  });

  it("przenosi koniec na kolejny dzień, gdy spotkanie przekracza północ", () => {
    const ev = consultationToEvent({ ...base, scheduledAtISO: "2026-06-11T23:30:00.000Z" });
    expect(ev.end?.dateTime).toBe("2026-06-12T00:15:00");
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

  describe("consultationToPatch", () => {
    it("liczy czas identycznie jak insert (jedno źródło prawdy)", () => {
      const ev = consultationToEvent(base);
      const patch = consultationToPatch(base);
      expect(patch.start).toEqual(ev.start);
      expect(patch.end).toEqual(ev.end);
    });

    it("nie rusza uczestników ani konferencji", () => {
      const patch = consultationToPatch(base);
      expect(patch.attendees).toBeUndefined();
      expect(patch.conferenceData).toBeUndefined();
    });
  });
});
