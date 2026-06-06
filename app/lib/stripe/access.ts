import type { SubscriptionStatus } from "~/lib/stripe/status";

/** Statusy subskrypcji dające dostęp do aplikacji (grace: past_due nadal wpuszcza). */
export const ACCESS_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "paused",
  "past_due",
]);

/** Czy płatność jest realnie możliwa (gating ma sens tylko wtedy). */
export function paymentRequired(a: {
  stripeConfigured: boolean;
  chargesEnabled: boolean;
  hasPrice: boolean;
}): boolean {
  return a.stripeConfigured && a.chargesEnabled && a.hasPrice;
}

/** Czy podopieczny ma dostęp do aplikacji. */
export function hasAppAccess(a: {
  paymentRequired: boolean;
  status: SubscriptionStatus | null;
}): boolean {
  if (!a.paymentRequired) return true;
  return a.status != null && ACCESS_STATUSES.has(a.status);
}
