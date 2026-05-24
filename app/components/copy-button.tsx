import { useEffect, useState } from "react";
import { Icons } from "./icons";

interface CopyButtonProps {
  value: string;
  /** Visual variant. "primary" stands out on dark backgrounds. */
  variant?: "default" | "primary" | "dark";
  label?: string;
  copiedLabel?: string;
  className?: string;
}

export function CopyButton({
  value,
  variant = "default",
  label = "Kopiuj",
  copiedLabel = "Skopiowano",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for old browsers / non-HTTPS contexts.
        const el = document.createElement("textarea");
        el.value = value;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const cls =
    variant === "primary"
      ? "btn btn-primary"
      : variant === "dark"
        ? "btn btn-dark"
        : "btn";

  return (
    <button
      type="button"
      onClick={onCopy}
      className={className ? `${cls} ${className}` : cls}
      aria-live="polite"
    >
      {copied ? (
        <>
          <Icons.Check /> {copiedLabel}
        </>
      ) : (
        <>
          <Icons.Link /> {label}
        </>
      )}
    </button>
  );
}
