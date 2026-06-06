import { describe, expect, it, vi } from "vitest";

// NIE mockujemy ~/lib/stripe/client — używamy realnego SDK. `constructEvent` i
// `generateTestHeaderString` to czysta kryptografia HMAC (zero sieci). Mockujemy env,
// by dostarczyć oba sekrety + klucz API (klucz nie jest używany przy weryfikacji podpisu).
vi.mock("~/lib/env", () => ({
  getEnv: () => ({
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_account",
    STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_connect",
  }),
}));

import Stripe from "stripe";
import { STRIPE_API_VERSION } from "~/lib/stripe/client";
import { verifyAndParse } from "~/lib/stripe/webhook";

const stripe = new Stripe("sk_test_dummy", { apiVersion: STRIPE_API_VERSION });

function signed(payload: string, secret: string): string {
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

const PAYLOAD = JSON.stringify({
  id: "evt_1",
  type: "account.updated",
  data: { object: { id: "acct_1" } },
});

describe("verifyAndParse — wiele sekretów (account + Connect)", () => {
  it("akceptuje podpis sekretem konta", () => {
    const ev = verifyAndParse(PAYLOAD, signed(PAYLOAD, "whsec_account"));
    expect(ev.id).toBe("evt_1");
  });

  it("akceptuje podpis sekretem Connect", () => {
    const ev = verifyAndParse(PAYLOAD, signed(PAYLOAD, "whsec_connect"));
    expect(ev.id).toBe("evt_1");
  });

  it("odrzuca podpis nieznanym sekretem", () => {
    expect(() => verifyAndParse(PAYLOAD, signed(PAYLOAD, "whsec_obcy"))).toThrow();
  });
});
