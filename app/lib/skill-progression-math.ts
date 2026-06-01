import type { ProgressionStatus } from "./progression-math";

/** Jedno zdarzenie awansu, zredukowane do pól potrzebnych do wyliczenia poziomu. */
export interface AdvancementEvent {
  toVariationId: string;
  toOrdinal: number;
  advancedOn: string; // YYYY-MM-DD
  createdAt: number; // epoch ms — tie-break przy tej samej dacie
}

/** Aktualny poziom = najświeższe zdarzenie (advancedOn, potem createdAt). null gdy brak. */
export function currentLevelFromEvents(
  events: AdvancementEvent[],
): { toVariationId: string; toOrdinal: number } | null {
  if (events.length === 0) return null;
  let best = events[0]!;
  for (const e of events) {
    if (e.advancedOn > best.advancedOn) best = e;
    else if (e.advancedOn === best.advancedOn && e.createdAt > best.createdAt) best = e;
  }
  return { toVariationId: best.toVariationId, toOrdinal: best.toOrdinal };
}

/** Próg minimalnej liczby sesji na bieżącym wariancie, zanim cokolwiek sugerujemy. */
export const MIN_SESSIONS_FOR_SUGGESTION = 4;
/** Średnie RPE uznawane za „zmaganie się" (przy cofnięciu). Skala 1–10. */
export const HIGH_RPE = 8;

export interface AdvanceSignals {
  sessionsOnCurrent: number;
  status: ProgressionStatus; // "up" | "flat" | "down" | "new"
  easierAtSameReps: boolean;
  inPlateau: boolean;
  recentAvgRpe: number | null;
  hasHigherVariant: boolean;
  hasLowerVariant: boolean;
}

export type AdvancementSuggestion = "advance" | "regress" | null;

/**
 * Miękka sugestia na bazie sygnałów (bez konfigurowalnych progów).
 * Awans i tak jest ręczny — to tylko podpowiedź dla trenera.
 */
export function suggestAdvancement(s: AdvanceSignals): AdvancementSuggestion {
  if (s.sessionsOnCurrent < MIN_SESSIONS_FOR_SUGGESTION) return null;

  if (s.hasHigherVariant && !s.inPlateau && (s.status === "up" || s.easierAtSameReps)) {
    return "advance";
  }

  if (
    s.hasLowerVariant &&
    s.status === "down" &&
    s.recentAvgRpe != null &&
    s.recentAvgRpe >= HIGH_RPE
  ) {
    return "regress";
  }

  return null;
}
