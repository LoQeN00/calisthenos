import { eq } from "drizzle-orm";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDateTime } from "~/lib/format";
import { answerLabel } from "~/lib/onboarding-form-types";
import { getFormForTrainer } from "~/lib/onboarding-forms";
import { assertTraineeOwnedBy } from "~/lib/trainees";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  // Rzuca 404, gdy podopieczny nie jest nasz — zanim w ogóle zapytamy o formularz.
  await assertTraineeOwnedBy(db, user.id, traineeId);

  const form = await getFormForTrainer(db, user.id, traineeId);
  if (!form) throw new Response("not found", { status: 404 });

  // Nazwa podopiecznego w nagłówku — trener otwierający tę stronę wprost (zakładka,
  // przycisk „wstecz") musi wiedzieć, czyj to formularz. Tak samo robią sąsiednie
  // widoki `sylwetka` i `platnosci`.
  const [trainee] = await db
    .select({ displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, traineeId))
    .limit(1);

  return { form, traineeId, traineeName: trainee?.displayName ?? null };
}

export default function FormularzStartowyTrenera() {
  const { form, traineeId, traineeName } = useLoaderData<typeof loader>();
  const done = form.completedAtISO != null;

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            <Link to={`/trener/podopieczni/${traineeId}`} style={{ color: "inherit" }}>
              ← Podopieczny
            </Link>
            {" · "}
            {traineeName ?? "—"}
          </div>
          <h1>Formularz startowy</h1>
          <div className="sub">
            {done
              ? `Wypełniony ${fmtDateTime(form.completedAtISO!)}.`
              : "Czeka na wypełnienie przez podopiecznego."}
          </div>
        </div>
      </div>

      {form.trainerNote != null && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div
            className="mono text-xs muted"
            style={{ textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}
          >
            Twoja notatka
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{form.trainerNote}</div>
        </div>
      )}

      <div className="list">
        <div
          className="list-head"
          style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 2fr", gap: 14 }}
        >
          <div>Ćwiczenie</div>
          <div>Wynik</div>
          <div>Komentarz</div>
        </div>
        {form.items.map((item) => (
          <div
            key={item.id}
            className="list-row"
            style={{ gridTemplateColumns: "1.6fr 0.8fr 2fr", gap: 14, cursor: "default" }}
          >
            <div style={{ fontSize: 14, fontWeight: 500 }}>{item.exerciseName}</div>
            <div className="mono">
              {item.value == null ? (
                <span className="muted">—</span>
              ) : (
                answerLabel(item.unit, item.value)
              )}
            </div>
            <div className="text-sm muted">{item.comment ?? "—"}</div>
          </div>
        ))}
      </div>

      {form.traineeNote != null && (
        <div className="card" style={{ marginTop: 16 }}>
          <div
            className="mono text-xs muted"
            style={{ textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}
          >
            Od podopiecznego
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{form.traineeNote}</div>
        </div>
      )}

      {!done && (
        <div className="empty" style={{ marginTop: 16 }}>
          <Icons.Consult />
          <div>Podopieczny zobaczy ten formularz przy pierwszym wejściu do aplikacji.</div>
        </div>
      )}
    </div>
  );
}
