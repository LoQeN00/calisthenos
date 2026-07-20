import { z } from "zod";

/** Waluty/locale wspierane w plasterku #1 (PL teraz, FR przygotowane pod #2). */
export const RegionInputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(64),
  country: z.string().regex(/^[A-Z]{2}$/), // ISO-3166 alpha-2
  currency: z.enum(["pln", "eur"]),
  locale: z.enum(["pl-PL", "fr-FR"]),
});

export type RegionInput = z.infer<typeof RegionInputSchema>;
