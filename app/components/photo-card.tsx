import { Form } from "react-router";
import type { BodyPhotoView } from "~/lib/db/schema";
import { fmtDate } from "~/lib/format";

export const BODY_VIEW_LABELS: Record<BodyPhotoView, string> = {
  front: "przód",
  side: "bok",
  back: "tył",
};

export interface PhotoCardProps {
  id: string;
  url: string;
  takenOn: string;
  view: BodyPhotoView;
  note: string | null;
  /** If true, renders the delete button (`<Form>` posting `intent=delete` to `deleteAction`). */
  canDelete: boolean;
  /**
   * Form `action` URL used by the delete button. Required when `canDelete=true`
   * — the component intentionally never relies on the current-URL default so it
   * stays portable across routes.
   */
  deleteAction?: string;
}

export function PhotoCard({
  id,
  url,
  takenOn,
  view,
  note,
  canDelete,
  deleteAction,
}: PhotoCardProps) {
  return (
    <div
      style={{
        position: "relative",
        aspectRatio: "3 / 4",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--ink)",
        border: "1px solid var(--line)",
      }}
    >
      <img
        src={url}
        alt={`Sylwetka — ${BODY_VIEW_LABELS[view]}, ${fmtDate(takenOn)}`}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          background: "rgba(0,0,0,.55)",
          color: "#fff",
          padding: "2px 7px",
          borderRadius: 4,
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: ".06em",
        }}
      >
        {BODY_VIEW_LABELS[view]}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top, rgba(0,0,0,.65) 0%, transparent 35%, transparent 65%, rgba(0,0,0,.35) 100%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 6,
          left: 8,
          right: 8,
          color: "#fff",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{fmtDate(takenOn)}</div>
          {note != null && note.length > 0 && (
            <div
              style={{
                fontSize: 10,
                opacity: 0.85,
                marginTop: 2,
                fontStyle: "italic",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              „{note}"
            </div>
          )}
        </div>
        {canDelete && deleteAction != null && (
          <Form method="post" action={deleteAction} style={{ flexShrink: 0 }}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="photoId" value={id} />
            <button
              type="submit"
              onClick={(e) => {
                if (!confirm("Usunąć to zdjęcie?")) e.preventDefault();
              }}
              style={{
                background: "rgba(0,0,0,.55)",
                color: "#fff",
                border: 0,
                padding: "4px 8px",
                fontSize: 11,
                borderRadius: 4,
                cursor: "pointer",
              }}
              aria-label="Usuń zdjęcie"
            >
              usuń
            </button>
          </Form>
        )}
      </div>
    </div>
  );
}
