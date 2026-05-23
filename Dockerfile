# Multi-stage build → smaller, prod-hardened image.
# Stage 1 builds with all deps; stage 2 ships only prod runtime + non-root user.

# ------------------------------------------------------------
# 1) Build stage
# ------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Deps layer (cached when only source changes).
COPY package.json package-lock.json ./
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

RUN apk add --no-cache tini

WORKDIR /app

# Install BOTH prod + dev deps. drizzle-kit (dev dep) is needed for `db:migrate`
# at boot, and tsx (dev dep) runs `db:seed`. Image is a bit larger but the
# runtime contract stays simple. Phase 7+ could split into a one-shot
# migration container.
COPY package.json package-lock.json ./
RUN npm ci

# Build output + sources needed at runtime by drizzle-kit (db:migrate reads
# schema.ts + migrations/) and tsx (db:seed runs scripts/seed.ts).
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY app ./app
COPY scripts ./scripts
COPY drizzle.config.ts tsconfig.json ./

# Volume mount point for uploads (matches DATA_DIR).
RUN mkdir -p /data && chown -R node:node /app /data
VOLUME ["/data"]

# Run as the unprivileged `node` user provided by the base image.
USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && exec npm run start"]
