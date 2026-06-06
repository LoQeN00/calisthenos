import Stripe from "stripe";
import { getEnv } from "~/lib/env";

// Przypięta wersja API — przewidywalne mapowanie pól w webhooku/orkiestracji.
// Musi zgadzać się z wersją typów zainstalowanego SDK (stripe@19 → 2025-10-29.clover).
export const STRIPE_API_VERSION = "2025-10-29.clover" as const;

let cached: Stripe | null = null;

/** Leniwy klient Stripe (platforma). Rzuca, gdy brak STRIPE_SECRET_KEY. */
export function getStripe(): Stripe {
  if (!cached) {
    const key = getEnv().STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY nie jest ustawiony");
    cached = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  }
  return cached;
}
