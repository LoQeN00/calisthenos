# Multi-stage build → smaller, prod-hardened image.
# Stage 1 builds with all deps; stage 2 ships only prod runtime + non-root user.

# ------------------------------------------------------------
# 1) Build stage
# ------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Deps layer (cached when only source changes).
ARG GITHUB_TOKEN
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Source.
COPY tsconfig.json react-router.config.ts vite.config.ts drizzle.config.ts ./
COPY app ./app
COPY public ./public
COPY scripts ./scripts

# Build React Router SSR + client bundles (output in ./build).
RUN npm run build

# ------------------------------------------------------------
# 2) Runtime stage
# ------------------------------------------------------------
FROM node:22-alpine AS runtime

# tini = PID 1 / signal forwarder; su-exec = lightweight gosu used by the
# entrypoint to drop from root → node after fixing /data perms.
RUN apk add --no-cache tini su-exec

WORKDIR /app

# Install BOTH prod + dev deps. drizzle-kit (dev dep) is needed for `db:migrate`
# at boot, and tsx (dev dep) runs `db:seed`. Image is a bit larger but the
# runtime contract stays simple. Phase 7+ could split into a one-shot
# migration container.
ARG GITHUB_TOKEN
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Build output + sources needed at runtime by drizzle-kit (db:migrate reads
# schema.ts + migrations/) and tsx (db:seed runs scripts/seed.ts).
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY app ./app
COPY scripts ./scripts
COPY drizzle.config.ts tsconfig.json ./

# Entrypoint that fixes /data perms (root-owned by Railway volume mount) and
# drops to the `node` user.
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Volume mount point for uploads (matches DATA_DIR). Created here so the app
# works even without a volume mount. The `VOLUME` Dockerfile directive is
# intentionally omitted — Railway rejects it and manages the mount via Railway
# Volumes configured in the service UI. Permissions on the *mounted* volume
# are fixed at runtime by docker-entrypoint.sh.
RUN mkdir -p /data && chown -R node:node /app /data

# IMPORTANT: stay as root here so the entrypoint can chown /data on container
# start. The entrypoint drops privileges to `node` via su-exec before exec'ing
# the final command, so the Node process itself runs unprivileged.

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && exec npm run start"]
