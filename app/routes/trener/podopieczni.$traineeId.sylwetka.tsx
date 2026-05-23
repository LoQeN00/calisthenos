import { and, eq } from "drizzle-orm";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { listBodyPhotosForTrainee } from "~/lib/body-photos";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { signFileUrl } from "~/lib/files";
import { PhotoCard } from "~/components/photo-card";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";

  const traineeRows = await db
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
  const trainee = traineeRows[0];
  if (!trainee) throw new Response("not found", { status: 404 });

  const photos = await listBodyPhotosForTrainee(db, traineeId);
  return {
    trainee,
    photos: photos.map((p) => ({ ...p, url: signFileUrl(p.fileId, user.id) })),
  };
}

export default function TrenerSylwetkaPodopiecznego() {
  const { trainee, photos } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Sylwetka</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>Sylwetka</h1>
          <div className="sub">
            Zdjęcia podopiecznego, najnowsze u góry.{" "}
            {photos.length === 0
              ? "Brak zdjęć."
              : `${photos.length} ${photos.length === 1 ? "zdjęcie" : "zdjęć"}.`}
          </div>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="empty">
          <h3>Brak zdjęć</h3>
          <div>Podopieczny jeszcze nie wgrał żadnego zdjęcia.</div>
        </div>
      ) : (
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {photos.map((p) => (
            <PhotoCard
              key={p.id}
              id={p.id}
              url={p.url}
              takenOn={p.takenOn}
              view={p.view}
              note={p.note}
              canDelete={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
