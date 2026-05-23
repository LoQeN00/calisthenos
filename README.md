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
| `SEED_TRAINER_EMAIL` | bootstrap trainer email |
| `SEED_TRAINER_PASSWORD` | strong password (≥8 chars; change after first login) |
| `SEED_TRAINER_NAME` | trainer's display name |

Set the volume mount inside the service config — uploads live at `DATA_DIR`.

> **Managed Postgres note:** the first migration runs
> `CREATE EXTENSION IF NOT EXISTS citext;`, which requires superuser-equivalent
> privileges. Railway grants the bound role enough rights — verify by checking
> migration logs on first deploy.

---

## Useful commands

```bash
npm run dev           # vite + react-router dev server (HMR)
npm run build         # production build → ./build/
npm run start         # serve production build (used by Docker/Railway)
npm run typecheck     # tsc --noEmit
npm run lint          # biome lint
npm run format        # biome format --write
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
