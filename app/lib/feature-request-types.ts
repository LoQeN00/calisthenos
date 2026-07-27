import { z } from "zod";

/**
 * Zgłoszenia podopiecznych („Pomysły") — czysta warstwa: słowniki etykiet,
 * prezentacja statusu i schematy Zod. Bez DB, bez `Date.now` — cel testów
 * jednostkowych. Jedno źródło prawdy etykiet dla OBU paneli, żeby ten sam
 * status nie nazywał się inaczej u trenera niż u podopiecznego.
 */

export const FEATURE_REQUEST_KINDS = ["idea", "bug", "other"] as const;
export type FeatureRequestKind = (typeof FEATURE_REQUEST_KINDS)[number];

export const FEATURE_REQUEST_STATUSES = [
  "new",
  "considering",
  "planned",
  "done",
  "rejected",
] as const;
export type FeatureRequestStatus = (typeof FEATURE_REQUEST_STATUSES)[number];

export const KIND_LABEL: Record<FeatureRequestKind, string> = {
  idea: "Pomysł",
  bug: "Błąd",
  other: "Inne",
};

export const STATUS_LABEL: Record<FeatureRequestStatus, string> = {
  new: "Nowe",
  considering: "Rozważamy",
  planned: "Zaplanowane",
  done: "Zrobione",
  rejected: "Odrzucone",
};

export type FeatureRequestTone = "new" | "progress" | "done" | "rejected";

export interface FeatureRequestPresentation {
  label: string;
  tone: FeatureRequestTone;
}

/** Kolor tekstu plakietki per ton (zmienne z tokens.css). */
export const TONE_TEXT: Record<FeatureRequestTone, string> = {
  new: "var(--warn)",
  progress: "var(--ink-2)",
  done: "var(--ok)",
  rejected: "var(--muted)",
};

/** Kolor kropki plakietki per ton. */
export const TONE_DOT: Record<FeatureRequestTone, string> = {
  new: "var(--warn)",
  progress: "var(--muted-2)",
  done: "var(--ok)",
  rejected: "var(--muted-2)",
};

export function statusPresentation(status: FeatureRequestStatus): FeatureRequestPresentation {
  switch (status) {
    case "considering":
    case "planned":
      return { label: STATUS_LABEL[status], tone: "progress" };
    case "done":
      return { label: STATUS_LABEL.done, tone: "done" };
    case "rejected":
      return { label: STATUS_LABEL.rejected, tone: "rejected" };
    default:
      return { label: STATUS_LABEL.new, tone: "new" };
  }
}

/**
 * Autor może wycofać własne zgłoszenie, dopóki trener go nie ruszył. Po zmianie
 * statusu (czyli po odpowiedzi) kasowanie zabrałoby trenerowi rozmowę sprzed nosa.
 */
export function canTraineeDelete(status: FeatureRequestStatus): boolean {
  return status === "new";
}

export const FeatureRequestFormSchema = z.object({
  kind: z.enum(FEATURE_REQUEST_KINDS).default("idea"),
  title: z
    .string()
    .trim()
    .min(3, "Tytuł musi mieć co najmniej 3 znaki.")
    .max(120, "Tytuł może mieć najwyżej 120 znaków."),
  body: z
    .string()
    .trim()
    .min(10, "Opis musi mieć co najmniej 10 znaków.")
    .max(2000, "Opis może mieć najwyżej 2000 znaków."),
});
export type FeatureRequestForm = z.infer<typeof FeatureRequestFormSchema>;

export const FeatureRequestResponseSchema = z.object({
  status: z.enum(FEATURE_REQUEST_STATUSES),
  response: z
    .string()
    .trim()
    .max(2000, "Odpowiedź może mieć najwyżej 2000 znaków.")
    .transform((s) => (s.length === 0 ? null : s)),
});
export type FeatureRequestResponse = z.infer<typeof FeatureRequestResponseSchema>;
