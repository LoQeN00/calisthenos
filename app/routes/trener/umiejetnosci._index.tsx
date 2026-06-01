import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { listSkillsForTrainer } from "~/lib/skills";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const skills = await listSkillsForTrainer(db, user.id);
  return { skills };
}

export default function UmiejetnosciList() {
  const { skills } = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Umiejętności</h1>
          <div className="sub">
            {skills.length === 0 ? "Brak umiejętności." : `${skills.length} umiejętności.`}
          </div>
        </div>
        <Link to="/trener/umiejetnosci/nowa" className="btn btn-primary">
          <Icons.Plus /> Nowa umiejętność
        </Link>
      </div>

      {skills.length === 0 ? (
        <div className="empty">
          <h3>Brak umiejętności</h3>
          <div>Utwórz pierwszą drabinę wariantów (np. Front Lever), by śledzić progresję.</div>
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}
        >
          {skills.map((s) => (
            <Link
              key={s.id}
              to={`/trener/umiejetnosci/${s.id}`}
              className="card card-hover"
              style={{ padding: 14 }}
            >
              <h3 style={{ margin: 0 }}>{s.name}</h3>
              <div className="text-xs muted" style={{ marginTop: 8 }}>
                {s.variationCount} wariantów
              </div>
              {s.description && (
                <div className="text-sm muted" style={{ marginTop: 8, lineHeight: 1.4 }}>
                  {s.description}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
