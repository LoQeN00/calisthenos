import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { getEnv } from "~/lib/env";

/** Scope: tworzenie/edycja zdarzeń (Meet) + odczyt e-maila konta (etykieta w UI). */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const GOOGLE_SCOPES = [GOOGLE_CALENDAR_SCOPE, "openid", "email"];

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export interface OAuthState {
  nonce: string;
  exp: number; // ms epoch — TTL state (anty-replay)
}

/** Wysokoentropijny nonce wiązany z cookie przeglądarki (anty-CSRF / login-CSRF). */
export function newNonce(): string {
  return randomBytes(16).toString("base64url");
}

/** Podpisuje `state` = base64url({nonce,exp}).hmac. */
export function signState(nonce: string, expMs: number, secret: string): string {
  const payload = b64url(JSON.stringify({ nonce, exp: expMs }));
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * Weryfikuje podpis HMAC + TTL; zwraca {nonce,exp} albo null.
 * Porównanie `nonce` z cookie (anty-CSRF) robi callback — sam podpis nie wystarcza.
 */
export function verifyState(state: string, secret: string, nowMs: number): OAuthState | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (!parsed.nonce || typeof parsed.exp !== "number" || parsed.exp < nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Buduje OAuth2Client z env. Rzuca, gdy integracja nieskonfigurowana. */
export function oauthClient(): OAuth2Client {
  const e = getEnv();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET || !e.GOOGLE_REDIRECT_URI) {
    throw new Error("Google OAuth env not configured");
  }
  return new OAuth2Client(e.GOOGLE_CLIENT_ID, e.GOOGLE_CLIENT_SECRET, e.GOOGLE_REDIRECT_URI);
}

/** URL zgody (offline + wymuszony consent → refresh token). */
export function consentUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string;
  expiryDate: number; // ms epoch
  scope: string;
  email: string | null; // z id_token — etykieta podpiętego konta
}

/** Dekoduje payload id_token (JWT z zaufanej odpowiedzi getToken; bez weryfikacji podpisu). */
function decodeIdTokenEmail(idToken: string | null | undefined): string | null {
  const part = idToken?.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Wymienia `code` na tokeny. Rzuca, gdy brak refresh_token (re-consent) LUB gdy
 * użytkownik nie nadał scope `calendar.events` (granularna zgoda Google).
 */
export async function exchangeCode(code: string): Promise<ExchangedTokens> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new Error("Google did not return a refresh token (re-consent required)");
  }
  const scope = tokens.scope ?? "";
  if (!scope.split(/\s+/).includes(GOOGLE_CALENDAR_SCOPE)) {
    throw new Error("Brak zgody na kalendarz (scope calendar.events) — połączenie odrzucone.");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date,
    scope,
    email: decodeIdTokenEmail(tokens.id_token),
  };
}
