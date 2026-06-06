// Nasz enum statusu (lustro Stripe + 'none'). Trzymany też w schema.ts (enum subscription_status).
export type SubscriptionStatus =
  | "none"
  | "incomplete"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type StatusTone = "ok" | "warn" | "neutral";
export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

const KNOWN: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "canceled",
  paused: "paused",
};

/** Stripe `Subscription.status` (string) → nasz enum. Nieznane → 'incomplete' (caller loguje). */
export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  return KNOWN[stripeStatus] ?? "incomplete";
}

const PRESENTATION: Record<SubscriptionStatus, StatusPresentation> = {
  none: { label: "Brak subskrypcji", tone: "neutral" },
  incomplete: { label: "Nieukończona", tone: "warn" },
  active: { label: "Aktywna", tone: "ok" },
  past_due: { label: "Zaległość", tone: "warn" },
  unpaid: { label: "Nieopłacona", tone: "warn" },
  canceled: { label: "Anulowana", tone: "neutral" },
  paused: { label: "Wstrzymana", tone: "neutral" },
};

export function subscriptionPresentation(status: SubscriptionStatus): StatusPresentation {
  return PRESENTATION[status];
}

/** Status faktury/płatności (Stripe `Invoice.status` + 'failed') → polska etykieta. */
export function invoiceStatusLabel(status: string): string {
  const M: Record<string, string> = {
    paid: "Opłacona",
    open: "Oczekująca",
    void: "Anulowana",
    uncollectible: "Nieściągalna",
    draft: "Szkic",
    failed: "Nieudana",
  };
  return M[status] ?? status;
}
