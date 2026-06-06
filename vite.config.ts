import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    reactRouter(),
    VitePWA({
      // We ship the manifest as a static file under `public/`, not generated.
      manifest: false,
      // Auto-update the service worker when a new build is deployed.
      registerType: "autoUpdate",
      // Inject the SW registration into the client bundle. The SW file is
      // emitted at `/sw.js`.
      injectRegister: "auto",
      filename: "sw.js",
      strategies: "generateSW",
      workbox: {
        // Precache hashed client assets (JS, CSS, SVG). The set is computed at
        // build time from Vite's manifest.
        globPatterns: ["**/*.{js,css,svg,ico,woff,woff2}"],
        // Don't try to precache SSR HTML — it's per-user and per-request.
        navigateFallback: null,
        // File serving routes carry signed URLs; never cache.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/files/"),
            handler: "NetworkOnly",
          },
        ],
        // RR7 routes are SSR'd; static asset cache shouldn't take over.
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        // Don't run the SW in dev — too disruptive while iterating.
        enabled: false,
      },
    }),
  ],
  server: { port: 3000 },
  // `@node-rs/argon2` jest modułem natywnym, używanym WYŁĄCZNIE po stronie serwera
  // (hashowanie haseł w `app/lib/auth`). RR7 poprawnie wycina go z bundla klienta w
  // produkcji, ale skaner zależności dev-servera potrafi pójść po surowych importach
  // i próbować zresolować jego gałąź `browser.js` (`@node-rs/argon2-wasm32-wasi`),
  // co wywraca leniwe ładowanie modułu trasy. Wykluczamy go z optymalizacji klienta.
  optimizeDeps: { exclude: ["@node-rs/argon2"] },
  resolve: {
    alias: { "~": fileURLToPath(new URL("./app", import.meta.url)) },
  },
});
