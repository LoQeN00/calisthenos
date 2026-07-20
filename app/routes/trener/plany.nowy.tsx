import { and, eq, isNull } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { createBlankPlan, findAnyDraftFor } from "~/lib/plans";

const NewPlanSchema = z.object({
  traineeId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const url = new URL(args.request.url);
  const preselectId = url.searchParams.get("traineeId");

  const trainees = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
        isNull(schema.users.archivedAt),
      ),
    )
    .orderBy(schema.users.displayName);

  // Preselect the trainee from the query string when it points at one of ours.
  const preselected =
    preselectId != null && trainees.some((t) => t.id === preselectId) ? preselectId : null;

  // If preselected has an existing draft, bounce there immediately so the trainer
  // doesn't accidentally try to create a second draft (DB unique index would block it).
  if (preselected) {
    const existingDraft = await findAnyDraftFor(db, preselected);
    if (existingDraft) {
      throw redirect(`/trener/plany/${existingDraft.id}`);
    }
  }

  return { trainees, preselected };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const parsed = NewPlanSchema.safeParse({
    traineeId: fd.get("traineeId"),
    name: fd.get("name"),
  });
  if (!parsed.success) {
    return { error: "plany.nowy.errorForm" };
  }

  // Confirm the trainee belongs to this trainer.
  const traineeRows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, parsed.data.traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (traineeRows.length === 0) {
    return { error: "plany.nowy.errorTraineeMissing" };
  }

  // Schema enforces "one draft per trainee" via partial unique index.
  // Pre-empt with a friendly error → redirect to the existing draft.
  const existingDraft = await findAnyDraftFor(db, parsed.data.traineeId);
  if (existingDraft) {
    throw redirect(`/trener/plany/${existingDraft.id}`);
  }

  const newId = await createBlankPlan(db, {
    trainerId: user.id,
    traineeId: parsed.data.traineeId,
    name: parsed.data.name,
  });
  throw redirect(`/trener/plany/${newId}`);
}

export default function NowyPlan() {
  const { trainees, preselected } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation("trenerPlany");

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="crumbs">
        <Link to="/trener/plany">{t("plany.nowy.crumbList")}</Link>
        <span className="sep">›</span>
        <span className="current">{t("plany.nowy.crumbCurrent")}</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("plany.eyebrow")}
          </div>
          <h1>{t("plany.nowy.title")}</h1>
        </div>
      </div>

      {trainees.length === 0 ? (
        <div className="empty">
          <h3>{t("plany.nowy.emptyTraineesTitle")}</h3>
          <div>{t("plany.nowy.emptyTraineesBody")}</div>
        </div>
      ) : (
        <Form method="post" className="card" style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <label htmlFor="np-trainee">{t("plany.nowy.labelForWhom")}</label>
            <select
              id="np-trainee"
              name="traineeId"
              required
              defaultValue={preselected ?? trainees[0]?.id ?? ""}
              className="select"
            >
              {trainees.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {tr.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="np-name">{t("plany.nowy.labelName")}</label>
            <input
              id="np-name"
              name="name"
              type="text"
              required
              maxLength={120}
              defaultValue={t("plany.nowy.defaultName")}
              className="input"
            />
          </div>
          {actionData?.error != null && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
              {tDyn(t, actionData.error)}
            </p>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary">
              {t("plany.nowy.create")}
            </button>
            <Link to="/trener/plany" className="btn btn-ghost">
              {t("plany.nowy.cancel")}
            </Link>
          </div>
        </Form>
      )}
    </div>
  );
}
