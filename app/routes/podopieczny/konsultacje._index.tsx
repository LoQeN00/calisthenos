import { useState } from "react";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Link,
  useActionData,
  useLoaderData,
} from "react-router";
import { ConsultationAlert } from "~/components/consultation-alert";
import { ConsultationRow } from "~/components/consultation-row";
import { StatusBadge } from "~/components/consultation-status-badge";
import { Icons } from "~/components/icons";
import { type DaySummary, MonthCalendar } from "~/components/month-calendar";
import { TraineeOccurrenceActions } from "~/components/trainee-occurrence-actions";
import { requireUser } from "~/lib/auth";
import { consultationPresentation, mostUrgentTone } from "~/lib/consultation-status";
import { TraineeActionSchema } from "~/lib/consultation-types";
import {
  ConsultationError,
  type OccurrenceListItem,
  getConsultationDetail,
  listOccurrencesForTrainee,
  nextUpcomingForTrainee,
  respondToOccurrence,
} from "~/lib/consultations";
import { syncCancelOne } from "~/lib/google/sync";
import { db } from "~/lib/db/client";
import { fmtDateTime, fmtTime, monthRangeUTC, shiftMonth, todayISO } from "~/lib/format";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const url = new URL(args.request.url);
  const m = url.searchParams.get("m") ?? todayISO().slice(0, 7);
  const range = monthRangeUTC(m);
  const occurrences = await listOccurrencesForTrainee(db, user.id, range);
  const nextRow = await nextUpcomingForTrainee(db, user.id, new Date().toISOString());
  const next = nextRow
    ? {
        id: nextRow.id,
        scheduledAt: nextRow.scheduledAt.toISOString(),
        durationMin: nextRow.durationMin,
        status: nextRow.status,
        title: nextRow.title,
        meetingUrl: nextRow.meetingUrl,
      }
    : null;
  return { occurrences, next, m, year: range.year, month0: range.month0, today: todayISO() };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const fd = await args.request.formData();
  const consultationId = String(fd.get("consultationId") ?? "");
  const parsedAction = TraineeActionSchema.safeParse(String(fd.get("action") ?? ""));
  if (!parsedAction.success) return { error: "Nieznana akcja." };
  const note = String(fd.get("note") ?? "").trim() || undefined;
  try {
    await respondToOccurrence(db, {
      traineeId: user.id,
      consultationId,
      action: parsedAction.data,
      note,
    });
    if (parsedAction.data === "decline") {
      // Termin doczytany w scope podopiecznego → trainerId jest zaufany (nie z requestu).
      const detail = await getConsultationDetail(db, { consultationId, traineeId: user.id });
      if (detail?.consultation.googleEventId) {
        await syncCancelOne(db, { trainerId: detail.consultation.trainerId, consultationId });
      }
    }
    return { success: "Zapisano." };
  } catch (e) {
    if (e instanceof ConsultationError) return { error: e.userMessage };
    throw e;
  }
}

export default function PodopiecznyKonsultacjeKalendarz() {
  const { occurrences, next, m, year, month0, today } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const now = Date.now();

  // Grupuj terminy po dniu miesiąca (UTC).
  const byDay = new Map<number, OccurrenceListItem[]>();
  for (const o of occurrences) {
    const day = new Date(o.scheduledAt).getUTCDate();
    const arr = byDay.get(day) ?? [];
    arr.push(o);
    byDay.set(day, arr);
  }

  // Podsumowanie per dzień (kolor kropki = najważniejszy ton).
  const days = new Map<number, DaySummary>();
  for (const [day, occs] of byDay) {
    const tone = mostUrgentTone(
      occs.map(
        (o) =>
          consultationPresentation({
            status: o.status,
            scheduledAtISO: o.scheduledAt,
            nowMs: now,
            viewer: "trainee",
          }).tone,
      ),
    );
    if (tone) days.set(day, { tone, count: occs.length });
  }

  const todayDay = today.slice(0, 7) === m ? new Date(`${today}T00:00:00.000Z`).getUTCDate() : null;
  const [selected, setSelected] = useState<number | null>(null);

  // Agenda miesiąca: nadchodzące (z pominięciem przypiętego „najbliższego”) i minione.
  const upcoming = occurrences
    .filter((o) => o.status !== "documented" && new Date(o.scheduledAt).getTime() >= now)
    .filter((o) => o.id !== next?.id);
  const past = occurrences
    .filter((o) => o.status === "documented" || new Date(o.scheduledAt).getTime() < now)
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  const selectedOccs = selected != null ? (byDay.get(selected) ?? []) : [];
  const nextMeta = next
    ? consultationPresentation({
        status: next.status,
        scheduledAtISO: next.scheduledAt,
        nowMs: now,
        viewer: "trainee",
      })
    : null;
  const nextCanAct = next?.status === "planned" || next?.status === "confirmed";

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny
          </div>
          <h1>Konsultacje</h1>
          <div className="sub">Twój kalendarz spotkań z trenerem.</div>
        </div>
      </div>

      <ConsultationAlert data={actionData} />

      {/* Najbliższy termin — przypięty, z szybkimi akcjami */}
      {next && nextMeta && (
        <div
          className="card"
          style={{ marginBottom: 18, borderColor: "var(--ink)", background: "var(--accent-soft)" }}
        >
          <div className="row between" style={{ alignItems: "center", marginBottom: 8 }}>
            <div className="eyebrow">Najbliższy termin</div>
            <StatusBadge label={nextMeta.label} tone={nextMeta.tone} />
          </div>
          <div className="row between" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <Link
                to={`/podopieczny/konsultacje/${next.id}`}
                style={{ fontSize: 16, fontWeight: 600 }}
              >
                {next.title}
              </Link>
              <div className="mono text-xs muted" style={{ marginTop: 2 }}>
                {fmtDateTime(next.scheduledAt)} · {next.durationMin} min
              </div>
            </div>
            {next.meetingUrl && (
              <a
                href={next.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm"
                style={{ flexShrink: 0 }}
              >
                <Icons.Video /> Dołącz
              </a>
            )}
          </div>
          {nextCanAct && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              <TraineeOccurrenceActions consultationId={next.id} compact />
            </div>
          )}
        </div>
      )}

      {/* Kalendarz miesiąca */}
      <MonthCalendar
        year={year}
        month0={month0}
        todayDay={todayDay}
        days={days}
        selected={selected}
        onSelect={(d) => setSelected((cur) => (cur === d ? null : d))}
        prevHref={`?m=${shiftMonth(m, -1)}`}
        nextHref={`?m=${shiftMonth(m, 1)}`}
      />

      <div style={{ marginTop: 18 }}>
        {selected != null ? (
          // Wybrany dzień — karty z akcjami
          <div>
            <div className="row between" style={{ alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>
                {selectedOccs.length === 1 ? "1 termin" : `${selectedOccs.length} terminy`}
              </h2>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setSelected(null)}
              >
                <Icons.ChevLeft /> Wszystkie terminy
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {selectedOccs.map((o) => (
                <DayOccurrenceCard key={o.id} occ={o} now={now} />
              ))}
            </div>
          </div>
        ) : (
          // Agenda miesiąca
          <>
            <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Nadchodzące terminy</h2>
            {upcoming.length === 0 ? (
              <div className="empty">
                <h3>{next ? "To wszystkie nadchodzące terminy" : "Brak nadchodzących terminów"}</h3>
                <div>
                  {next
                    ? "Kolejne terminy pojawią się tutaj, gdy trener je zaplanuje."
                    : "Trener jeszcze nie zaplanował spotkań w tym miesiącu."}
                </div>
              </div>
            ) : (
              <div className="list">
                {upcoming.map((o) => {
                  const meta = consultationPresentation({
                    status: o.status,
                    scheduledAtISO: o.scheduledAt,
                    nowMs: now,
                    viewer: "trainee",
                  });
                  return (
                    <ConsultationRow
                      key={o.id}
                      to={`/podopieczny/konsultacje/${o.id}`}
                      lead={fmtDateTime(o.scheduledAt)}
                      title={o.title}
                      sub={`${o.durationMin} min`}
                      label={meta.label}
                      tone={meta.tone}
                    />
                  );
                })}
              </div>
            )}

            {past.length > 0 && (
              <>
                <h2 style={{ fontSize: 17, margin: "28px 0 12px" }}>Minione</h2>
                <div className="list">
                  {past.map((o) => {
                    const meta = consultationPresentation({
                      status: o.status,
                      scheduledAtISO: o.scheduledAt,
                      nowMs: now,
                      viewer: "trainee",
                    });
                    return (
                      <ConsultationRow
                        key={o.id}
                        to={`/podopieczny/konsultacje/${o.id}`}
                        lead={fmtDateTime(o.scheduledAt)}
                        title={o.title}
                        sub={`${o.durationMin} min`}
                        label={meta.label}
                        tone={meta.tone}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DayOccurrenceCard({ occ, now }: { occ: OccurrenceListItem; now: number }) {
  const meta = consultationPresentation({
    status: occ.status,
    scheduledAtISO: occ.scheduledAt,
    nowMs: now,
    viewer: "trainee",
  });
  const canAct = occ.status === "planned" || occ.status === "confirmed";

  return (
    <div className="card">
      <div className="row between" style={{ alignItems: "flex-start", gap: 10 }}>
        <div>
          <Link to={`/podopieczny/konsultacje/${occ.id}`} style={{ fontSize: 15, fontWeight: 600 }}>
            {occ.title}
          </Link>
          <div className="mono text-xs muted" style={{ marginTop: 2 }}>
            {fmtTime(occ.scheduledAt)} · {occ.durationMin} min
          </div>
        </div>
        <StatusBadge label={meta.label} tone={meta.tone} />
      </div>

      {occ.meetingUrl && (
        <div style={{ marginTop: 10 }}>
          <a
            href={occ.meetingUrl}
            target="_blank"
            rel="noreferrer"
            className="row"
            style={{ gap: 6, display: "inline-flex", alignItems: "center", fontSize: 13 }}
          >
            <Icons.Video /> Link spotkania
          </a>
        </div>
      )}

      {canAct && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <TraineeOccurrenceActions consultationId={occ.id} compact />
        </div>
      )}
    </div>
  );
}
