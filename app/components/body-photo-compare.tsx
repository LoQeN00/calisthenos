import { BODY_VIEW_LABELS } from "~/components/photo-card";
import type { BodyPhotoView } from "~/lib/body-photos";
import { fmtDate } from "~/lib/format";

// ============================================================
// Side-by-side: pierwsze vs najnowsze zdjęcie z ujęcia.
// Tiles are clickable buttons that open the lightbox at the corresponding photo.
// ============================================================

export interface ResolvedPair {
  view: BodyPhotoView;
  first: { id: string; url: string; takenOn: string } | null;
  latest: { id: string; url: string; takenOn: string } | null;
  hasPair: boolean;
  daysBetween: number | null;
}

export function SideBySideSection({
  pairs,
  onOpenPhoto,
}: {
  pairs: ResolvedPair[];
  onOpenPhoto: (id: string) => void;
}) {
  const hasAny = pairs.some((p) => p.first != null);
  if (!hasAny) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <div className="row between" style={{ alignItems: "baseline", marginBottom: 10 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Porównanie</h2>
        <span className="text-xs muted">kliknij zdjęcie aby powiększyć</span>
      </div>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {pairs.map((p) => (
          <ViewPair key={p.view} pair={p} onOpenPhoto={onOpenPhoto} />
        ))}
      </div>
    </section>
  );
}

function ViewPair({
  pair,
  onOpenPhoto,
}: {
  pair: ResolvedPair;
  onOpenPhoto: (id: string) => void;
}) {
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
        <PhotoTile
          id={pair.first.id}
          url={pair.first.url}
          takenOn={pair.first.takenOn}
          onClick={onOpenPhoto}
        />
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between" style={{ marginBottom: 8, alignItems: "baseline" }}>
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
        <div className="mono text-xs muted">{pair.daysBetween} dni różnicy</div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "start" }}>
        <PhotoTile
          id={pair.first.id}
          url={pair.first.url}
          takenOn={pair.first.takenOn}
          tag="pierwsze"
          onClick={onOpenPhoto}
        />
        <PhotoTile
          id={pair.latest!.id}
          url={pair.latest!.url}
          takenOn={pair.latest!.takenOn}
          tag="ostatnie"
          highlight
          onClick={onOpenPhoto}
        />
      </div>
    </div>
  );
}

function PhotoTile({
  id,
  url,
  takenOn,
  tag,
  highlight,
  onClick,
}: {
  id: string;
  url: string;
  takenOn: string;
  tag?: string;
  highlight?: boolean;
  onClick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      aria-label={`Otwórz zdjęcie z ${fmtDate(takenOn)}`}
      style={{
        position: "relative",
        aspectRatio: "3 / 4",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--ink)",
        border: highlight ? "2px solid var(--accent)" : "1px solid var(--line)",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        display: "block",
        width: "100%",
        font: "inherit",
        color: "inherit",
      }}
    >
      <img
        src={url}
        alt=""
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
    </button>
  );
}
