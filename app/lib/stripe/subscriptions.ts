import { and, eq } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { getEnv, stripeApiConfigured } from "~/lib/env";
import { getStripe } from "~/lib/stripe/client";
import { getConnectionRow } from "~/lib/stripe/connections";
import { mapStripeStatus } from "~/lib/stripe/status";
import { errorMeta, logger } from "~/lib/logger";

export class SubscriptionError extends Error {}

/**
 * Loguje WYŁĄCZNIE stały komunikat + kod błędu — nigdy `err.message`/obiektu z SDK,
 * bo mógłby nieść fragmenty żądania (np. metadane klienta). Spójne z `google/sync.ts`.
 */
function logCleanupError(label: string, err: unknown): void {
  logger.error("stripe_cleanup.failed", { op: label, ...errorMeta(err) });
}

/** Wiersz pary trener+podopieczny (lub null). Tenant-scope: oba id. */
export async function getSubscriptionForPair(db: Db, trainerId: string, traineeId: string) {
  const [row] = await db
    .select()
    .from(schema.coachingSubscriptions)
    .where(
      and(
        eq(schema.coachingSubscriptions.trainerId, trainerId),
        eq(schema.coachingSubscriptions.traineeId, traineeId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Ustala miesięczną kwotę. Tworzy nowy Stripe Price (na koncie platformy)
 * i upsertuje wiersz pary. Gdy subskrypcja aktywna — podmienia item na nowy Price
 * (proration_behavior: 'none', od następnego cyklu). Gdy brak — tylko zapis.
 */
export async function setMonthlyAmount(
  db: Db,
  trainerId: string,
  traineeId: string,
  amountGrosze: number,
): Promise<void> {
  const stripe = getStripe();
  const existing = await getSubscriptionForPair(db, trainerId, traineeId);

  // Nic się nie zmieniło — nie twórz kolejnego (niemutowalnego) Price w Stripe.
  if (existing && existing.amountGrosze === amountGrosze && existing.stripePriceId) {
    return;
  }

  // Nazwa produktu z imieniem trenera (framing dla podopiecznego na fakturze/portalu).
  const [trainer] = await db
    .select({ name: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, trainerId))
    .limit(1);
  const productName = trainer?.name
    ? `Prowadzenie treningowe — ${trainer.name}`
    : "Prowadzenie treningowe";

  // Price są niemutowalne — tworzymy nowy przy każdej zmianie kwoty. Bez idempotency
  // key: `product_data.name` zależy od (zmiennej) nazwy trenera, więc klucz oparty na
  // kwocie + replay w 24h po zmianie nazwy dałby 400 (mismatch ciała). Duplikat Price
  // przy podwójnym wysłaniu jest nieszkodliwy (niemutowalny, niepodpięty), więc klucz
  // tu nie jest wart tego ryzyka.
  const price = await stripe.prices.create({
    currency: "pln",
    unit_amount: amountGrosze,
    recurring: { interval: "month" },
    product_data: { name: productName },
    metadata: { trainerId, traineeId },
  });

  if (!existing) {
    await db.insert(schema.coachingSubscriptions).values({
      trainerId,
      traineeId,
      amountGrosze,
      stripePriceId: price.id,
      status: "none",
    });
    return;
  }

  await db
    .update(schema.coachingSubscriptions)
    .set({ amountGrosze, stripePriceId: price.id, updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, existing.id));

  // Gdy subskrypcja aktywna — podmień item na nowy Price od następnego cyklu.
  if (
    existing.stripeSubscriptionId &&
    (existing.status === "active" || existing.status === "past_due")
  ) {
    const sub = await stripe.subscriptions.retrieve(existing.stripeSubscriptionId);
    const itemId = sub.items.data[0]?.id;
    if (itemId) {
      await stripe.subscriptions.update(existing.stripeSubscriptionId, {
        items: [{ id: itemId, price: price.id }],
        proration_behavior: "none",
      });
    }
  }
}

/** Tworzy (lub zwraca) customer podopiecznego na koncie PLATFORMY. */
export async function ensureCustomer(
  db: Db,
  row: schema.CoachingSubscription,
  traineeEmail: string,
  traineeName: string,
): Promise<string> {
  if (row.stripeCustomerId) return row.stripeCustomerId;
  // Idempotency key per para chroni przed duplikatem customera, gdy insert wiersza
  // padnie po utworzeniu klienta i akcja zostanie powtórzona.
  const customer = await getStripe().customers.create(
    {
      email: traineeEmail,
      name: traineeName,
      metadata: { trainerId: row.trainerId, traineeId: row.traineeId },
    },
    { idempotencyKey: `coaching-customer-${row.trainerId}-${row.traineeId}` },
  );
  await db
    .update(schema.coachingSubscriptions)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, row.id));
  return customer.id;
}

/**
 * Checkout Session (mode: subscription) z destination charges do konta trenera.
 * application_fee_percent = 0 (gotowe na później). Zwraca URL do redirectu.
 */
export async function createCheckoutSession(
  db: Db,
  args: { trainerId: string; traineeId: string; traineeEmail: string; traineeName: string },
): Promise<string> {
  const row = await getSubscriptionForPair(db, args.trainerId, args.traineeId);
  if (!row || !row.stripePriceId) {
    throw new SubscriptionError("Trener nie ustalił jeszcze kwoty.");
  }
  const conn = await getConnectionRow(db, args.trainerId);
  if (!conn || !conn.chargesEnabled) {
    throw new SubscriptionError("Trener nie ma aktywnych płatności.");
  }

  const customerId = await ensureCustomer(db, row, args.traineeEmail, args.traineeName);
  const base = getEnv().BASE_URL.replace(/\/$/, "");

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: row.stripePriceId, quantity: 1 }],
    subscription_data: {
      transfer_data: { destination: conn.stripeAccountId },
      application_fee_percent: 0,
      metadata: { trainerId: args.trainerId, traineeId: args.traineeId },
    },
    metadata: { trainerId: args.trainerId, traineeId: args.traineeId },
    success_url: `${base}/podopieczny/platnosci?ok=1`,
    cancel_url: `${base}/podopieczny/platnosci?canceled=1`,
  });
  if (!session.url) {
    throw new SubscriptionError("Nie udało się utworzyć sesji płatności.");
  }
  return session.url;
}

/** Billing Customer Portal (zmiana karty, anulowanie, faktury). Zwraca URL. */
export async function createPortalSession(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<string> {
  const row = await getSubscriptionForPair(db, trainerId, traineeId);
  if (!row?.stripeCustomerId) {
    throw new SubscriptionError("Brak konta płatności.");
  }
  const base = getEnv().BASE_URL.replace(/\/$/, "");
  const portal = await getStripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${base}/podopieczny/platnosci`,
  });
  return portal.url;
}

/** Trener kończy subskrypcję (anuluje od razu). */
export async function cancelSubscription(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<void> {
  const row = await getSubscriptionForPair(db, trainerId, traineeId);
  if (!row?.stripeSubscriptionId) {
    throw new SubscriptionError("Brak aktywnej subskrypcji.");
  }
  await getStripe().subscriptions.cancel(row.stripeSubscriptionId);
  // Status zaktualizuje webhook customer.subscription.deleted; ustawiamy też
  // lokalnie defensywnie, by UI od razu pokazał stan anulowany.
  await db
    .update(schema.coachingSubscriptions)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, row.id));
}

/** Trener wstrzymuje pobieranie płatności (pause_collection, behavior 'void'). */
export async function pauseSubscription(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<void> {
  const row = await getSubscriptionForPair(db, trainerId, traineeId);
  if (!row?.stripeSubscriptionId) {
    throw new SubscriptionError("Brak aktywnej subskrypcji.");
  }
  await getStripe().subscriptions.update(row.stripeSubscriptionId, {
    pause_collection: { behavior: "void" },
  });
  // pause_collection NIE zmienia subscription.status w Stripe — status 'paused'
  // utrzymujemy po naszej stronie (webhook też ustawia go z paused: true).
  await db
    .update(schema.coachingSubscriptions)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, row.id));
}

/** Trener wznawia subskrypcję (czyści pause_collection). */
export async function resumeSubscription(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<void> {
  const row = await getSubscriptionForPair(db, trainerId, traineeId);
  if (!row?.stripeSubscriptionId) {
    throw new SubscriptionError("Brak subskrypcji do wznowienia.");
  }
  // Pusta wartość czyści pause_collection ('' i null są równoważne wg typów Stripe).
  await getStripe().subscriptions.update(row.stripeSubscriptionId, { pause_collection: "" });
  await db
    .update(schema.coachingSubscriptions)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(schema.coachingSubscriptions.id, row.id));
}

/** Setter statusu używany przez webhook (z mapStripeStatus). */
export async function applySubscriptionUpdate(
  db: Db,
  args: {
    stripeSubscriptionId: string;
    stripeStatus: string;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    paused: boolean;
    // Para z metadanych subskrypcji — fallback, gdy wiersz nie jest jeszcze powiązany
    // przez stripeSubscriptionId (np. event .created dotarł przed checkout.session.completed).
    trainerId?: string | null;
    traineeId?: string | null;
  },
): Promise<void> {
  const set = {
    // pause_collection nie zmienia statusu w Stripe — gdy ustawiony, nadpisujemy 'paused'.
    status: args.paused ? ("paused" as const) : mapStripeStatus(args.stripeStatus),
    currentPeriodEnd: args.currentPeriodEnd,
    cancelAtPeriodEnd: args.cancelAtPeriodEnd,
    updatedAt: new Date(),
  };
  // 1) Wiersz już powiązany po id subskrypcji — zwykła aktualizacja.
  const updated = await db
    .update(schema.coachingSubscriptions)
    .set(set)
    .where(eq(schema.coachingSubscriptions.stripeSubscriptionId, args.stripeSubscriptionId))
    .returning({ id: schema.coachingSubscriptions.id });
  if (updated.length > 0) return;
  // 2) Brak dopasowania, ale znamy parę z metadanych → powiąż i ustaw status (race z .created).
  if (args.trainerId && args.traineeId) {
    await db
      .update(schema.coachingSubscriptions)
      .set({ ...set, stripeSubscriptionId: args.stripeSubscriptionId })
      .where(
        and(
          eq(schema.coachingSubscriptions.trainerId, args.trainerId),
          eq(schema.coachingSubscriptions.traineeId, args.traineeId),
        ),
      );
  }
}

/** Powiązanie po Checkout: zapisuje customer + subscription id na parze. */
export async function linkCheckoutResult(
  db: Db,
  args: { trainerId: string; traineeId: string; customerId: string; subscriptionId: string },
): Promise<void> {
  await db
    .update(schema.coachingSubscriptions)
    .set({
      stripeCustomerId: args.customerId,
      stripeSubscriptionId: args.subscriptionId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.coachingSubscriptions.trainerId, args.trainerId),
        eq(schema.coachingSubscriptions.traineeId, args.traineeId),
      ),
    );
}

/**
 * Best-effort sprzątanie Stripe przy usuwaniu podopiecznego: anuluje subskrypcję
 * (zatrzymuje pobieranie płatności) i kasuje obiekt `customer` na koncie platformy
 * (RODO — usunięcie PII u procesora; `customers.del` anuluje też ewentualne
 * pozostałe subskrypcje). Każdy błąd wywołania Stripe jest połykany (logowany) —
 * nie może zablokować usunięcia konta. Wołać PRZED kaskadą DB (po niej znika
 * wiersz pary i powiązanie). No-op, gdy Stripe nieskonfigurowany. Tenant-scope: oba id.
 */
export async function cleanupSubscriptionForTrainee(
  db: Db,
  trainerId: string,
  traineeId: string,
): Promise<void> {
  if (!stripeApiConfigured()) return;
  // Cała funkcja jest best-effort: także odczyt wiersza pary i konstrukcja klienta
  // są w try, by ŻADEN błąd (np. chwilowy błąd DB) nie wyciekł i nie zablokował
  // usunięcia konta podopiecznego w wołającej trasie.
  try {
    const row = await getSubscriptionForPair(db, trainerId, traineeId);
    if (!row) return;
    const stripe = getStripe();
    if (row.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(row.stripeSubscriptionId);
      } catch (err) {
        logCleanupError("cancel subscription", err);
      }
    }
    if (row.stripeCustomerId) {
      try {
        await stripe.customers.del(row.stripeCustomerId);
      } catch (err) {
        logCleanupError("delete customer", err);
      }
    }
  } catch (err) {
    logCleanupError("cleanup", err);
  }
}
