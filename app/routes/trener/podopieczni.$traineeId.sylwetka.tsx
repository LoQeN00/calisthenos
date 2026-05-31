import { and, eq } from "drizzle-orm";
import { useMemo, useState } from "react";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { SideBySideSection, type ResolvedPair } from "~/components/body-photo-compare";
import { PhotoCard } from "~/components/photo-card";
import { PhotoLightbox, type LightboxPhoto } from "~/components/photo-lightbox";
import { requireUser } from "~/lib/auth";
import { listBodyPhotosForTrainee } from "~/lib/body-photos";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import type { BodyPhotoView } from "~/lib/db/schema";
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

  return {
    trainee,
    photos: photos.map((p) => ({ ...p, url: signFileUrl(p.fileId, user.id) })),
    resolvedPairs,
  };
}

type ViewFilter = "all" | BodyPhotoView;

export default function TrenerSylwetkaPodopiecznego() {
  const { trainee, photos, resolvedPairs } = useLoaderData<typeof loader>();
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const counts = useMemo(() => countByView(photos), [photos]);
  const filteredPhotos = useMemo(
    () => (filter === "all" ? photos : photos.filter((p) => p.view === filter)),
    [photos, filter],
  );

  // Lightbox nav scoped to the clicked photo's VIEW — clicking a "tył" photo
  // gives you only "tył" photos to swipe through, even with filter on
  // "Wszystkie". The filter only governs the grid.
  const activeLightboxPhotos: LightboxPhoto[] = useMemo(() => {
    if (lightboxId == null) return [];
    const opened = photos.find((p) => p.id === lightboxId);
    if (!opened) return [];
    return photos
      .filter((p) => p.view === opened.view)
      .map((p) => ({
        id: p.id,
        url: p.url,
        view: p.view,
        takenOn: p.takenOn,
        note: p.note,
        mimeType: p.mimeType,
      }));
  }, [lightboxId, photos]);

  const groups = useMemo(() => groupByMonth(filteredPhotos), [filteredPhotos]);

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
            {photos.length === 0
              ? "Brak zdjęć."
              : `${photos.length} ${photos.length === 1 ? "zdjęcie" : "zdjęć"} · najnowsze u góry`}
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
          <SideBySideSection pairs={resolvedPairs} onOpenPhoto={setLightboxId} />

          <FilterTabs filter={filter} setFilter={setFilter} counts={counts} />

          {filteredPhotos.length === 0 ? (
            <div className="empty" style={{ marginTop: 12 }}>
              <h3>Brak zdjęć w tym ujęciu</h3>
              <div>Zmień filtr, by zobaczyć inne ujęcia.</div>
            </div>
          ) : (
            <PhotoGrid groups={groups} onOpenPhoto={setLightboxId} />
          )}
        </>
      )}

      {/* Trainer doesn't get the delete button — deleteAction omitted. */}
      <PhotoLightbox
        photos={activeLightboxPhotos}
        currentId={lightboxId}
        onClose={() => setLightboxId(null)}
        onNavigate={setLightboxId}
      />
    </div>
  );
}

// ============================================================
// Filter tabs (shared shape with trainee view).
// ============================================================

function FilterTabs({
  filter,
  setFilter,
  counts,
}: {
  filter: ViewFilter;
  setFilter: (f: ViewFilter) => void;
  counts: Record<ViewFilter, number>;
}) {
  const TABS: Array<{ key: ViewFilter; label: string }> = [
    { key: "all", label: "Wszystkie" },
    { key: "front", label: "Przód" },
    { key: "side", label: "Bok" },
    { key: "back", label: "Tył" },
  ];
  return (
    <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
      {TABS.map((tab) => {
        const isActive = filter === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={isActive ? "btn btn-sm btn-dark" : "btn btn-sm"}
          >
            {tab.label}
            <span className="mono" style={{ marginLeft: 8, fontSize: 10, opacity: 0.7 }}>
              {counts[tab.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Grouped grid
// ============================================================

interface PhotoGroup {
  label: string;
  photos: Array<{
    id: string;
    url: string;
    takenOn: string;
    view: BodyPhotoView;
    note: string | null;
  }>;
}

function PhotoGrid({
  groups,
  onOpenPhoto,
}: {
  groups: PhotoGroup[];
  onOpenPhoto: (id: string) => void;
}) {
  return (
    <div className="col" style={{ gap: 18 }}>
      {groups.map((g) => (
        <div key={g.label}>
          <div
            className="mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".1em",
              color: "var(--muted)",
              marginBottom: 8,
            }}
          >
            {g.label} · {g.photos.length}
          </div>
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 12,
            }}
          >
            {g.photos.map((p) => (
              <PhotoCard
                key={p.id}
                id={p.id}
                url={p.url}
                takenOn={p.takenOn}
                view={p.view}
                note={p.note}
                onOpen={onOpenPhoto}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Helpers (kept in sync with trainee route)
// ============================================================

function countByView(photos: Array<{ view: BodyPhotoView }>): Record<ViewFilter, number> {
  const out: Record<ViewFilter, number> = {
    all: photos.length,
    front: 0,
    side: 0,
    back: 0,
  };
  for (const p of photos) {
    out[p.view] += 1;
  }
  return out;
}

const MONTHS_PL = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

function groupByMonth<
  T extends {
    id: string;
    url: string;
    takenOn: string;
    view: BodyPhotoView;
    note: string | null;
  },
>(photos: T[]): PhotoGroup[] {
  const groups = new Map<string, PhotoGroup>();
  const order: string[] = [];
  for (const p of photos) {
    const d = new Date(p.takenOn);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const label = `${MONTHS_PL[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    let g = groups.get(key);
    if (!g) {
      g = { label, photos: [] };
      groups.set(key, g);
      order.push(key);
    }
    g.photos.push({
      id: p.id,
      url: p.url,
      takenOn: p.takenOn,
      view: p.view,
      note: p.note,
    });
  }
  return order.map((k) => groups.get(k)!);
}
