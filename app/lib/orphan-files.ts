import { and, eq, lt, notExists, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { deleteFileBlob } from "~/lib/file-uploads";
import { errorMeta, logger } from "~/lib/logger";

/**
 * Karencja, po której nagranie niepodpięte do żadnej serii uznajemy za porzucone.
 * Hojnie: sesja treningowa zostawiona otwarta na noc ma się jeszcze zapisać.
 */
export const ORPHAN_GRACE_MS = 24 * 3600 * 1000;

/**
 * Kasuje nagrania serii (`set_video`), których nie podpięto do żadnego logu treningu.
 *
 * Rozdzielony upload tworzy wiersz `files` PRZED zapisem sesji — porzucona sesja
 * (zamknięta karta, rozmyślenie się) zostawia więc plik bez właściciela. Bez sprzątania
 * wolumen rósłby o każdy taki plik.
 *
 * Świadomie BEZ migracji: sierotę wykrywa zapytanie (`NOT EXISTS` po `video_file_id`),
 * a nie dodatkowa kolumna stanu — dzięki temu nie ma czego utrzymywać w spójności.
 *
 * `nowMs` wstrzykiwane dla testów.
 */
export async function sweepOrphanSetVideos(db: Db, nowMs: number = Date.now()): Promise<number> {
  const cutoff = new Date(nowMs - ORPHAN_GRACE_MS);

  const rows = await db
    .delete(schema.files)
    .where(
      and(
        eq(schema.files.kind, "set_video"),
        lt(schema.files.createdAt, cutoff),
        notExists(
          db
            .select({ x: sql`1` })
            .from(schema.workoutSetLogs)
            .where(eq(schema.workoutSetLogs.videoFileId, schema.files.id)),
        ),
      ),
    )
    .returning({ storagePath: schema.files.storagePath });

  // Bloby dopiero PO skasowaniu wierszy: odwrotna kolejność zostawiłaby wiersz
  // wskazujący nieistniejący plik, gdyby DELETE się nie powiódł.
  for (const r of rows) {
    try {
      await deleteFileBlob(r.storagePath);
    } catch (err) {
      // Osierocony blob na dysku jest lepszy niż przerwane sprzątanie reszty.
      logger.error("orphan_sweep.blob_delete_failed", {
        storagePath: r.storagePath,
        ...errorMeta(err),
      });
    }
  }

  return rows.length;
}

// Kadencja leniwego sprzątania — ten sam wzorzec co `maybePruneExpiredSessions`
// w `lib/auth/session.ts`. Repo nie ma crona i ten plasterek go nie wprowadza.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
let lastSweepAt = 0;

/**
 * Wołane z często trafianego loadera (root). Najwyżej raz na godzinę na proces,
 * fire-and-forget — trwające żądanie nie czeka na DELETE.
 */
export function maybeSweepOrphanSetVideos(db: Db): void {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  sweepOrphanSetVideos(db)
    .then((n) => {
      if (n > 0) logger.info("orphan_sweep.done", { count: n });
    })
    .catch((err) => {
      logger.error("orphan_sweep.failed", errorMeta(err));
    });
}
