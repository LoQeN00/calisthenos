import { createCookie } from "react-router";
import { RemixI18Next } from "remix-i18next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { hashToken, parseSessionId } from "~/lib/auth";
import { FALLBACK_LANG, NAMESPACES, SUPPORTED_LANGS } from "~/i18n/config";
import { resources } from "~/i18n/resources";
import { pickLang } from "~/i18n/pick-lang";

export const localeCookie = createCookie("lng", {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
});

/** Region locale (BCP-47) zalogowanego usera: trener→własny, podopieczny→region trenera, brand_admin→null. */
async function regionLocaleForRequest(request: Request): Promise<string | null> {
  const sid = parseSessionId(request.headers.get("cookie"));
  if (!sid) return null;
  const rows = await db
    .select({
      regionId: schema.users.regionId,
      role: schema.users.role,
      trainerId: schema.users.trainerId,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sid), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u) return null;
  let regionId = u.regionId;
  if (u.role === "trainee" && u.trainerId) {
    const t = await db
      .select({ regionId: schema.users.regionId })
      .from(schema.users)
      .where(eq(schema.users.id, u.trainerId))
      .limit(1);
    regionId = t[0]?.regionId ?? null;
  }
  if (!regionId) return null;
  const r = await db
    .select({ locale: schema.regions.locale })
    .from(schema.regions)
    .where(eq(schema.regions.id, regionId))
    .limit(1);
  return r[0]?.locale ?? null;
}

/** Region locale zapraszającego trenera dla trasy /zaproszenie/:token. */
async function inviteTrainerRegionLocale(request: Request): Promise<string | null> {
  const url = new URL(request.url);
  const m = url.pathname.match(/^\/zaproszenie\/([^/]+)$/);
  if (!m || !m[1]) return null;
  const token = decodeURIComponent(m[1]);
  const inv = await db
    .select({ trainerId: schema.invites.trainerId })
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, hashToken(token)))
    .limit(1);
  const trainerId = inv[0]?.trainerId;
  if (!trainerId) return null;
  const t = await db
    .select({ regionId: schema.users.regionId })
    .from(schema.users)
    .where(eq(schema.users.id, trainerId))
    .limit(1);
  const regionId = t[0]?.regionId;
  if (!regionId) return null;
  const r = await db
    .select({ locale: schema.regions.locale })
    .from(schema.regions)
    .where(eq(schema.regions.id, regionId))
    .limit(1);
  return r[0]?.locale ?? null;
}

export const i18nServer = new RemixI18Next({
  detection: {
    supportedLanguages: [...SUPPORTED_LANGS],
    fallbackLanguage: FALLBACK_LANG,
    cookie: localeCookie,
    order: ["custom", "cookie", "header"],
    async findLocale(request) {
      const [regionLocale, inviteTrainerRegionLoc] = await Promise.all([
        regionLocaleForRequest(request),
        inviteTrainerRegionLocale(request),
      ]);
      return pickLang({
        regionLocale,
        inviteTrainerRegionLocale: inviteTrainerRegionLoc,
        acceptLanguage: request.headers.get("accept-language"),
      });
    },
  },
  i18next: { resources, defaultNS: "common", ns: [...NAMESPACES] },
});
