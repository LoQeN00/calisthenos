import { and, eq } from "drizzle-orm";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ConsultationForm } from "~/components/consultation-form";
import { requireUser } from "~/lib/auth";
import { ConsultationError, createConsultation } from "~/lib/consultations";
import { parseConsultationFormData } from "~/lib/consultation-form.server";
import { ConsultationFormSchema } from "~/lib/consultation-types";
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
  return { trainee, today: todayISO() };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const fd = await args.request.formData();
  const parsed = ConsultationFormSchema.safeParse(parseConsultationFormData(fd));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
  }
  try {
    await createConsultation(db, { trainerId: user.id, traineeId, form: parsed.data });
  } catch (e) {
    if (e instanceof ConsultationError) return { error: e.userMessage };
    throw e;
  }
  throw redirect(`/trener/podopieczni/${traineeId}/konsultacje`);
}

export default function TrenerNowaKonsultacja() {
  const { trainee, today } = useLoaderData<typeof loader>();
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
        <span className="current">Nowa</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>Nowa konsultacja</h1>
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
          <ConsultationForm defaultHeldOn={today} />

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
            <Link to={`/trener/podopieczni/${trainee.id}/konsultacje`} className="btn btn-ghost">
              Anuluj
            </Link>
            <button type="submit" className="btn btn-primary">
              Zapisz konsultację
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
