import "~/styles/tokens.css";
import { data, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { useTranslation } from "react-i18next";
import { ConfirmProvider } from "~/components/confirm-provider";
import { ToastProvider } from "~/components/toast-provider";
import { maybePruneExpiredSessions } from "~/lib/auth/session";
import { db } from "~/lib/db/client";
import { i18nServer, localeCookie } from "~/i18n.server";

export async function loader({ request }: { request: Request }) {
  // Lazy background prune: at most once an hour per process, fire-and-forget.
  maybePruneExpiredSessions(db);
  const lng = await i18nServer.getLocale(request);
  return data({ lng }, { headers: { "Set-Cookie": await localeCookie.serialize(lng) } });
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
  const { i18n } = useTranslation();
  return (
    <html lang={i18n.language}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0E1116" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="calisthenos" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <Meta />
        <Links />
        {/* No-FOUC theme initializer — reads the `theme` cookie set by the
            UserMenu toggle and applies the dark class synchronously before
            the page paints. Allowed by CSP (`script-src 'unsafe-inline'`). */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: tiny synchronous init that has to run before paint.
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]+)/);if(m&&m[1]==='dark'){document.documentElement.classList.add('theme-dark');}}catch(_){}})();",
          }}
        />
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
