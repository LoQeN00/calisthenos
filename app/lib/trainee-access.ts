import { eq } from "drizzle-orm";
import { redirect } from "react-router";
import type { AuthUser } from "~/lib/auth";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

/**
 * Gate wstrzymania podopiecznego: jeśli jego trener jest zdezaktywowany
 * (`users.archived_at`), przekierowuje na `/podopieczny/wstrzymane`. Wstrzymanie
 * wyprowadzone z trenera (brak osobnej flagi na podopiecznym).
 *
 * Współdzielony przez layout podopiecznego ORAZ trasy POZA layoutem (`wrapped`,
 * `aktywuj`) — tamte nie przechodzą przez gate w `_layout.tsx`, więc muszą wołać
 * to jawnie, inaczej wstrzymany podopieczny zachowałby dostęp do danych/billingu.
 * No-op dla podopiecznego bez trenera. Rzuca `redirect` (jak `requireUser`).
 */
export async function assertTrainerActive(db: Db, user: AuthUser): Promise<void> {
  if (!user.trainerId) return;
  const [trainer] = await db
    .select({ archivedAt: schema.users.archivedAt })
    .from(schema.users)
    .where(eq(schema.users.id, user.trainerId))
    .limit(1);
  if (trainer?.archivedAt) throw redirect("/podopieczny/wstrzymane");
}
