import {
  Form,
  Link,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
} from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { ConsultationAlert } from "~/components/consultation-alert";
import { ConsultationForm } from "~/components/consultation-form";
import { StatusBadge } from "~/components/consultation-status-badge";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/api/auth";
import { consultationPresentation } from "~/lib/consultation-status";
import { parseConsultationDocFormData } from "~/lib/consultation-form.server";
import { ConsultationDocFormSchema } from "~/lib/consultation-types";
import {
  ConsultationError,
  cancelOccurrence,
  deleteConsultation,
  documentConsultation,
  getConsultationDetail,
  rescheduleOccurrence,
  setActionItemStatus,
} from "~/lib/consultations";
import { syncCancelOne, syncUpsertOne } from "~/lib/google/sync";
import { db } from "~/lib/db/client";
import { fmtDate, fmtDateTime } from "~/lib/format";
import { findTraineeOfTrainer } from "~/lib/trainees";

/** ISO (UTC) → wartość dla <input type="datetime-local"> ("YYYY-MM-DDTHH:MM"). */
function toLocalInput(iso: string): string {
  return iso.slice(0, 16);
}

export async function loader(args: LoaderFunctionArgs) {
  const { user } = requireUser(args.context, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  // Scope by BOTH trainerId and traineeId, so a mislinked URL (another of the
  // trainer's trainees) yields 404 rather than rendering under the wrong trainee.
  const detail = await getConsultationDetail(db, {
    consultationId: args.params.konsultacjaId ?? "",
    trainerId: user.id,
    traineeId,
  });
  if (!detail) throw new Response("not found", { status: 404 });
  // Normalizujemy timestamptz → ISO string (UTC) dla widoku/formularza.
  const consultation = {
    ...detail.consultation,
    scheduledAt: detail.consultation.scheduledAt.toISOString(),
  };
  return {
    detail: { consultation, items: detail.items },
    traineeId,
    traineeName: trainee.displayName,
  };
}

export async function action(args: ActionFunctionArgs) {
  const { user } = requireUser(args.context, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const consultationId = args.params.konsultacjaId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  try {
    // Wiązanie do ścieżki traineeId (mislinked URL → 404), jak w loaderze.
    if (
      intent === "delete" ||
      intent === "document" ||
      intent === "reschedule" ||
      intent === "cancel"
    ) {
      const owned = await getConsultationDetail(db, {
        consultationId,
        trainerId: user.id,
        traineeId,
      });
      if (!owned) throw new Response("not found", { status: 404 });
    }
    if (intent === "delete") {
      await syncCancelOne(db, { trainerId: user.id, consultationId });
      await deleteConsultation(db, { trainerId: user.id, consultationId });
      throw redirect(`/trener/podopieczni/${traineeId}/konsultacje`);
    }
    if (intent === "cancel") {
      await cancelOccurrence(db, { trainerId: user.id, consultationId });
      await syncCancelOne(db, { trainerId: user.id, consultationId });
      return { success: "Termin odwołany." };
    }
    if (intent === "reschedule") {
      const scheduledAtLocal = String(fd.get("scheduledAt") ?? "");
      const durationMin = Number(fd.get("durationMin") ?? "") || undefined;
      await rescheduleOccurrence(db, {
        trainerId: user.id,
        consultationId,
        scheduledAtLocal,
        durationMin,
      });
      await syncUpsertOne(db, { trainerId: user.id, consultationId });
      return { success: "Termin przełożony." };
    }
    if (intent === "toggle-item") {
      const itemId = String(fd.get("itemId") ?? "");
      const status = fd.get("status") === "resolved" ? "resolved" : "open";
      await setActionItemStatus(db, { trainerId: user.id, itemId, status });
      return null;
    }
    if (intent === "document") {
      const parsed = ConsultationDocFormSchema.safeParse(parseConsultationDocFormData(fd));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      await documentConsultation(db, { trainerId: user.id, consultationId, form: parsed.data });
      return { success: "Zapisano." };
    }
    return null;
  } catch (e) {
    if (e instanceof Response) throw e;
    if (e instanceof ConsultationError) return { error: e.userMessage };
    throw e;
  }
}

export default function TrenerKonsultacjaDetail() {
  const { detail, traineeId, traineeName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const isDocument = searchParams.get("document") === "1";

  const { consultation: c, items } = detail;
  const listUrl = `/trener/podopieczni/${traineeId}/konsultacje`;

  // ── DOCUMENT mode ──────────────────────────────────────────
  if (isDocument) {
    return (
      <div>
        <div className="crumbs">
          <Link to="/trener/podopieczni">Podopieczni</Link>
          <span className="sep">›</span>
          <Link to={`/trener/podopieczni/${traineeId}`}>{traineeName}</Link>
          <span className="sep">›</span>
          <Link to={listUrl}>Konsultacje</Link>
          <span className="sep">›</span>
          <Link to={`${listUrl}/${c.id}`}>{c.title}</Link>
          <span className="sep">›</span>
          <span className="current">Dokumentowanie</span>
        </div>

        <div className="pagehead">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Termin · <span className="mono">{fmtDateTime(c.scheduledAt)}</span>
            </div>
            <h1>Udokumentuj spotkanie</h1>
          </div>
        </div>

        <ConsultationAlert data={actionData} />

        <div className="card" style={{ maxWidth: 760 }}>
          <Form method="post">
            <input type="hidden" name="intent" value="document" />
            <ConsultationForm
              defaultValue={{
                scheduledAt: toLocalInput(c.scheduledAt),
                durationMin: c.durationMin,
                meetingUrl: c.meetingUrl,
                periodFrom: c.periodFrom,
                periodTo: c.periodTo,
                title: c.title,
                summary: c.summary ?? "",
                items: items.map((it) => ({ body: it.body, status: it.status })),
              }}
            />
            <div
              style={{
                marginTop: 24,
                paddingTop: 18,
                borderTop: "1px solid var(--line)",
                display: "flex",
                gap: 10,
                justifyContent: "flex-end",
              }}
            >
              <Link to={`${listUrl}/${c.id}`} className="btn btn-ghost">
                Anuluj
              </Link>
              <button type="submit" className="btn btn-primary">
                Zapisz dokumentację
              </button>
            </div>
          </Form>
        </div>
      </div>
    );
  }

  // ── VIEW mode ──────────────────────────────────────────────
  const openCount = items.filter((it) => it.status === "open").length;
  const isCancelled = c.status === "cancelled";
  const isDocumented = c.status === "documented";
  const meta = consultationPresentation({
    status: c.status,
    scheduledAtISO: c.scheduledAt,
    nowMs: Date.now(),
    viewer: "trainer",
  });

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${traineeId}`}>{traineeName}</Link>
        <span className="sep">›</span>
        <Link to={listUrl}>Konsultacje</Link>
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
        <div className="row" style={{ gap: 8 }}>
          {!isCancelled && (
            <Link to="?document=1" className="btn btn-primary">
              <Icons.Note /> {isDocumented ? "Edytuj dokumentację" : "Udokumentuj"}
            </Link>
          )}
          <Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <ConfirmSubmitButton
              className="btn btn-icon btn-ghost"
              style={{ color: "var(--danger)" }}
              title="Usuń termin"
              aria-label="Usuń termin"
              confirmOptions={{
                title: "Usunąć termin?",
                message:
                  "Usunięcie jest nieodwracalne — przepada dokumentacja i punkty do poprawy.",
                destructive: true,
                confirmText: "Usuń termin",
              }}
            >
              <Icons.Trash />
            </ConfirmSubmitButton>
          </Form>
        </div>
      </div>

      <ConsultationAlert data={actionData} />

      {/* Notatka podopiecznego (prośba o zmianę) */}
      {c.status === "change_requested" && c.traineeNote && (
        <div
          className="card"
          style={{
            marginBottom: 18,
            maxWidth: 760,
            borderColor: "var(--warn)",
            borderStyle: "dashed",
          }}
        >
          <div className="field-label" style={{ marginBottom: 6, color: "var(--warn)" }}>
            Podopieczny prosi o zmianę terminu
          </div>
          <p
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--ink-2)",
              margin: 0,
            }}
          >
            {c.traineeNote}
          </p>
        </div>
      )}

      {/* Akcje terminu: przełóż / odwołaj */}
      {!isCancelled && !isDocumented && (
        <div className="card" style={{ marginBottom: 18, maxWidth: 760 }}>
          <div className="field-label" style={{ marginBottom: 10 }}>
            Zarządzaj terminem
          </div>
          <Form
            method="post"
            className="row"
            style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
          >
            <input type="hidden" name="intent" value="reschedule" />
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="rs-scheduledAt">Nowy termin</label>
              <input
                id="rs-scheduledAt"
                className="input"
                type="datetime-local"
                name="scheduledAt"
                defaultValue={toLocalInput(c.scheduledAt)}
                required
              />
            </div>
            <div className="field" style={{ width: 140 }}>
              <label htmlFor="rs-durationMin">Czas (min)</label>
              <input
                id="rs-durationMin"
                className="input"
                type="number"
                name="durationMin"
                min={1}
                max={600}
                defaultValue={c.durationMin}
              />
            </div>
            <button type="submit" className="btn">
              <Icons.Calendar /> Przełóż
            </button>
          </Form>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <Form method="post">
              <input type="hidden" name="intent" value="cancel" />
              <ConfirmSubmitButton
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)" }}
                confirmOptions={{
                  title: "Odwołać termin?",
                  message:
                    "Termin zostanie oznaczony jako odwołany i zniknie z kalendarza podopiecznego.",
                  destructive: true,
                  confirmText: "Odwołaj termin",
                }}
              >
                Odwołaj termin
              </ConfirmSubmitButton>
            </Form>
          </div>
        </div>
      )}

      {/* Podsumowanie */}
      {c.summary && c.summary.trim().length > 0 && (
        <div className="card" style={{ marginBottom: 18, maxWidth: 760 }}>
          <div className="field-label" style={{ marginBottom: 10 }}>
            Podsumowanie
          </div>
          <p
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--ink-2)",
              margin: 0,
            }}
          >
            {c.summary}
          </p>
        </div>
      )}

      {/* Okres omówiony */}
      {c.periodFrom && c.periodTo && (
        <div className="text-xs muted" style={{ marginBottom: 18 }}>
          Okres omówiony: <span className="mono">{fmtDate(c.periodFrom)}</span> —{" "}
          <span className="mono">{fmtDate(c.periodTo)}</span>
        </div>
      )}

      {/* Punkty do poprawy */}
      {items.length === 0 ? (
        isDocumented && (
          <div className="empty" style={{ maxWidth: 760 }}>
            <h3>Brak punktów</h3>
            <div>Ta konsultacja nie ma żadnych punktów do poprawy.</div>
          </div>
        )
      ) : (
        <div style={{ maxWidth: 760 }}>
          <div className="field-label" style={{ marginBottom: 10 }}>
            Do poprawy (
            {openCount > 0 ? `${openCount} otwartych z ${items.length}` : `${items.length}`})
          </div>
          <div className="list">
            {items.map((item) => {
              const resolved = item.status === "resolved";
              const nextStatus = resolved ? "open" : "resolved";
              return (
                <div
                  key={item.id}
                  className="list-row"
                  style={{
                    gridTemplateColumns: "24px 1fr auto",
                    gap: 14,
                    cursor: "default",
                    opacity: resolved ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {resolved ? (
                      <Icons.Check style={{ color: "var(--ok)", width: 16, height: 16 }} />
                    ) : (
                      <Icons.Dot style={{ color: "var(--warn)", width: 16, height: 16 }} />
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      textDecoration: resolved ? "line-through" : "none",
                      color: resolved ? "var(--muted)" : "var(--ink)",
                    }}
                  >
                    {item.body}
                  </div>
                  <Form method="post" style={{ display: "flex" }}>
                    <input type="hidden" name="intent" value="toggle-item" />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="status" value={nextStatus} />
                    <button
                      type="submit"
                      className="btn btn-sm btn-ghost"
                      style={{
                        fontSize: 12,
                        color: resolved ? "var(--muted)" : "var(--ink-2)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {resolved ? "Cofnij do otwartych" : "Oznacz jako poprawione"}
                    </button>
                  </Form>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
