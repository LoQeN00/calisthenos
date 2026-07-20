import { describe, it, expect } from "vitest";
import {
  invoiceStatusLabel,
  invoiceStatusLabelKey,
  subscriptionPresentation,
  mapStripeStatus,
} from "~/lib/stripe/status";

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
    expect(subscriptionPresentation("active")).toMatchObject({ label: "Aktywna", tone: "ok" });
    expect(subscriptionPresentation("past_due")).toMatchObject({
      label: "Zaległość",
      tone: "warn",
    });
    expect(subscriptionPresentation("none")).toMatchObject({
      label: "Brak subskrypcji",
      tone: "neutral",
    });
    expect(subscriptionPresentation("canceled")).toMatchObject({
      label: "Anulowana",
      tone: "neutral",
    });
    expect(subscriptionPresentation("incomplete")).toMatchObject({
      label: "Nieukończona",
      tone: "warn",
    });
    expect(subscriptionPresentation("unpaid")).toMatchObject({
      label: "Nieopłacona",
      tone: "warn",
    });
    expect(subscriptionPresentation("paused")).toMatchObject({
      label: "Wstrzymana",
      tone: "neutral",
    });
  });

  it("zwraca poprawne labelKey dla każdego statusu subskrypcji", () => {
    expect(subscriptionPresentation("none").labelKey).toBe("platnosci:subStatus.none");
    expect(subscriptionPresentation("incomplete").labelKey).toBe("platnosci:subStatus.incomplete");
    expect(subscriptionPresentation("active").labelKey).toBe("platnosci:subStatus.active");
    expect(subscriptionPresentation("past_due").labelKey).toBe("platnosci:subStatus.past_due");
    expect(subscriptionPresentation("unpaid").labelKey).toBe("platnosci:subStatus.unpaid");
    expect(subscriptionPresentation("canceled").labelKey).toBe("platnosci:subStatus.canceled");
    expect(subscriptionPresentation("paused").labelKey).toBe("platnosci:subStatus.paused");
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

describe("invoiceStatusLabelKey", () => {
  it("zwraca poprawne klucze i18next dla znanych statusów faktury", () => {
    expect(invoiceStatusLabelKey("paid")).toBe("platnosci:invoiceStatus.paid");
    expect(invoiceStatusLabelKey("open")).toBe("platnosci:invoiceStatus.open");
    expect(invoiceStatusLabelKey("void")).toBe("platnosci:invoiceStatus.void");
    expect(invoiceStatusLabelKey("uncollectible")).toBe("platnosci:invoiceStatus.uncollectible");
    expect(invoiceStatusLabelKey("draft")).toBe("platnosci:invoiceStatus.draft");
    expect(invoiceStatusLabelKey("failed")).toBe("platnosci:invoiceStatus.failed");
  });
  it("nieznany status → null", () => {
    expect(invoiceStatusLabelKey("future_status_xyz")).toBeNull();
  });
});
