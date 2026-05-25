import { BODY_VIEW_LABELS } from "~/components/photo-card";
import type { BodyPhotoView } from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";

// ============================================================
// Side-by-side: pierwsze vs najnowsze zdjęcie z ujęcia.
// `pairs` are the URL-resolved version of `SideBySidePhotoPair` from stats.ts.
// ============================================================

export interface ResolvedPair {
  view: BodyPhotoView;
  first: { id: string; url: string; takenOn: string } | null;
  latest: { id: string; url: string; takenOn: string } | null;
  hasPair: boolean;
  daysBetween: number | null;
}

export function SideBySideSection({ pairs }: { pairs: ResolvedPair[] }) {
  const hasAny = pairs.some((p) => p.first != null);
  if (!hasAny) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 17, marginBottom: 10 }}>Porównanie</h2>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {pairs.map((p) => (
          <ViewPair key={p.view} pair={p} />
        ))}
      </div>
    </section>
  );
}

function ViewPair({ pair }: { pair: ResolvedPair }) {
  if (pair.first == null) {
    return (
      <div
        className="card"
        style={{
          padding: 14,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 140,
          gap: 4,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--muted)",
          }}
        >
          {BODY_VIEW_LABELS[pair.view]}
        </div>
        <div className="text-xs muted" style={{ fontStyle: "italic" }}>
          brak zdjęć
        </div>
      </div>
    );
  }

  if (!pair.hasPair) {
    // Single photo (only one taken in this view so far).
    return (
      <div className="card" style={{ padding: 12 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--muted)",
            marginBottom: 8,
          }}
        >
          {BODY_VIEW_LABELS[pair.view]} · jedno zdjęcie
        </div>
        <PhotoTile url={pair.first.url} takenOn={pair.first.takenOn} />
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div
        className="row between"
        style={{ marginBottom: 8, alignItems: "baseline" }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--muted)",
          }}
        >
          {BODY_VIEW_LABELS[pair.view]}
        </div>
        <div className="mono text-xs muted">
          {pair.daysBetween} dni różnicy
        </div>
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "start" }}
      >
        <PhotoTile
          url={pair.first.url}
          takenOn={pair.first.takenOn}
          tag="pierwsze"
        />
        <PhotoTile
          url={pair.latest!.url}
          takenOn={pair.latest!.takenOn}
          tag="ostatnie"
          highlight
        />
      </div>
    </div>
  );
}

function PhotoTile({
  url,
  takenOn,
  tag,
  highlight,
}: {
  url: string;
  takenOn: string;
  tag?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "3 / 4",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--ink)",
        border: highlight
          ? "2px solid var(--accent)"
          : "1px solid var(--line)",
      }}
    >
      <img
        src={url}
        alt={`Sylwetka — ${fmtDate(takenOn)}`}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {tag != null && (
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 6,
            background: highlight ? "var(--accent)" : "rgba(0,0,0,.55)",
            color: highlight ? "var(--accent-ink)" : "#fff",
            padding: "2px 7px",
            borderRadius: 4,
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            fontWeight: 600,
          }}
        >
          {tag}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top, rgba(0,0,0,.7), transparent)",
          color: "#fff",
          padding: "8px 8px 6px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {fmtDate(takenOn)}
      </div>
    </div>
  );
}

// ============================================================
// Timeline: oś czasu zdjęć per ujęcie (3 rzędy horyzontalnego scrolla).
// ============================================================

export interface TimelinePhoto {
  id: string;
  url: string;
  takenOn: string;
}

export interface TimelineByView {
  view: BodyPhotoView;
  photos: TimelinePhoto[];
}

export function TimelineSection({ rows }: { rows: TimelineByView[] }) {
  const hasAny = rows.some((r) => r.photos.length > 0);
  if (!hasAny) return null;
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 17, marginBottom: 10 }}>Oś czasu</h2>
      <div className="col" style={{ gap: 12 }}>
        {rows.map((row) => (
          <TimelineRow key={row.view} row={row} />
        ))}
      </div>
    </section>
  );
}

function TimelineRow({ row }: { row: TimelineByView }) {
  if (row.photos.length === 0) {
    return (
      <div
        className="card"
        style={{
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--muted)",
            width: 60,
          }}
        >
          {BODY_VIEW_LABELS[row.view]}
        </div>
        <div className="text-xs muted" style={{ fontStyle: "italic" }}>
          brak zdjęć
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ padding: 12 }}>
      <div
        className="mono"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        {BODY_VIEW_LABELS[row.view]} · {row.photos.length}
      </div>
      <div
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {row.photos.map((p) => (
          <div
            key={p.id}
            style={{
              position: "relative",
              flex: "0 0 100px",
              aspectRatio: "3 / 4",
              borderRadius: 6,
              overflow: "hidden",
              background: "var(--ink)",
              border: "1px solid var(--line)",
            }}
          >
            <img
              src={p.url}
              alt={`Sylwetka — ${fmtDate(p.takenOn)}`}
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "linear-gradient(to top, rgba(0,0,0,.7), transparent)",
                color: "#fff",
                padding: "6px 6px 4px",
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {fmtDate(p.takenOn)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
