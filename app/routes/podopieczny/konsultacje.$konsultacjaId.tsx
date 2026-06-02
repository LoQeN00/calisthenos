import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  Link,
  useActionData,
  useLoaderData,
} from "react-router";
import { ConsultationAlert } from "~/components/consultation-alert";
import { StatusBadge } from "~/components/consultation-status-badge";
import { Icons } from "~/components/icons";
import { TraineeOccurrenceActions } from "~/components/trainee-occurrence-actions";
import { requireUser } from "~/lib/auth";
import { consultationPresentation } from "~/lib/consultation-status";
import { TraineeActionSchema } from "~/lib/consultation-types";
import { ConsultationError, getConsultationDetail, respondToOccurrence } from "~/lib/consultations";
import { syncCancelOne } from "~/lib/google/sync";
import { db } from "~/lib/db/client";
import { fmtDate, fmtDateTime } from "~/lib/format";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const detail = await getConsultationDetail(db, {
    consultationId: args.params.konsultacjaId ?? "",
    traineeId: user.id,
  });
  if (!detail) throw new Response("not found", { status: 404 });
  const consultation = {
    ...detail.consultation,
    scheduledAt: detail.consultation.scheduledAt.toISOString(),
  };
  return { detail: { consultation, items: detail.items } };
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

export default function TraineeKonsultacjaDetail() {
  const { detail } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { consultation: c, items } = detail;

  const meta = consultationPresentation({
    status: c.status,
    scheduledAtISO: c.scheduledAt,
    nowMs: Date.now(),
    viewer: "trainee",
  });
  const canAct = c.status === "planned" || c.status === "confirmed";
  const openCount = items.filter((it) => it.status === "open").length;

  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny/konsultacje">Konsultacje</Link>
        <span className="sep">›</span>
        <span className="current">{c.title}</span>
      </div>

      <div className="pagehead">
        <div>
          <div
            className="eyebrow"
            style={{ marginBottom: 6, display: "flex", gap: 10, alignItems: "center" }}
          >
            <span className="mono">{fmtDateTime(c.scheduledAt)}</span>
            <span>· {c.durationMin} min</span>
            <StatusBadge label={meta.label} tone={meta.tone} />
          </div>
          <h1>{c.title}</h1>
          {c.meetingUrl && (
            <div className="sub" style={{ marginTop: 4 }}>
              <a
                href={c.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="row"
                style={{ gap: 6, display: "inline-flex", alignItems: "center" }}
              >
                <Icons.Video /> Link spotkania
              </a>
            </div>
          )}
        </div>
      </div>

      <ConsultationAlert data={actionData} />

      {/* Akcje potwierdzania */}
      {canAct && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="field-label" style={{ marginBottom: 10 }}>
            Twoja odpowiedź
          </div>
          <TraineeOccurrenceActions consultationId={c.id} />
        </div>
      )}

      {c.status === "change_requested" && (
        <div className="text-sm muted" style={{ marginBottom: 18 }}>
          Wysłałeś prośbę o zmianę terminu — trener zaproponuje nowy.
        </div>
      )}

      {/* Podsumowanie (po udokumentowaniu) */}
      {c.summary && c.summary.trim().length > 0 && (
        <div
          className="card"
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 18,
            borderLeft: "3px solid var(--line-2)",
          }}
        >
          {c.summary}
        </div>
      )}

      {c.periodFrom && c.periodTo && (
        <div className="text-xs muted" style={{ marginBottom: 18 }}>
          Okres omówiony: <span className="mono">{fmtDate(c.periodFrom)}</span> —{" "}
          <span className="mono">{fmtDate(c.periodTo)}</span>
        </div>
      )}

      {/* Punkty do poprawy (read-only) */}
      {items.length > 0 && (
        <div>
          <div className="field-label" style={{ marginBottom: 10 }}>
            Do poprawy ({openCount > 0 ? `${openCount} otwartych z ${items.length}` : items.length})
          </div>
          <div className="list">
            {items.map((item) => {
              const resolved = item.status === "resolved";
              return (
                <div
                  key={item.id}
                  className="list-row"
                  style={{ gridTemplateColumns: "20px 1fr auto", gap: 12, cursor: "default" }}
                >
                  {resolved ? (
                    <Icons.Check
                      style={{ color: "var(--ok)", flexShrink: 0, width: 16, height: 16 }}
                    />
                  ) : (
                    <Icons.Dot
                      style={{ color: "var(--muted-2)", flexShrink: 0, width: 16, height: 16 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 14,
                      opacity: resolved ? 0.45 : 1,
                      textDecoration: resolved ? "line-through" : "none",
                      color: "var(--ink)",
                    }}
                  >
                    {item.body}
                  </span>
                  <span
                    className="mono text-xs"
                    style={{ color: resolved ? "var(--ok)" : "var(--muted)", flexShrink: 0 }}
                  >
                    {resolved ? "poprawione" : "otwarte"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
