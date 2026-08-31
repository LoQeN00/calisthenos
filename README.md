# kalisthenos

Polish-language web app for calisthenics trainer ↔ trainee collaboration. Ships
trainer-facing exercise library, plan editor with versioning, workout logging
with per-set videos, body-photo gallery, and a PWA-installable trainee UI.

Spec: `docs/superpowers/specs/2026-05-23-kalisthenos-fullstack-v1-design.md`

---

## Quick start (local dev)

Postgres runs in Docker. The Node app runs on the host (HMR, easier debugging).
Required: Node 22+, npm, Docker Desktop.

### One-time setup

```bash
# 1) Start Postgres in the background.
docker compose up -d

# 2) Install JS deps.
npm install

# 3) Copy the env template and fill in real values.
cp .env.example .env
# .env already points at localhost:5432 for the Postgres above. Set
# SESSION_SECRET / FILE_SIGNING_SECRET to real random values:
#   openssl rand -base64 32
# Set SEED_TRAINER_EMAIL / SEED_TRAINER_PASSWORD / SEED_TRAINER_NAME — these
# bootstrap the first trainer account on an empty users table.

# 4) Apply migrations + seed the default trainer (no demo exercises seeded).
npm run db:migrate
npm run db:seed
```

The seed creates a trainer using the `SEED_TRAINER_*` values from your `.env`.
The exercise library starts empty — add categories and exercises through the UI.

### Run the app

```bash
npm run dev
```

→ Open **http://localhost:3000** and log in.

That's it. HMR is live; saves to `app/**/*.tsx` reload automatically.

### Screenshot-loop (dev/AI)

Wizualna pętla zwrotna do iteracji nad UI. Wymaga działającego Postgresa i dev
servera. Jednorazowo pobierz przeglądarkę Playwright: `npx playwright install chromium`.
`npm run shots` zrzuca cały manifest tras; `npm run shots -- /trener/biblioteka`
zrzuca pojedynczą trasę na desktop+mobile. PNG-i lądują w `screenshots/`
(gitignore). Logowanie używa `SEED_TRAINER_EMAIL` / `SEED_TRAINER_PASSWORD` z `.env`.

### Stop / reset

```bash
docker compose down       # stops Postgres (keeps data)
docker compose down -v    # stops Postgres AND wipes the volume
```

After `down -v` you'll need to re-run `npm run db:migrate` + `npm run db:seed`.
Set `SEED_TRAINER_*` in `.env` first — seed exits with an error if any are missing.

> **Cookie note**: sessions use the `__Host-` prefix and always set `Secure`.
> Browsers grant a localhost exception so `http://localhost:3000` works in dev.
> LAN testing on a phone over `http://192.168.x.y` will *not* — use ngrok (or
> Cloudflare Tunnel) to get an HTTPS URL.

---

## PWA install

The app is installable via any browser's "Add to Home Screen" / "Install" prompt
once you've visited it over HTTPS (or via the localhost exception). Static assets
are cached by a service worker; signed file URLs and SSR routes always hit the
network. Manifest at `/manifest.webmanifest`, icon at `/icon.svg`.

For production icons, generate 192×192 and 512×512 PNGs and add them to
`public/` + the manifest. The included SVG icon is acceptable for most browsers
but Apple touch icons are best as PNG.

---

## Production deploy (Railway)

`railway.toml` ships preconfigured for Railway. The `Dockerfile` is multi-stage
and runs the server as the unprivileged `node` user. Railway picks it up
automatically; `docker-compose.yml` is only for local Postgres and is not used
in production.

Required env vars on Railway:

| Variable | Value |
|---|---|
| `DATABASE_URL` | from the Postgres service binding |
| `SESSION_SECRET` | 32+ random chars — `openssl rand -base64 32` |
| `FILE_SIGNING_SECRET` | 32+ random chars |
| `BASE_URL` | `https://<your-railway-domain>` |
| `DATA_DIR` | `/data` (mount a Railway volume) |
| `NODE_ENV` | `production` |
| `API_URL` | backend URL (Railway private network, if available) |
| `API_PUBLIC_URL` | public backend URL, for `<img>`/`<video>` `src`; defaults to `API_URL` |
| `GITHUB_TOKEN` | build-time only — `read:packages` (private `@kalisthenos/api-client`) |
| `SEED_TRAINER_EMAIL` | bootstrap trainer email |
| `SEED_TRAINER_PASSWORD` | strong password (≥8 chars; change after first login) |
| `SEED_TRAINER_NAME` | trainer's display name |

Set the volume mount inside the service config — uploads live at `DATA_DIR`.

> **Healthcheck:** `healthcheckPath` points at `/healthz` — a resource route
> that returns a bare `200`. Do **not** point it back at `/`: the index route
> always redirects, and Railway treats any non-200 (302 included) as
> `failed with service unavailable`, so the deploy never goes live even though
> the container is serving fine. Guarded by `app/routes/healthz.test.ts`.

> **Migrations are NOT applied by the deploy.** Railway's `startCommand` in
> `railway.toml` *replaces* the Dockerfile `CMD`, so the image's
> `db:migrate && db:seed` chain never runs in production — only `npm run start`
> does. Apply pending migrations yourself against the Railway database
> (`DATABASE_URL=<railway url> npm run db:migrate`) **before** deploying code
> that depends on them, otherwise the new build boots against an old schema and
> the affected routes return 500. Same for `npm run db:seed` — it is a one-off
> trainer bootstrap, and the only thing the `SEED_TRAINER_*` vars above are for.

> **Managed Postgres note:** the first migration runs
> `CREATE EXTENSION IF NOT EXISTS citext;`, which requires superuser-equivalent
> privileges. Railway grants the bound role enough rights — verify by checking
> the output of that manual run.

---

## Integracja Google (opcjonalna)

Trener może połączyć konto Google Calendar — konsultacje są wtedy automatycznie
synchronizowane jako zdarzenia z Meet linkiem. Aplikacja działa w pełni bez tej
integracji (wyłączona, gdy brakuje zmiennych).

### Konfiguracja Google Cloud

1. Utwórz projekt w [Google Cloud Console](https://console.cloud.google.com/).
2. **OAuth consent screen** → External; dodaj scope `https://www.googleapis.com/auth/calendar.events` oraz `openid` i `email` (potrzebne do etykiety konta po połączeniu).
3. **Credentials → OAuth 2.0 Client ID** → typ: Web; dodaj **Authorized redirect URI**:
   ```
   ${BASE_URL}/trener/integracje/google/callback
   ```
4. Skopiuj `Client ID` i `Client Secret`.

### Klucz szyfrowania tokenów

Tokeny OAuth są szyfrowane at-rest (AES-256-GCM). Wygeneruj klucz:

```bash
openssl rand -base64 32
```

### Zmienne środowiskowe

Dodaj do `.env` (lokalnie) lub do ustawień serwisu na Railway:

| Zmienna | Wartość |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID z Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Client Secret z Google Cloud |
| `GOOGLE_REDIRECT_URI` | `${BASE_URL}/trener/integracje/google/callback` |
| `GOOGLE_TOKEN_ENC_KEY` | wynik `openssl rand -base64 32` |

Bez tych zmiennych aplikacja działa normalnie — widok `/trener/integracje/google`
informuje o braku konfiguracji i nie pokazuje przycisku „Połącz".

---

## Płatności (Stripe) (opcjonalna)

Trener łączy własne konto Stripe (Connect Express) i ustala podopiecznemu
miesięczną kwotę prowadzenia. Podopieczny opłaca subskrypcję przez **Stripe
Checkout**, zarządza nią w **Customer Portal**, a historia płatności jest
aktualizowana webhookiem. Funkcja jest **opcjonalna** — bez kluczy aplikacja
działa normalnie (widoki płatności informują o braku konfiguracji). **Żadne dane
kart nie są przechowywane u nas** — Checkout i Portal są hostowane przez Stripe.

> **Najpierw uruchom migrację** (płatności dodają tabele Stripe):
> ```bash
> npm run db:migrate
> ```

### Zmienne środowiskowe

| Zmienna | Wartość |
|---|---|
| `STRIPE_SECRET_KEY` | klucz tajny platformy (w trybie testowym `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | sekret podpisu webhooka konta (`whsec_…`, scope „Your account") — patrz niżej |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | sekret podpisu webhooka kont połączonych (`whsec_…`, scope „Connected accounts") — patrz niżej |

Połączenia kont trenerów i onboarding działają w **trybie testowym** Stripe
(test mode) — używaj kluczy `sk_test_…` i kart testowych Stripe.

### Webhook lokalnie (Stripe CLI)

Zainstaluj [Stripe CLI](https://stripe.com/docs/stripe-cli), zaloguj się
(`stripe login`) i przekieruj zdarzenia na lokalny endpoint:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

`stripe listen` wypisze sekret podpisu (`whsec_…`) — wpisz go do
`STRIPE_WEBHOOK_SECRET` w `.env` i zrestartuj dev server.

### Webhooki na produkcji (panel Stripe → Workbench → Webhooks / Event destinations)

Model Connect z destination charges wymaga **dwóch event destinations** na ten sam URL
`https://<domena>/webhooks/stripe` (zdarzenia billingowe powstają na koncie platformy,
a `account.updated` na kontach połączonych). Każdy destination ma własny sekret podpisu;
aplikacja weryfikuje oba (`verifyAndParse`).

1. **Destination „Your account"** — zdarzenia: `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `checkout.session.completed`. Sekret → `STRIPE_WEBHOOK_SECRET`.
2. **Destination „Connected accounts"** — zdarzenie: `account.updated`
   (aktualizuje `chargesEnabled` trenera; Express weryfikuje asynchronicznie, więc to ono,
   nie powrót z onboardingu, jest źródłem prawdy). Sekret → `STRIPE_CONNECT_WEBHOOK_SECRET`.

Dla obu ustaw wersję API endpointu na **`2026-05-27.dahlia`** (spójną z SDK). Sekrety wpisz
w env serwisu na Railway i zrestartuj.

### Konfiguracja w panelu Stripe (właściciel)

- **Smart Retries (dunning):** ustaw 8 prób w ciągu 2 tygodni, stan końcowy `cancel` — Billing → Revenue recovery → Retries.
- **Customer Portal:** włącz aktualizację metody płatności i anulowanie subskrypcji.
- (Opcjonalnie) włącz wbudowane e-maile Stripe o nieudanej płatności.

### SCA / zgodność (EU/PL)

- Stripe Checkout wymusza 3D Secure na pierwszej płatności i ustanawia zgodę na płatności cykliczne. Nie zapisujemy karty poza Checkout (brak SetupIntent). Odnowienia o stałej kwocie/interwale są zwolnione z SCA; zmiana kwoty lub proracja może ponownie wymagać 3DS — dlatego zmiana ceny aktywnej subskrypcji wchodzi w życie od następnego odnowienia.
- **Nota prawna:** obowiązki VAT/e-faktur w PL (platforma jako merchant-of-record) oraz wymagane prawem powiadomienia o nadchodzącym obciążeniu wymagają potwierdzenia z księgową/prawnikiem — poza zakresem implementacji.

### Dostęp = opłacona subskrypcja (gating)

- Podopieczny ma dostęp do aplikacji **tylko z aktywną subskrypcją**. Po rejestracji
  z zaproszenia trafia na pełnoekranowy ekran aktywacji (`/podopieczny/aktywuj`,
  poza layoutem) i bez opłacenia nie wchodzi do panelu. Gating jest **ciągły** —
  wygaśnięcie subskrypcji odbiera dostęp (kolejna nawigacja → ekran aktywacji).
- Statusy dające dostęp: **active, paused, past_due** (grace — pojedyncza nieudana
  płatność w oknie dunningu nie wyrzuca od razu; dostęp znika przy `canceled`/`unpaid`).
- **Gating działa tylko, gdy płatność jest realnie możliwa** (Stripe skonfigurowany
  + trener `chargesEnabled` + ustalona kwota). Gdy trener nie skonfigurował płatności —
  podopieczny ma pełny dostęp (nie zamykamy go w pułapce). Pauza zachowuje dostęp.
- Predykat: `app/lib/stripe/access.ts` (`paymentRequired`, `hasAppAccess`), egzekwowany
  w loaderze `app/routes/podopieczny/_layout.tsx`.

---

## Useful commands

```bash
npm run dev           # vite + react-router dev server (HMR)
npm run build         # production build → ./build/
npm run start         # serve production build (used by Docker/Railway)
npm run typecheck     # tsc --noEmit
npm run lint          # biome lint
npm run format        # biome format --write
npm test              # vitest unit tests (watch)
npm run test:unit     # vitest run, excludes *.itest.ts
npm run test:itest    # integration tests (*.itest.ts) — needs Docker/Postgres (testcontainers)
npm run e2e           # playwright E2E — needs the app running
npm run shots         # screenshot-loop: zrzuty realnych tras (desktop+mobile) do screenshots/
npm run db:generate   # diff schema.ts → produce next migration .sql
npm run db:migrate    # apply pending migrations
npm run db:seed       # bootstrap default trainer from SEED_TRAINER_* envs (only if users table empty)
npm run db:studio     # drizzle studio (browse data in a GUI)
```

---

## Security posture (V1)

- Session cookies: `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`.
- Passwords: Argon2id (OWASP-2023 floor).
- Invite tokens: 32-byte random, SHA-256 hashed at rest, 14-day TTL, used-once.
- File serving: HMAC-signed short-lived URLs scoped to the requesting user,
  re-verified against tenant scope server-side.
- File uploads: magic-byte verification (`file-type`) on top of MIME allow-list.
- Multi-tenant: `trainer_id` on every domain row, repository functions take
  required `trainerId` parameter.
- HTTP headers: CSP, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS (in prod).
- Sessions: lazy hourly prune of expired rows.

---

## Project structure

```
app/                  # React Router v7 framework-mode source
  root.tsx
  routes.ts
  routes/             # file-based routes
  components/         # shared UI (PhotoCard…)
  lib/
    auth/             # session, password, cookie, invite, requireUser
    db/               # drizzle client + schema + migrations
    storage/          # FileStorage interface + LocalVolumeStorage
    body-photos.ts
    file-uploads.ts
    files.ts
    plans.ts
    plan-types.ts
    workouts.ts
    exercises.ts
    authz.ts
    env.ts
    format.ts
  styles/tokens.css
scripts/
  seed.ts             # idempotent seed: default trainer only (no demo exercises)
public/
  icon.svg
  manifest.webmanifest
prototype/            # original React+Babel single-page prototype (reference)
docs/superpowers/     # spec + plans
docker-compose.yml    # postgres only (local dev)
Dockerfile            # multi-stage; non-root runtime (Railway uses this)
railway.toml
```
