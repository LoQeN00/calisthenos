import { describe, expect, it } from "vitest";
import { signState, verifyState } from "~/lib/google/oauth";

const SECRET = "test-session-secret-at-least-32-bytes-long!!";

describe("OAuth state (CSRF: nonce + TTL)", () => {
  it("verify(sign) zwraca nonce dla ważnego state", () => {
    const s = signState("nonce-abc", 9_999_999_999_999, SECRET);
    expect(verifyState(s, SECRET, 0)?.nonce).toBe("nonce-abc");
  });

  it("wygasły state → null", () => {
    const s = signState("nonce-abc", 1000, SECRET);
    expect(verifyState(s, SECRET, 2000)).toBeNull();
  });

  it("zła sygnatura → null", () => {
    const s = signState("nonce-abc", 9_999_999_999_999, SECRET);
    const tampered = `${s.split(".")[0]}.deadbeef`;
    expect(verifyState(tampered, SECRET, 0)).toBeNull();
  });

  it("inny sekret → null", () => {
    const s = signState("nonce-abc", 9_999_999_999_999, SECRET);
    expect(verifyState(s, "different-secret-different-secret-xx", 0)).toBeNull();
  });

  it("malformed → null", () => {
    expect(verifyState("garbage", SECRET, 0)).toBeNull();
  });
});
