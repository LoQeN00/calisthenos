/**
 * Cookie name uses the `__Host-` prefix for defense in depth: the browser
 * refuses to accept the cookie if it lacks `Secure`, has a `Domain`, or has a
 * `Path` other than `/`. This means an attacker on a sibling subdomain cannot
 * inject a same-named cookie to confuse us.
 *
 * We always emit `Secure`. Modern browsers grant a localhost exception, so dev
 * over `http://localhost:3000` works. LAN testing over `http://192.168.x.y`
 * will NOT — use a reverse proxy with TLS (or ngrok) when testing on a phone
 * over the LAN.
 */
const COOKIE_NAME = "__Host-kth_session";

// Session ids are base64url (RFC 4648) — alphabet `A-Za-z0-9_-` is URL-safe by
// construction, so we don't URL-encode the value. If you change the session id
// format (e.g. to a JWT containing `=` or `;`), URL-encode here.
export function buildSetCookie(sessionId: string, expiresAt: Date): string {
  return [
    `${COOKIE_NAME}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ");
}

export function clearSessionCookie(): string {
  return buildSetCookie("", new Date(0));
}

export function parseSessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(/;\s*/)) {
    const [k, ...rest] = part.split("=");
    if (k === COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}
