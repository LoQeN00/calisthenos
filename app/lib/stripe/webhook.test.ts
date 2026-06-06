import { describe, expect, it } from "vitest";
import { mapEvent } from "~/lib/stripe/webhook";

// UWAGA o kształcie pól (zweryfikowane na stripe@22.2.0, apiVersion 2026-05-27.dahlia):
// - Na obiekcie Invoice metadane subskrypcji żyją pod `parent.subscription_details.metadata`
//   (NIE pod top-level `subscription_details.metadata`). `amount_paid`/`amount_due`,
//   `status`, `status_transitions.paid_at`, `period_start`/`period_end`,
//   `hosted_invoice_url` są nadal top-level.
// - Na obiekcie Subscription `current_period_end` przeniesiono do
//   `items.data[0].current_period_end` (NIE jest już top-level).
// Fixtury poniżej odzwierciedlają realne ścieżki, które parsuje mapEvent.

describe("mapEvent", () => {
  it("invoice.paid → wpis do księgi ze statusem paid (metadata pod parent.subscription_details)", () => {
    const change = mapEvent({
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          amount_paid: 20000,
          currency: "pln",
          status: "paid",
          status_transitions: { paid_at: 1_700_000_000 },
          period_start: 1_699_000_000,
          period_end: 1_701_000_000,
          hosted_invoice_url: "https://pay/x",
          parent: {
            type: "subscription_details",
            subscription_details: {
              subscription: "sub_1",
              metadata: { trainerId: "t1", traineeId: "u1" },
            },
          },
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "invoice",
      trainerId: "t1",
      traineeId: "u1",
      stripeInvoiceId: "in_1",
      amountGrosze: 20000,
      currency: "pln",
      status: "paid",
      paidAt: new Date(1_700_000_000 * 1000),
      periodStart: new Date(1_699_000_000 * 1000),
      periodEnd: new Date(1_701_000_000 * 1000),
      hostedInvoiceUrl: "https://pay/x",
    });
  });

  it("invoice.payment_failed → status failed, amount_due gdy brak amount_paid", () => {
    const change = mapEvent({
      type: "invoice.payment_failed",
      data: {
        object: {
          // amount_paid pominięte (nieopłacona) → mapEvent bierze amount_due.
          id: "in_2",
          amount_due: 35000,
          currency: "pln",
          status: "open",
          status_transitions: { paid_at: null },
          period_start: 1_699_000_000,
          period_end: 1_701_000_000,
          hosted_invoice_url: null,
          parent: {
            type: "subscription_details",
            subscription_details: {
              subscription: "sub_2",
              metadata: { trainerId: "t1", traineeId: "u1" },
            },
          },
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "invoice",
      trainerId: "t1",
      traineeId: "u1",
      stripeInvoiceId: "in_2",
      amountGrosze: 35000,
      currency: "pln",
      status: "open",
      paidAt: null,
      periodStart: new Date(1_699_000_000 * 1000),
      periodEnd: new Date(1_701_000_000 * 1000),
      hostedInvoiceUrl: null,
    });
  });

  it("customer.subscription.updated → zmiana statusu (current_period_end z items.data[0])", () => {
    const change = mapEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "past_due",
          cancel_at_period_end: false,
          items: {
            data: [{ id: "si_1", current_period_end: 1_701_000_000 }],
          },
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "subscription",
      stripeSubscriptionId: "sub_1",
      stripeStatus: "past_due",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_701_000_000 * 1000),
      paused: false,
      trainerId: null,
      traineeId: null,
    });
  });

  it("customer.subscription.created → status active + para z metadanych (link po Checkout)", () => {
    const change = mapEvent({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_new",
          status: "active",
          cancel_at_period_end: false,
          metadata: { trainerId: "t1", traineeId: "u1" },
          items: {
            data: [{ id: "si_new", current_period_end: 1_701_000_000 }],
          },
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "subscription",
      stripeSubscriptionId: "sub_new",
      stripeStatus: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_701_000_000 * 1000),
      paused: false,
      trainerId: "t1",
      traineeId: "u1",
    });
  });

  it("customer.subscription.updated z pause_collection → paused: true", () => {
    const change = mapEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_p",
          status: "active",
          cancel_at_period_end: false,
          pause_collection: { behavior: "void" },
          items: {
            data: [{ id: "si_p", current_period_end: 1_701_000_000 }],
          },
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "subscription",
      stripeSubscriptionId: "sub_p",
      stripeStatus: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(1_701_000_000 * 1000),
      paused: true,
      trainerId: null,
      traineeId: null,
    });
  });

  it("customer.subscription.deleted → status canceled, brak items → currentPeriodEnd null", () => {
    const change = mapEvent({
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_3",
          status: "canceled",
          cancel_at_period_end: false,
          items: { data: [] },
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "subscription",
      stripeSubscriptionId: "sub_3",
      stripeStatus: "canceled",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      paused: false,
      trainerId: null,
      traineeId: null,
    });
  });

  it("checkout.session.completed → powiązanie customer+subscription z metadanych", () => {
    const change = mapEvent({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          customer: "cus_1",
          subscription: "sub_1",
          metadata: { trainerId: "t1", traineeId: "u1" },
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "checkout",
      trainerId: "t1",
      traineeId: "u1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
    });
  });

  it("checkout.session.completed bez metadanych/subskrypcji → null", () => {
    const change = mapEvent({
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_2", customer: "cus_2", subscription: null, metadata: {} },
      },
    } as never);
    expect(change).toBeNull();
  });

  it("account.updated → flagi statusu konta Connect", () => {
    const change = mapEvent({
      type: "account.updated",
      data: {
        object: {
          id: "acct_1",
          charges_enabled: true,
          payouts_enabled: false,
          details_submitted: true,
        },
      },
    } as never);
    expect(change).toEqual({
      kind: "account",
      accountId: "acct_1",
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
    });
  });

  it("typ nieobsługiwany → null", () => {
    expect(mapEvent({ type: "ping", data: { object: {} } } as never)).toBeNull();
  });
});
