import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import type { ConsultationForm } from "~/lib/consultation-types";
import * as schema from "~/lib/db/schema";

export class ConsultationError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export type ConsultationSort = "date_desc" | "date_asc" | "most_open";

export interface ConsultationListOpts {
  limit?: number;
  offset?: number;
  sort?: ConsultationSort;
  q?: string;
  open?: "all" | "with_open";
}

export interface ConsultationListItem {
  id: string;
  heldOn: string;
  periodFrom: string | null;
  periodTo: string | null;
  title: string;
  totalItemCount: number;
  openItemCount: number;
}

/** Lista konsultacji podopiecznego. Tenant-scope: traineeId. */
export async function listConsultationsForTrainee(
  db: Db,
  traineeId: string,
  opts: ConsultationListOpts = {},
): Promise<ConsultationListItem[]> {
  const openExpr = sql<number>`count(*) filter (where ${schema.consultationActionItems.status} = 'open')`;

  const where = [eq(schema.consultations.traineeId, traineeId)];
  if (opts.q && opts.q.length > 0) {
    where.push(ilike(schema.consultations.title, `%${opts.q}%`));
  }

  const orderBy =
    opts.sort === "date_asc"
      ? [asc(schema.consultations.heldOn), asc(schema.consultations.createdAt)]
      : opts.sort === "most_open"
        ? [sql`${openExpr} DESC`, desc(schema.consultations.heldOn)]
        : [desc(schema.consultations.heldOn), desc(schema.consultations.createdAt)];

  let query = db
    .select({
      id: schema.consultations.id,
      heldOn: schema.consultations.heldOn,
      periodFrom: schema.consultations.periodFrom,
      periodTo: schema.consultations.periodTo,
      title: schema.consultations.title,
      createdAt: schema.consultations.createdAt,
      total: count(schema.consultationActionItems.id),
      open: openExpr,
    })
    .from(schema.consultations)
    .leftJoin(
      schema.consultationActionItems,
      eq(schema.consultationActionItems.consultationId, schema.consultations.id),
    )
    .where(and(...where))
    .groupBy(schema.consultations.id)
    .$dynamic();

  if (opts.open === "with_open") {
    query = query.having(
      sql`count(*) filter (where ${schema.consultationActionItems.status} = 'open') > 0`,
    );
  }

  const rows = await query
    .orderBy(...orderBy)
    .limit(opts.limit ?? 100)
    .offset(opts.offset ?? 0);

  return rows.map((r) => ({
    id: r.id,
    heldOn: r.heldOn,
    periodFrom: r.periodFrom,
    periodTo: r.periodTo,
    title: r.title,
    totalItemCount: Number(r.total),
    openItemCount: Number(r.open),
  }));
}

export async function countConsultationsForTrainee(db: Db, traineeId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.consultations)
    .where(eq(schema.consultations.traineeId, traineeId));
  return Number(row?.c ?? 0);
}

/** Liczba otwartych punktów „do poprawy" w skali wszystkich konsultacji — pod badge. */
export async function countOpenItemsForTrainee(db: Db, traineeId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(schema.consultationActionItems)
    .innerJoin(
      schema.consultations,
      eq(schema.consultations.id, schema.consultationActionItems.consultationId),
    )
    .where(
      and(
        eq(schema.consultations.traineeId, traineeId),
        eq(schema.consultationActionItems.status, "open"),
      ),
    );
  return Number(row?.c ?? 0);
}

export interface ConsultationDetail {
  consultation: schema.Consultation;
  items: schema.ConsultationActionItem[];
}

/**
 * Szczegóły konsultacji z punktami. Tenant-scope: podaj `trainerId` (widok trenera)
 * LUB `traineeId` (widok podopiecznego). Brak dopasowania → null (route zwraca 404).
 */
export async function getConsultationDetail(
  db: Db,
  args: { consultationId: string; trainerId?: string; traineeId?: string },
): Promise<ConsultationDetail | null> {
  if (!args.trainerId && !args.traineeId) {
    throw new ConsultationError(
      "getConsultationDetail requires trainerId or traineeId",
      "Brak kontekstu dostępu.",
    );
  }
  const conds = [eq(schema.consultations.id, args.consultationId)];
  if (args.trainerId) conds.push(eq(schema.consultations.trainerId, args.trainerId));
  if (args.traineeId) conds.push(eq(schema.consultations.traineeId, args.traineeId));

  const [c] = await db
    .select()
    .from(schema.consultations)
    .where(and(...conds))
    .limit(1);
  if (!c) return null;

  const items = await db
    .select()
    .from(schema.consultationActionItems)
    .where(eq(schema.consultationActionItems.consultationId, args.consultationId))
    .orderBy(asc(schema.consultationActionItems.ordinal));

  return { consultation: c, items };
}

async function assertTraineeOwnedBy(db: Db, trainerId: string, traineeId: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (!row) throw new ConsultationError("trainee not owned", "Nie znaleziono podopiecznego.");
}

export interface CreateConsultationInput {
  trainerId: string;
  traineeId: string;
  form: ConsultationForm;
}

/** Tworzy konsultację z punktami. Re-weryfikuje własność podopiecznego. */
export async function createConsultation(db: Db, input: CreateConsultationInput): Promise<string> {
  await assertTraineeOwnedBy(db, input.trainerId, input.traineeId);
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.consultations)
      .values({
        trainerId: input.trainerId,
        traineeId: input.traineeId,
        heldOn: input.form.heldOn,
        periodFrom: input.form.periodFrom ?? null,
        periodTo: input.form.periodTo ?? null,
        title: input.form.title,
        summary: input.form.summary ?? "",
      })
      .returning({ id: schema.consultations.id });
    const id = row!.id;
    await insertItems(tx, id, input.form.items);
    return id;
  });
}

export interface UpdateConsultationInput {
  trainerId: string;
  consultationId: string;
  form: ConsultationForm;
}

/**
 * Edycja konsultacji (tylko właściciel-trener). Punkty są wycierane i pisane od
 * nowa z formularza (status każdego punktu pochodzi z formularza). Brak własności → ConsultationError.
 */
export async function updateConsultation(db: Db, input: UpdateConsultationInput): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx
      .select({ id: schema.consultations.id })
      .from(schema.consultations)
      .where(
        and(
          eq(schema.consultations.id, input.consultationId),
          eq(schema.consultations.trainerId, input.trainerId),
        ),
      )
      .limit(1);
    if (!c) throw new ConsultationError("not owned", "Nie znaleziono konsultacji.");

    await tx
      .update(schema.consultations)
      .set({
        heldOn: input.form.heldOn,
        periodFrom: input.form.periodFrom ?? null,
        periodTo: input.form.periodTo ?? null,
        title: input.form.title,
        summary: input.form.summary ?? "",
      })
      .where(eq(schema.consultations.id, input.consultationId));

    await tx
      .delete(schema.consultationActionItems)
      .where(eq(schema.consultationActionItems.consultationId, input.consultationId));
    await insertItems(tx, input.consultationId, input.form.items);
  });
}

async function insertItems(
  db: Db,
  consultationId: string,
  items: ConsultationForm["items"],
): Promise<void> {
  if (items.length === 0) return;
  await db.insert(schema.consultationActionItems).values(
    items.map((it, idx) => ({
      consultationId,
      ordinal: idx,
      body: it.body,
      status: it.status,
      resolvedAt: it.status === "resolved" ? new Date() : null,
    })),
  );
}

/** Przełącza status punktu (tylko właściciel-trener). Ustawia/zeruje resolved_at. */
export async function setActionItemStatus(
  db: Db,
  args: { trainerId: string; itemId: string; status: schema.ConsultationItemStatus },
): Promise<void> {
  const [owned] = await db
    .select({ id: schema.consultationActionItems.id })
    .from(schema.consultationActionItems)
    .innerJoin(
      schema.consultations,
      eq(schema.consultations.id, schema.consultationActionItems.consultationId),
    )
    .where(
      and(
        eq(schema.consultationActionItems.id, args.itemId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .limit(1);
  if (!owned) throw new ConsultationError("item not owned", "Nie znaleziono punktu.");

  await db
    .update(schema.consultationActionItems)
    .set({ status: args.status, resolvedAt: args.status === "resolved" ? new Date() : null })
    .where(eq(schema.consultationActionItems.id, args.itemId));
}

/** Usuwa konsultację (kaskada kasuje punkty). Tenant-scope: trainerId. */
export async function deleteConsultation(
  db: Db,
  args: { trainerId: string; consultationId: string },
): Promise<boolean> {
  const rows = await db
    .delete(schema.consultations)
    .where(
      and(
        eq(schema.consultations.id, args.consultationId),
        eq(schema.consultations.trainerId, args.trainerId),
      ),
    )
    .returning({ id: schema.consultations.id });
  return rows.length > 0;
}
