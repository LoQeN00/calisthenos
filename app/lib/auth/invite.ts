import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import type { Db } from "../db/client";
import * as schema from "../db/schema";
import { attachFormToTrainee, createOnboardingForm } from "../onboarding-forms";

const TOKEN_BYTES = 32;
const INVITE_DURATION_DAYS = 14;

function newToken(): { token: string; hash: string } {
  const buf = randomBytes(TOKEN_BYTES);
  const token = buf.toString("base64url");
  const hash = createHash("sha256").update(buf).digest("hex");
  return { token, hash };
}

export function hashToken(token: string): string {
  const buf = Buffer.from(token, "base64url");
  return createHash("sha256").update(buf).digest("hex");
}

export interface CreateInviteInput {
  trainerId: string;
  displayName: string;
  email?: string | null;
  replacesUserId?: string | null;
  monthlyAmountGrosze?: number | null;
}

export async function createInvite(db: Db, input: CreateInviteInput) {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + INVITE_DURATION_DAYS * 24 * 3600 * 1000);
  const [invite] = await db
    .insert(schema.invites)
    .values({
      trainerId: input.trainerId,
      displayName: input.displayName,
      email: input.email ?? null,
      tokenHash: hash,
      replacesUserId: input.replacesUserId ?? null,
      monthlyAmountGrosze: input.monthlyAmountGrosze ?? null,
      expiresAt,
    })
    .returning();
  return { token, invite };
}

/**
 * Zaproszenie + opcjonalny formularz startowy w JEDNEJ transakcji: albo jedno i drugie,
 * albo nic. Inaczej dałoby się wysłać link do zaproszenia, któremu formularz nie doszedł.
 * `inviteId` bierze się WYŁĄCZNIE z wiersza utworzonego w tej transakcji — nigdy z requestu.
 *
 * Mieszka tutaj, a nie w `onboarding-forms.ts`, bo ten moduł już importuje formularze
 * (`attachFormToTrainee` w `consumeInvite`) — odwrotny import zamknąłby cykl. Zaproszenie
 * jest korzeniem tego agregatu, formularz mu towarzyszy.
 *
 * `OnboardingFormError` przechodzi na zewnątrz — mapuje go trasa.
 */
export async function createInviteWithOnboarding(
  db: Db,
  input: {
    trainerId: string;
    displayName: string;
    email: string | null;
    monthlyAmountGrosze: number | null;
    template: { exerciseIds: string[]; note: string | null } | null;
  },
): Promise<{ token: string }> {
  const token = await db.transaction(async (tx) => {
    const created = await createInvite(tx, {
      trainerId: input.trainerId,
      displayName: input.displayName,
      email: input.email,
      monthlyAmountGrosze: input.monthlyAmountGrosze,
    });
    if (input.template) {
      await createOnboardingForm(tx, {
        trainerId: input.trainerId,
        inviteId: created.invite!.id,
        exerciseIds: input.template.exerciseIds,
        note: input.template.note,
      });
    }
    return created.token;
  });
  return { token };
}

/** Zaproszenie po SUROWYM tokenie z URL-a — haszowanie siedzi tutaj, nie w trasie. */
export async function findInviteByToken(db: Db, token: string): Promise<schema.Invite | null> {
  const rows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, hashToken(token)))
    .limit(1);
  return rows[0] ?? null;
}

export interface ConsumeInviteInput {
  token: string;
  chosenEmail: string;
  chosenDisplayName: string;
  newPasswordHash: string;
}

export type ConsumeInviteResult =
  | { kind: "created"; user: schema.User }
  | { kind: "replaced"; user: schema.User };

// Atomically consume an invite token. Concurrency-safe: SELECT ... FOR UPDATE locks the
// invite row for the duration of the transaction so two simultaneous accept requests
// serialize. The final UPDATE additionally re-checks `consumed_at IS NULL` as a belt-
// and-suspenders guard.
export async function consumeInvite(
  db: Db,
  input: ConsumeInviteInput,
): Promise<ConsumeInviteResult> {
  const hash = hashToken(input.token);
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.invites)
      .where(
        and(
          eq(schema.invites.tokenHash, hash),
          isNull(schema.invites.consumedAt),
          gt(schema.invites.expiresAt, new Date()),
        ),
      )
      .limit(1)
      .for("update");
    const invite = rows[0];
    if (!invite) {
      // Distinguish failure modes for a useful error message.
      const anyRows = await tx
        .select()
        .from(schema.invites)
        .where(eq(schema.invites.tokenHash, hash))
        .limit(1);
      const any = anyRows[0];
      if (any?.consumedAt) throw new Error("invite already used");
      if (any && any.expiresAt.getTime() < Date.now()) throw new Error("invite expired");
      throw new Error("invite not found");
    }

    let user: schema.User;
    if (invite.replacesUserId) {
      const updated = await tx
        .update(schema.users)
        .set({ passwordHash: input.newPasswordHash, archivedAt: null })
        .where(eq(schema.users.id, invite.replacesUserId))
        .returning();
      user = updated[0]!;
    } else {
      const created = await tx
        .insert(schema.users)
        .values({
          email: input.chosenEmail,
          displayName: input.chosenDisplayName,
          role: "trainee",
          trainerId: invite.trainerId,
          passwordHash: input.newPasswordHash,
          joinedOn: new Date().toISOString().slice(0, 10),
        })
        .returning();
      user = created[0]!;
    }

    // Formularz startowy (jeśli trener go doczepił) dostaje właściciela w tej
    // samej transakcji co konto — inaczej awaria po utworzeniu użytkownika
    // zostawiłaby formularz-sierotę bez podopiecznego. Przekazujemy cały wiersz
    // zaproszenia, żeby jego `trainer_id` trafił do `WHERE` bez dopytywania bazy.
    await attachFormToTrainee(tx, invite, user.id);

    const consumed = await tx
      .update(schema.invites)
      .set({ consumedAt: new Date(), consumedByUser: user.id })
      .where(and(eq(schema.invites.id, invite.id), isNull(schema.invites.consumedAt)))
      .returning({ id: schema.invites.id });
    if (consumed.length !== 1) {
      // Race: another transaction consumed this invite between our SELECT FOR UPDATE
      // and the UPDATE. Rolls back the user mutation.
      throw new Error("invite already used");
    }

    return {
      kind: invite.replacesUserId ? ("replaced" as const) : ("created" as const),
      user,
    };
  });
}
