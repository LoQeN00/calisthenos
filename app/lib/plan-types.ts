import { z } from "zod";

/**
 * Shape of a plan being edited on the client. The route action receives this as JSON.
 * Server-side validation lives in `PlanFormSchema`.
 *
 * Block-kind invariants:
 * - "single" / "superset" — block.sets and block.restSeconds are NULL; each item
 *   carries its own sets + restSeconds.
 * - "dropset" — block.sets and block.restSeconds are required; each item only
 *   carries reps + unit + (optional) note. Item-level sets/restSeconds are NULL.
 */

export const ItemFormSchema = z.object({
  // Client-generated id for tracking (`tmp-…`) or existing row id. Server ignores
  // these on save — rows are wiped and rewritten so ids don't need to be stable.
  id: z.string().optional(),
  exerciseId: z.string().uuid(),
  reps: z.number().int().min(1).max(1000),
  unit: z.enum(["REPS", "SEC"]),
  // Per-item; only valid for non-dropset blocks. Validator below enforces.
  sets: z.number().int().min(1).max(50).optional().nullable(),
  restSeconds: z.number().int().min(0).max(3600).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});
export type ItemForm = z.infer<typeof ItemFormSchema>;

export const BlockFormSchema = z
  .object({
    id: z.string().optional(),
    kind: z.enum(["single", "superset", "dropset"]),
    // Only set for dropset blocks.
    sets: z.number().int().min(1).max(50).optional().nullable(),
    restSeconds: z.number().int().min(0).max(3600).optional().nullable(),
    items: z.array(ItemFormSchema).min(1).max(20),
  })
  .refine(
    (b) => {
      if (b.kind === "dropset") {
        return b.sets != null && b.restSeconds != null && b.items.length >= 2;
      }
      if (b.kind === "superset") return b.items.length >= 2;
      // single
      return b.items.length === 1;
    },
    { message: "Niepoprawna struktura bloku dla danego typu." },
  )
  .refine(
    (b) => {
      if (b.kind === "dropset") {
        // Items' sets/rest must be null/undefined — block carries them.
        return b.items.every((i) => i.sets == null && i.restSeconds == null);
      }
      // Non-dropset: each item must have sets + rest defined.
      return b.items.every((i) => i.sets != null && i.restSeconds != null);
    },
    { message: "Pola sets/rest muszą pasować do typu bloku." },
  );
export type BlockForm = z.infer<typeof BlockFormSchema>;

export const SessionFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  blocks: z.array(BlockFormSchema).max(20),
});
export type SessionForm = z.infer<typeof SessionFormSchema>;

export const PlanFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sessions: z.array(SessionFormSchema).max(20),
});
export type PlanForm = z.infer<typeof PlanFormSchema>;
