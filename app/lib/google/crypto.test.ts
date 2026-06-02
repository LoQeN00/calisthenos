import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

// Klucz testowy MUSI być ustawiony zanim crypto.ts go odczyta (lazy w key()).
beforeAll(() => {
  process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(32).toString("base64");
});

import { decryptToken, encryptToken } from "~/lib/google/crypto";

describe("token crypto (AES-256-GCM)", () => {
  it("round-trip: decrypt(encrypt(x)) === x", () => {
    const secret = "1//0gFsecret-refresh-token-value";
    expect(decryptToken(encryptToken(secret))).toBe(secret);
  });

  it("dwa szyfrogramy tej samej wartości różnią się (losowy IV)", () => {
    const a = encryptToken("same");
    const b = encryptToken("same");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("same");
    expect(decryptToken(b)).toBe("same");
  });

  it("manipulacja szyfrogramem rzuca (tag GCM)", () => {
    const blob = encryptToken("tamper-me");
    const [iv, tag, data] = blob.split(".");
    const broken = `${iv}.${tag}.${Buffer.from("zzzz").toString("base64")}`;
    expect(() => decryptToken(broken)).toThrow();
  });
});
