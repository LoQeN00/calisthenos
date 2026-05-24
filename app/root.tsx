import "~/styles/tokens.css";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { ConfirmProvider } from "~/components/confirm-provider";
import { ToastProvider } from "~/components/toast-provider";
import { maybePruneExpiredSessions } from "~/lib/auth/session";
import { db } from "~/lib/db/client";

export async function loader() {
  // Lazy background prune: at most once an hour per process, fire-and-forget.
  maybePruneExpiredSessions(db);
  return null;
}

/**
 * Security headers applied to every HTML response.
 *
 * CSP notes:
 * - `script-src 'self' 'unsafe-inline'`: React Router injects an inline
 *   bootstrap script with hydration data. A nonce-based CSP would be tighter
 *   but requires server plumbing. V1 ships with `unsafe-inline`.
 * - `img-src 'self' data: blob:`: data: for inline SVGs we may add; blob: for
 *   the body-photo crop tools later.
 * - `media-src 'self'`: per-set videos served from our own /files route.
 * - Google Fonts is allow-listed under style-src/font-src.
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function headers(): Record<string, string> {
  return {
    "Content-Security-Policy": CSP_DIRECTIVES,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    // HSTS only meaningful over HTTPS; harmless over http (browsers ignore it).
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0E1116" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="kalisthenos" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <Meta />
        <Links />
      </head>
      <body>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
