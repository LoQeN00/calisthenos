import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { errorMeta, logger } from "~/lib/logger";

const SESSION_DURATION_DAYS = 30;
const REFRESH_WHEN_DAYS_LEFT = 7;

function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

function inDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 3600 * 1000);
}

export interface CreateSessionInput {
  userId: string;
  userAgentHint?: string | null;
}

export async function createSession(db: Db, input: CreateSessionInput) {
  const id = newSessionId();
  const expiresAt = inDays(SESSION_DURATION_DAYS);
  await db.insert(schema.sessions).values({
    id,
    userId: input.userId,
    userAgentHint: input.userAgentHint ?? null,
    expiresAt,
  });
  return { id, expiresAt };
}

export async function readSession(db: Db, id: string) {
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.user.archivedAt) return null;
  return row;
}

export async function destroySession(db: Db, id: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
}

/**
 * Drop sessions whose expiry has passed. Best-effort hygiene to keep the
 * sessions table small; cookies for expired sessions are already invalid via
 * the `expires_at` filter in `readSession`, so this isn't a correctness fix.
 *
 * Designed to be cheap: a partial index on `expires_at` is in place
 * (`sessions_expires_idx`) so the DELETE is index-driven.
 */
export async function pruneExpiredSessions(db: Db): Promise<number> {
  const rows = await db
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, new Date()))
    .returning({ id: schema.sessions.id });
  return rows.length;
}

// Hourly cadence for the lazy on-request prune. Stored at module scope so the
// timer state persists across requests in the same Node process.
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

/**
 * Invoke from a frequently-hit loader (e.g. the root loader). Runs at most
 * once per hour per process; no-ops otherwise. Fire-and-forget — the in-flight
 * request doesn't await the actual DELETE.
 */
export function maybePruneExpiredSessions(db: Db): void {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  pruneExpiredSessions(db)
    .then((n) => {
      if (n > 0) logger.info("sessions.pruned", { count: n });
    })
    .catch((err) => {
      logger.error("sessions.prune_failed", errorMeta(err));
    });
}

// Rotates the session id when within REFRESH_WHEN_DAYS_LEFT of expiry.
// Runs in a transaction with SELECT ... FOR UPDATE so concurrent refresh attempts
// on the same session serialize cleanly — only the first commits a new session.
export async function refreshIfNearExpiry(db: Db, id: string) {
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({ session: schema.sessions, user: schema.users })
      .from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .where(and(eq(schema.sessions.id, id), gt(schema.sessions.expiresAt, new Date())))
      .limit(1)
      .for("update");
    const row = rows[0];
    if (!row || row.user.archivedAt) return null;

    const msLeft = row.session.expiresAt.getTime() - Date.now();
    if (msLeft > REFRESH_WHEN_DAYS_LEFT * 24 * 3600 * 1000) return null;

    await tx.delete(schema.sessions).where(eq(schema.sessions.id, id));
    const newId = newSessionId();
    const expiresAt = inDays(SESSION_DURATION_DAYS);
    await tx.insert(schema.sessions).values({
      id: newId,
      userId: row.user.id,
      userAgentHint: row.session.userAgentHint,
      expiresAt,
    });
    return { id: newId, expiresAt };
  });
}
