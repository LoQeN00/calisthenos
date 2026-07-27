import type { Db } from "~/lib/db/client";
import { stripeApiConfigured } from "~/lib/env";
import { hasAppAccess, paymentRequired } from "~/lib/stripe/access";
import { getConnectionRow } from "~/lib/stripe/connections";
import { getSubscriptionForPair } from "~/lib/stripe/subscriptions";

/**
 * Serwerowa bramka dostępu podopiecznego: czy wpuszczamy go do aplikacji.
 *
 * Osobny moduł, bo `access.ts` jest czysty (same predykaty, zero DB) i taki ma
 * zostać, a `subscriptions.ts` nie może zależeć od bramki, skoro bramka zależy
 * od niego. Zwracamy też `sub`, żeby wołający nie musiał go dociągać drugi raz
 * (layout rysuje z niego odznakę „Płatności").
 */
export async function hasTraineeAppAccess(
  db: Db,
  user: { id: string; trainerId: string | null },
): Promise<{
  hasAccess: boolean;
  sub: Awaited<ReturnType<typeof getSubscriptionForPair>>;
}> {
  if (!user.trainerId) return { hasAccess: true, sub: null };
  const sub = await getSubscriptionForPair(db, user.trainerId, user.id);
  const conn = await getConnectionRow(db, user.trainerId);
  const required = paymentRequired({
    stripeConfigured: stripeApiConfigured(),
    chargesEnabled: Boolean(conn?.chargesEnabled),
    hasPrice: Boolean(sub?.stripePriceId),
  });
  return {
    hasAccess: hasAppAccess({ paymentRequired: required, status: sub?.status ?? null }),
    sub,
  };
}
