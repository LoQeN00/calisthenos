import { createHash } from "node:crypto";
import { invitesControllerCreate } from "@kalisthenos/api-client";
import type { InviteCreatedResponse } from "@kalisthenos/api-client";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";
import type { Db } from "../db/client";
import * as schema from "../db/schema";

// ============================================================
// Wystawianie zaproszenia — kontrakt BE
// ============================================================

export type { InviteCreatedResponse } from "@kalisthenos/api-client";

/**
 * Własny typ błędu, bo trasa pokazuje `userMessage` w modalu zaproszenia.
 * Źródłem `userMessage` jest `message` z koperty BE.
 */
export class InviteError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface CreateInviteInput {
  displayName: string;
  email: string | null;
  /** Kwota subskrypcji ustalona przez trenera; `null` = zaproszenie bez płatności. */
  monthlyAmountGrosze: number | null;
  /** Szablon formularza startowego; `null` = zaproszenie bez formularza. */
  onboardingForm: { exerciseIds: string[]; note: string | null } | null;
}

/**
 * Zaproszenie + opcjonalny formularz startowy JEDNYM żądaniem (`POST /v1/invites`).
 * Atomowość, która do integracji siedziała tu w `db.transaction` (dawne
 * `createInviteWithOnboarding`), jest teraz sprawą BE: „zaproszenie i formularz
 * powstają atomowo" (`docs/04` §Zaproszenia), więc nigdy nie powstaje odnośnik do
 * zaproszenia, któremu formularz nie doszedł. Token generuje i haszuje BE —
 * w odpowiedzi jest jedyna chwila, w której surowy token opuszcza serwer.
 *
 * Ciało składane jawnie pole po polu: BE odrzuca pola spoza DTO, a `trainerId`
 * wynika z tokenu. Bez `replacesTraineeId` (odnowienie dostępu) — żadna trasa
 * FE dziś tego nie wystawia.
 *
 * Wąsko, do modalu: `404` (ćwiczenie z szablonu spoza biblioteki albo
 * zarchiwizowane — BE sprawdza to PRZED wstawieniem czegokolwiek), `409`
 * (`ONBOARDING_FORM_ALREADY_PENDING` przy odnowieniu) i `400` (walidacja BE
 * ostrzejsza niż Zod). Reszta leci dalej — awaria BE ma zostać awarią.
 */
export async function createInvite(
  api: Api,
  input: CreateInviteInput,
): Promise<InviteCreatedResponse> {
  try {
    const { data } = await invitesControllerCreate({
      client: api,
      body: {
        displayName: input.displayName,
        email: input.email,
        monthlyAmountGrosze: input.monthlyAmountGrosze,
        onboardingForm:
          input.onboardingForm == null
            ? null
            : { exerciseIds: input.onboardingForm.exerciseIds, note: input.onboardingForm.note },
      },
      throwOnError: true,
    });
    return data;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 409)) {
      throw new InviteError(e.code, e.message);
    }
    throw e;
  }
}

// ============================================================
// Przyjmowanie zaproszenia — jeszcze na Drizzle (do kroku 6 / S6)
// ============================================================

export function hashToken(token: string): string {
  const buf = Buffer.from(token, "base64url");
  return createHash("sha256").update(buf).digest("hex");
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

/**
 * Stempluje `trainee_id` na formularzu należącym do zaproszenia. Wołane
 * WEWNĄTRZ transakcji `consumeInvite` — konto i przypięcie formularza powstają
 * albo oba, albo żadne.
 *
 * Przeniesione tu z `onboarding-forms.ts` bez zmiany zachowania, gdy tamten
 * moduł przeszedł w całości na kontrakt (S2): jedynym wołającym jest
 * `consumeInvite`, a ten zostaje na Drizzle do S6. Prywatne — poza tą
 * transakcją nie ma czego przypinać.
 *
 * Bierze CAŁY wiersz zaproszenia, nie samo `id`: `consumeInvite` ma go już
 * wczytanego, więc `trainer_id` wchodzi do `WHERE` bez dodatkowego zapytania i
 * formularza nie da się przypiąć w poprzek tenantów.
 */
async function attachFormToTrainee(
  db: Db,
  invite: { id: string; trainerId: string },
  traineeId: string,
): Promise<void> {
  await db
    .update(schema.onboardingForms)
    .set({ traineeId })
    .where(
      and(
        eq(schema.onboardingForms.inviteId, invite.id),
        eq(schema.onboardingForms.trainerId, invite.trainerId),
        isNull(schema.onboardingForms.traineeId),
      ),
    );
}

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
