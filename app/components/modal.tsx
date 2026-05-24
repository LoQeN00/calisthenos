import { useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open/close the native dialog imperatively in sync with the `open` prop.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // Body scroll lock — native dialog inerts the rest of the page for interaction
  // but doesn't reliably prevent scroll on all browsers.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    // Clicks on ::backdrop bubble to the dialog with target === dialog. Clicks
    // on inner content have a different target.
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={() => onClose()}
      onCancel={(e) => {
        // ESC fires both `cancel` and then `close`. Default for `cancel` is to
        // close the dialog; we just hook into `close` to notify the parent.
        e.preventDefault();
        onClose();
      }}
      onClick={onDialogClick}
      onKeyDown={undefined}
      className={wide ? "modal wide" : "modal"}
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
    </dialog>
  );
}
