import { useTranslation } from "react-i18next";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import type { BodyPhotoView } from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";

// biome-ignore lint/suspicious/noExplicitAny: loose `t` typing for cross-component helper
type TFn = (...args: any[]) => string;

/** Localized label for a body-photo view (przód/bok/tył). Shared with the compare/lightbox views. */
export function bodyViewLabel(t: TFn, view: BodyPhotoView): string {
  return tDyn(t, `photo.view.${view}`);
}

export interface PhotoCardProps {
  id: string;
  url: string;
  takenOn: string;
  view: BodyPhotoView;
  note: string | null;
  /** Click opens the lightbox at this photo. */
  onOpen: (id: string) => void;
}

/**
 * Thumbnail card for the gallery grid. Click opens the lightbox. The lightbox
 * owns download + delete actions so the card stays a clean preview.
 */
export function PhotoCard({ id, url, takenOn, view, note, onOpen }: PhotoCardProps) {
  const { t, i18n } = useTranslation();
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="photo-card-btn"
      aria-label={t("photo.openAriaWithView", {
        date: fmtDate(takenOn, locale),
        view: bodyViewLabel(t, view),
      })}
      style={{
        position: "relative",
        aspectRatio: "3 / 4",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--ink)",
        border: "1px solid var(--line)",
        padding: 0,
        margin: 0,
        cursor: "pointer",
        display: "block",
        width: "100%",
        font: "inherit",
        color: "inherit",
        textAlign: "left",
      }}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      <span
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          background: "rgba(0,0,0,.6)",
          color: "#fff",
          padding: "3px 8px",
          borderRadius: 4,
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: ".08em",
          fontWeight: 600,
        }}
      >
        {bodyViewLabel(t, view)}
      </span>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,.75) 0%, transparent 38%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: 10,
          right: 10,
          color: "#fff",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <div>{fmtDate(takenOn, locale)}</div>
        {note != null && note.length > 0 && (
          <div
            style={{
              fontSize: 11,
              opacity: 0.85,
              marginTop: 3,
              fontStyle: "italic",
              fontWeight: 400,
              fontFamily: "var(--font-body)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.3,
            }}
          >
            „{note}"
          </div>
        )}
      </div>
    </button>
  );
}
