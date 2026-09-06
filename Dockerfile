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
COPY tsconfig.json react-router.config.ts vite.config.ts ./
COPY app ./app
COPY public ./public
COPY scripts ./scripts

# Build React Router SSR + client bundles (output in ./build).
RUN npm run build

# ------------------------------------------------------------
# 2) Runtime stage
# ------------------------------------------------------------
FROM node:22-alpine AS runtime

# tini = PID 1 / signal forwarder. `su-exec` zniknęło razem z entrypointem:
# nie ma już wolumenu, któremu trzeba naprawić właściciela przed startem.
RUN apk add --no-cache tini

WORKDIR /app

# Dev deps jadą tu nadal, ale POWÓD zniknął w S6: instalowaliśmy je dla
# `drizzle-kit` (migracje przy starcie) i `tsx` (seed). Obu nie ma — migracje
# są po stronie BE, seedowanie też. Przejście na `npm ci --omit=dev` jest
# bezpieczne dopiero po sprawdzeniu obrazu, a Docker prowadzi właściciel.
ARG GITHUB_TOKEN
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Wyłącznie wynik builda i assety — źródła nie są już nikomu potrzebne
# w runtime (kopiowaliśmy `app/` dla drizzle-kit, `scripts/` dla seeda).
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public

RUN chown -R node:node /app

# Bajty uploadów leżą w R2 po stronie BE, więc kontener nie potrzebuje już
# ani wolumenu, ani roota na starcie: proces od początku biegnie jako `node`.
USER node

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "start"]
