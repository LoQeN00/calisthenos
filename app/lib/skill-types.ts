import { z } from "zod";
import { SKILL_TIERS } from "~/lib/skill-tier";

/** Schematy walidacji formularzy umiejętności (server-side). Czysta logika — testowana bez DB. */

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Niepoprawna data.");

export const SkillFormSchema = z.object({
  name: z.string().trim().min(1, "Nazwa jest wymagana.").max(120),
  description: z.string().max(2000).default(""),
  tier: z.enum(SKILL_TIERS).default("basic"),
});
export type SkillForm = z.infer<typeof SkillFormSchema>;

export const AdvancementFormSchema = z.object({
  toVariationId: z.string().uuid("Niepoprawny wariant."),
  advancedOn: dateString,
  note: z.string().trim().max(2000).optional(),
});
export type AdvancementForm = z.infer<typeof AdvancementFormSchema>;

export const ReorderFormSchema = z.object({
  variationIds: z.array(z.string().uuid()).min(1, "Pusta lista wariantów."),
});
export type ReorderForm = z.infer<typeof ReorderFormSchema>;

export const PrerequisiteFormSchema = z.object({
  skillId: z.string().uuid("Niepoprawna umiejętność."),
  requiresSkillId: z.string().uuid("Niepoprawny prerekwizyt."),
});
export type PrerequisiteForm = z.infer<typeof PrerequisiteFormSchema>;
