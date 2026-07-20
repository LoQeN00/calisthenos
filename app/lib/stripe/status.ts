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
  /** Klucz i18next (namespace `platnosci`) — addytywny, callerzy mogą używać `label` lub `t(labelKey)`. */
  labelKey: string;
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
  none: { label: "Brak subskrypcji", tone: "neutral", labelKey: "platnosci:subStatus.none" },
  incomplete: { label: "Nieukończona", tone: "warn", labelKey: "platnosci:subStatus.incomplete" },
  active: { label: "Aktywna", tone: "ok", labelKey: "platnosci:subStatus.active" },
  past_due: { label: "Zaległość", tone: "warn", labelKey: "platnosci:subStatus.past_due" },
  unpaid: { label: "Nieopłacona", tone: "warn", labelKey: "platnosci:subStatus.unpaid" },
  canceled: { label: "Anulowana", tone: "neutral", labelKey: "platnosci:subStatus.canceled" },
  paused: { label: "Wstrzymana", tone: "neutral", labelKey: "platnosci:subStatus.paused" },
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

/** Status faktury → klucz i18next (namespace `platnosci`). Nieznany status → null. */
export function invoiceStatusLabelKey(status: string): string | null {
  const KNOWN_KEYS: Record<string, string> = {
    paid: "platnosci:invoiceStatus.paid",
    open: "platnosci:invoiceStatus.open",
    void: "platnosci:invoiceStatus.void",
    uncollectible: "platnosci:invoiceStatus.uncollectible",
    draft: "platnosci:invoiceStatus.draft",
    failed: "platnosci:invoiceStatus.failed",
  };
  return KNOWN_KEYS[status] ?? null;
}
