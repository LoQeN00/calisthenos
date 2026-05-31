import { z } from "zod";

/**
 * Walidacja formularza konsultacji (server-side). Route buduje zwykły obiekt z
 * FormData i waliduje przez `ConsultationFormSchema`. Czysta logika — testowana
 * jednostkowo bez DB.
 */

export const ConsultationItemStatusSchema = z.enum(["open", "resolved"]);
export type ConsultationItemStatusForm = z.infer<typeof ConsultationItemStatusSchema>;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Niepoprawna data.");

export const ActionItemFormSchema = z.object({
  // Server ignoruje id przy zapisie (rows są wycierane i pisane od nowa).
  id: z.string().optional(),
  body: z.string().trim().min(1, "Treść punktu nie może być pusta.").max(2000),
  status: ConsultationItemStatusSchema.default("open"),
});
export type ActionItemForm = z.infer<typeof ActionItemFormSchema>;

export const ConsultationFormSchema = z
  .object({
    heldOn: dateString,
    periodFrom: dateString.nullable().optional(),
    periodTo: dateString.nullable().optional(),
    title: z.string().trim().min(1, "Tytuł jest wymagany.").max(160),
    summary: z.string().max(10000).default(""),
    items: z.array(ActionItemFormSchema).max(50).optional().default([]),
  })
  .refine((c) => (c.periodFrom == null) === (c.periodTo == null), {
    message: "Podaj oba końce okresu albo żaden.",
    path: ["periodTo"],
  })
  .refine((c) => c.periodFrom == null || c.periodTo == null || c.periodFrom <= c.periodTo, {
    message: "Początek okresu nie może być po końcu.",
    path: ["periodTo"],
  });
export type ConsultationForm = z.infer<typeof ConsultationFormSchema>;
