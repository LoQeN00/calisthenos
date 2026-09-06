import { useCallback, useEffect, useRef } from "react";
import { Form } from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { Icons } from "~/components/icons";
import type { BodyPhotoView } from "~/lib/body-photos";
import { fmtDate } from "~/lib/format";
import { BODY_VIEW_LABELS } from "./photo-card";

// ============================================================
// PhotoLightbox — full-screen photo viewer with prev/next, download, delete.
// Used by both trainee and trainer sylwetka routes.
// ============================================================

export interface LightboxPhoto {
  id: string;
  url: string;
  view: BodyPhotoView;
  takenOn: string;
  note: string | null;
  mimeType: string;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  currentId: string | null;
  onClose: () => void;
  onNavigate: (id: string) => void;
  /** Render delete form when set; trainer view passes undefined. */
  deleteAction?: string;
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function downloadFilenameFor(p: LightboxPhoto): string {
  const ext = MIME_TO_EXT[p.mimeType] ?? "jpg";
  return `sylwetka-${p.takenOn}-${p.view}.${ext}`;
}

export function PhotoLightbox({
  photos,
  currentId,
  onClose,
  onNavigate,
  deleteAction,
}: PhotoLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const idx = currentId == null ? -1 : photos.findIndex((p) => p.id === currentId);
  const open = idx >= 0;
  const photo = open ? photos[idx]! : null;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < photos.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(photos[idx - 1]!.id);
  }, [hasPrev, idx, onNavigate, photos]);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(photos[idx + 1]!.id);
  }, [hasNext, idx, onNavigate, photos]);

  // Sync native dialog with `open`.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Keyboard nav.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
      // ESC is handled by the native dialog `cancel` event.
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goPrev, goNext]);

  const onDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    // Clicks on ::backdrop bubble to the dialog itself.
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={onDialogClick}
      onKeyDown={undefined}
      className="photo-lightbox"
      aria-label={photo ? `Zdjęcie z ${fmtDate(photo.takenOn)}` : "Zdjęcie"}
      style={{
        border: 0,
        padding: 0,
        background: "rgba(8, 10, 14, 0.96)",
        color: "#fff",
        maxWidth: "100vw",
        maxHeight: "100vh",
        width: "100vw",
        height: "100vh",
        margin: 0,
        inset: 0,
      }}
    >
      {photo && (
        <LightboxBody
          photo={photo}
          idx={idx}
          total={photos.length}
          hasPrev={hasPrev}
          hasNext={hasNext}
          goPrev={goPrev}
          goNext={goNext}
          onClose={onClose}
          deleteAction={deleteAction}
        />
      )}
    </dialog>
  );
}

function LightboxBody({
  photo,
  idx,
  total,
  hasPrev,
  hasNext,
  goPrev,
  goNext,
  onClose,
  deleteAction,
}: {
  photo: LightboxPhoto;
  idx: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  goPrev: () => void;
  goNext: () => void;
  onClose: () => void;
  deleteAction?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          gap: 12,
          flexWrap: "wrap",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)",
        }}
      >
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <span
            style={{
              background: "var(--accent)",
              color: "var(--accent-ink)",
              padding: "3px 9px",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: ".08em",
              fontWeight: 600,
            }}
          >
            {BODY_VIEW_LABELS[photo.view]}
          </span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>
            {fmtDate(photo.takenOn)}
          </span>
          <span className="mono" style={{ fontSize: 11, opacity: 0.55, marginLeft: 4 }}>
            {idx + 1} / {total}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <a
            href={photo.url}
            download={downloadFilenameFor(photo)}
            className="btn btn-primary"
            style={{ height: 34 }}
          >
            <Icons.Download /> Pobierz
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij"
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: 0,
              background: "rgba(255,255,255,.12)",
              color: "#fff",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icons.X />
          </button>
        </div>
      </div>

      {/* Image area + side nav */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 0,
          padding: "0 56px",
        }}
      >
        <img
          src={photo.url}
          alt={`Sylwetka — ${fmtDate(photo.takenOn)}, ${BODY_VIEW_LABELS[photo.view]}`}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            display: "block",
            borderRadius: 6,
          }}
        />
        {hasPrev && <NavButton side="left" onClick={goPrev} />}
        {hasNext && <NavButton side="right" onClick={goNext} />}
      </div>

      {/* Bottom: note + (optional) delete */}
      <div
        style={{
          padding: "14px 18px 22px",
          background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: 1, maxWidth: 720 }}>
          {photo.note != null && photo.note.length > 0 ? (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.5,
                fontStyle: "italic",
                color: "rgba(255,255,255,.92)",
              }}
            >
              „{photo.note}"
            </div>
          ) : (
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,.45)",
                fontStyle: "italic",
              }}
            >
              brak notatki
            </div>
          )}
        </div>
        {deleteAction && (
          <Form method="post" action={deleteAction}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="photoId" value={photo.id} />
            <ConfirmSubmitButton
              confirmOptions={{
                title: "Usunąć zdjęcie?",
                message: "Tej operacji nie da się cofnąć.",
                destructive: true,
                confirmText: "Usuń",
              }}
              className="btn"
              style={{
                background: "rgba(226, 92, 58, 0.18)",
                borderColor: "var(--danger)",
                color: "#fff",
                height: 34,
              }}
              aria-label="Usuń zdjęcie"
            >
              <Icons.Trash /> Usuń
            </ConfirmSubmitButton>
          </Form>
        )}
      </div>
    </div>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Poprzednie zdjęcie" : "Następne zdjęcie"}
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        [side]: 8,
        width: 44,
        height: 44,
        borderRadius: "50%",
        border: 0,
        background: "rgba(255,255,255,.08)",
        color: "#fff",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        fontSize: 18,
        backdropFilter: "blur(6px)",
      }}
    >
      {side === "left" ? <Icons.ChevLeft /> : <Icons.Chev />}
    </button>
  );
}
