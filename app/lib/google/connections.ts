import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { getEnv } from "~/lib/env";
import { decryptToken, encryptToken } from "~/lib/google/crypto";
import { GOOGLE_CALENDAR_SCOPE } from "~/lib/google/oauth";
import type { ExchangedTokens } from "~/lib/google/oauth";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";

export interface ConnectionStatus {
  connected: boolean;
  googleEmail: string | null;
  calendarId: string;
}

/** Status połączenia trenera (bez sekretów — bezpieczny do loadera). Tenant-scope: trainerId. */
export async function getConnectionStatus(db: Db, trainerId: string): Promise<ConnectionStatus> {
  const [row] = await db
    .select({
      googleEmail: schema.googleCalendarConnections.googleEmail,
      calendarId: schema.googleCalendarConnections.calendarId,
    })
    .from(schema.googleCalendarConnections)
    .where(eq(schema.googleCalendarConnections.trainerId, trainerId))
    .limit(1);
  return {
    connected: Boolean(row),
    googleEmail: row?.googleEmail ?? null,
    calendarId: row?.calendarId ?? "primary",
  };
}

/** Zapisuje/aktualizuje połączenie (tokeny szyfrowane). Tenant-scope: trainerId. */
export async function upsertConnection(
  db: Db,
  args: { trainerId: string; googleEmail: string; tokens: ExchangedTokens },
): Promise<void> {
  const values = {
    trainerId: args.trainerId,
    googleEmail: args.googleEmail,
    accessTokenEnc: encryptToken(args.tokens.accessToken),
    refreshTokenEnc: encryptToken(args.tokens.refreshToken),
    tokenExpiry: new Date(args.tokens.expiryDate),
    scope: args.tokens.scope,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.googleCalendarConnections)
    .values(values)
    .onConflictDoUpdate({
      target: schema.googleCalendarConnections.trainerId,
      set: {
        googleEmail: values.googleEmail,
        accessTokenEnc: values.accessTokenEnc,
        refreshTokenEnc: values.refreshTokenEnc,
        tokenExpiry: values.tokenExpiry,
        scope: values.scope,
        updatedAt: values.updatedAt,
      },
    });
}

/** Usuwa połączenie (rozłącz). Tenant-scope: trainerId. Zwraca odszyfrowany refresh token do revoke (lub null). */
export async function deleteConnection(db: Db, trainerId: string): Promise<string | null> {
  const [row] = await db
    .delete(schema.googleCalendarConnections)
    .where(eq(schema.googleCalendarConnections.trainerId, trainerId))
    .returning({ refreshTokenEnc: schema.googleCalendarConnections.refreshTokenEnc });
  if (!row) return null;
  try {
    return decryptToken(row.refreshTokenEnc);
  } catch {
    return null;
  }
}

export interface AuthedCalendar {
  client: OAuth2Client;
  calendarId: string;
}

/**
 * Zwraca uwierzytelniony OAuth2Client trenera (lub null gdy brak połączenia).
 * Auto-refresh access tokenu jest obsługiwany przez bibliotekę; nasłuch 'tokens'
 * persystuje odświeżony token (zaszyfrowany). Tenant-scope: trainerId.
 */
export async function getAuthedClient(db: Db, trainerId: string): Promise<AuthedCalendar | null> {
  const [row] = await db
    .select()
    .from(schema.googleCalendarConnections)
    .where(eq(schema.googleCalendarConnections.trainerId, trainerId))
    .limit(1);
  if (!row) return null;

  const e = getEnv();
  const client = new OAuth2Client(e.GOOGLE_CLIENT_ID, e.GOOGLE_CLIENT_SECRET, e.GOOGLE_REDIRECT_URI);
  client.setCredentials({
    access_token: decryptToken(row.accessTokenEnc),
    refresh_token: decryptToken(row.refreshTokenEnc),
    expiry_date: row.tokenExpiry.getTime(),
    scope: row.scope || GOOGLE_CALENDAR_SCOPE,
  });

  // Persystuj odświeżony access_token (i ewentualnie rotowany refresh_token).
  client.on("tokens", (tokens) => {
    void persistRefreshed(db, trainerId, tokens.access_token, tokens.expiry_date, tokens.refresh_token);
  });

  return { client, calendarId: row.calendarId };
}

async function persistRefreshed(
  db: Db,
  trainerId: string,
  accessToken: string | null | undefined,
  expiryDate: number | null | undefined,
  refreshToken: string | null | undefined,
): Promise<void> {
  try {
    // Szyfrowanie WEWNĄTRZ try — błąd encryptToken nie może uciec jako unhandled
    // rejection z listenera 'tokens' (który woła tę funkcję jako fire-and-forget).
    const set: Partial<typeof schema.googleCalendarConnections.$inferInsert> = { updatedAt: new Date() };
    if (accessToken) set.accessTokenEnc = encryptToken(accessToken);
    if (expiryDate) set.tokenExpiry = new Date(expiryDate);
    if (refreshToken) set.refreshTokenEnc = encryptToken(refreshToken);
    await db
      .update(schema.googleCalendarConnections)
      .set(set)
      .where(eq(schema.googleCalendarConnections.trainerId, trainerId));
  } catch {
    // best-effort: błąd szyfrowania/zapisu odświeżonego tokenu nie może wywrócić żądania.
  }
}
