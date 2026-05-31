import { and, eq } from "drizzle-orm";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { ConsultationForm } from "~/components/consultation-form";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { parseConsultationFormData } from "~/lib/consultation-form.server";
import { ConsultationFormSchema } from "~/lib/consultation-types";
import {
  ConsultationError,
  deleteConsultation,
  getConsultationDetail,
  setActionItemStatus,
  updateConsultation,
} from "~/lib/consultations";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const [trainee] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (!trainee) throw new Response("not found", { status: 404 });
  // Scope by BOTH trainerId and traineeId: the consultation must belong to this
  // trainer AND to the trainee in the path, so a mislinked URL (another of the
  // trainer's trainees) yields 404 rather than rendering under the wrong trainee.
  const detail = await getConsultationDetail(db, {
    consultationId: args.params.konsultacjaId ?? "",
    trainerId: user.id,
    traineeId,
  });
  if (!detail) throw new Response("not found", { status: 404 });
  return { detail, traineeId, traineeName: trainee.displayName };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const consultationId = args.params.konsultacjaId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  try {
    // Bind consultationId-based mutations to the path traineeId (same reason as
    // the loader scoping): reject mutating a consultation that isn't this
    // trainee's, even if it belongs to the same trainer.
    if (intent === "delete" || intent === "update") {
      const owned = await getConsultationDetail(db, {
        consultationId,
        trainerId: user.id,
        traineeId,
      });
      if (!owned) throw new Response("not found", { status: 404 });
    }
    if (intent === "delete") {
      await deleteConsultation(db, { trainerId: user.id, consultationId });
      throw redirect(`/trener/podopieczni/${traineeId}/konsultacje`);
    }
    if (intent === "toggle-item") {
      const itemId = String(fd.get("itemId") ?? "");
      const status = fd.get("status") === "resolved" ? "resolved" : "open";
      await setActionItemStatus(db, { trainerId: user.id, itemId, status });
      return null;
    }
    if (intent === "update") {
      const parsed = ConsultationFormSchema.safeParse(parseConsultationFormData(fd));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      await updateConsultation(db, { trainerId: user.id, consultationId, form: parsed.data });
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
  const isEdit = searchParams.get("edit") === "1";

  const { consultation: c, items } = detail;
  const listUrl = `/trener/podopieczni/${traineeId}/konsultacje`;

  if (isEdit) {
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
          <span className="current">Edycja</span>
        </div>

        <div className="pagehead">
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Konsultacja · <span className="mono">{fmtDate(c.heldOn)}</span>
            </div>
            <h1>Edytuj konsultację</h1>
          </div>
        </div>

        {actionData && "error" in actionData && actionData.error && (
          <p
            role="alert"
            style={{
              color: "var(--danger)",
              fontSize: 13,
              marginBottom: 18,
              padding: "8px 12px",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius)",
            }}
          >
            {actionData.error}
          </p>
        )}
        {actionData && "success" in actionData && actionData.success && (
          <output
            style={{
              display: "block",
              color: "var(--ok)",
              fontSize: 13,
              marginBottom: 18,
              padding: "8px 12px",
              border: "1px solid var(--ok)",
              borderRadius: "var(--radius)",
              background: "var(--accent-soft)",
            }}
          >
            {actionData.success}
          </output>
        )}

        <div className="card" style={{ maxWidth: 760 }}>
          <Form method="post">
            <input type="hidden" name="intent" value="update" />
            <ConsultationForm
              defaultValue={{
                heldOn: c.heldOn,
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
                Zapisz
              </button>
            </div>
          </Form>
        </div>
      </div>
    );
  }

  // ── VIEW mode ──────────────────────────────────────────────

  const openCount = items.filter((it) => it.status === "open").length;

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
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Konsultacja · <span className="mono">{fmtDate(c.heldOn)}</span>
            {c.periodFrom && c.periodTo && (
              <>
                {" "}
                ·{" "}
                <span className="mono">
                  {fmtDate(c.periodFrom)} — {fmtDate(c.periodTo)}
                </span>
              </>
            )}
          </div>
          <h1>{c.title}</h1>
          {items.length > 0 && (
            <div className="sub" style={{ marginTop: 4 }}>
              {openCount > 0 ? (
                <span style={{ color: "var(--warn)" }}>
                  <span className="mono">{openCount}</span> do poprawy
                </span>
              ) : (
                <span style={{ color: "var(--ok)" }}>wszystko poprawione</span>
              )}
              {" · "}
              <span className="mono">{items.length}</span>{" "}
              {items.length === 1 ? "punkt" : items.length <= 4 ? "punkty" : "punktów"} łącznie
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="?edit=1" className="btn">
            <Icons.Edit /> Edytuj
          </Link>
          <Form method="post">
            <input type="hidden" name="intent" value="delete" />
            <ConfirmSubmitButton
              className="btn btn-icon btn-ghost"
              style={{ color: "var(--danger)" }}
              title="Usuń konsultację"
              aria-label="Usuń konsultację"
              confirmOptions={{
                title: "Usunąć konsultację?",
                message:
                  "Usunięcie konsultacji jest nieodwracalne. Wszystkie punkty do poprawy zostaną utracone.",
                destructive: true,
                confirmText: "Usuń konsultację",
              }}
            >
              <Icons.Trash />
            </ConfirmSubmitButton>
          </Form>
        </div>
      </div>

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

      {/* Punkty do poprawy */}
      {items.length === 0 ? (
        <div className="empty" style={{ maxWidth: 760 }}>
          <h3>Brak punktów</h3>
          <div>Ta konsultacja nie ma żadnych punktów do poprawy.</div>
        </div>
      ) : (
        <div style={{ maxWidth: 760 }}>
          <div className="field-label" style={{ marginBottom: 10 }}>
            Do poprawy ({items.length})
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
                  {/* Status icon */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {resolved ? (
                      <Icons.Check style={{ color: "var(--ok)", width: 16, height: 16 }} />
                    ) : (
                      <Icons.Dot style={{ color: "var(--warn)", width: 16, height: 16 }} />
                    )}
                  </div>

                  {/* Body */}
                  <div
                    style={{
                      fontSize: 14,
                      textDecoration: resolved ? "line-through" : "none",
                      color: resolved ? "var(--muted)" : "var(--ink)",
                    }}
                  >
                    {item.body}
                  </div>

                  {/* Toggle button */}
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
