import { useEffect, useId, useRef, useState } from "react";
import { Icons } from "./icons";

const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";

export interface VideoUploadState {
  uploading: boolean;
  fileId: string | null;
}

export interface VideoUploadFieldProps {
  /** Nazwa ukrytego pola z identyfikatorem, np. `e_0_s_1_video_id`. */
  name: string;
  label: string;
  /** Ten sam limit co na serwerze — plik ponad limit nie opuszcza urządzenia. */
  maxBytes: number;
  /** Rozróżnia id, gdy na stronie jest wiele instancji. */
  idSuffix: string;
  /** Wartość przywrócona ze szkicu (`log-draft`). */
  initialFileId?: string | null;
  /** Formularz blokuje zapis, dopóki cokolwiek leci. */
  onStateChange: (state: VideoUploadState) => void;
}

type Phase =
  | { kind: "empty" }
  | { kind: "uploading"; pct: number; fileName: string }
  | { kind: "done"; fileId: string; label: string };

/** Sygnalizuje anulowanie przez użytkownika — odróżniamy je od realnego błędu. */
const ABORTED = "ABORTED";

/**
 * Wysyła jeden plik na `/upload/wideo`, raportując postęp.
 *
 * XMLHttpRequest, nie `fetch`: fetch NIE raportuje postępu WYSYŁKI (`ReadableStream`
 * w ciele żądania nie jest powszechnie wspierany), a przy 30 MB na łączu mobilnym
 * brak informacji o postępie jest właśnie tym, na co narzekali użytkownicy.
 */
function uploadVideo(
  file: File,
  onProgress: (pct: number) => void,
): { promise: Promise<string>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    xhr.open("POST", "/upload/wideo");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { fileId?: string; error?: string } = {};
      let parsed = false;
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
        parsed = true;
      } catch {
        // Nie-JSON: patrz niżej — najczęściej to strona logowania po przekierowaniu.
      }
      const ok2xx = xhr.status >= 200 && xhr.status < 300;
      if (ok2xx && body.fileId) {
        resolve(body.fileId);
      } else if (ok2xx && !parsed) {
        // `requireUser` rzuca `redirect("/login")`, a XHR idzie za przekierowaniem i
        // wraca z HTML-em logowania i statusem 200. Bez tego rozróżnienia użytkownik
        // dostawałby „nie udało się wgrać" zamiast informacji, że wyleciał z sesji.
        reject(new Error("Sesja wygasła. Odśwież stronę i zaloguj się ponownie."));
      } else {
        reject(new Error(body.error ?? "Nie udało się wgrać nagrania."));
      }
    };
    xhr.onerror = () => reject(new Error("Brak połączenia. Spróbuj ponownie."));
    xhr.onabort = () => reject(new Error(ABORTED));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
  return { promise, abort: () => xhr.abort() };
}

function formatMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Pole nagrania serii: wysyła plik OD RAZU po wyborze i trzyma w formularzu wyłącznie
 * identyfikator. Dzięki temu zapis sesji nie niesie binariów, a zerwana sieć kosztuje
 * jedno nagranie zamiast całego treningu.
 *
 * `FileDropzone` celowo zostaje osobnym komponentem — tam plik czeka na wysyłkę razem
 * z formularzem; tu jest zarządzany w czasie. To dwie różne odpowiedzialności.
 */
export function VideoUploadField({
  name,
  label,
  maxBytes,
  idSuffix,
  initialFileId = null,
  onStateChange,
}: VideoUploadFieldProps) {
  const generatedId = useId();
  const inputId = `vuf-${idSuffix}-${generatedId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const [phase, setPhase] = useState<Phase>(
    initialFileId
      ? { kind: "done", fileId: initialFileId, label: "przywrócone" }
      : { kind: "empty" },
  );
  const [error, setError] = useState<string | null>(null);

  // Trzymamy referencję do callbacku, żeby efekt raportujący stan nie zależał od
  // tożsamości funkcji przekazanej przez rodzica (inaczej pętliłby się przy każdym renderze).
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  });

  useEffect(() => {
    onStateChangeRef.current({
      uploading: phase.kind === "uploading",
      fileId: phase.kind === "done" ? phase.fileId : null,
    });
  }, [phase]);

  // Odmontowanie: przerwij wysyłkę I zgłoś, że nic już nie leci.
  //
  // Raport `uploading: false` jest KONIECZNY, nie kosmetyczny: stan trafia w górę tylko
  // efektem na `[phase]`, a po odmontowaniu żaden efekt już nie wystartuje. Bez tego
  // kliknięcie „Pomiń" w trakcie wysyłki (podmiana `SetRow` → `SkippedSetRow` odmontowuje
  // to pole) zostawiałoby licznik trwających wysyłek na zawsze podniesiony, co TRWALE
  // blokuje przycisk „Zapisz sesję".
  //
  // `fileId: null` jest bezpieczne również przy przemontowaniu przez `videoFieldsEpoch`:
  // nowe pole montuje się w tym samym commicie i jego efekt startowy nadpisze wartość
  // poprawnym identyfikatorem odczytanym z `initialFileId`.
  useEffect(() => {
    return () => {
      abortRef.current?.();
      onStateChangeRef.current({ uploading: false, fileId: null });
    };
  }, []);

  const start = (picked: File) => {
    // Wybór kolejnego pliku w trakcie trwającej wysyłki: przerwij poprzednią, inaczej
    // dokończy się w tle, zrobi sierotę i mogłaby nadpisać fazę tej nowej.
    abortRef.current?.();
    setError(null);

    if (picked.type && !VIDEO_ACCEPT.split(",").includes(picked.type)) {
      setError(`Nieobsługiwany format: ${picked.type}. Wymagane: MP4, MOV lub WebM.`);
      return;
    }
    if (picked.size > maxBytes) {
      setError(
        `Plik za duży: ${formatMb(picked.size)} · limit ${Math.floor(maxBytes / 1_000_000)} MB.`,
      );
      return;
    }

    setPhase({ kind: "uploading", pct: 0, fileName: picked.name });
    const { promise, abort } = uploadVideo(picked, (pct) => {
      setPhase((p) => (p.kind === "uploading" ? { ...p, pct } : p));
    });
    abortRef.current = abort;

    promise
      .then((fileId) => {
        abortRef.current = null;
        setPhase({ kind: "done", fileId, label: formatMb(picked.size) });
      })
      .catch((err: Error) => {
        abortRef.current = null;
        // Wyzeruj input, inaczej ponowny wybór TEGO SAMEGO pliku nie wyemituje
        // `change` i przycisk „Nagraj / wybierz" po prostu nic nie zrobi — a to
        // najczęstsza reakcja po zerwanej sieci.
        if (inputRef.current) inputRef.current.value = "";
        setPhase({ kind: "empty" });
        // Anulowanie to decyzja użytkownika, nie awaria — bez czerwonego komunikatu.
        if (err.message !== ABORTED) setError(err.message);
      });
  };

  const clear = () => {
    abortRef.current?.();
    abortRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
    setPhase({ kind: "empty" });
    setError(null);
  };

  const hiddenFileInput = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={VIDEO_ACCEPT}
      capture="environment"
      onChange={(e) => {
        const picked = e.target.files?.[0];
        if (picked) start(picked);
      }}
      style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      tabIndex={-1}
    />
  );

  // Wspólna skorupa 36 px dla każdego stanu — wysokość wiersza nie skacze przy zmianie
  // stanu, co przy kilkunastu seriach pod sobą oszczędza przeskoków całej listy.
  const shell: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 36,
    padding: "0 4px",
    borderRadius: 8,
    border: "1px solid var(--line)",
    background: "var(--surface)",
    minWidth: 0,
    maxWidth: "100%",
  };

  return (
    <div className="field" style={{ minWidth: 0 }}>
      <label
        htmlFor={inputId}
        className="uppercase-label"
        style={{ fontSize: 10, marginBottom: 4 }}
      >
        {label}
      </label>
      {hiddenFileInput}
      {phase.kind === "done" && <input type="hidden" name={name} value={phase.fileId} />}

      {phase.kind === "empty" && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            ...shell,
            border: "1px dashed var(--line-2)",
            color: "var(--ink-2)",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "0 12px",
          }}
        >
          <Icons.Camera />
          <span>Nagraj / wybierz</span>
        </button>
      )}

      {phase.kind === "uploading" && (
        <div
          style={{
            ...shell,
            // Postęp jako wypełnienie TŁA skorupy, nie osobny pasek pod spodem: nie
            // dokłada wysokości, więc lista serii nie przeskakuje w trakcie wysyłki.
            background: `linear-gradient(to right, var(--accent-soft) ${phase.pct}%, var(--surface) ${phase.pct}%)`,
          }}
        >
          {/* Semantykę postępu niesie natywny `<progress>` (ukryty wizualnie), a nie
              `role` na divie: element z rolą `progressbar` nie jest fokusowalny, więc
              czytniki traktują go gorzej, a linter słusznie się czepia. Gradient wyżej
              jest wyłącznie dekoracją. */}
          <progress
            value={phase.pct}
            max={100}
            aria-label="Postęp wysyłki nagrania"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
          />
          <span
            style={{
              fontSize: 12,
              fontVariantNumeric: "tabular-nums",
              color: "var(--ink)",
              padding: "0 6px",
              whiteSpace: "nowrap",
            }}
          >
            {phase.pct}%
          </span>
          <span
            className="muted"
            style={{
              fontSize: 11,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
            title={phase.fileName}
          >
            {phase.fileName}
          </span>
          <button
            type="button"
            onClick={clear}
            title="Przerwij wysyłkę"
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "transparent",
              border: 0,
              padding: "0 6px",
              color: "var(--ink-2)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
            }}
          >
            <Icons.X /> Anuluj
          </button>
        </div>
      )}

      {phase.kind === "done" && (
        <div style={shell}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              background: "var(--ok)",
              color: "var(--surface)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <Icons.Check />
          </span>
          <span style={{ fontSize: 12, color: "var(--ink)", whiteSpace: "nowrap" }}>
            Wgrane · <span className="muted">{phase.label}</span>
          </span>
          <button
            type="button"
            onClick={clear}
            title="Usuń nagranie z tej serii"
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "transparent",
              border: 0,
              padding: "0 6px",
              color: "var(--ink-2)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
            }}
          >
            <Icons.X />
          </button>
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 11, margin: "4px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}
