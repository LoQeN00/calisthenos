import { and, eq } from "drizzle-orm";
import { useTranslation } from "react-i18next";
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
import { tDyn } from "~/i18n/translate";
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
    return { errorRaw: parsed.error.issues[0]?.message, errorKey: "akcje.invalidData" };
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
    if (e instanceof ConsultationError) return { errorRaw: e.userMessage };
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
  const { t } = useTranslation("trenerKonsultacje");

  // Komunikat błędu: klucz i18n albo gotowy tekst z warstwy lib (Zod/ConsultationError).
  const errorMsg = actionData
    ? ("errorKey" in actionData && actionData.errorKey
        ? tDyn(t, actionData.errorKey)
        : undefined) ?? ("errorRaw" in actionData ? actionData.errorRaw : undefined)
    : undefined;

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">{t("nowa.crumbTrainees")}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}/konsultacje`}>
          {t("nowa.crumbConsultations")}
        </Link>
        <span className="sep">›</span>
        <span className="current">{t("nowa.crumbCurrent")}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>{t("nowa.title")}</h1>
          <div className="sub">{t("nowa.sub")}</div>
        </div>
      </div>

      {errorMsg && (
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
          {errorMsg}
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
              {t("nowa.cancel")}
            </Link>
            <button type="submit" name="intent" value="save-documented" className="btn">
              {t("nowa.saveDocumented")}
            </button>
            <button type="submit" name="intent" value="save-planned" className="btn btn-primary">
              {t("nowa.plan")}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
