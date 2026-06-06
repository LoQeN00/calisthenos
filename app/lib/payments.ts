import { and, desc, eq } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export interface InvoiceRecord {
  trainerId: string;
  traineeId: string;
  stripeInvoiceId: string;
  amountGrosze: number;
  currency: string;
  status: string;
  paidAt: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  hostedInvoiceUrl: string | null;
}

/** Upsert faktury po stripe_invoice_id (idempotencja webhooka). */
export async function recordInvoice(db: Db, rec: InvoiceRecord): Promise<void> {
  await db
    .insert(schema.subscriptionPayments)
    .values(rec)
    .onConflictDoUpdate({
      target: schema.subscriptionPayments.stripeInvoiceId,
      set: {
        amountGrosze: rec.amountGrosze,
        status: rec.status,
        paidAt: rec.paidAt,
        periodStart: rec.periodStart,
        periodEnd: rec.periodEnd,
        hostedInvoiceUrl: rec.hostedInvoiceUrl,
      },
    });
}

/** Historia płatności podopiecznego (tenant-scope: traineeId). */
export async function listPaymentsForTrainee(db: Db, traineeId: string, limit = 24) {
  return db
    .select()
    .from(schema.subscriptionPayments)
    .where(eq(schema.subscriptionPayments.traineeId, traineeId))
    .orderBy(desc(schema.subscriptionPayments.createdAt))
    .limit(limit);
}

/** Historia płatności pary trener+podopieczny (tenant-scope: oba id). */
export async function listPaymentsForPair(
  db: Db,
  trainerId: string,
  traineeId: string,
  limit = 24,
) {
  return db
    .select()
    .from(schema.subscriptionPayments)
    .where(
      and(
        eq(schema.subscriptionPayments.trainerId, trainerId),
        eq(schema.subscriptionPayments.traineeId, traineeId),
      ),
    )
    .orderBy(desc(schema.subscriptionPayments.createdAt))
    .limit(limit);
}
