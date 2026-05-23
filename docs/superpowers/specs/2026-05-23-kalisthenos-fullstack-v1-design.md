# Kalisthenos V1 — Fullstack Design Spec

**Status:** Draft — awaiting user review
**Author:** Mateusz Kozłowski (with Claude)
**Date:** 2026-05-23
**Supersedes:** the in-repo React+Babel prototype (`app.jsx`, `data.jsx`, `store.jsx`, etc.)

---

## 1. Goal & non-goals

### Goal
Take the existing single-page React prototype of kalisthenos (a calisthenics training app for trainer ↔ trainee collaboration) and ship a production-grade, multi-tenant V1 covering every feature of the prototype, but with:

- real persistence (Postgres instead of localStorage),
- proper authentication and per-tenant authorization,
- real file uploads for exercise demo videos, per-set videos and body photos,
- a mobile-first PWA experience for the trainee, a desktop experience for the trainer,
- a foundation that scales from V1's two users (one trainer + one trainee) to many trainers without a data-model migration.

### Non-goals for V1
- Self-service signup for new trainers. Trainers are added by hand directly in DB / admin task.
- Public marketing site, billing, plan tiers.
- Email sending of any kind. Invite links and password resets are copied by the trainer and shared out-of-band (Signal, WhatsApp, in person).
- Background workers, queues, transcoding, image resizing. All work is synchronous in V1.
- CDN. Files are served by the app from a Railway volume.
- Offline-first workout logging. PWA installs and caches static assets; mutations require connectivity.
- Internationalization. Polish only. Strings are inline in components; no i18n library.
- Native mobile apps. PWA-installable web only.

These are deliberate cuts to keep V1 finishable. Each has a migration path noted in §16.

---

## 2. Audience and tenancy model

V1 has exactly two production users:

- **Adam Niedźwiedź** — the trainer
- **Mateusz Kozłowski** — the trainee (also the author of the system)

However, the data model and authorization layer treat every trainer as a tenant from day one, so that adding more trainers later is purely a matter of creating rows. Concretely:

- Every domain table (exercises, plans, plan_sessions, workout_logs, body_photos, files, …) carries a `trainer_id` column.
- All read and write queries that touch tenant-scoped tables go through repository functions that take a required `trainerId` parameter; TypeScript prevents the parameter being forgotten.
- An integration test suite verifies that a trainer cannot read or mutate another trainer's data even via direct URL access.
- Postgres Row-Level Security (RLS) is **not** used in V1 — it would require setting a session GUC per request, which adds plumbing. We rely on the app-level repository discipline plus tests. RLS is a candidate hardening step for V2 (§16).

A trainee belongs to exactly one trainer. There is no "trainee shared between trainers" use case in V1.

---

## 3. Tech stack summary

| Layer | Choice | Why |
|---|---|---|
| Web framework | **React Router v7** in framework mode | React-based → maximum reuse of the prototype's components, icons and styles. Loaders/actions on routes give us a clean data-fetch / mutation model without a separate API layer. The canonical successor to Remix v2. |
| Language | **TypeScript** (strict) | Multi-tenant code needs the type system to catch missing tenant scoping. |
| ORM | **Drizzle ORM** | Type-safe, no codegen, simple SQL-shaped API. Good migration story via Drizzle Kit. |
| Database | **Postgres 16** | Standard relational store. Will use JSONB only for tag arrays — everything else relational. |
| Auth | **Custom session-cookie auth** | ~200 lines. Argon2id password hashing (`hash-wasm` or `@node-rs/argon2`). HMAC-signed cookie via Remix-style `createCookieSessionStorage` (RR7 ships this). No external auth dep. |
| File hosting | **Railway persistent volume** mounted at `/data`, served by the app | One account, one bill. Range-request streaming for video, HMAC-signed URLs for authorization. CDN migration path is well-isolated (§10). |
| Hosting | **Railway** | App service + Postgres + Volume in one project, EU region. |
| Frontend bundler | Built-in to React Router v7 (Vite) | No custom config needed for V1. |
| PWA | `vite-plugin-pwa` | Service worker for static asset caching + installability. No offline data sync. |
| Tests | **Vitest** for unit/integration, **Playwright** for E2E happy-path | Skip-test gates protect critical paths (auth, plan publish, log create). |
| Linting/format | **Biome** | Single tool for lint + format, very fast, fewer config files than eslint+prettier. |
| Error tracking | **Sentry** (free tier) | Browser + server errors, source maps. |
| Logs | stdout JSON → Railway log viewer | No external aggregator in V1. |
| Date/time | Native `Intl.DateTimeFormat` with `pl-PL` locale | The prototype's `fmtDate`, `daysAgo` helpers port over directly. |

---

## 4. High-level architecture

```
┌──────────────────────────────────────────────────────────┐
│  Railway project (region EU)                             │
│                                                          │
│  ┌─────────────────────────────┐  ┌──────────────────┐   │
│  │  app service (Node 22)      │  │  Postgres 16     │   │
│  │  React Router v7 framework  │◄─┤  (Railway mgd)   │   │
│  │   - SSR (loaders/actions)   │  └──────────────────┘   │
│  │   - Cookie sessions         │                         │
│  │   - HMAC-signed file URLs   │  ┌──────────────────┐   │
│  │   - File streaming (Range)  │◄─┤  Volume 50GB     │   │
│  │   - Service worker (PWA)    │  │  /data/uploads   │   │
│  └─────────────┬───────────────┘  └──────────────────┘   │
└────────────────┼─────────────────────────────────────────┘
                 │ HTTPS (Railway-managed cert)
                 ▼
   ┌─────────────────────────┐    ┌─────────────────────┐
   │  Trener (desktop)       │    │  Podopieczny (PWA   │
   │                         │    │   na telefonie)     │
   └─────────────────────────┘    └─────────────────────┘
```

A single Node process handles SSR HTML, JSON over RR7 actions, file upload bodies, and file download streams. There is no separate API gateway, queue worker, or auth service.

### Request lifecycle for the two critical flows

**Trainee saves a workout log**

1. Browser POSTs `multipart/form-data` to `action /trainee/log/<sessionId>/new`. Each set's video is included as a file field; non-file fields carry reps, difficulty, set order.
2. Action handler reads the request as a stream, writes incoming file bytes directly to `/data/uploads/sets/<newLogId>/<setOrdinal>-<exerciseId>.mp4`. No buffering of full file in memory; we use Node's stream pipeline with a hard size cap (250 MB per file, 1 GB per request).
3. After streams settle, the action opens a Postgres transaction, inserts `workout_logs`, `workout_exercise_logs`, `workout_set_logs`, and `files` rows. The trainee's `last_session`, `total_sessions`, `sessions_last_7` counters update in the same transaction.
4. On transaction commit, action returns `redirect("/trainee/history/<logId>")`. On any failure: the action deletes the partial files it wrote before responding 4xx/5xx (tracked via a per-request `cleanup queue` list of paths).

**Trainee streams a per-set video back**

1. Browser requests `GET /files/<fileId>?sig=<hmac>&exp=<unix>` with optional `Range:` header.
2. App validates: signature is current, expiration not past, the session user owns or supervises the file's owner.
3. App reads file metadata (size, MIME) from `files` table (one indexed SELECT), opens a `fs.createReadStream` with the requested byte range, sets `Content-Range`, `Accept-Ranges: bytes`, `Content-Type`, pipes to response.
4. No DB writes on the read path.

---

## 5. Data model

The schema is intentionally relational. JSONB is used only for `text[]` of exercise tags (where querying inside is rare and Drizzle's array types cover it).

### 5.1 Identity

```sql
-- All users — both trainers and trainees — share one table.
-- A user has exactly one role for the lifetime of the row.
CREATE TYPE user_role AS ENUM ('trainer', 'trainee');

users (
  id                 uuid PK default gen_random_uuid(),
  email              citext UNIQUE NOT NULL,
  password_hash      text NULL,             -- NULL until invite accepted
  display_name       text NOT NULL,
  role               user_role NOT NULL,
  trainer_id         uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
                                            -- NULL when role='trainer'
                                            -- NOT NULL and points to a trainer row when role='trainee'
  joined_on          date NULL,             -- for trainees, the date the trainer onboarded them
  archived_at        timestamptz NULL,      -- soft-archive; archived users can't log in
  created_at         timestamptz NOT NULL DEFAULT now(),

  CHECK (
    (role = 'trainer' AND trainer_id IS NULL) OR
    (role = 'trainee' AND trainer_id IS NOT NULL)
  )
)

-- Sessions: server-side store for cookie session ids.
-- We don't use signed-only cookies because we want server-side revocation.
sessions (
  id                 text PK,               -- 32 bytes, base64url
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent_hint    text NULL,
  expires_at         timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
)
CREATE INDEX ON sessions (user_id);
CREATE INDEX ON sessions (expires_at);

-- Invites: created by trainer, consumed by trainee to set their password.
invites (
  id                 uuid PK default gen_random_uuid(),
  trainer_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name       text NOT NULL,
  email              citext NULL,           -- optional, not used for sending in V1
  token_hash         text NOT NULL,         -- sha256 of the random token
  expires_at         timestamptz NOT NULL,
  consumed_at        timestamptz NULL,
  consumed_by_user   uuid NULL REFERENCES users(id),
  replaces_user_id   uuid NULL REFERENCES users(id),
                                            -- set for password-reset invites: when consumed,
                                            -- updates this user's password_hash instead of
                                            -- creating a new user row.
  created_at         timestamptz NOT NULL DEFAULT now()
)
CREATE UNIQUE INDEX ON invites (token_hash);
```

### 5.2 Exercises (library)

```sql
CREATE TYPE exercise_unit AS ENUM ('REPS', 'SEC');

exercises (
  id                 uuid PK default gen_random_uuid(),
  trainer_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               text NOT NULL,
  unit               exercise_unit NOT NULL,
  description        text NOT NULL DEFAULT '',
  tags               text[] NOT NULL DEFAULT '{}',   -- e.g. {'pull','explosive'}
  demo_file_id       uuid NULL REFERENCES files(id) ON DELETE SET NULL,
  archived_at        timestamptz NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
)
CREATE INDEX ON exercises (trainer_id) WHERE archived_at IS NULL;
CREATE INDEX ON exercises USING GIN (tags);
```

Why per-trainer exercises rather than a global library: every trainer has their own taxonomy, naming, demo videos. A shared "global" pool would force consensus on naming and complicate authorization. If we later want a community library, it sits on top of per-trainer libraries.

### 5.3 Plans (trainer-authored, per-trainee)

```sql
CREATE TYPE plan_status AS ENUM ('draft', 'active', 'archived');

plans (
  id                 uuid PK default gen_random_uuid(),
  trainer_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainee_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               text NOT NULL,
  version            int  NOT NULL,         -- starts at 1, per (trainee_id) bumps on each new draft
  based_on_version   int  NULL,             -- which version this draft is editing
  status             plan_status NOT NULL,
  published_at       timestamptz NULL,      -- set when status flips to active
  created_at         timestamptz NOT NULL DEFAULT now()
)
CREATE UNIQUE INDEX ON plans (trainee_id, version);
-- A trainee has at most one active plan at a time:
CREATE UNIQUE INDEX ON plans (trainee_id) WHERE status = 'active';
-- A trainee has at most one draft plan at a time:
CREATE UNIQUE INDEX ON plans (trainee_id) WHERE status = 'draft';

CREATE TYPE block_kind AS ENUM ('single', 'superset', 'dropset');

plan_sessions (
  id                 uuid PK default gen_random_uuid(),
  plan_id            uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  ordinal            int  NOT NULL,
  name               text NOT NULL,
  UNIQUE (plan_id, ordinal)
)

plan_blocks (
  id                 uuid PK default gen_random_uuid(),
  plan_session_id    uuid NOT NULL REFERENCES plan_sessions(id) ON DELETE CASCADE,
  ordinal            int  NOT NULL,
  kind               block_kind NOT NULL,
  -- For dropset, the block carries set count and rest:
  sets               int  NULL,
  rest_seconds       int  NULL,
  UNIQUE (plan_session_id, ordinal),
  CHECK (
    (kind = 'dropset' AND sets IS NOT NULL AND rest_seconds IS NOT NULL) OR
    (kind <> 'dropset' AND sets IS NULL AND rest_seconds IS NULL)
  )
)

plan_items (
  id                 uuid PK default gen_random_uuid(),
  plan_block_id      uuid NOT NULL REFERENCES plan_blocks(id) ON DELETE CASCADE,
  ordinal            int  NOT NULL,
  exercise_id        uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  -- For single/superset, sets and rest live per-item:
  sets               int  NULL,
  rest_seconds       int  NULL,
  -- Reps and unit always per-item:
  reps               int  NOT NULL,
  unit               exercise_unit NOT NULL,
  note               text NULL,
  UNIQUE (plan_block_id, ordinal)
)
```

**Why this NULL-pattern for sets/rest:**
- A `single` block has one item with its own sets and rest.
- A `superset` block has N items, each with its own sets and rest (typically all equal, but allowed to differ if the trainer wants).
- A `dropset` is conceptually one set of "drops" performed back-to-back; sets count and rest belong to the block, each item just has its target reps. The CHECK constraint enforces this.

App-level validation in the plan editor save action confirms additional invariants (e.g., a superset has ≥2 items, a dropset has ≥2 drops).

### 5.4 Workout logs (trainee-recorded)

```sql
workout_logs (
  id                 uuid PK default gen_random_uuid(),
  trainer_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                     -- denormalized from trainee.trainer_id for tenant scoping
  trainee_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id            uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  plan_session_id    uuid NOT NULL REFERENCES plan_sessions(id) ON DELETE RESTRICT,
  -- denormalized snapshot of the session name as it was when logged:
  session_name       text NOT NULL,
  performed_on       date NOT NULL,
  note               text NULL,
  all_done           bool NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
)
CREATE INDEX ON workout_logs (trainee_id, performed_on DESC);
CREATE INDEX ON workout_logs (trainer_id, created_at DESC);

workout_exercise_logs (
  id                 uuid PK default gen_random_uuid(),
  workout_log_id     uuid NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  ordinal            int  NOT NULL,
  exercise_id        uuid NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  UNIQUE (workout_log_id, ordinal)
)

workout_set_logs (
  id                 uuid PK default gen_random_uuid(),
  workout_exercise_log_id  uuid NOT NULL REFERENCES workout_exercise_logs(id) ON DELETE CASCADE,
  ordinal            int  NOT NULL,        -- 1-based set index
  reps               int  NOT NULL,         -- in REPS or SEC depending on exercise unit
  difficulty         int  NOT NULL CHECK (difficulty BETWEEN 1 AND 10),
  video_file_id      uuid NULL REFERENCES files(id) ON DELETE SET NULL,
  UNIQUE (workout_exercise_log_id, ordinal)
)
```

Plans are never hard-deleted (ON DELETE RESTRICT from logs), to preserve historical record integrity.

### 5.5 Body photos

```sql
CREATE TYPE body_photo_view AS ENUM ('front', 'side', 'back');

body_photos (
  id                 uuid PK default gen_random_uuid(),
  trainer_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                     -- denormalized for tenant scoping
  trainee_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view               body_photo_view NOT NULL,
  taken_on           date NOT NULL,
  note               text NULL,
  file_id            uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now()
)
CREATE INDEX ON body_photos (trainee_id, taken_on DESC);
```

### 5.6 Files

```sql
CREATE TYPE file_kind AS ENUM ('exercise_demo', 'set_video', 'body_photo');

files (
  id                 uuid PK default gen_random_uuid(),
  trainer_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind               file_kind NOT NULL,
  mime_type          text NOT NULL,
  bytes              bigint NOT NULL,
  storage_path       text  NOT NULL UNIQUE,   -- path relative to /data
  width              int   NULL,              -- for images
  height             int   NULL,
  duration_ms        int   NULL,              -- for videos, populated on upload by reading container header
  created_at         timestamptz NOT NULL DEFAULT now()
)
CREATE INDEX ON files (trainer_id, kind, created_at DESC);
```

`storage_path` examples:
```
exercises/<exerciseId>/demo.mp4
sets/<workoutLogId>/<setLogId>.mp4
body/<traineeId>/<photoId>.jpg
```

The path includes the row's own id (file or owning row) so it's deterministic and collision-free.

### 5.7 Why trainer_id on every table

Every domain table denormalizes `trainer_id` even when it could be reached via a join. This makes:
- Tenant-scoped queries one-WHERE-clause without joins.
- Indexing on `(trainer_id, …)` straightforward.
- The repository layer enforceable by TypeScript type: every repository function takes `trainerId` and adds `WHERE trainer_id = $1` to every statement.

A trigger or app-level assertion (in tests) verifies invariants like "a workout_logs row's trainer_id equals its trainee's trainer_id." For V1 the app handles this; a CHECK constraint via a stored function is a candidate hardening (§16).

---

## 6. Authentication & authorization

### 6.1 Session auth flow

1. Login form posts email + password to `action /login`.
2. Server looks up the user by email (citext, case-insensitive), reads `password_hash`, verifies with argon2id.
3. On success: insert a row into `sessions` with a random 32-byte id (base64url-encoded), expiry 30 days from now. Set a cookie `__kth_session=<id>` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
4. On each request, a top-level `loader` reads the cookie, looks up the session, joins the user, attaches `request.context.user` for downstream loaders/actions.
5. Logout deletes the session row and clears the cookie.
6. Sliding refresh: if the session is within 7 days of expiry, the server rotates the id and resets the expiry, updates the cookie on the response.

No CSRF token is needed for SameSite=Lax cookies combined with form/action posts that go same-origin. We confirm in tests.

### 6.2 Invite flow

1. Trainer fills "Dodaj podopiecznego" form: display name, optional email.
2. Server generates a 32-byte random token. Stores `sha256(token)` in `invites.token_hash`. Expires in 14 days.
3. Server returns a copy-pasteable URL: `https://kalisthenos.app/zaproszenie/<token>`.
4. Trainer sends URL to trainee via Signal/WhatsApp/in person.
5. Trainee opens URL on phone. Server looks up by `token_hash`, validates expiry and `consumed_at IS NULL`.
6. Trainee form: confirms display name (prefilled, editable), sets password.
7. On submit: create `users` row with role='trainee' and `trainer_id` from invite; hash password; mark invite consumed; create a session; redirect to `/trainee`.

### 6.3 Password resets (V1)

No "Forgot password" flow that emails the user. Instead the trainer's admin panel has a "Wygeneruj nowy invite" button per trainee that:
- Creates a fresh invite with that trainee's existing trainer_id and display_name.
- The invite, when consumed, replaces the existing user's password and reuses the same `users` row (rather than creating a new one). This is enforced by an additional column on `invites`: `replaces_user_id uuid NULL`.

That keeps the trainee's data intact and gives the trainer a controlled recovery path without email infra.

### 6.4 Authorization rules

Authorization is **uniformly** "the resource's `trainer_id` must equal the current user's owning trainer_id":
- Trainer user: their own `users.id` is the `trainer_id` for their resources.
- Trainee user: their `users.trainer_id` is the `trainer_id` for their resources.

Resource visibility:
- A trainer can read everything for their trainees, can write exercises, plans, comments. Cannot create workout logs or body photos for a trainee.
- A trainee can read their own profile, their own plans (active only), their own logs and body photos. Can write workout logs and body photos. Cannot edit plans, cannot see other trainees, cannot edit the exercise library.

These rules live in a single `authorize(user, action, resource)` function, called from every action and loader. Forbidden access returns 404 (not 403), to avoid leaking existence.

---

## 7. Plan editor and versioning rules

The behavior matches the prototype's logic in `store.jsx:savePlan` and `store.jsx:publishPlan`, ported to server actions:

**Open an existing plan for editing.**
- If plan is `active`: look for an existing `draft` whose `based_on_version` equals this plan's `version`. If found, open it. If not, create a new draft as a deep clone with `version = active.version + 1`, `based_on_version = active.version`, `status = 'draft'`, `published_at = NULL`.
- If plan is `draft`: open it directly.
- If plan is `archived`: open read-only.

**Save (autosave or explicit save).**
- POST to `action /trainer/plans/<id>/save` with the full plan JSON.
- Server validates structure (block kinds, item counts, required fields), upserts plan, plan_sessions, plan_blocks, plan_items in a transaction. Removed rows from the editor are deleted via the cascade.

**Publish.**
- POST to `action /trainer/plans/<id>/publish`. Server in one transaction:
  1. Find the trainee's current `active` plan, if any → set `status = 'archived'`.
  2. Set this plan to `status = 'active'`, `published_at = now()`.
- The unique partial index on `plans (trainee_id) WHERE status = 'active'` enforces "at most one active" at the DB level.

**Discard a draft.**
- Hard-deletes the draft row and cascades through its plan_sessions, plan_blocks, plan_items. No logs ever reference a draft, so no integrity issue.

---

## 8. Workout logging behavior

A trainee picks a session from their active plan and records a session. The form is laid out for thumb operation on phones.

**Form structure** (matches prototype `TraineeLogForm`):
- Top: session name (read-only), date picker defaulting today, free-text note.
- Per exercise (from the plan_session): collapsed card showing exercise name, target reps × sets.
- Tap to expand → per-set rows. Each row has: reps input, difficulty 1-10 segmented control, optional video attach button.
- "Zapisz" at bottom posts everything as one `multipart/form-data` POST.

**Server-side save**:
- Validate that every plan exercise has at least one set logged (unless trainee toggled "nie skończyłem" — sets `all_done = false`).
- Compute the workout_log's `trainer_id` from the trainee's `trainer_id`.
- Insert log + exercise logs + set logs + file rows in a single transaction.
- Update trainee's `last_session`, `total_sessions`, `sessions_last_7` counters.
- Files are written to disk before the transaction; on rollback, registered cleanup paths are unlinked.

**Edit / delete**: a trainee can edit a log they wrote within 24 h, then it locks. A trainer can never edit a trainee's log — only comment (out of scope for V1; see §16).

---

## 9. Mobile / PWA / responsive design

The prototype's UI (`styles.css`) is desktop-first with CSS grids. V1 design choices:

- **Trainer views** (dashboard, clients list, library, plan editor): desktop-first. We keep the existing layouts and add a single mobile breakpoint that hides the side nav behind a hamburger and stacks the page grids.
- **Trainee views** (dashboard, sessions, log form, history, body): mobile-first. We rebuild these layouts from scratch to optimize for one-thumb operation. Bottom-aligned primary actions, single-column lists, big tap targets, no horizontal scroll. The look-and-feel (typography, colours, accent) is preserved.
- **PWA manifest**: name "kalisthenos", icon (the prototype's `K` mark from `index.html`), display "standalone", theme color matches accent.
- **Service worker** (via `vite-plugin-pwa`): precache hashed JS/CSS, cache-first for static assets, network-only for `/files/*` and any RR7 action POSTs. No background sync.
- **Add-to-home-screen prompt** on trainee dashboard on first visit on a mobile browser.

The accent color tweak (limonkowy/pomarańczowy) and theme (light/dark) ports as a user preference on the `users` table, replacing the prototype's `tweaks-panel.jsx` localStorage approach.

---

## 10. File upload & serving

### Upload

Uploads always go through the app process (not direct-to-storage; we have no S3-compatible endpoint). The action handler:

1. Receives `multipart/form-data` via the standard Node + Web Streams API (RR7 routes accept `Request`).
2. For each file field: streams to a temp file under `/data/tmp/<uuid>`. Tracks the temp path on a per-request cleanup list.
3. Hard-caps: 250 MB per file, 1 GB per total request, MIME from a whitelist (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`). MIME is verified by reading the first bytes (`file-type` package), not by trusting the Content-Type header.
4. On all-files-received without error: moves temp files to their final paths (`/data/uploads/...`), opens DB transaction, inserts file rows + domain rows.
5. On any error or transaction rollback: every path in the cleanup list is `fs.unlink`'d.

Video duration is read from the container header (via `mp4box.js` for mp4 / mov, container-agnostic fallback for webm) and stored in `files.duration_ms`. We do not transcode.

### Serving

Every file URL is HMAC-signed and short-lived to prevent enumeration / sharing:

```
GET /files/<fileId>?exp=<unix_ts>&sig=<hmac_sha256>
```

`sig = hex(hmac_sha256(SIGNING_SECRET, `${fileId}:${exp}:${currentUserId}`))`

- App validates: not expired, signature valid for the request's session user.
- App enforces authorization: file's `trainer_id` must equal session user's owning trainer_id.
- App reads `files.storage_path` and streams the disk file with proper `Content-Type`, `Content-Length` (for non-range), `Accept-Ranges: bytes`, and `Content-Range` (for range requests).
- Cache: `Cache-Control: private, max-age=3600`. Browser caches per signed URL.

URLs are generated by a server helper that signs with a 24-hour expiry. Trainee photo galleries and per-set videos all use this helper.

### Migration to R2/S3

Day-1 design keeps this isolated to a `FileStorage` interface with two methods:

```ts
interface FileStorage {
  write(path: string, stream: ReadableStream): Promise<void>;
  read(path: string, range?: { start: number; end: number }): Promise<ReadableStream>;
  delete(path: string): Promise<void>;
  size(path: string): Promise<number>;
}
```

V1 impl is `LocalVolumeStorage`. V2 can drop in `R2Storage` without touching call sites.

---

## 11. Configuration & environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (Railway-provided) |
| `SESSION_SECRET` | 32-byte random, signs session cookies |
| `FILE_SIGNING_SECRET` | 32-byte random, signs file URLs |
| `DATA_DIR` | Volume mount path, default `/data` |
| `MAX_UPLOAD_BYTES` | Per-file cap, default `250000000` |
| `MAX_REQUEST_BYTES` | Per-request cap, default `1000000000` |
| `SENTRY_DSN` | optional, browser+server |
| `NODE_ENV` | `production` / `development` |
| `BASE_URL` | e.g. `https://kalisthenos.up.railway.app`, used in invite link generation |

`.env.example` checked in; real values in Railway service variables.

---

## 12. Testing strategy

Three layers, in increasing scope:

1. **Unit (Vitest)**: pure functions (`fmtDate`, `daysAgo`, `avgDiff`, signing helpers, validation schemas). Fast, no DB.
2. **Integration (Vitest + a real Postgres on testcontainers, or a per-suite DB on Railway's test branch)**: every action + loader behind a real HTTP request. Covers:
   - Auth happy paths and failure modes.
   - Tenant scoping: trainer A cannot read trainer B's data through any URL.
   - Invite + accept + login + logout.
   - Plan create → save → publish → archive on next publish.
   - Workout log save with files; cleanup on transaction rollback.
   - File serving: signed URL validation; range requests; cross-tenant denial.
3. **E2E (Playwright)**: two happy-path browser flows: "trainer creates plan and publishes", "trainee logs a session with one video". Smoke tests for the rest.

CI: GitHub Actions on every PR, posts a Playwright HTML report artifact on failure.

Test discipline: every new action handler ships with at least one happy-path + one auth-fail integration test before merge.

---

## 13. Migration from prototype

The prototype's `data.jsx` contains 15 seed exercises and seed plans/logs. We port:

- **Exercises**: import all 15 into `exercises` table for the trainer's library on first boot. Done via a `pnpm seed` script that idempotently upserts by deterministic UUIDs derived from the prototype's string IDs (`ex_pl` → namespace-uuid). Demo videos are absent in the prototype (only placeholders) — `demo_file_id` stays NULL; trainer uploads real demos through the UI.
- **Plans**: not migrated. The trainer recreates plans in the new app using the editor, which is part of the dogfooding.
- **Logs**: not migrated. Fresh start.
- **The trainer's user row + Mateusz's trainee row**: created by the seed script with placeholder passwords that must be changed on first login.

The prototype files (`*.jsx`, `index.html`, `styles.css`) stay in the repo under `prototype/` for reference until the new app reaches feature parity, then they move to a `legacy/` archive or get deleted.

---

## 14. Repo layout

```
/                                  # the existing working directory
├── prototype/                     # the existing files, moved here
│   ├── app.jsx
│   ├── data.jsx
│   ├── ... (etc.)
│   └── index.html
├── app/                           # React Router v7 app source
│   ├── root.tsx
│   ├── routes/
│   │   ├── _index.tsx             # marketing / login redirect
│   │   ├── login.tsx
│   │   ├── zaproszenie.$token.tsx
│   │   ├── trener/
│   │   │   ├── _layout.tsx
│   │   │   ├── pulpit.tsx
│   │   │   ├── podopieczni._index.tsx
│   │   │   ├── podopieczni.$traineeId._layout.tsx
│   │   │   ├── podopieczni.$traineeId._index.tsx
│   │   │   ├── podopieczni.$traineeId.historia.tsx
│   │   │   ├── podopieczni.$traineeId.sylwetka.tsx
│   │   │   ├── biblioteka.tsx
│   │   │   ├── plany._index.tsx
│   │   │   └── plany.$planId.tsx          # editor
│   │   ├── podopieczny/
│   │   │   ├── _layout.tsx
│   │   │   ├── _index.tsx
│   │   │   ├── sesje._index.tsx
│   │   │   ├── sesje.$sessionId.tsx
│   │   │   ├── log.$sessionId.nowy.tsx
│   │   │   ├── historia._index.tsx
│   │   │   ├── historia.$logId.tsx
│   │   │   └── sylwetka.tsx
│   │   └── files.$fileId.tsx              # signed file serving
│   ├── components/                # ported from prototype (ui.jsx, icons.jsx)
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts          # Drizzle schema
│   │   │   ├── client.ts
│   │   │   └── migrations/
│   │   ├── auth/
│   │   │   ├── session.ts
│   │   │   ├── password.ts
│   │   │   └── invite.ts
│   │   ├── authz.ts               # the single authorize() function
│   │   ├── storage/
│   │   │   ├── interface.ts       # FileStorage
│   │   │   └── local-volume.ts
│   │   ├── files.ts               # signed URL helpers
│   │   ├── validators/            # zod schemas per action
│   │   └── format.ts              # fmtDate, daysAgo, avgDiff
│   ├── styles/
│   │   ├── tokens.css             # ported from styles.css :root vars
│   │   ├── trainer.css
│   │   └── trainee.css
│   └── entry.server.tsx
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── helpers/
├── scripts/
│   └── seed.ts
├── drizzle.config.ts
├── biome.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── playwright.config.ts
├── railway.toml
├── Dockerfile
├── .env.example
└── docs/
    └── superpowers/specs/
        └── 2026-05-23-kalisthenos-fullstack-v1-design.md   # this file
```

---

## 15. Deployment & operational concerns

- **Build**: `pnpm build` produces a Vite-built SSR bundle + client bundle. Dockerfile uses `node:22-alpine`, copies `node_modules`, runs the SSR entry on port 3000.
- **Migrate**: `pnpm db:migrate` runs Drizzle migrations on container start (idempotent).
- **Seed**: `pnpm db:seed` runs once-only for the initial trainer + trainee + exercises. Guarded by checking if `users` table has any rows.
- **Volume**: Railway volume mounted at `/data`, 50 GB initial allocation. Size watch via a daily log line ("data dir using X GB of Y").
- **Logs**: JSON-formatted to stdout. Railway log viewer is the V1 UI.
- **Backups**: Railway's automatic Postgres backups (daily snapshots, configurable retention). For volume: a nightly script bundles `/data/uploads` into a tar.gz and writes it to a separate Railway volume (or, if we expand to R2 in V2, offsite). V1 acknowledged risk: a Railway-region outage could mean lost uploads since last snapshot. Acceptable for 2 users; not acceptable past ~50 users (§16).
- **Monitoring**: Sentry browser + server SDK. No uptime monitoring in V1 — Railway's status emails suffice.

---

## 16. Out of scope for V1 / V2 candidates

These are deliberately deferred. Each is non-trivial; mixing them into V1 would push the launch by weeks each.

- **Self-service trainer signup** + organization/team model.
- **Billing**: Stripe Subscriptions with tiered limits (number of trainees, total GB of files).
- **Email**: Resend integration for invites, password resets, "your trainee logged a session" notifications.
- **Background jobs**: `pg-boss` running in the same process for thumbnail generation, weekly summary emails, video duration extraction reruns.
- **CDN-backed file storage**: `R2Storage` impl of `FileStorage`, swap-in.
- **Postgres RLS** as a second authorization layer on top of the repository discipline.
- **Trainer comments on workout logs** (the prototype hints at it; defer until trainee asks).
- **Trainer-to-trainee messaging / chat**.
- **Offline-first** workout logging with IndexedDB queue and sync.
- **Native mobile apps** via Expo, reusing the same RR7 backend.
- **Public exercise library** that trainers can fork from.
- **Internationalization** beyond Polish.
- **Analytics** for the trainer (progress charts beyond per-set difficulty rings).
- **Periodization templates** (block scheduling beyond linear "sessions").

---

## 17. Risks and open questions

| Risk | Mitigation |
|---|---|
| The trainer is non-technical; copy-paste-invite flow may be frustrating if many trainees | V1 only has one trainee. If more, we ship Resend. |
| Per-set video uploads from a phone over patchy gym wifi may fail mid-upload | Per-file caps + clear "uploading 3/5" UI + retry per file on the client. No partial uploads in V1. |
| 50 GB volume fills up faster than expected | Daily disk-usage log line + Sentry-style alert at 80%. |
| Argon2id native binding fails on Railway (`@node-rs/argon2`) | Prebuilt binaries for `linux-x64-musl` are published; verified in Dockerfile build. Fallback `hash-wasm` (pure WASM) if needed. |
| Server-side file streaming uses too much app CPU under load | Acceptable at V1 scale (2 users). Migration to R2+CDN solves it later. |
| Schema choice for plan blocks (NULL pattern for sets/rest) is awkward | Validated against prototype shape; CHECK constraint + app validators prevent invalid states. Alternative (separate `dropset_blocks` table) was considered and rejected as more code for negligible gain. |

**Resolved decisions worth restating here:**
- The plan editor uses an **explicit "Zapisz" button** (not debounced autosave). Simpler server contract, no half-saved state, matches the prototype's mental model. A "Zapisz i opublikuj" combo button is the publish path. Autosave is a polish item, not V1.
- A draft plan with unsaved local changes warns on navigation away (`beforeunload`); the editor keeps an in-memory dirty flag.

---

## 18. Acceptance criteria for V1

The work is done when:

1. A trainer can log into the deployed app at the configured URL.
2. The trainer can create exercises (with optional demo video upload), edit/archive them, see them in the library.
3. The trainer can issue an invite, copy the URL, and a trainee can use it to set their password and log in.
4. The trainer can create a plan for the trainee, build sessions with all three block kinds, save as draft, publish. On publishing v2, v1 is archived.
5. The trainee can pick a session, log every set with reps + difficulty, optionally attach per-set videos from the phone camera, save the workout.
6. The trainee can upload body photos (front/side/back) with optional note; the trainer can see the timeline.
7. The trainer can see workout history per trainee, drill into a log, view per-set videos with proper range-streaming on mobile.
8. The trainee cannot access any data of any other trainee in the system (verified by integration test even with V1's single trainee).
9. The app is installable as a PWA on iOS Safari and Android Chrome; static assets are cached for fast cold start.
10. The CI pipeline runs unit + integration + Playwright on every PR and blocks merge on red.
