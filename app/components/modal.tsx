import { useEffect } from "react";
import { Icons } from "./icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Wider variant (760px max) for forms with two columns. */
  wide?: boolean;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, wide, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-back"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={wide ? "modal wide" : "modal"}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-icon btn-ghost"
            aria-label="Zamknij"
          >
            <Icons.X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
