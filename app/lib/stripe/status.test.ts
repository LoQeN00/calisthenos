import { describe, it, expect } from "vitest";
import { invoiceStatusLabel, subscriptionPresentation, mapStripeStatus } from "~/lib/stripe/status";

describe("mapStripeStatus", () => {
  it("mapuje znane statusy Stripe na nasz enum", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("past_due")).toBe("past_due");
    expect(mapStripeStatus("canceled")).toBe("canceled");
    expect(mapStripeStatus("trialing")).toBe("active");
    expect(mapStripeStatus("incomplete_expired")).toBe("canceled");
  });
  it("mapuje pozostałe znane statusy Stripe", () => {
    expect(mapStripeStatus("unpaid")).toBe("unpaid");
    expect(mapStripeStatus("incomplete")).toBe("incomplete");
    expect(mapStripeStatus("paused")).toBe("paused");
  });
  it("nieznany status → 'incomplete' (bezpieczny domyślny)", () => {
    expect(mapStripeStatus("future_status_xyz")).toBe("incomplete");
  });
});

describe("subscriptionPresentation", () => {
  it("daje polską etykietę i ton dla statusu", () => {
    expect(subscriptionPresentation("active")).toEqual({ label: "Aktywna", tone: "ok" });
    expect(subscriptionPresentation("past_due")).toEqual({ label: "Zaległość", tone: "warn" });
    expect(subscriptionPresentation("none")).toEqual({
      label: "Brak subskrypcji",
      tone: "neutral",
    });
    expect(subscriptionPresentation("canceled")).toEqual({ label: "Anulowana", tone: "neutral" });
    expect(subscriptionPresentation("incomplete")).toEqual({ label: "Nieukończona", tone: "warn" });
    expect(subscriptionPresentation("unpaid")).toEqual({ label: "Nieopłacona", tone: "warn" });
    expect(subscriptionPresentation("paused")).toEqual({ label: "Wstrzymana", tone: "neutral" });
  });
});

describe("invoiceStatusLabel", () => {
  it("mapuje znane statusy faktury na polskie etykiety", () => {
    expect(invoiceStatusLabel("paid")).toBe("Opłacona");
    expect(invoiceStatusLabel("open")).toBe("Oczekująca");
    expect(invoiceStatusLabel("void")).toBe("Anulowana");
    expect(invoiceStatusLabel("uncollectible")).toBe("Nieściągalna");
    expect(invoiceStatusLabel("draft")).toBe("Szkic");
    expect(invoiceStatusLabel("failed")).toBe("Nieudana");
  });
  it("nieznany status przechodzi bez zmian", () => {
    expect(invoiceStatusLabel("future_status_xyz")).toBe("future_status_xyz");
  });
});
