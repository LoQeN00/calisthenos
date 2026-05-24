import { useEffect, useId, useRef, useState } from "react";
import { useNavigation } from "react-router";
import { Icons } from "./icons";

export type FileKind = "video" | "image";

interface FileDropzoneProps {
  name: string;
  label: string;
  kind: FileKind;
  required?: boolean;
  /** Mobile: open device camera directly instead of file picker. */
  capture?: boolean;
  /** Smaller layout, no drag&drop area — for dense rows (per-set videos). */
  compact?: boolean;
  /** Client-side size warning (server enforces real limit). */
  maxBytes?: number;
  hint?: string;
  /** Disambiguates the htmlFor↔id link when multiple instances share a name. */
  idSuffix?: string;
}

const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

export function FileDropzone({
  name,
  label,
  kind,
  required = false,
  capture = false,
  compact = false,
  maxBytes,
  hint,
  idSuffix,
}: FileDropzoneProps) {
  const generatedId = useId();
  const inputId = idSuffix ? `fdz-${name}-${idSuffix}` : generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigation = useNavigation();
  const isSubmittingThisField = (() => {
    if (navigation.state === "idle") return false;
    const fd = navigation.formData;
    if (!fd) return false;
    const v = fd.get(name);
    return v instanceof File && v.size > 0;
  })();

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptAttr = kind === "video" ? VIDEO_ACCEPT : IMAGE_ACCEPT;
  const acceptedList = acceptAttr.split(",");
  const formatLabel =
    kind === "video" ? "MP4, MOV lub WebM" : "JPG, PNG lub WebP";

  const accept = (picked: File | null) => {
    if (!picked) {
      setFile(null);
      setError(null);
      return;
    }
    if (picked.type && !acceptedList.includes(picked.type)) {
      setError(
        `Nieobsługiwany format: ${picked.type}. Wymagane: ${formatLabel}.`,
      );
      if (inputRef.current) inputRef.current.value = "";
      setFile(null);
      return;
    }
    if (maxBytes && picked.size > maxBytes) {
      setError(
        `Plik za duży: ${(picked.size / 1_000_000).toFixed(1)} MB · limit ${Math.floor(maxBytes / 1_000_000)} MB.`,
      );
      if (inputRef.current) inputRef.current.value = "";
      setFile(null);
      return;
    }
    setError(null);
    setFile(picked);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    accept(e.target.files?.[0] ?? null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (!dropped) return;
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(dropped);
      inputRef.current.files = dt.files;
    }
    accept(dropped);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the wrapper, not crossing a child boundary.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOver(false);
  };

  const clear = () => {
    if (inputRef.current) inputRef.current.value = "";
    setFile(null);
    setError(null);
  };

  const sizeMb = file ? (file.size / 1_000_000).toFixed(1) : null;

  // Underlying input lives in the DOM either way (it's what the form submits).
  // We keep it visually hidden but focusable so keyboard users can still tab to it.
  const hiddenInput = (
    <input
      ref={inputRef}
      id={inputId}
      name={name}
      type="file"
      accept={acceptAttr}
      required={required && file == null}
      capture={capture ? "environment" : undefined}
      onChange={onInputChange}
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "none",
      }}
      tabIndex={-1}
    />
  );

  if (compact) {
    return (
      <div className="field" style={{ minWidth: 0 }}>
        <label
          htmlFor={inputId}
          className="uppercase-label"
          style={{ fontSize: 10, marginBottom: 4 }}
        >
          {label}
        </label>
        {hiddenInput}
        {file ? (
          <CompactFilled
            file={file}
            previewUrl={previewUrl}
            kind={kind}
            isSubmitting={isSubmittingThisField}
            onChange={() => inputRef.current?.click()}
            onClear={clear}
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 36,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px dashed var(--line-2)",
              background: "var(--surface)",
              color: "var(--ink-2)",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {kind === "video" ? <Icons.Camera /> : <Icons.Image />}
            <span>{capture ? "Nagraj / wybierz" : "Wybierz plik"}</span>
          </button>
        )}
        {error && (
          <p
            role="alert"
            style={{ color: "var(--danger)", fontSize: 11, margin: "4px 0 0" }}
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {hiddenInput}
      {file ? (
        <FullFilled
          file={file}
          previewUrl={previewUrl}
          sizeMb={sizeMb}
          kind={kind}
          isSubmitting={isSubmittingThisField}
          onChange={() => inputRef.current?.click()}
          onClear={clear}
        />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "24px 18px",
            borderRadius: 12,
            border: dragOver
              ? "2px dashed var(--accent)"
              : "2px dashed var(--line-2)",
            background: dragOver ? "var(--accent-soft)" : "var(--surface)",
            color: "var(--ink-2)",
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background .12s ease, border-color .12s ease",
            width: "100%",
          }}
        >
          <span
            style={{
              fontSize: 28,
              color: dragOver ? "var(--accent-ink)" : "var(--muted)",
              lineHeight: 1,
            }}
          >
            <Icons.Upload />
          </span>
          <span style={{ fontSize: 14 }}>
            <strong>Kliknij aby wybrać</strong> lub upuść plik tutaj
          </span>
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--muted)" }}
          >
            {hint ??
              `${formatLabel}${maxBytes ? ` · do ${Math.floor(maxBytes / 1_000_000)} MB` : ""}`}
          </span>
        </button>
      )}
      {error && (
        <p
          role="alert"
          style={{ color: "var(--danger)", fontSize: 12, margin: "6px 0 0" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function FullFilled({
  file,
  previewUrl,
  sizeMb,
  kind,
  isSubmitting,
  onChange,
  onClear,
}: {
  file: File;
  previewUrl: string | null;
  sizeMb: string | null;
  kind: FileKind;
  isSubmitting: boolean;
  onChange: () => void;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--surface)",
        padding: 10,
        display: "grid",
        gap: 10,
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 84,
          height: 56,
          background: "var(--ink)",
          borderRadius: 6,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {previewUrl && kind === "video" && (
          <video
            src={previewUrl}
            muted
            playsInline
            preload="metadata"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}
        {previewUrl && kind === "image" && (
          <img
            src={previewUrl}
            alt="Podgląd"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {file.name}
        </div>
        <div
          className="mono"
          style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}
        >
          {sizeMb} MB
          {isSubmitting && (
            <span style={{ color: "var(--ok)", marginLeft: 8 }}>
              · wysyłanie…
            </span>
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={onChange}
          disabled={isSubmitting}
        >
          Zmień
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-icon"
          style={{ color: "var(--danger)" }}
          onClick={onClear}
          disabled={isSubmitting}
          aria-label="Usuń wybrany plik"
          title="Usuń"
        >
          <Icons.X />
        </button>
      </div>
    </div>
  );
}

function CompactFilled({
  file,
  previewUrl,
  kind,
  isSubmitting,
  onChange,
  onClear,
}: {
  file: File;
  previewUrl: string | null;
  kind: FileKind;
  isSubmitting: boolean;
  onChange: () => void;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 36,
        padding: "0 4px 0 4px",
        borderRadius: 8,
        border: "1px solid var(--line)",
        background: "var(--surface)",
        minWidth: 0,
      }}
    >
      <button
        type="button"
        onClick={onChange}
        disabled={isSubmitting}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: 0,
          padding: "0 6px",
          minWidth: 0,
          color: "var(--ink)",
          cursor: isSubmitting ? "default" : "pointer",
          fontSize: 12,
          fontFamily: "inherit",
        }}
        title={file.name}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            background: "var(--ink)",
            overflow: "hidden",
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--bg)",
          }}
        >
          {previewUrl && kind === "video" && (
            <video
              src={previewUrl}
              muted
              playsInline
              preload="metadata"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
          {previewUrl && kind === "image" && (
            <img
              src={previewUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
          {!previewUrl && (kind === "video" ? <Icons.Play /> : <Icons.Image />)}
        </span>
        {isSubmitting ? (
          <span className="mono" style={{ fontSize: 10, color: "var(--ok)" }}>
            wysyłanie…
          </span>
        ) : (
          <Icons.Check />
        )}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={isSubmitting}
        className="btn-icon"
        style={{
          width: 24,
          height: 24,
          padding: 0,
          border: 0,
          background: "transparent",
          color: "var(--muted)",
          cursor: isSubmitting ? "default" : "pointer",
          display: "grid",
          placeItems: "center",
        }}
        aria-label="Usuń wybrany plik"
        title="Usuń"
      >
        <Icons.X />
      </button>
    </div>
  );
}
