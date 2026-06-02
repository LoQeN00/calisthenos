import { calendar, type calendar_v3 } from "@googleapis/calendar";
import type { OAuth2Client } from "google-auth-library";

export interface ConsultationEventInput {
  id: string;
  title: string;
  summary: string;
  scheduledAtISO: string;
  durationMin: number;
  attendeeEmail: string;
}

/** Czysty mapper konsultacji → ciało zdarzenia Google Calendar (z prośbą o Meet). */
export function consultationToEvent(input: ConsultationEventInput): calendar_v3.Schema$Event {
  const start = new Date(input.scheduledAtISO);
  const end = new Date(start.getTime() + input.durationMin * 60_000);
  return {
    summary: input.title,
    description: input.summary,
    start: { dateTime: start.toISOString(), timeZone: "Etc/UTC" },
    end: { dateTime: end.toISOString(), timeZone: "Etc/UTC" },
    attendees: [{ email: input.attendeeEmail }],
    conferenceData: {
      createRequest: {
        requestId: `kalisthenos-${input.id}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

function api(auth: OAuth2Client): calendar_v3.Calendar {
  return calendar({ version: "v3", auth });
}

/** Tworzy zdarzenie z Meet + zaproszeniem. Zwraca { eventId, meetUrl }. */
export async function insertEvent(
  auth: OAuth2Client,
  calendarId: string,
  input: ConsultationEventInput,
): Promise<{ eventId: string; meetUrl: string | null }> {
  const res = await api(auth).events.insert({
    calendarId,
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: consultationToEvent(input),
  });
  const eventId = res.data.id;
  if (!eventId) throw new Error("Google did not return an event id");
  const meetUrl =
    res.data.hangoutLink ??
    res.data.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ??
    null;
  return { eventId, meetUrl };
}

/** Aktualizuje termin/godzinę/treść istniejącego zdarzenia (po reschedule/edycji). */
export async function patchEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string,
  input: ConsultationEventInput,
): Promise<void> {
  await api(auth).events.patch({
    calendarId,
    eventId,
    sendUpdates: "all",
    requestBody: {
      summary: input.title,
      description: input.summary,
      start: { dateTime: new Date(input.scheduledAtISO).toISOString(), timeZone: "Etc/UTC" },
      end: {
        dateTime: new Date(
          new Date(input.scheduledAtISO).getTime() + input.durationMin * 60_000,
        ).toISOString(),
        timeZone: "Etc/UTC",
      },
    },
  });
}

/** Usuwa zdarzenie (po cancel/odrzuceniu). Idempotentne wobec 404/410. */
export async function deleteEvent(
  auth: OAuth2Client,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await api(auth).events.delete({ calendarId, eventId, sendUpdates: "all" });
  } catch (err: unknown) {
    const code = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
    if (code === 404 || code === 410) return; // już usunięte — OK
    throw err;
  }
}
