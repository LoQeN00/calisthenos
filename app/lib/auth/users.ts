import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import * as schema from "../db/schema";

/** Użytkownik po adresie e-mail (logowanie). Null → trasa i tak liczy dummy-hash. */
export async function findUserByEmail(db: Db, email: string): Promise<schema.User | null> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return rows[0] ?? null;
}

/** Sama nazwa wyświetlana — do framingu trenera na ekranach podopiecznego. */
export async function findDisplayName(db: Db, userId: string): Promise<string | null> {
  const rows = await db
    .select({ name: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0]?.name ?? null;
}
