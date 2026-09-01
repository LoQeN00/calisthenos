import { type LoaderFunctionArgs, redirect } from "react-router";
import { requireUser } from "~/lib/api/auth";
import { db } from "~/lib/db/client";
import { getEnv } from "~/lib/env";
import { upsertConnection } from "~/lib/google/connections";
import { exchangeCode, verifyState } from "~/lib/google/oauth";

const DEST = "/trener/integracje/google";
// Klucze/wartości query WYŁĄCZNIE ASCII — polskie znaki w nagłówku Location
// rzucają w undici/Node fetch Headers ("Invalid character in header content").
const CLEAR_NONCE =
  "goauth_nonce=; HttpOnly; SameSite=Lax; Path=/trener/integracje/google; Max-Age=0";

function readNonceCookie(request: Request): string | null {
  const m = (request.headers.get("Cookie") ?? "").match(/(?:^|;\s*)goauth_nonce=([^;]+)/);
  return m ? (m[1] ?? null) : null;
}

export async function loader(args: LoaderFunctionArgs) {
  const { user } = requireUser(args.context, { role: "trainer" });
  const url = new URL(args.request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieNonce = readNonceCookie(args.request);

  const fail = (reason: string) =>
    redirect(`${DEST}?error=${reason}`, { headers: { "Set-Cookie": CLEAR_NONCE } });

  if (url.searchParams.get("error") || !code || !state) return fail("denied");

  // Anty-CSRF: podpisany `state` z ważnym TTL + `nonce` zgodny z cookie z „Połącz".
  const parsed = verifyState(state, getEnv().SESSION_SECRET, Date.now());
  if (!parsed || !cookieNonce || parsed.nonce !== cookieNonce) return fail("state");

  try {
    const tokens = await exchangeCode(code); // rzuca, gdy brak scope calendar.events / refresh
    await upsertConnection(db, {
      trainerId: user.id, // połączenie zawsze dla ZALOGOWANEGO trenera
      googleEmail: tokens.email ?? "(polaczone)",
      tokens,
    });
    return redirect(`${DEST}?ok=1`, { headers: { "Set-Cookie": CLEAR_NONCE } });
  } catch {
    return fail("exchange");
  }
}

// Trasa wyłącznie loader-owa — zawsze przekierowuje, nigdy nie renderuje.
// RR7 nie wymaga default export dla tras z samym loaderem (resource routes),
// ale dodajemy minimalny komponent na wypadek SSR bez przekierowania.
export default function GoogleCallback() {
  return null;
}
