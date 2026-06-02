import { Link } from "react-router";
import { StatusBadge } from "~/components/consultation-status-badge";
import { Icons } from "~/components/icons";
import type { ConsultationTone } from "~/lib/consultation-status";

/**
 * Wiersz agendy terminu — wspólny dla list u trenera i podopiecznego.
 * `lead` to mono data/godzina, `title` główna treść, `sub` doprecyzowanie.
 */
export function ConsultationRow({
  to,
  lead,
  title,
  sub,
  label,
  tone,
}: {
  to: string;
  lead: string;
  title: string;
  sub?: string;
  label: string;
  tone: ConsultationTone;
}) {
  return (
    <Link to={to} className="list-row consult-row">
      <span className="mono text-xs muted consult-row-lead">{lead}</span>
      <span className="consult-row-main">
        <span className="consult-row-title">{title}</span>
        {sub && <span className="text-xs muted">{sub}</span>}
      </span>
      <StatusBadge label={label} tone={tone} />
      <Icons.Chev className="consult-row-chev" />
    </Link>
  );
}
