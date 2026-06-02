import { useState } from "react";
import { Form } from "react-router";
import { Icons } from "~/components/icons";

/**
 * Akcje podopiecznego na terminie: Potwierdzam / Poproś o zmianę / Odrzuć.
 * Wspólne dla karty „najbliższy termin”, kart dnia i widoku szczegółów —
 * rodzic dostarcza trasę akcji (POST → `respondToOccurrence`).
 */
export function TraineeOccurrenceActions({
  consultationId,
  compact = false,
}: {
  consultationId: string;
  compact?: boolean;
}) {
  const [showNote, setShowNote] = useState(false);
  const sm = compact ? " btn-sm" : "";

  if (!showNote) {
    return (
      <div className="row wrap" style={{ gap: 8 }}>
        <Form method="post">
          <input type="hidden" name="consultationId" value={consultationId} />
          <input type="hidden" name="action" value="confirm" />
          <button type="submit" className={`btn btn-primary${sm}`}>
            <Icons.Check /> Potwierdzam
          </button>
        </Form>
        <button type="button" className={`btn${sm}`} onClick={() => setShowNote(true)}>
          Poproś o zmianę
        </button>
        <Form method="post">
          <input type="hidden" name="consultationId" value={consultationId} />
          <input type="hidden" name="action" value="decline" />
          <button type="submit" className={`btn btn-ghost${sm}`} style={{ color: "var(--danger)" }}>
            Odrzuć
          </button>
        </Form>
      </div>
    );
  }

  return (
    <Form method="post" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input type="hidden" name="consultationId" value={consultationId} />
      <input type="hidden" name="action" value="request_change" />
      <label htmlFor={`note-${consultationId}`} className="field-label">
        Co chcesz zmienić? (opcjonalnie)
      </label>
      <textarea
        id={`note-${consultationId}`}
        className="textarea"
        name="note"
        rows={3}
        maxLength={2000}
        placeholder="np. Wolę rano, albo inny dzień tygodnia…"
      />
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className={`btn btn-primary${sm}`}>
          Wyślij prośbę
        </button>
        <button type="button" className={`btn btn-ghost${sm}`} onClick={() => setShowNote(false)}>
          Anuluj
        </button>
      </div>
    </Form>
  );
}
