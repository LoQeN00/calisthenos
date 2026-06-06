import type Stripe from "stripe";
import type { Db } from "~/lib/db/client";
import { getEnv } from "~/lib/env";
import { logger } from "~/lib/logger";
import { recordInvoice } from "~/lib/payments";
import { getStripe } from "~/lib/stripe/client";
import { applyAccountUpdate } from "~/lib/stripe/connections";
import { applySubscriptionUpdate, linkCheckoutResult } from "~/lib/stripe/subscriptions";

/** Weryfikuje podpis i zwraca event. Rzuca, gdy podpis zły (caller → 400). */
export function verifyAndParse(rawBody: string, signature: string): Stripe.Event {
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET nie jest ustawiony");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}

export type Change =
  | {
      kind: "invoice";
      trainerId: string | null;
      traineeId: string | null;
      stripeInvoiceId: string;
      amountGrosze: number;
      currency: string;
      status: string;
      paidAt: Date | null;
      periodStart: Date | null;
      periodEnd: Date | null;
      hostedInvoiceUrl: string | null;
    }
  | {
      kind: "subscription";
      stripeSubscriptionId: string;
      stripeStatus: string;
      cancelAtPeriodEnd: boolean;
      currentPeriodEnd: Date | null;
      paused: boolean;
      // Metadane pary (ustawione w subscription_data.metadata przy Checkout) — pozwalają
      // powiązać/zaktualizować wiersz nawet gdy event przyjdzie przed checkout.session.completed.
      trainerId: string | null;
      traineeId: string | null;
    }
  | {
      kind: "checkout";
      trainerId: string;
      traineeId: string;
      customerId: string;
      subscriptionId: string;
    }
  | {
      kind: "account";
      accountId: string;
      chargesEnabled: boolean;
      payoutsEnabled: boolean;
      detailsSubmitted: boolean;
    };

const secs = (s: number | null | undefined): Date | null =>
  typeof s === "number" ? new Date(s * 1000) : null;

/**
 * Czysta funkcja: event Stripe → zamierzona zmiana (lub null gdy nieobsługiwany).
 *
 * Ścieżki pól zweryfikowane na stripe@19.3.0 (apiVersion 2025-10-29.clover):
 * - Invoice: metadane subskrypcji pod `parent.subscription_details.metadata`
 *   (nie top-level). `amount_paid`/`amount_due`, `status`, `status_transitions.paid_at`,
 *   `period_start`/`period_end`, `hosted_invoice_url` — top-level.
 * - Subscription: `current_period_end` żyje w `items.data[0].current_period_end`
 *   (przeniesione z top-level w nowszych wersjach API).
 */
export function mapEvent(event: Stripe.Event): Change | null {
  switch (event.type) {
    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      // Faktura bez id (np. proforma) → pomiń, 200 bez zapisu.
      if (!inv.id) return null;
      // Metadane pary żyją na fakturze pod parent.subscription_details.metadata
      // (zweryfikowane na stripe@19, 2025-10-29.clover — NIE top-level).
      const meta = inv.parent?.subscription_details?.metadata ?? {};
      return {
        kind: "invoice",
        trainerId: meta.trainerId ?? null,
        traineeId: meta.traineeId ?? null,
        stripeInvoiceId: inv.id,
        amountGrosze: inv.amount_paid || inv.amount_due || 0,
        currency: inv.currency,
        status: inv.status ?? "unknown",
        paidAt: secs(inv.status_transitions?.paid_at ?? null),
        periodStart: secs(inv.period_start),
        periodEnd: secs(inv.period_end),
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      // current_period_end przeniesiono do items.data[0] (zweryfikowane na stripe@19).
      const periodEnd = sub.items?.data?.[0]?.current_period_end;
      // pause_collection nie zmienia sub.status — wykrywamy wstrzymanie osobno.
      return {
        kind: "subscription",
        stripeSubscriptionId: sub.id,
        stripeStatus: sub.status,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        currentPeriodEnd: secs(periodEnd),
        // Anulowana subskrypcja nigdy nie jest „wstrzymana" — przy .deleted wymuszamy
        // false, by zalegające pause_collection nie zamaskowało anulowania jako pauzy.
        paused: event.type !== "customer.subscription.deleted" && sub.pause_collection != null,
        trainerId: sub.metadata?.trainerId ?? null,
        traineeId: sub.metadata?.traineeId ?? null,
      };
    }
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const meta = s.metadata ?? {};
      const customerId = typeof s.customer === "string" ? s.customer : (s.customer?.id ?? null);
      const subscriptionId =
        typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null);
      if (!meta.trainerId || !meta.traineeId || !customerId || !subscriptionId) return null;
      return {
        kind: "checkout",
        trainerId: meta.trainerId,
        traineeId: meta.traineeId,
        customerId,
        subscriptionId,
      };
    }
    case "account.updated": {
      const a = event.data.object as Stripe.Account;
      return {
        kind: "account",
        accountId: a.id,
        chargesEnabled: Boolean(a.charges_enabled),
        payoutsEnabled: Boolean(a.payouts_enabled),
        detailsSubmitted: Boolean(a.details_submitted),
      };
    }
    default:
      return null;
  }
}

/** Zapisuje zmianę do DB (idempotentnie). */
export async function applyChange(db: Db, change: Change): Promise<void> {
  switch (change.kind) {
    case "invoice":
      // Brak powiązania pary (metadane nie dotarły) → pomiń.
      if (!change.trainerId || !change.traineeId) {
        logger.warn("stripe_webhook.invoice_no_pair", { invoiceId: change.stripeInvoiceId });
        return;
      }
      await recordInvoice(db, {
        trainerId: change.trainerId,
        traineeId: change.traineeId,
        stripeInvoiceId: change.stripeInvoiceId,
        amountGrosze: change.amountGrosze,
        currency: change.currency,
        status: change.status,
        paidAt: change.paidAt,
        periodStart: change.periodStart,
        periodEnd: change.periodEnd,
        hostedInvoiceUrl: change.hostedInvoiceUrl,
      });
      return;
    case "subscription":
      await applySubscriptionUpdate(db, {
        stripeSubscriptionId: change.stripeSubscriptionId,
        stripeStatus: change.stripeStatus,
        currentPeriodEnd: change.currentPeriodEnd,
        cancelAtPeriodEnd: change.cancelAtPeriodEnd,
        paused: change.paused,
        trainerId: change.trainerId,
        traineeId: change.traineeId,
      });
      return;
    case "checkout":
      await linkCheckoutResult(db, change);
      return;
    case "account":
      await applyAccountUpdate(db, {
        id: change.accountId,
        charges_enabled: change.chargesEnabled,
        payouts_enabled: change.payoutsEnabled,
        details_submitted: change.detailsSubmitted,
      });
      return;
  }
}
