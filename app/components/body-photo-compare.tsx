import { useTranslation } from "react-i18next";
import { bodyViewLabel } from "~/components/photo-card";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import type { BodyPhotoView } from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";

// biome-ignore lint/suspicious/noExplicitAny: loose `t` typing for in-file subcomponents
type TFn = (...args: any[]) => string;

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
  const { t } = useTranslation();
  const hasAny = pairs.some((p) => p.first != null);
  if (!hasAny) return null;

  return (
    <section style={{ marginBottom: 24 }}>
      <div className="row between" style={{ alignItems: "baseline", marginBottom: 10 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>{t("photo.compare.title")}</h2>
        <span className="text-xs muted">{t("photo.compare.zoomHint")}</span>
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
  const { t, i18n } = useTranslation();
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
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
          {bodyViewLabel(t, pair.view)}
        </div>
        <div className="text-xs muted" style={{ fontStyle: "italic" }}>
          {t("photo.compare.noPhotos")}
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
          {bodyViewLabel(t, pair.view)} · {t("photo.compare.onePhoto")}
        </div>
        <PhotoTile
          id={pair.first.id}
          url={pair.first.url}
          takenOn={pair.first.takenOn}
          onClick={onOpenPhoto}
          t={t}
          locale={locale}
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
          {bodyViewLabel(t, pair.view)}
        </div>
        <div className="mono text-xs muted">
          {t("photo.compare.daysDiff", { count: pair.daysBetween ?? 0 })}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8, alignItems: "start" }}>
        <PhotoTile
          id={pair.first.id}
          url={pair.first.url}
          takenOn={pair.first.takenOn}
          tag={t("photo.compare.first")}
          onClick={onOpenPhoto}
          t={t}
          locale={locale}
        />
        <PhotoTile
          id={pair.latest!.id}
          url={pair.latest!.url}
          takenOn={pair.latest!.takenOn}
          tag={t("photo.compare.latest")}
          highlight
          onClick={onOpenPhoto}
          t={t}
          locale={locale}
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
  t,
  locale,
}: {
  id: string;
  url: string;
  takenOn: string;
  tag?: string;
  highlight?: boolean;
  onClick: (id: string) => void;
  t: TFn;
  locale: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      aria-label={t("photo.openAria", { date: fmtDate(takenOn, locale) })}
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
        {fmtDate(takenOn, locale)}
      </div>
    </button>
  );
}
