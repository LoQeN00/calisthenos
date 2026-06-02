import { type ConsultationTone, TONE_DOT, TONE_TEXT } from "~/lib/consultation-status";

/**
 * Badge statusu terminu — sygnaturowy `.badge` design-systemu (mono, uppercase,
 * kropka wiodąca). Kolor tekstu i kropki sterowany tonem z `consultation-status`,
 * więc ten sam status wygląda identycznie u trenera i u podopiecznego.
 */
export function StatusBadge({ label, tone }: { label: string; tone: ConsultationTone }) {
  return (
    <span className="badge" style={{ color: TONE_TEXT[tone], whiteSpace: "nowrap" }}>
      <span className="badge-dot" style={{ background: TONE_DOT[tone] }} />
      {label}
    </span>
  );
}
