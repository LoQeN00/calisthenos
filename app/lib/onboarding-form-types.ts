import { z } from "zod";
import { type PlForms, pluralizePl } from "~/lib/format";

/**
 * Formularz startowy — czysta warstwa: schematy Zod, opis wyniku i parser
 * równoległych pól formularza. Bez DB i bez `Date.now` — cel testów
 * jednostkowych.
 *
 * `answerLabel` to CO INNEGO niż `unitLabelPl` z `progression-math.ts`: tamto
 * jest skrótem osi wykresu („powt."), to jest pełną frazą z liczbą i polską
 * odmianą („3 powtórzenia"). Nie zastępuj jednego drugim.
 */

export const MAX_ONBOARDING_EXERCISES = 12;
export const MAX_ONBOARDING_VALUE = 10000;
export const MAX_ONBOARDING_NOTE = 1000;
export const MAX_ONBOARDING_COMMENT = 200;

export type OnboardingUnit = "REPS" | "SEC";

const POWTORZENIE: PlForms = {
  one: "powtórzenie",
  few: "powtórzenia",
  many: "powtórzeń",
};

/** Opis wyniku pozycji: „12 powtórzeń" / „35 s". */
export function answerLabel(unit: OnboardingUnit, value: number): string {
  if (unit === "SEC") return `${value} s`;
  return `${value} ${pluralizePl(value, POWTORZENIE)}`;
}

const optionalNote = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} może mieć najwyżej ${max} znaków.`)
    .transform((s) => (s.length === 0 ? null : s));

/** Szablon doczepiany do zaproszenia przez trenera. */
export const OnboardingTemplateSchema = z.object({
  exerciseIds: z
    .array(z.string().uuid())
    .min(1, "Wybierz co najmniej jedno ćwiczenie.")
    .max(MAX_ONBOARDING_EXERCISES, `Możesz wybrać najwyżej ${MAX_ONBOARDING_EXERCISES} ćwiczeń.`)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "To samo ćwiczenie nie może wejść dwa razy.",
    }),
  note: optionalNote(MAX_ONBOARDING_NOTE, "Notatka"),
});
export type OnboardingTemplate = z.infer<typeof OnboardingTemplateSchema>;

export const OnboardingAnswerSchema = z.object({
  itemId: z.string().uuid(),
  value: z
    .number({ invalid_type_error: "Podaj wynik liczbą." })
    .int("Wynik musi być liczbą całkowitą.")
    .min(0, "Wynik nie może być ujemny.")
    .max(MAX_ONBOARDING_VALUE, `Wynik może wynosić najwyżej ${MAX_ONBOARDING_VALUE}.`),
  comment: optionalNote(MAX_ONBOARDING_COMMENT, "Komentarz"),
});

/**
 * Odpowiedzi podopiecznego. Górny limit tablicy jest tak samo obowiązkowy jak
 * dolny: bez niego jedno żądanie z tysiącami powtórzonych `itemId` rozkręcało
 * pętlę UPDATE-ów w `submitOnboardingForm`.
 */
export const OnboardingAnswersSchema = z.object({
  answers: z
    .array(OnboardingAnswerSchema)
    .min(1, "Formularz jest pusty.")
    .max(
      MAX_ONBOARDING_EXERCISES,
      `Formularz może mieć najwyżej ${MAX_ONBOARDING_EXERCISES} pozycji.`,
    ),
  traineeNote: optionalNote(MAX_ONBOARDING_NOTE, "Notatka"),
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;

/**
 * Puste pole wyniku ma polecieć jako NaN, a nie 0 — `Number("")` daje zero, więc
 * niewypełnione pole po cichu zapisałoby się jako „ani razu". NaN odbija się od
 * `z.number()` z czytelnym komunikatem.
 */
function toValue(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return Number.NaN;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Równoległe pola `<input name="itemId">` / `value` / `comment` → obiekt do walidacji. */
export function toAnswersInput(raw: {
  itemIds: string[];
  values: string[];
  comments: string[];
  traineeNote: string;
}): { answers: { itemId: string; value: number; comment: string }[]; traineeNote: string } {
  return {
    answers: raw.itemIds.map((itemId, i) => ({
      itemId,
      value: toValue(raw.values[i] ?? ""),
      comment: raw.comments[i] ?? "",
    })),
    traineeNote: raw.traineeNote,
  };
}
