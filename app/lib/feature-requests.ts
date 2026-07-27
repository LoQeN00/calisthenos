import { type SQL, and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import type { FeatureRequestKind, FeatureRequestStatus } from "~/lib/feature-request-types";

/**
 * Repozytorium zgłoszeń podopiecznych („Pomysły"). Zgłoszenie jest PRYWATNE w
 * parze: czyta je autor i jego trener. Każda funkcja przyjmuje wymagany
 * `traineeId` (widok autora) albo `trainerId` (skrzynka trenera) i filtruje po
 * nim w zapytaniu — nigdy po odczycie. Brak dopasowania to `null`/`0`; trasa
 * zamienia to na 404, nie 403 (nie zdradzamy istnienia cudzego zasobu).
 */

export class FeatureRequestError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export type FeatureRequestSort = "newest" | "oldest";

export interface TraineeRequestRow {
  id: string;
  kind: FeatureRequestKind;
  title: string;
  body: string;
  status: FeatureRequestStatus;
  trainerResponse: string | null;
  respondedAtISO: string | null;
  createdAtISO: string;
}

export interface TrainerRequestRow {
  id: string;
  kind: FeatureRequestKind;
  title: string;
  status: FeatureRequestStatus;
  traineeId: string;
  traineeName: string;
  createdAtISO: string;
  respondedAtISO: string | null;
}

export interface TrainerRequestDetail extends TrainerRequestRow {
  body: string;
  trainerResponse: string | null;
}

type StatusFilter = FeatureRequestStatus | "all" | undefined;
type KindFilter = FeatureRequestKind | "all" | undefined;

function statusCond(status: StatusFilter): SQL | undefined {
  return status == null || status === "all" ? undefined : eq(schema.featureRequests.status, status);
}

function kindCond(kind: KindFilter): SQL | undefined {
  return kind == null || kind === "all" ? undefined : eq(schema.featureRequests.kind, kind);
}

/**
 * Szukajka trenera: tytuł, treść albo nazwa autora. `%`/`_` escapujemy — inaczej
 * `%` wpisany w pole szukajki pasuje do wszystkiego zamiast do znaku procenta.
 */
function searchCond(q: string | undefined): SQL | undefined {
  const trimmed = (q ?? "").trim();
  if (trimmed.length === 0) return undefined;
  const pattern = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(
    ilike(schema.featureRequests.title, pattern),
    ilike(schema.featureRequests.body, pattern),
    ilike(schema.users.displayName, pattern),
  );
}

function orderFor(sort: FeatureRequestSort | undefined) {
  return sort === "oldest"
    ? asc(schema.featureRequests.createdAt)
    : desc(schema.featureRequests.createdAt);
}

// ---------------- Podopieczny (autor) ----------------

export async function listForTrainee(
  db: Db,
  traineeId: string,
  opts: { sort?: FeatureRequestSort; status?: StatusFilter; limit: number; offset: number },
): Promise<TraineeRequestRow[]> {
  const rows = await db
    .select({
      id: schema.featureRequests.id,
      kind: schema.featureRequests.kind,
      title: schema.featureRequests.title,
      body: schema.featureRequests.body,
      status: schema.featureRequests.status,
      trainerResponse: schema.featureRequests.trainerResponse,
      respondedAt: schema.featureRequests.respondedAt,
      createdAt: schema.featureRequests.createdAt,
    })
    .from(schema.featureRequests)
    .where(and(eq(schema.featureRequests.traineeId, traineeId), statusCond(opts.status)))
    .orderBy(orderFor(opts.sort))
    .limit(opts.limit)
    .offset(opts.offset);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    status: r.status,
    trainerResponse: r.trainerResponse,
    respondedAtISO: r.respondedAt?.toISOString() ?? null,
    createdAtISO: r.createdAt.toISOString(),
  }));
}

export async function countForTrainee(
  db: Db,
  traineeId: string,
  opts: { status?: StatusFilter } = {},
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.featureRequests)
    .where(and(eq(schema.featureRequests.traineeId, traineeId), statusCond(opts.status)));
  return Number(row?.c ?? 0);
}

export async function createFeatureRequest(
  db: Db,
  args: {
    trainerId: string;
    traineeId: string;
    kind: FeatureRequestKind;
    title: string;
    body: string;
  },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.featureRequests)
    .values({
      trainerId: args.trainerId,
      traineeId: args.traineeId,
      kind: args.kind,
      title: args.title,
      body: args.body,
    })
    .returning({ id: schema.featureRequests.id });
  return { id: row!.id };
}

/**
 * Kasuje WŁASNE zgłoszenie autora i tylko dopóki ma status `new`. Warunek statusu
 * siedzi w `WHERE`, nie w kodzie po odczycie — inaczej trener odpowiadający w tej
 * samej chwili przegrywałby wyścig i odpowiedź znikałaby razem ze zgłoszeniem.
 */
export async function deleteFeatureRequest(
  db: Db,
  args: { traineeId: string; id: string },
): Promise<void> {
  const deleted = await db
    .delete(schema.featureRequests)
    .where(
      and(
        eq(schema.featureRequests.id, args.id),
        eq(schema.featureRequests.traineeId, args.traineeId),
        eq(schema.featureRequests.status, "new"),
      ),
    )
    .returning({ id: schema.featureRequests.id });

  if (deleted.length === 0) {
    throw new FeatureRequestError(
      "not deletable",
      "Nie można usunąć tego zgłoszenia — trener już je obsłużył.",
    );
  }
}

// ---------------- Trener (skrzynka) ----------------

export async function listForTrainer(
  db: Db,
  trainerId: string,
  opts: {
    sort?: FeatureRequestSort;
    status?: StatusFilter;
    kind?: KindFilter;
    q?: string;
    limit: number;
    offset: number;
  },
): Promise<TrainerRequestRow[]> {
  const rows = await db
    .select({
      id: schema.featureRequests.id,
      kind: schema.featureRequests.kind,
      title: schema.featureRequests.title,
      status: schema.featureRequests.status,
      traineeId: schema.featureRequests.traineeId,
      traineeName: schema.users.displayName,
      createdAt: schema.featureRequests.createdAt,
      respondedAt: schema.featureRequests.respondedAt,
    })
    .from(schema.featureRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.featureRequests.traineeId))
    .where(
      and(
        eq(schema.featureRequests.trainerId, trainerId),
        statusCond(opts.status),
        kindCond(opts.kind),
        searchCond(opts.q),
      ),
    )
    .orderBy(orderFor(opts.sort))
    .limit(opts.limit)
    .offset(opts.offset);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    traineeId: r.traineeId,
    traineeName: r.traineeName,
    createdAtISO: r.createdAt.toISOString(),
    respondedAtISO: r.respondedAt?.toISOString() ?? null,
  }));
}

export async function countForTrainer(
  db: Db,
  trainerId: string,
  opts: { status?: StatusFilter; kind?: KindFilter; q?: string } = {},
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.featureRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.featureRequests.traineeId))
    .where(
      and(
        eq(schema.featureRequests.trainerId, trainerId),
        statusCond(opts.status),
        kindCond(opts.kind),
        searchCond(opts.q),
      ),
    );
  return Number(row?.c ?? 0);
}

export async function getForTrainer(
  db: Db,
  trainerId: string,
  id: string,
): Promise<TrainerRequestDetail | null> {
  const [r] = await db
    .select({
      id: schema.featureRequests.id,
      kind: schema.featureRequests.kind,
      title: schema.featureRequests.title,
      body: schema.featureRequests.body,
      status: schema.featureRequests.status,
      trainerResponse: schema.featureRequests.trainerResponse,
      traineeId: schema.featureRequests.traineeId,
      traineeName: schema.users.displayName,
      createdAt: schema.featureRequests.createdAt,
      respondedAt: schema.featureRequests.respondedAt,
    })
    .from(schema.featureRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.featureRequests.traineeId))
    .where(and(eq(schema.featureRequests.id, id), eq(schema.featureRequests.trainerId, trainerId)))
    .limit(1);

  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    status: r.status,
    trainerResponse: r.trainerResponse,
    traineeId: r.traineeId,
    traineeName: r.traineeName,
    createdAtISO: r.createdAt.toISOString(),
    respondedAtISO: r.respondedAt?.toISOString() ?? null,
  };
}

/**
 * Ustawia status i odpowiedź. `respondedAt` stemplujemy tylko przy NIEPUSTEJ
 * odpowiedzi — sama zmiana statusu nie jest odpowiedzią i nie powinna udawać, że
 * trener coś napisał.
 */
export async function respondToFeatureRequest(
  db: Db,
  args: {
    trainerId: string;
    id: string;
    status: FeatureRequestStatus;
    response: string | null;
  },
): Promise<void> {
  const updated = await db
    .update(schema.featureRequests)
    .set({
      status: args.status,
      trainerResponse: args.response,
      respondedAt: args.response == null ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.featureRequests.id, args.id),
        eq(schema.featureRequests.trainerId, args.trainerId),
      ),
    )
    .returning({ id: schema.featureRequests.id });

  if (updated.length === 0) {
    throw new FeatureRequestError("not found", "Nie znaleziono zgłoszenia.");
  }
}

/** Odznaka nawigacji trenera — liczy WYŁĄCZNIE nieruszone zgłoszenia. */
export async function countNewForTrainer(db: Db, trainerId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.featureRequests)
    .where(
      and(
        eq(schema.featureRequests.trainerId, trainerId),
        eq(schema.featureRequests.status, "new"),
      ),
    );
  return Number(row?.c ?? 0);
}
