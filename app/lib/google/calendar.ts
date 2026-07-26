import { calendar, type calendar_v3 } from "@googleapis/calendar";
import type { OAuth2Client } from "google-auth-library";
import { APP_TIME_ZONE } from "~/lib/format";

export interface ConsultationEventInput {
  id: string;
  title: string;
  summary: string;
  scheduledAtISO: string;
  durationMin: number;
  attendeeEmail: string;
}

/**
 * Czas ścienny "YYYY-MM-DDTHH:MM:SS" — RFC3339 BEZ offsetu i bez `Z`.
 *
 * `scheduled_at` niesie u nas czas ścienny w komponentach UTC (patrz `APP_TIME_ZONE`),
 * więc czytamy je przez `getUTC*` i celowo NIE dopisujemy `Z`. Strefę podajemy Google
 * osobno w polu `timeZone` — dokumentacja Calendar API dopuszcza dokładnie taką parę
 * („a time zone offset is required unless a time zone is explicitly specified in
 * timeZone"). Wysyłanie `…Z` oznaczałoby, że 18:30 to 18:30 UTC, i Google pokazałby
 * termin o 20:30 czasu lokalnego.
 */
function wallClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** start/end zdarzenia — jedno źródło prawdy dla `insert` i `patch`, żeby nie rozjechały się w czasie. */
function eventTimes(input: ConsultationEventInput): Pick<calendar_v3.Schema$Event, "start" | "end"> {
  const start = new Date(input.scheduledAtISO);
  const end = new Date(start.getTime() + input.durationMin * 60_000);
  return {
    start: { dateTime: wallClock(start), timeZone: APP_TIME_ZONE },
    end: { dateTime: wallClock(end), timeZone: APP_TIME_ZONE },
  };
}

/** Czysty mapper konsultacji → ciało `events.patch` (termin + treść, bez uczestników i konferencji). */
export function consultationToPatch(input: ConsultationEventInput): calendar_v3.Schema$Event {
  return {
    summary: input.title,
    description: input.summary,
    ...eventTimes(input),
  };
}

/** Czysty mapper konsultacji → ciało zdarzenia Google Calendar (z prośbą o Meet). */
export function consultationToEvent(input: ConsultationEventInput): calendar_v3.Schema$Event {
  return {
    ...consultationToPatch(input),
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

/** Aktualizuje termin/godzinę/treść istniejącego zdarzenia (po reschedule/edycji/naprawie). */
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
    requestBody: consultationToPatch(input),
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
