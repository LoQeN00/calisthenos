import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { createInvite } from "~/lib/auth";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { errorMeta, logger } from "~/lib/logger";
import { pauseSubscription, resumeSubscription } from "~/lib/stripe/subscriptions";

export class AmbassadorError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface AmbassadorListRow {
  id: string;
  displayName: string;
  email: string;
  regionName: string | null;
  joinedOn: string | null;
  traineeCount: number;
  active: boolean;
}

/** Trenerzy organizacji prezesa + liczba aktywnych podopiecznych + status. */
export async function listAmbassadors(
  db: Db,
  organizationId: string,
): Promise<AmbassadorListRow[]> {
  const rows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      email: schema.users.email,
      regionName: schema.regions.name,
      joinedOn: schema.users.joinedOn,
      archivedAt: schema.users.archivedAt,
    })
    .from(schema.users)
    .leftJoin(schema.regions, eq(schema.regions.id, schema.users.regionId))
    .where(and(eq(schema.users.role, "trainer"), eq(schema.users.organizationId, organizationId)))
    .orderBy(schema.users.displayName);
  if (rows.length === 0) return [];
  // Liczba aktywnych podopiecznych per trener — zawężone do trenerów tej org
  // (inArray po pobranych id; bez tego byłby skan wszystkich podopiecznych w bazie).
  const trainerIds = rows.map((r) => r.id);
  const counts = await db
    .select({ trainerId: schema.users.trainerId, c: count() })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "trainee"),
        isNull(schema.users.archivedAt),
        inArray(schema.users.trainerId, trainerIds),
      ),
    )
    .groupBy(schema.users.trainerId);
  const byTrainer = new Map(counts.map((r) => [r.trainerId, Number(r.c)]));
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    email: r.email,
    regionName: r.regionName,
    joinedOn: r.joinedOn,
    traineeCount: byTrainer.get(r.id) ?? 0,
    active: r.archivedAt == null,
  }));
}

export interface AmbassadorProfile extends AmbassadorListRow {
  logs7d: number;
  logs30d: number;
  mrrGrosze: number;
}

/** Profil pojedynczego ambasadora + metryki. null gdy trener spoza org → 404. */
export async function getAmbassadorProfile(
  db: Db,
  organizationId: string,
  trainerId: string,
): Promise<AmbassadorProfile | null> {
  const [u] = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      email: schema.users.email,
      regionName: schema.regions.name,
      joinedOn: schema.users.joinedOn,
      archivedAt: schema.users.archivedAt,
    })
    .from(schema.users)
    .leftJoin(schema.regions, eq(schema.regions.id, schema.users.regionId))
    .where(
      and(
        eq(schema.users.id, trainerId),
        eq(schema.users.role, "trainer"),
        eq(schema.users.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!u) return null;

  const [tc] = await db
    .select({ c: count() })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.role, "trainee"),
        eq(schema.users.trainerId, trainerId),
        isNull(schema.users.archivedAt),
      ),
    );
  const d7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [l7] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(
      and(eq(schema.workoutLogs.trainerId, trainerId), gte(schema.workoutLogs.performedOn, d7)),
    );
  const [l30] = await db
    .select({ c: count() })
    .from(schema.workoutLogs)
    .where(
      and(eq(schema.workoutLogs.trainerId, trainerId), gte(schema.workoutLogs.performedOn, d30)),
    );
  const [mrr] = await db
    .select({ s: sql<number>`COALESCE(SUM(${schema.coachingSubscriptions.amountGrosze}), 0)::int` })
    .from(schema.coachingSubscriptions)
    .where(
      and(
        eq(schema.coachingSubscriptions.trainerId, trainerId),
        eq(schema.coachingSubscriptions.status, "active"),
      ),
    );

  return {
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    regionName: u.regionName,
    joinedOn: u.joinedOn,
    traineeCount: Number(tc?.c ?? 0),
    active: u.archivedAt == null,
    logs7d: Number(l7?.c ?? 0),
    logs30d: Number(l30?.c ?? 0),
    mrrGrosze: Number(mrr?.s ?? 0),
  };
}

export interface InviteAmbassadorInput {
  organizationId: string;
  invitedByUserId: string;
  regionId: string;
  displayName: string;
  email: string;
}

/** Tworzy zaproszenie trenera. Waliduje, że region należy do organizacji. */
export async function inviteAmbassador(db: Db, input: InviteAmbassadorInput): Promise<string> {
  const [region] = await db
    .select({ id: schema.regions.id })
    .from(schema.regions)
    .where(
      and(
        eq(schema.regions.id, input.regionId),
        eq(schema.regions.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!region) {
    throw new AmbassadorError("region not in org", "Wybrany region nie należy do tej organizacji.");
  }
  const { token } = await createInvite(db, {
    targetRole: "trainer",
    organizationId: input.organizationId,
    invitedByUserId: input.invitedByUserId,
    regionId: input.regionId,
    displayName: input.displayName,
    email: input.email,
  });
  return token;
}

/** Trener należy do org? (tenant-scope guard). */
async function trainerInOrg(db: Db, organizationId: string, trainerId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, trainerId),
        eq(schema.users.role, "trainer"),
        eq(schema.users.organizationId, organizationId),
      ),
    )
    .limit(1);
  return r != null;
}

/** Dezaktywuje ambasadora: archived_at=now, best-effort pauza aktywnych subskrypcji jego par. */
export async function deactivateAmbassador(
  db: Db,
  organizationId: string,
  trainerId: string,
): Promise<void> {
  if (!(await trainerInOrg(db, organizationId, trainerId))) {
    throw new AmbassadorError("not found", "Nie znaleziono ambasadora.");
  }
  await db
    .update(schema.users)
    .set({ archivedAt: new Date() })
    .where(eq(schema.users.id, trainerId));
  const subs = await db
    .select({ traineeId: schema.coachingSubscriptions.traineeId })
    .from(schema.coachingSubscriptions)
    .where(
      and(
        eq(schema.coachingSubscriptions.trainerId, trainerId),
        eq(schema.coachingSubscriptions.status, "active"),
      ),
    );
  for (const s of subs) {
    try {
      await pauseSubscription(db, trainerId, s.traineeId);
    } catch (err) {
      logger.error("ambassador.pause_failed", errorMeta(err));
    }
  }
}

/** Reaktywuje ambasadora: archived_at=null, best-effort wznowienie spauzowanych par. */
export async function reactivateAmbassador(
  db: Db,
  organizationId: string,
  trainerId: string,
): Promise<void> {
  if (!(await trainerInOrg(db, organizationId, trainerId))) {
    throw new AmbassadorError("not found", "Nie znaleziono ambasadora.");
  }
  await db.update(schema.users).set({ archivedAt: null }).where(eq(schema.users.id, trainerId));
  const subs = await db
    .select({ traineeId: schema.coachingSubscriptions.traineeId })
    .from(schema.coachingSubscriptions)
    .where(
      and(
        eq(schema.coachingSubscriptions.trainerId, trainerId),
        eq(schema.coachingSubscriptions.status, "paused"),
      ),
    );
  for (const s of subs) {
    try {
      await resumeSubscription(db, trainerId, s.traineeId);
    } catch (err) {
      logger.error("ambassador.resume_failed", errorMeta(err));
    }
  }
}
