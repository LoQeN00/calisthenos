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
import { requireUser } from "~/lib/api/auth";
import { db } from "~/lib/db/client";
import { createBlankPlan, findAnyDraftFor } from "~/lib/plans";
import { findTraineeOfTrainer, listTraineesOfTrainer } from "~/lib/trainees";

const NewPlanSchema = z.object({
  traineeId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export async function loader(args: LoaderFunctionArgs) {
  const { user } = requireUser(args.context, { role: "trainer" });
  const url = new URL(args.request.url);
  const preselectId = url.searchParams.get("traineeId");

  const trainees = await listTraineesOfTrainer(db, user.id);

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
  const { user } = requireUser(args.context, { role: "trainer" });
  const fd = await args.request.formData();
  const parsed = NewPlanSchema.safeParse({
    traineeId: fd.get("traineeId"),
    name: fd.get("name"),
  });
  if (!parsed.success) {
    return { error: "Sprawdź pola formularza." };
  }

  // Confirm the trainee belongs to this trainer.
  const trainee = await findTraineeOfTrainer(db, user.id, parsed.data.traineeId);
  if (trainee == null) {
    return { error: "Podopieczny nie istnieje albo nie należy do Ciebie." };
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

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="crumbs">
        <Link to="/trener/plany">Plany</Link>
        <span className="sep">›</span>
        <span className="current">Nowy</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Nowy plan</h1>
        </div>
      </div>

      {trainees.length === 0 ? (
        <div className="empty">
          <h3>Brak podopiecznych</h3>
          <div>Wystaw najpierw zaproszenie w sekcji „Podopieczni".</div>
        </div>
      ) : (
        <Form method="post" className="card" style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <label htmlFor="np-trainee">Dla kogo</label>
            <select
              id="np-trainee"
              name="traineeId"
              required
              defaultValue={preselected ?? trainees[0]?.id ?? ""}
              className="select"
            >
              {trainees.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="np-name">Nazwa planu</label>
            <input
              id="np-name"
              name="name"
              type="text"
              required
              maxLength={120}
              defaultValue="Nowy plan"
              className="input"
            />
          </div>
          {actionData?.error != null && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
              {actionData.error}
            </p>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn btn-primary">
              Utwórz draft
            </button>
            <Link to="/trener/plany" className="btn btn-ghost">
              Anuluj
            </Link>
          </div>
        </Form>
      )}
    </div>
  );
}
