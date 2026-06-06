import { eq } from "drizzle-orm";
import type { ActionFunctionArgs } from "react-router";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { getEnv } from "~/lib/env";
import { errorMeta, logger } from "~/lib/logger";
import { applyChange, mapEvent, verifyAndParse } from "~/lib/stripe/webhook";

/**
 * Endpoint webhooka Stripe (bez sesji/auth — autoryzacja przez podpis HMAC).
 * Czyta SUROWY body (`request.text()`, nie `formData()`) — wymagany do weryfikacji
 * podpisu przez `constructEvent`. RR7 nie konsumuje body przed akcją.
 */
export async function action({ request }: ActionFunctionArgs) {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  if (!getEnv().STRIPE_WEBHOOK_SECRET) {
    return new Response("webhook not configured", { status: 500 });
  }

  const raw = await request.text();
  let event: ReturnType<typeof verifyAndParse>;
  try {
    event = verifyAndParse(raw, sig);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  // Dedup: zarejestruj event.id zanim go przetworzymy. Gdy już istnieje (Stripe
  // dostarczył ten sam event ponownie) — pomijamy i zwracamy 200.
  const inserted = await db
    .insert(schema.processedWebhookEvents)
    .values({ eventId: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ eventId: schema.processedWebhookEvents.eventId });
  if (inserted.length === 0) {
    return new Response(null, { status: 200 });
  }

  const change = mapEvent(event);
  if (change) {
    try {
      await applyChange(db, change);
    } catch (err) {
      // Cofnij marker, by Stripe ponowił dostarczenie i event mógł zostać
      // przetworzony od nowa (bez markera blokującego retry).
      try {
        await db
          .delete(schema.processedWebhookEvents)
          .where(eq(schema.processedWebhookEvents.eventId, event.id));
      } catch (cleanupErr) {
        logger.error("stripe_webhook.marker_rollback_failed", {
          eventId: event.id,
          ...errorMeta(cleanupErr),
        });
      }
      // Log po stronie serwera; zwracamy 500, by Stripe ponowił dostarczenie.
      logger.error("stripe_webhook.apply_failed", { type: event.type, ...errorMeta(err) });
      return new Response("handler error", { status: 500 });
    }
  }
  return new Response(null, { status: 200 });
}
