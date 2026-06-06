import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import { getEnv } from "~/lib/env";
import * as schema from "~/lib/db/schema";
import { getStripe } from "~/lib/stripe/client";

export interface ConnectionStatus {
  connected: boolean;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}

/** Status połączenia Stripe trenera (bez sekretów — bezpieczny do loadera). Tenant-scope: trainerId. */
export async function getConnectionStatus(db: Db, trainerId: string): Promise<ConnectionStatus> {
  const [row] = await db
    .select({
      stripeAccountId: schema.stripeConnections.stripeAccountId,
      chargesEnabled: schema.stripeConnections.chargesEnabled,
      detailsSubmitted: schema.stripeConnections.detailsSubmitted,
    })
    .from(schema.stripeConnections)
    .where(eq(schema.stripeConnections.trainerId, trainerId))
    .limit(1);
  return {
    connected: Boolean(row),
    stripeAccountId: row?.stripeAccountId ?? null,
    chargesEnabled: row?.chargesEnabled ?? false,
    detailsSubmitted: row?.detailsSubmitted ?? false,
  };
}

/** Pełny wiersz połączenia (do orkiestracji płatności) lub null. Tenant-scope: trainerId. */
export async function getConnectionRow(
  db: Db,
  trainerId: string,
): Promise<schema.StripeConnection | null> {
  const [row] = await db
    .select()
    .from(schema.stripeConnections)
    .where(eq(schema.stripeConnections.trainerId, trainerId))
    .limit(1);
  return row ?? null;
}

/**
 * Zwraca istniejący stripeAccountId trenera albo tworzy nowe konto Express,
 * zapisuje wiersz i zwraca account.id. Tenant-scope: trainerId.
 */
export async function ensureExpressAccount(
  db: Db,
  trainerId: string,
  email: string,
): Promise<string> {
  const existing = await getConnectionRow(db, trainerId);
  if (existing) return existing.stripeAccountId;

  const stripe = getStripe();
  // Tworzymy konto w Stripe, a potem zapisujemy wiersz. Idempotency key (per trener)
  // sprawia, że gdy db.insert padnie po utworzeniu konta i akcja zostanie powtórzona,
  // Stripe zwróci TO SAMO konto zamiast tworzyć kolejne — brak osieroconych kont (24h).
  // Równoległe podwójne wywołanie jest też bezpieczne (trainer_id to PRIMARY KEY →
  // drugi insert rzuca, pierwszy wygrywa).
  const account = await stripe.accounts.create(
    {
      type: "express",
      email,
      metadata: { trainerId },
    },
    { idempotencyKey: `express-account-${trainerId}` },
  );

  await db.insert(schema.stripeConnections).values({
    trainerId,
    stripeAccountId: account.id,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    country: account.country ?? null,
    defaultCurrency: account.default_currency ?? null,
  });

  return account.id;
}

/** Jednorazowy link onboardingu Express dla danego konta. */
export async function createOnboardingLink(accountId: string): Promise<string> {
  const baseUrl = getEnv().BASE_URL.replace(/\/$/, "");
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/trener/integracje/stripe?refresh=1`,
    return_url: `${baseUrl}/trener/integracje/stripe?return=1`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Minimalny kształt konta Stripe potrzebny do aktualizacji statusu (np. z webhooka). */
export interface AccountUpdateShape {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}

/**
 * Aktualizuje flagi statusu połączenia WHERE stripe_account_id = account.id.
 * Używane przez webhook (Task 8). Pola nieobecne w `account` nie są zmieniane.
 */
export async function applyAccountUpdate(
  db: Db,
  account: AccountUpdateShape | Stripe.Account,
): Promise<void> {
  const set: Partial<typeof schema.stripeConnections.$inferInsert> = { updatedAt: new Date() };
  if (account.charges_enabled !== undefined) set.chargesEnabled = account.charges_enabled;
  if (account.payouts_enabled !== undefined) set.payoutsEnabled = account.payouts_enabled;
  if (account.details_submitted !== undefined) set.detailsSubmitted = account.details_submitted;
  await db
    .update(schema.stripeConnections)
    .set(set)
    .where(eq(schema.stripeConnections.stripeAccountId, account.id));
}
