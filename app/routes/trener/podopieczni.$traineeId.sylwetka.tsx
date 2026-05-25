import { and, eq } from "drizzle-orm";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import {
  SideBySideSection,
  TimelineSection,
  type ResolvedPair,
  type TimelineByView,
} from "~/components/body-photo-compare";
import { PhotoCard } from "~/components/photo-card";
import { requireUser } from "~/lib/auth";
import { listBodyPhotosForTrainee } from "~/lib/body-photos";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { signFileUrl } from "~/lib/files";
import { getSideBySidePhotoPairs } from "~/lib/stats";

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

  const [photos, pairs] = await Promise.all([
    listBodyPhotosForTrainee(db, traineeId, { limit: 500 }),
    getSideBySidePhotoPairs(db, traineeId),
  ]);

  const resolvedPairs: ResolvedPair[] = pairs.map((p) => ({
    view: p.view,
    hasPair: p.hasPair,
    daysBetween: p.daysBetween,
    first: p.first
      ? {
          id: p.first.id,
          url: signFileUrl(p.first.fileId, user.id),
          takenOn: p.first.takenOn,
        }
      : null,
    latest: p.latest
      ? {
          id: p.latest.id,
          url: signFileUrl(p.latest.fileId, user.id),
          takenOn: p.latest.takenOn,
        }
      : null,
  }));

  const timelineRows: TimelineByView[] = (["front", "side", "back"] as const).map(
    (view) => ({
      view,
      photos: photos
        .filter((p) => p.view === view)
        .sort((a, b) => (a.takenOn < b.takenOn ? -1 : 1))
        .map((p) => ({
          id: p.id,
          url: signFileUrl(p.fileId, user.id),
          takenOn: p.takenOn,
        })),
    }),
  );

  return {
    trainee,
    photos: photos.map((p) => ({ ...p, url: signFileUrl(p.fileId, user.id) })),
    resolvedPairs,
    timelineRows,
  };
}

export default function TrenerSylwetkaPodopiecznego() {
  const { trainee, photos, resolvedPairs, timelineRows } =
    useLoaderData<typeof loader>();

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
        <>
          <SideBySideSection pairs={resolvedPairs} />
          <TimelineSection rows={timelineRows} />

          <h2 style={{ fontSize: 17, margin: "8px 0 12px" }}>Wszystkie zdjęcia</h2>
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
        </>
      )}
    </div>
  );
}
