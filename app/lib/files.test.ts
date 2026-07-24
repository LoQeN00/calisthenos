import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/env", () => ({
  getEnv: () => ({ FILE_SIGNING_SECRET: "x".repeat(32) }),
}));

import {
  FILE_URL_BUCKET_SECONDS,
  extForMime,
  fileUrlExp,
  signFileUrl,
  verifyFileUrl,
} from "./files";

const HOUR = 3600;
const DAY = 24 * HOUR;

describe("fileUrlExp — kubełkowanie znacznika wygaśnięcia", () => {
  // Sedno: `exp` MUSI być stałe w obrębie kubełka, inaczej każdy render generuje
  // inny URL, klucz cache przeglądarki się zmienia i ten sam plik jest pobierany
  // od nowa przy każdym wejściu na stronę.
  it("zwraca ten sam exp dla dwóch chwil w tym samym kubełku", () => {
    const bucket = FILE_URL_BUCKET_SECONDS * 1000;
    const bucketStartMs = Math.floor(1_700_000_000_000 / bucket) * bucket;

    const a = fileUrlExp(bucketStartMs + 1_000);
    const b = fileUrlExp(bucketStartMs + bucket - 1_000);

    expect(a).toBe(b);
  });

  it("zwraca różny exp po przejściu do kolejnego kubełka", () => {
    const bucket = FILE_URL_BUCKET_SECONDS * 1000;
    const bucketStartMs = Math.floor(1_700_000_000_000 / bucket) * bucket;

    const a = fileUrlExp(bucketStartMs + 1_000);
    const b = fileUrlExp(bucketStartMs + bucket + 1_000);

    expect(b).toBeGreaterThan(a);
    expect(b - a).toBe(FILE_URL_BUCKET_SECONDS);
  });

  it("zawsze daje co najmniej 24 h ważności, licząc od chwili podpisania", () => {
    const bucket = FILE_URL_BUCKET_SECONDS * 1000;
    const bucketStartMs = Math.floor(1_700_000_000_000 / bucket) * bucket;

    // Najgorszy przypadek: podpisujemy na samym końcu kubełka.
    const nowMs = bucketStartMs + bucket - 1;
    const exp = fileUrlExp(nowMs);

    expect(exp - Math.floor(nowMs / 1000)).toBeGreaterThanOrEqual(DAY);
  });

  it("nie wydłuża ważności ponad 24 h + długość kubełka", () => {
    const bucket = FILE_URL_BUCKET_SECONDS * 1000;
    const bucketStartMs = Math.floor(1_700_000_000_000 / bucket) * bucket;

    // Najhojniejszy przypadek: podpisujemy na samym początku kubełka.
    const exp = fileUrlExp(bucketStartMs);

    expect(exp - Math.floor(bucketStartMs / 1000)).toBeLessThanOrEqual(
      DAY + FILE_URL_BUCKET_SECONDS,
    );
  });
});

describe("signFileUrl / verifyFileUrl", () => {
  it("generuje identyczny URL dla dwóch renderów w tym samym kubełku", () => {
    // `signFileUrl` celowo nie przyjmuje czasu (patrz komentarz w files.ts) —
    // determinizm bierzemy z zegara systemowego.
    const bucket = FILE_URL_BUCKET_SECONDS * 1000;
    const bucketStartMs = Math.floor(1_700_000_000_000 / bucket) * bucket;

    vi.useFakeTimers();
    try {
      vi.setSystemTime(bucketStartMs + 1_000);
      const first = signFileUrl("file-1", "user-1");
      vi.setSystemTime(bucketStartMs + bucket - 1_000);
      const second = signFileUrl("file-1", "user-1");

      expect(first).toBe(second);
    } finally {
      vi.useRealTimers();
    }
  });

  it("generuje różny URL po przejściu do kolejnego kubełka", () => {
    const bucket = FILE_URL_BUCKET_SECONDS * 1000;
    const bucketStartMs = Math.floor(1_700_000_000_000 / bucket) * bucket;

    vi.useFakeTimers();
    try {
      vi.setSystemTime(bucketStartMs + 1_000);
      const first = signFileUrl("file-1", "user-1");
      vi.setSystemTime(bucketStartMs + bucket + 1_000);
      const second = signFileUrl("file-1", "user-1");

      expect(first).not.toBe(second);
    } finally {
      vi.useRealTimers();
    }
  });

  it("podpis wygenerowany dla jednego użytkownika nie przechodzi u innego", () => {
    const url = signFileUrl("file-1", "user-1");
    const params = new URL(url, "https://example.test").searchParams;
    const exp = Number(params.get("exp"));
    const sig = params.get("sig") ?? "";

    expect(verifyFileUrl("file-1", exp, sig, "user-1")).toBe(true);
    expect(verifyFileUrl("file-1", exp, sig, "user-2")).toBe(false);
  });

  it("podpis nie przechodzi dla innego pliku", () => {
    const url = signFileUrl("file-1", "user-1");
    const params = new URL(url, "https://example.test").searchParams;
    const exp = Number(params.get("exp"));
    const sig = params.get("sig") ?? "";

    expect(verifyFileUrl("file-2", exp, sig, "user-1")).toBe(false);
  });

  it("odrzuca podpis po upływie exp", () => {
    const url = signFileUrl("file-1", "user-1");
    const params = new URL(url, "https://example.test").searchParams;
    const sig = params.get("sig") ?? "";
    const expired = Math.floor(Date.now() / 1000) - 1;

    expect(verifyFileUrl("file-1", expired, sig, "user-1")).toBe(false);
  });
});

describe("extForMime", () => {
  it("mapuje dozwolone typy na rozszerzenia", () => {
    expect(extForMime("video/mp4")).toBe("mp4");
    expect(extForMime("video/quicktime")).toBe("mov");
    expect(extForMime("image/jpeg")).toBe("jpg");
  });

  it("rzuca dla nieobsługiwanego typu", () => {
    expect(() => extForMime("application/pdf")).toThrow();
  });
});
