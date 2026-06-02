import type { ConsultationStatus } from "~/lib/db/schema";

/**
 * Jedno źródło prawdy dla prezentacji statusu terminu konsultacji — etykieta +
 * ton — używane przez OBA panele (trener i podopieczny), żeby ten sam termin
 * nigdy nie wyglądał inaczej zależnie od widoku. Czysta logika (cel testów).
 */

export type ConsultationTone =
  | "scheduled"
  | "pending"
  | "confirmed"
  | "change"
  | "cancelled"
  | "done";

export interface ConsultationPresentation {
  label: string;
  tone: ConsultationTone;
}

/** Kolor tekstu badge per ton (zmienne z tokens.css). */
export const TONE_TEXT: Record<ConsultationTone, string> = {
  scheduled: "var(--ink-2)",
  pending: "var(--warn)",
  confirmed: "var(--ok)",
  change: "var(--warn)",
  cancelled: "var(--muted)",
  done: "var(--muted)",
};

/** Kolor kropki statusu (badge + kropka dnia w kalendarzu). */
export const TONE_DOT: Record<ConsultationTone, string> = {
  scheduled: "var(--muted-2)",
  pending: "var(--warn)",
  confirmed: "var(--ok)",
  change: "var(--warn)",
  cancelled: "var(--muted-2)",
  done: "var(--ok)",
};

/** Priorytet tonu na zbiorczej kropce dnia (wyższy = ważniejszy). */
const TONE_PRIORITY: Record<ConsultationTone, number> = {
  pending: 5,
  change: 4,
  confirmed: 3,
  scheduled: 2,
  done: 1,
  cancelled: 0,
};

/** Najważniejszy ton z listy (dla dnia z kilkoma terminami). Null gdy pusto. */
export function mostUrgentTone(tones: ConsultationTone[]): ConsultationTone | null {
  let best: ConsultationTone | null = null;
  for (const t of tones) {
    if (best === null || TONE_PRIORITY[t] > TONE_PRIORITY[best]) best = t;
  }
  return best;
}

export interface PresentationArgs {
  status: ConsultationStatus;
  /** ISO (UTC) terminu — potrzebne by odróżnić `planned` przyszły od minionego. */
  scheduledAtISO: string;
  nowMs: number;
  viewer: "trainer" | "trainee";
}

/**
 * Etykiety w rodzaju męskim (zgodnie z „termin"). `planned` po terminie:
 * dla trenera → „do udokumentowania", dla podopiecznego → „do potwierdzenia".
 */
export function consultationPresentation(args: PresentationArgs): ConsultationPresentation {
  const { status, scheduledAtISO, nowMs, viewer } = args;
  switch (status) {
    case "confirmed":
      return { label: "potwierdzony", tone: "confirmed" };
    case "change_requested":
      return { label: "prośba o zmianę", tone: "change" };
    case "cancelled":
      return { label: "odwołany", tone: "cancelled" };
    case "documented":
      return { label: "udokumentowany", tone: "done" };
    default: {
      // planned
      if (viewer === "trainee") return { label: "do potwierdzenia", tone: "pending" };
      const isPast = new Date(scheduledAtISO).getTime() < nowMs;
      if (isPast) return { label: "do udokumentowania", tone: "pending" };
      return { label: "zaplanowany", tone: "scheduled" };
    }
  }
}
