import { useEffect, useState } from "react";
import { Icons } from "~/components/icons";

/** Small "Zobacz video" button that opens a centered modal with the clip on click. */
export function VideoButton({
  src,
  title,
  label = "Zobacz video",
  size,
}: {
  src: string;
  title: string;
  label?: string;
  size?: "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={size === "sm" ? "btn btn-sm" : "btn btn-sm"}
        onClick={() => setOpen(true)}
      >
        <Icons.Play /> {label}
      </button>
      {open && <VideoModal src={src} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

export function VideoModal({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  // ESC to close + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="modal-back"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      // biome-ignore lint/a11y/useSemanticElements: modal-back uses our own backdrop styling; native <dialog> backdrop conflicts
      role="dialog"
      aria-modal="true"
      aria-label={`Wideo: ${title}`}
    >
      <div
        className="modal wide"
        style={{
          padding: 0,
          maxWidth: 1100,
          background: "var(--ink)",
          borderColor: "transparent",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            color: "var(--bg)",
            borderBottom: "1px solid rgba(255,255,255,.08)",
          }}
        >
          <div className="mono" style={{ fontSize: 12, letterSpacing: ".06em" }}>
            {title}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-icon"
            onClick={onClose}
            aria-label="Zamknij"
            style={{
              background: "transparent",
              color: "var(--bg)",
              borderColor: "rgba(255,255,255,.15)",
            }}
          >
            <Icons.X />
          </button>
        </div>
        <video
          src={src}
          controls
          autoPlay
          playsInline
          style={{
            width: "100%",
            maxHeight: "82vh",
            display: "block",
            background: "var(--ink)",
          }}
        />
      </div>
    </div>
  );
}
