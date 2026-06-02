import { and, eq } from "drizzle-orm";
import {
  Form,
  Link,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import { ConsultationForm } from "~/components/consultation-form";
import { requireUser } from "~/lib/auth";
import { parseConsultationDocFormData } from "~/lib/consultation-form.server";
import { ConsultationDocFormSchema } from "~/lib/consultation-types";
import { ConsultationError, createAdhocConsultation } from "~/lib/consultations";
import { syncUpsertOne } from "~/lib/google/sync";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { todayISO } from "~/lib/format";

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
  return { trainee, defaultScheduledAt: `${todayISO()}T18:00` };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const fd = await args.request.formData();
  const documented = fd.get("intent") === "save-documented";
  const parsed = ConsultationDocFormSchema.safeParse(parseConsultationDocFormData(fd));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
  }
  let id: string;
  try {
    id = await createAdhocConsultation(db, {
      trainerId: user.id,
      traineeId,
      form: parsed.data,
      documented,
    });
  } catch (e) {
    if (e instanceof ConsultationError) return { error: e.userMessage };
    throw e;
  }
  if (!documented) {
    await syncUpsertOne(db, { trainerId: user.id, consultationId: id });
  }
  throw redirect(`/trener/podopieczni/${traineeId}/konsultacje`);
}

export default function TrenerNowaKonsultacja() {
  const { trainee, defaultScheduledAt } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}/konsultacje`}>Konsultacje</Link>
        <span className="sep">›</span>
        <span className="current">Nowy termin</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>Nowy termin</h1>
          <div className="sub">
            Pojedynczy termin poza serią — zaplanuj na przyszłość albo zapisz odbyte spotkanie.
          </div>
        </div>
      </div>

      {actionData?.error && (
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

      <div className="card" style={{ maxWidth: 760 }}>
        <Form method="post">
          <ConsultationForm defaultScheduledAt={defaultScheduledAt} />

          <div
            style={{
              marginTop: 24,
              paddingTop: 18,
              borderTop: "1px solid var(--line)",
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <Link to={`/trener/podopieczni/${trainee.id}/konsultacje`} className="btn btn-ghost">
              Anuluj
            </Link>
            <button type="submit" name="intent" value="save-documented" className="btn">
              Zapisz jako odbytą
            </button>
            <button type="submit" name="intent" value="save-planned" className="btn btn-primary">
              Zaplanuj
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
