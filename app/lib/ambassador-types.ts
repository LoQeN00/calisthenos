import { z } from "zod";

export const AmbassadorInviteSchema = z.object({
  displayName: z.string().trim().min(1, "ambasadorzy.validation.nameRequired").max(80),
  email: z
    .string()
    .trim()
    .min(1, "ambasadorzy.validation.emailRequired")
    .max(254)
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "ambasadorzy.validation.emailInvalid",
    }),
  regionId: z.string().uuid("ambasadorzy.validation.regionRequired"),
});
export type AmbassadorInvite = z.infer<typeof AmbassadorInviteSchema>;
