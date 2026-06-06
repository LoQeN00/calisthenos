import { describe, expect, it } from "vitest";
import { hasAppAccess, paymentRequired } from "~/lib/stripe/access";

describe("paymentRequired", () => {
  it("true tylko gdy Stripe skonfigurowany + charges + cena", () => {
    expect(paymentRequired({ stripeConfigured: true, chargesEnabled: true, hasPrice: true })).toBe(
      true,
    );
  });
  it("false gdy brak którejkolwiek przesłanki", () => {
    expect(paymentRequired({ stripeConfigured: false, chargesEnabled: true, hasPrice: true })).toBe(
      false,
    );
    expect(paymentRequired({ stripeConfigured: true, chargesEnabled: false, hasPrice: true })).toBe(
      false,
    );
    expect(paymentRequired({ stripeConfigured: true, chargesEnabled: true, hasPrice: false })).toBe(
      false,
    );
  });
});

describe("hasAppAccess", () => {
  it("gdy płatność nie jest wymagana → zawsze dostęp", () => {
    for (const status of [
      "none",
      "incomplete",
      "active",
      "past_due",
      "canceled",
      "unpaid",
      "paused",
    ] as const) {
      expect(hasAppAccess({ paymentRequired: false, status })).toBe(true);
    }
    expect(hasAppAccess({ paymentRequired: false, status: null })).toBe(true);
  });
  it("gdy wymagana → dostęp tylko dla active/paused/past_due", () => {
    expect(hasAppAccess({ paymentRequired: true, status: "active" })).toBe(true);
    expect(hasAppAccess({ paymentRequired: true, status: "paused" })).toBe(true);
    expect(hasAppAccess({ paymentRequired: true, status: "past_due" })).toBe(true);
    for (const status of ["none", "incomplete", "canceled", "unpaid"] as const) {
      expect(hasAppAccess({ paymentRequired: true, status })).toBe(false);
    }
    expect(hasAppAccess({ paymentRequired: true, status: null })).toBe(false);
  });
});
