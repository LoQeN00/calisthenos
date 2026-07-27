import {
  type FeatureRequestStatus,
  TONE_DOT,
  TONE_TEXT,
  statusPresentation,
} from "~/lib/feature-request-types";

/**
 * Plakietka statusu zgłoszenia — sygnaturowy `.badge` design-systemu (mono,
 * uppercase, kropka wiodąca). Wygląd bierze się z `statusPresentation`, więc
 * status wygląda tak samo u autora i u trenera.
 */
export function FeatureRequestBadge({ status }: { status: FeatureRequestStatus }) {
  const { label, tone } = statusPresentation(status);
  return (
    <span className="badge" style={{ color: TONE_TEXT[tone], whiteSpace: "nowrap" }}>
      <span className="badge-dot" style={{ background: TONE_DOT[tone] }} />
      {label}
    </span>
  );
}
