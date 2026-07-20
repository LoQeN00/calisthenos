# Panel prezesa — zarządzanie ambasadorami (#4c) — plan implementacji

> **Dla wykonawców (agentów):** WYMAGANY SUB-SKILL: `superpowers:subagent-driven-development`
> (rekomendowane) lub `superpowers:executing-plans`. Kroki = checkboxy.
>
> **Reguły-fundamenty repo (NADRZĘDNE):** nigdy git/docker (handoff na końcu); npm;
> komendy pojedynczo z allowlisty (`npm run typecheck`, `npm run lint`, `npm run build`,
> `npm run db:generate`, `npx vitest run <wzorzec>`, `npx biome format --write <plik>`);
> **NIE** `npm test`. `db:generate`/`db:migrate` uruchamia właściciel (interaktywne).
> Itesty (`*.itest.ts`) tylko PISZEMY. UI → `frontend-design:frontend-design`.
> Review per task (`/code-review`) zamiast commitów.

**Goal:** Prezes (`brand_admin`) zarządza ambasadorami swojej organizacji: lista,
profil z metrykami, zapraszanie nowych trenerów (link self-onboarding),
dezaktywacja/reaktywacja (blokuje trenera, wstrzymuje jego podopiecznych, pauzuje
ich subskrypcje Stripe).

**Architecture:** Uogólnienie tabeli `invites` (rola docelowa + org/region/invited_by)
zamiast osobnej tabeli; nowe org-scoped repo `app/lib/ambassadors.ts`; trasy
`/marka/ambasadorzy*`. Dezaktywacja = `users.archived_at` (blokadę logowania ma już
`login.tsx` + `readSession`), wstrzymanie podopiecznego wyprowadzone z trenera w
gate'cie layoutu + ekran `/podopieczny/wstrzymane`; pauza/wznowienie Stripe best-effort.

**Tech Stack:** RR7, Drizzle + Postgres, Zod, Vitest, i18next (pl+fr), Biome.

**Spec:** `docs/superpowers/specs/2026-06-08-panel-prezesa-ambasadorzy-design.md`.

### Refinements vs spec (świadome, zapisane przy self-review)
- **Blokada logowania zarchiwizowanych JUŻ ISTNIEJE** (`app/routes/login.tsx:64` `|| user.archivedAt`; `app/lib/auth/session.ts:44,104`). Plan NIE dodaje kodu auth — tylko gate podopiecznego + test potwierdzający.
- **E-mail ambasadora WYMAGANY** w zaproszeniu (jak trener→podopieczny). Upraszcza publiczną trasę `zaproszenie/:token` do zera zmian logiki (e-mail autorytatywny z invite; `consumeInvite` rozgałęzia rolę wewnętrznie; redirect przez `defaultPathForRole` już daje `/trener`).
- **Zaproszenie przez modal na liście** (`/marka/ambasadorzy`), nie osobna trasa `/nowy` — lustro `trener/podopieczni._index.tsx`.
- Kolumna kwoty subskrypcji to **`amount_grosze`** (nie `monthly_amount_grosze`). MRR = suma `amount_grosze` przy `status = 'active'`.

---

## Mapa plików
**Tworzone:** `app/lib/ambassador-types.ts` (+ `.test.ts`), `app/lib/ambassadors.ts`,
`app/routes/marka/ambasadorzy._index.tsx`, `app/routes/marka/ambasadorzy.$trainerId.tsx`,
`app/routes/podopieczny/wstrzymane.tsx`, `tests/ambassadors.itest.ts`.
**Modyfikowane:** `app/lib/db/schema.ts` (`invites`), `app/lib/auth/invite.ts`
(`createInvite`/`consumeInvite`), `app/routes/zaproszenie.$token.tsx` (copy wg roli),
`app/routes/podopieczny/_layout.tsx` (gate), `app/routes/marka/_layout.tsx` (nav),
`app/routes.ts`, `app/locales/{pl,fr}/marka.json`, `app/locales/{pl,fr}/podopieczny.json`,
`app/locales/{pl,fr}/auth.json` (copy trenera), README-e + `CLAUDE.md`.

---

## Task 1: Schemat — uogólnienie `invites`

**Files:** Modify `app/lib/db/schema.ts` (`invites` ~145-166; enum sekcja); `app/lib/db/README.md`

- [ ] **Step 1: Dodaj enum + zmień tabelę.** Znajdź sekcję enumów (gdzie są inne `pgEnum`) i dodaj:
```ts
export const inviteTargetRole = pgEnum("invite_target_role", ["trainee", "trainer"]);
```
Zamień definicję `invites` na (zmiany: `trainerId` nullable; nowe kolumny; `targetRole` z default; CHECK):
```ts
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetRole: inviteTargetRole("target_role").notNull().default("trainee"),
    // Nullable: ustawiony tylko dla zaproszeń podopiecznego.
    trainerId: uuid("trainer_id").references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    regionId: uuid("region_id").references(() => regions.id, { onDelete: "restrict" }),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    email: citext("email"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedByUser: uuid("consumed_by_user").references(() => users.id),
    replacesUserId: uuid("replaces_user_id").references(() => users.id),
    monthlyAmountGrosze: integer("monthly_amount_grosze"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenHashUniq: uniqueIndex("invites_token_hash_uniq").on(t.tokenHash),
    trainerIdx: index("invites_trainer_idx").on(t.trainerId),
    targetCheck: check(
      "invites_target_check",
      sql`(${t.targetRole} = 'trainee' AND ${t.trainerId} IS NOT NULL) OR
          (${t.targetRole} = 'trainer' AND ${t.invitedByUserId} IS NOT NULL
             AND ${t.organizationId} IS NOT NULL AND ${t.trainerId} IS NULL)`,
    ),
  }),
);
```
Sprawdź, że `check`, `sql`, `pgEnum`, `regions`, `organizations` są zaimportowane/zdefiniowane (są — patrz inne tabele).

- [ ] **Step 2:** `npm run typecheck` → PASS (kolumny nullable; istniejący `createInvite` podaje `trainerId` → kompiluje). Jeśli błąd typu w `invite.ts` (bo `trainerId` teraz może być null w odczycie) — to naprawi Task 2; zanotuj jako DONE_WITH_CONCERNS.
- [ ] **Step 3:** Zaktualizuj `app/lib/db/README.md` (wiersz `schema.ts`): `invites` ma `target_role` (trainee|trainer, default trainee), nullable `trainer_id`, `organization_id`/`region_id`/`invited_by_user_id`, CHECK `invites_target_check` (trainee→trainer_id; trainer→invited_by+org, trainer_id NULL).
- [ ] **Step 4:** `npx biome format --write app/lib/db/schema.ts`; `npm run lint` → PASS.
- [ ] **Step 5:** Handoff-nota: właściciel `db:generate` (interaktywne — nowy enum + kolumny + CHECK + default backfilluje istniejące na 'trainee') → `db:migrate`.
- [ ] **Step 6:** `/code-review`.

---

## Task 2: `createInvite` / `consumeInvite` — rozgałęzienie po roli

**Files:** Modify `app/lib/auth/invite.ts`

> DB logic — pokrycie w itestach (Task 8). Bramka: typecheck/build/lint. Ścieżka podopiecznego bez zmian zachowania.

- [ ] **Step 1: Rozszerz `CreateInviteInput` + `createInvite`.**
```ts
export interface CreateInviteInput {
  targetRole?: "trainee" | "trainer"; // default "trainee"
  trainerId?: string | null;          // wymagany dla trainee
  organizationId?: string | null;     // wymagany dla trainer
  regionId?: string | null;           // trainer: region nowego ambasadora
  invitedByUserId?: string | null;    // trainer: kto zaprasza (prezes)
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
      targetRole: input.targetRole ?? "trainee",
      trainerId: input.trainerId ?? null,
      organizationId: input.organizationId ?? null,
      regionId: input.regionId ?? null,
      invitedByUserId: input.invitedByUserId ?? null,
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
```

- [ ] **Step 2: Rozgałęź `consumeInvite`** — w bloku tworzenia nowego usera (gałąź `else` po `replacesUserId`), użyj roli z invite:
```ts
    } else {
      const created = await tx
        .insert(schema.users)
        .values(
          invite.targetRole === "trainer"
            ? {
                email: input.chosenEmail,
                displayName: input.chosenDisplayName,
                role: "trainer" as const,
                organizationId: invite.organizationId,
                regionId: invite.regionId,
                passwordHash: input.newPasswordHash,
                joinedOn: new Date().toISOString().slice(0, 10),
              }
            : {
                email: input.chosenEmail,
                displayName: input.chosenDisplayName,
                role: "trainee" as const,
                trainerId: invite.trainerId,
                passwordHash: input.newPasswordHash,
                joinedOn: new Date().toISOString().slice(0, 10),
              },
        )
        .returning();
      user = created[0]!;
    }
```
`ConsumeInviteResult` kind: dla trenera zawsze `"created"` (brak `replacesUserId`). Reszta bez zmian.

- [ ] **Step 3:** Napraw ewentualne typy w wywołaniach `createInvite` (istniejące w `trener/podopieczni._index.tsx` podają `trainerId` — pasują, bo pole jest nadal akceptowane). `npm run typecheck` → PASS.
- [ ] **Step 4:** `npm run build` → PASS; `npx biome format --write app/lib/auth/invite.ts`; `npm run lint` → PASS.
- [ ] **Step 5:** Zaktualizuj `app/lib/auth/README.md` (`invite.ts`): zaproszenia są teraz uogólnione (trainee|trainer); trener-invite niesie org/region/invited_by, tworzy konto `trainer`.
- [ ] **Step 6:** `/code-review`.

---

## Task 3: Zod typy zaproszenia ambasadora (TDD)

**Files:** Create `app/lib/ambassador-types.ts`, `app/lib/ambassador-types.test.ts`

- [ ] **Step 1: Failujący test** (`app/lib/ambassador-types.test.ts`):
```ts
import { describe, expect, it } from "vitest";
import { AmbassadorInviteSchema } from "./ambassador-types";

describe("AmbassadorInviteSchema", () => {
  it("akceptuje poprawne zaproszenie", () => {
    const r = AmbassadorInviteSchema.safeParse({
      displayName: "Jan Trener", email: "jan@example.com", regionId: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(true);
  });
  it("wymaga imienia", () => {
    const r = AmbassadorInviteSchema.safeParse({ displayName: "  ", email: "j@e.pl", regionId: "11111111-1111-1111-1111-111111111111" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("ambasadorzy.validation.nameRequired");
  });
  it("wymaga poprawnego e-maila", () => {
    const r = AmbassadorInviteSchema.safeParse({ displayName: "Jan", email: "znak", regionId: "11111111-1111-1111-1111-111111111111" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("ambasadorzy.validation.emailInvalid");
  });
  it("wymaga regionu (uuid)", () => {
    const r = AmbassadorInviteSchema.safeParse({ displayName: "Jan", email: "j@e.pl", regionId: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("ambasadorzy.validation.regionRequired");
  });
});
```

- [ ] **Step 2:** `npx vitest run app/lib/ambassador-types.test.ts` → FAIL (brak modułu).
- [ ] **Step 3: Implementacja** (`app/lib/ambassador-types.ts`):
```ts
import { z } from "zod";

export const AmbassadorInviteSchema = z.object({
  displayName: z.string().trim().min(1, "ambasadorzy.validation.nameRequired").max(80),
  email: z
    .string()
    .trim()
    .min(1, "ambasadorzy.validation.emailRequired")
    .max(254)
    .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: "ambasadorzy.validation.emailInvalid" }),
  regionId: z.string().uuid("ambasadorzy.validation.regionRequired"),
});
export type AmbassadorInvite = z.infer<typeof AmbassadorInviteSchema>;
```

- [ ] **Step 4:** `npx vitest run app/lib/ambassador-types.test.ts` → PASS.
- [ ] **Step 5:** `npx biome format --write app/lib/ambassador-types.ts app/lib/ambassador-types.test.ts`; `npm run lint` → PASS.
- [ ] **Step 6:** `/code-review`.

---

## Task 4: Repo `app/lib/ambassadors.ts` (org-scoped)

**Files:** Create `app/lib/ambassadors.ts`

> DB + orkiestracja Stripe (best-effort, poza tx). Pokrycie: itesty (Task 8). Bramka: typecheck/build/lint.

- [ ] **Step 1: Utwórz moduł z listą + profilem + zaproszeniem.**
```ts
import { and, count, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { createInvite } from "~/lib/auth";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { errorMeta, logger } from "~/lib/logger";
import { pauseSubscription, resumeSubscription } from "~/lib/stripe/subscriptions";

export class AmbassadorError extends Error {
  constructor(message: string, public readonly userMessage: string) { super(message); }
}

export interface AmbassadorListRow {
  id: string;
  displayName: string;
  email: string;
  regionName: string | null;
  joinedOn: string | null;
  traineeCount: number;
  active: boolean; // archived_at IS NULL
}

/** Trenerzy organizacji prezesa + liczba podopiecznych + status. */
export async function listAmbassadors(db: Db, organizationId: string): Promise<AmbassadorListRow[]> {
  const rows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      email: schema.users.email,
      regionName: schema.regions.name,
      joinedOn: schema.users.joinedOn,
      archivedAt: schema.users.archivedAt,
    })
    .from(schema.users)
    .leftJoin(schema.regions, eq(schema.regions.id, schema.users.regionId))
    .where(and(eq(schema.users.role, "trainer"), eq(schema.users.organizationId, organizationId)))
    .orderBy(schema.users.displayName);
  // Liczba podopiecznych per trener (osobne zapytanie zgrupowane — mała skala org).
  const counts = await db
    .select({ trainerId: schema.users.trainerId, c: count() })
    .from(schema.users)
    .where(and(eq(schema.users.role, "trainee"), isNull(schema.users.archivedAt), isNotNull(schema.users.trainerId)))
    .groupBy(schema.users.trainerId);
  const byTrainer = new Map(counts.map((r) => [r.trainerId, Number(r.c)]));
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    email: r.email,
    regionName: r.regionName,
    joinedOn: r.joinedOn,
    traineeCount: byTrainer.get(r.id) ?? 0,
    active: r.archivedAt == null,
  }));
}

export interface AmbassadorProfile extends AmbassadorListRow {
  logs7d: number;
  logs30d: number;
  mrrGrosze: number; // suma amount_grosze aktywnych subskrypcji jego par
}

/** Profil pojedynczego ambasadora + metryki. null gdy trener spoza org → 404. */
export async function getAmbassadorProfile(
  db: Db,
  organizationId: string,
  trainerId: string,
): Promise<AmbassadorProfile | null> {
  const [u] = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      email: schema.users.email,
      regionName: schema.regions.name,
      joinedOn: schema.users.joinedOn,
      archivedAt: schema.users.archivedAt,
    })
    .from(schema.users)
    .leftJoin(schema.regions, eq(schema.regions.id, schema.users.regionId))
    .where(
      and(
        eq(schema.users.id, trainerId),
        eq(schema.users.role, "trainer"),
        eq(schema.users.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!u) return null;

  const [tc] = await db
    .select({ c: count() })
    .from(schema.users)
    .where(and(eq(schema.users.role, "trainee"), eq(schema.users.trainerId, trainerId), isNull(schema.users.archivedAt)));
  const d7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [l7] = await db.select({ c: count() }).from(schema.workoutLogs)
    .where(and(eq(schema.workoutLogs.trainerId, trainerId), gte(schema.workoutLogs.performedOn, d7)));
  const [l30] = await db.select({ c: count() }).from(schema.workoutLogs)
    .where(and(eq(schema.workoutLogs.trainerId, trainerId), gte(schema.workoutLogs.performedOn, d30)));
  const [mrr] = await db
    .select({ s: sql<number>`COALESCE(SUM(${schema.coachingSubscriptions.amountGrosze}), 0)::int` })
    .from(schema.coachingSubscriptions)
    .where(and(eq(schema.coachingSubscriptions.trainerId, trainerId), eq(schema.coachingSubscriptions.status, "active")));

  return {
    id: u.id, displayName: u.displayName, email: u.email, regionName: u.regionName,
    joinedOn: u.joinedOn, traineeCount: Number(tc?.c ?? 0), active: u.archivedAt == null,
    logs7d: Number(l7?.c ?? 0), logs30d: Number(l30?.c ?? 0), mrrGrosze: Number(mrr?.s ?? 0),
  };
}

export interface InviteAmbassadorInput {
  organizationId: string;
  invitedByUserId: string;
  regionId: string;
  displayName: string;
  email: string;
}

/** Tworzy zaproszenie trenera. Waliduje, że region należy do organizacji. */
export async function inviteAmbassador(db: Db, input: InviteAmbassadorInput): Promise<string> {
  const [region] = await db
    .select({ id: schema.regions.id })
    .from(schema.regions)
    .where(and(eq(schema.regions.id, input.regionId), eq(schema.regions.organizationId, input.organizationId)))
    .limit(1);
  if (!region) throw new AmbassadorError("region not in org", "Wybrany region nie należy do tej organizacji.");
  const { token } = await createInvite(db, {
    targetRole: "trainer",
    organizationId: input.organizationId,
    invitedByUserId: input.invitedByUserId,
    regionId: input.regionId,
    displayName: input.displayName,
    email: input.email,
  });
  return token;
}
```

- [ ] **Step 2: Dezaktywacja/reaktywacja + Stripe.** Dopisz:
```ts
/** Trener org? (tenant-scope guard). */
async function trainerInOrg(db: Db, organizationId: string, trainerId: string): Promise<boolean> {
  const [r] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(and(eq(schema.users.id, trainerId), eq(schema.users.role, "trainer"), eq(schema.users.organizationId, organizationId)))
    .limit(1);
  return r != null;
}

/** Dezaktywuje ambasadora: archived_at=now, best-effort pauza subskrypcji jego par. */
export async function deactivateAmbassador(db: Db, organizationId: string, trainerId: string): Promise<void> {
  if (!(await trainerInOrg(db, organizationId, trainerId))) {
    throw new AmbassadorError("not found", "Nie znaleziono ambasadora.");
  }
  await db.update(schema.users).set({ archivedAt: new Date() }).where(eq(schema.users.id, trainerId));
  // Stripe poza transakcją, best-effort. Pauzujemy aktywne subskrypcje jego par.
  const subs = await db
    .select({ traineeId: schema.coachingSubscriptions.traineeId })
    .from(schema.coachingSubscriptions)
    .where(and(eq(schema.coachingSubscriptions.trainerId, trainerId), eq(schema.coachingSubscriptions.status, "active")));
  for (const s of subs) {
    try {
      await pauseSubscription(db, trainerId, s.traineeId);
    } catch (err) {
      logger.error("ambassador.pause_failed", errorMeta(err));
    }
  }
}

/** Reaktywuje ambasadora: archived_at=null, best-effort wznowienie spauzowanych par. */
export async function reactivateAmbassador(db: Db, organizationId: string, trainerId: string): Promise<void> {
  if (!(await trainerInOrg(db, organizationId, trainerId))) {
    throw new AmbassadorError("not found", "Nie znaleziono ambasadora.");
  }
  await db.update(schema.users).set({ archivedAt: null }).where(eq(schema.users.id, trainerId));
  const subs = await db
    .select({ traineeId: schema.coachingSubscriptions.traineeId })
    .from(schema.coachingSubscriptions)
    .where(and(eq(schema.coachingSubscriptions.trainerId, trainerId), eq(schema.coachingSubscriptions.status, "paused")));
  for (const s of subs) {
    try {
      await resumeSubscription(db, trainerId, s.traineeId);
    } catch (err) {
      logger.error("ambassador.resume_failed", errorMeta(err));
    }
  }
}
```
> Sprawdź w `schema.ts`, że `subscriptionStatus` ma wartość `'paused'` (powinna — patrz stripe/status.ts `SubscriptionStatus`). Jeśli `amountGrosze`/`performedOn`/`archivedAt`/`regionId` mają inne nazwy property w schemacie — dostosuj (zweryfikowane: `coachingSubscriptions.amountGrosze`, `workoutLogs.performedOn`, `users.archivedAt`, `users.regionId`).

- [ ] **Step 3:** `npm run typecheck` + `npm run build` → PASS. `npx biome format --write app/lib/ambassadors.ts`; `npm run lint` → PASS.
- [ ] **Step 4:** `/code-review` (org-scope w każdej funkcji; Stripe poza tx; best-effort).

---

## Task 5: Trasy `/marka/ambasadorzy` — lista + zaproszenie (modal)

**Files:** Create `app/routes/marka/ambasadorzy._index.tsx`; Modify `app/routes.ts`, `app/routes/marka/_layout.tsx`

> UI → `frontend-design`. Wzorzec: `app/routes/trener/podopieczni._index.tsx` (lista + modal zaproszenia + `InviteCreatedCard` + `<ListControls>` + `<Pagination>`). Różnice: rola brand_admin; orgId 404; repo `ambassadors`; pole **region** (select z regionów org) zamiast kwoty; namespace `marka` (`ambasadorzy.*`); link wiersza → `/marka/ambasadorzy/:id`.

- [ ] **Step 1: routes.ts** — w bloku `marka` dodaj:
```ts
      route("ambasadorzy", "routes/marka/ambasadorzy._index.tsx"),
      route("ambasadorzy/:trainerId", "routes/marka/ambasadorzy.$trainerId.tsx"),
```
(trasę `$trainerId` wypełnia Task 6 — utwórz teraz minimalny stub `export default`, by build przeszedł, albo zrób Task 6 przed bramką build tego taska.)

- [ ] **Step 2: `marka/_layout.tsx`** — zamień disabled „Ambasadorzy" na aktywny `NavLink to="/marka/ambasadorzy"` (icon `Users`, label `marka:nav.ambassadors`). Loader może doliczyć badge (liczba ambasadorów) — opcjonalnie; jeśli nie, bez tail.

- [ ] **Step 3: `ambasadorzy._index.tsx`** — loader:
```ts
export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const [ambassadors, regions] = await Promise.all([
    listAmbassadors(db, orgId),
    db.select({ id: schema.regions.id, name: schema.regions.name }).from(schema.regions)
      .where(eq(schema.regions.organizationId, orgId)).orderBy(schema.regions.name),
  ]);
  return { ambassadors, regions, baseUrl: getEnv().BASE_URL };
}
```
action (zaproszenie):
```ts
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const fd = await args.request.formData();
  const parsed = AmbassadorInviteSchema.safeParse({
    displayName: fd.get("displayName"), email: fd.get("email"), regionId: fd.get("regionId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "ambasadorzy.form.fallbackError" };
  try {
    const token = await inviteAmbassador(db, {
      organizationId: orgId, invitedByUserId: user.id,
      regionId: parsed.data.regionId, displayName: parsed.data.displayName, email: parsed.data.email,
    });
    return { invite: { url: `${getEnv().BASE_URL}/zaproszenie/${token}`, displayName: parsed.data.displayName, email: parsed.data.email } };
  } catch (e) {
    if (e instanceof AmbassadorError) return { error: "ambasadorzy.validation.regionRequired", errorMessage: e.userMessage };
    throw e;
  }
}
```
Komponent: mirror `trener/podopieczni._index.tsx` — `<ListControls>` (sort nazwa A–Z/Z–A; filtr status aktywny/wstrzymany — opcjonalnie; szukajka po nazwie, **in-memory** bo mała skala), lista (`list-row`): avatar+nazwa, region, liczba podopiecznych, badge statusu, chevron → `/marka/ambasadorzy/:id`; przycisk „Zaproś ambasadora" → modal z polami imię + e-mail + **select regionu** (`regions` z loadera); `InviteCreatedCard` z `CopyButton` po sukcesie; stan pusty. Błędy przez `tDyn` (+ `errorMessage` gdy jest). i18n `marka` (`ambasadorzy.*`).

- [ ] **Step 4:** `npm run typecheck`, `npm run build`, `npm run lint` → PASS.
- [ ] **Step 5:** `/code-review` + UI/design-system.

---

## Task 6: Trasa profilu `/marka/ambasadorzy/:trainerId` + dezaktywacja

**Files:** Create/replace `app/routes/marka/ambasadorzy.$trainerId.tsx`

> UI → `frontend-design`. Profil rozszerzony + akcje.

- [ ] **Step 1: loader** — `requireUser(brand_admin)`; orgId 404; `const profile = await getAmbassadorProfile(db, orgId, trainerId)`; null → 404; zwróć `profile`.
- [ ] **Step 2: action** — intencje `deactivate`/`reactivate`:
```ts
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "brand_admin" });
  const orgId = user.organizationId;
  if (!orgId) throw new Response("not found", { status: 404 });
  const trainerId = args.params.trainerId ?? "";
  const intent = (await args.request.formData()).get("intent");
  try {
    if (intent === "deactivate") await deactivateAmbassador(db, orgId, trainerId);
    else if (intent === "reactivate") await reactivateAmbassador(db, orgId, trainerId);
    else return { error: "ambasadorzy.profil.actionError" };
    return { ok: true as const };
  } catch (e) {
    if (e instanceof AmbassadorError) return { error: "ambasadorzy.profil.actionError", errorMessage: e.userMessage };
    throw e;
  }
}
```
- [ ] **Step 3: komponent** — karta tożsamości (imię, e-mail, region, „od {{date}}"), badge status (aktywny/wstrzymany), kafelki metryk (`stat`): aktywni podopieczni, logi 7d/30d, MRR (`fmtMoney(mrrGrosze, locale, "pln")`). Akcja: gdy aktywny → `ConfirmSubmitButton intent=deactivate` (destructive, treść ostrzega o wstrzymaniu podopiecznych + pauzie subskrypcji); gdy wstrzymany → `intent=reactivate`. i18n `marka:ambasadorzy.profil.*`. Crumbs do `/marka/ambasadorzy`.
- [ ] **Step 4:** `npm run typecheck`, `npm run build`, `npm run lint` → PASS.
- [ ] **Step 5:** `/code-review` (org-scope 404; confirm na destructive) + UI.

---

## Task 7: Gate podopiecznego + ekran „wstrzymane"

**Files:** Modify `app/routes/podopieczny/_layout.tsx`, `app/routes.ts`; Create `app/routes/podopieczny/wstrzymane.tsx`

- [ ] **Step 1: routes.ts** — dodaj POZA layoutem podopiecznego (obok `aktywuj`):
```ts
    route("wstrzymane", "routes/podopieczny/wstrzymane.tsx"),
```
- [ ] **Step 2: gate w `_layout.tsx`** — po `requireUser(trainee)`, PRZED bramką płatności, dodaj sprawdzenie statusu trenera:
```ts
  if (user.trainerId) {
    const [trainer] = await db
      .select({ archivedAt: schema.users.archivedAt })
      .from(schema.users)
      .where(eq(schema.users.id, user.trainerId))
      .limit(1);
    if (trainer?.archivedAt) throw redirect("/podopieczny/wstrzymane");
  }
```
(Wstrzymanie wyprowadzone z trenera — brak osobnej flagi.)
- [ ] **Step 3: `wstrzymane.tsx`** — POZA layoutem (mirror `aktywuj.tsx`). loader:
```ts
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request, db, { role: "trainee" });
  if (user.trainerId) {
    const [trainer] = await db.select({ archivedAt: schema.users.archivedAt, name: schema.users.displayName })
      .from(schema.users).where(eq(schema.users.id, user.trainerId)).limit(1);
    if (!trainer?.archivedAt) throw redirect("/podopieczny"); // reaktywowany → wróć
    return { trainerName: trainer.name };
  }
  throw redirect("/podopieczny");
}
```
Komponent: pełnoekranowa karta `auth-shell`/`auth-card` (jak `aktywuj`): nagłówek „Konto wstrzymane", treść `podopieczny:wstrzymane.*` (wyjaśnienie: trener nieaktywny, skontaktuj się), link „Wyloguj" (`/wyloguj`). Brak akcji.
- [ ] **Step 4:** `npm run typecheck`, `npm run build`, `npm run lint` → PASS.
- [ ] **Step 5:** `/code-review` (gate przed płatnością; brak pętli redirectów).

---

## Task 8: i18n — `marka:ambasadorzy.*`, `podopieczny:wstrzymane.*`, copy trenera w zaproszeniu (pl+fr)

**Files:** Modify `app/locales/pl/marka.json` + `fr`, `app/locales/pl/podopieczny.json` + `fr`, `app/locales/pl/auth.json` + `fr`; Modify `app/routes/zaproszenie.$token.tsx`

> Parytet pl/fr MUSI przejść. Klucze pojedyncze z `{{count}}` (bez `_one/_few/_other`).

- [ ] **Step 1:** Dodaj do `marka.json` (pl+fr) blok `ambasadorzy` z kluczami używanymi w Taskach 5–6: `eyebrow`, `title`, `empty`, `total` ("{{count}} ambasadorów"), `invite`, `searchPlaceholder`, `sort.name_asc`, `sort.name_desc`, `filterStatus.{label,all,active,suspended}`, `form.{title,name,namePlaceholder,email,emailPlaceholder,region,regionPlaceholder,cancel,generate,fallbackError}`, `inviteCard.{generated,instructions,copy,tokenNote}`, `validation.{nameRequired,emailRequired,emailInvalid,regionRequired}`, `table.{ambassador,region,trainees,status,since,active,suspended}`, `profil.{eyebrow,crumbs,trainees,logs7d,logs30d,mrr,statusActive,statusSuspended,deactivate,reactivate,deactivateConfirmTitle,deactivateConfirmMessage,deactivateConfirmText,actionError,saved}`.
- [ ] **Step 2:** Dodaj do `podopieczny.json` (pl+fr) blok `wstrzymane`: `eyebrow`, `title`, `body` (z `{{trainer}}` lub neutralnie), `logout`.
- [ ] **Step 3:** Dodaj do `auth.json` (pl+fr) warianty copy dla zaproszenia trenera: `invite.trainerEyebrow`, `invite.trainerTitle` ("{{name}}, dołącz jako ambasador"), `invite.trainerSubtitle`. W `zaproszenie.$token.tsx` loader zwróć `targetRole: invite.targetRole`; w komponencie wybierz eyebrow/title/subtitle wg `targetRole` (`trainer` → nowe klucze, inaczej istniejące). Reszta formularza bez zmian (e-mail autorytatywny z invite, hasło, displayName).
- [ ] **Step 4:** `npx vitest run app/locales` → PASS (parytet). `npm run typecheck` → PASS.
- [ ] **Step 5:** `npx biome format --write` na zmienionych json/tsx; `npm run lint` → PASS.
- [ ] **Step 6:** `/code-review` (parytet, sensowność FR, copy trenera).

---

## Task 9: Testy integracyjne (PISANE — właściciel uruchamia)

**Files:** Create `tests/ambassadors.itest.ts`

> NIE uruchamiaj. Mirror harnessu istniejących `tests/*.itest.ts` (testcontainers, migrate, helpery `ensureOrganization`/`ensureRegion`/`ensureBrandAdmin`/`assignUserToOrgRegion`). Stripe: zmockuj moduł `~/lib/stripe/subscriptions` (`pauseSubscription`/`resumeSubscription`) lub testuj bez konfiguracji Stripe — patrz jak inne itesty radzą sobie ze Stripe; jeśli brak wzorca, asercję pauzy oznacz `// NOTE` i skup się na DB (archived_at + gate).

- [ ] **Step 1: scenariusze** (`it`):
  1. `inviteAmbassador` → konsumpcja tokenu (`consumeInvite` z e-mailem z invite) → user `role:"trainer"`, `organization_id=org`, `region_id` ustawiony, `trainer_id NULL`.
  2. Istniejące zaproszenie podopiecznego (`createInvite` z `trainerId`, domyślny targetRole) → konsumpcja tworzy `trainee` (regresja — backfill `target_role`).
  3. `deactivateAmbassador` → `users.archived_at` ustawione; `readSession` dla jego sesji zwraca null (login zablokowany — wywołaj `readSession` po utworzeniu sesji i archiwizacji); jego podopieczny: zapytanie gate'a (trainer.archivedAt) wykrywa wstrzymanie. (Stripe: jeśli mockujesz — pauseSubscription wywołane dla aktywnej pary.)
  4. `reactivateAmbassador` → `archived_at` null; (resume wywołane dla spauzowanej pary).
  5. Izolacja: `getAmbassadorProfile(orgB, trainerOrgA)` → null; `deactivateAmbassador(orgB, trainerOrgA)` rzuca `AmbassadorError`; `listAmbassadors(orgA)` nie zawiera trenera orgB.
  6. CHECK `invites_target_check`: insert trener-invite bez `invited_by_user_id`/`organization_id` rzuca; trainee-invite bez `trainer_id` rzuca.
  7. Metryki: `getAmbassadorProfile` liczy `traineeCount`, `logs7d/30d` (wstaw `workout_logs` z datami), `mrrGrosze` (wstaw `coaching_subscriptions` status active → sumuje; paused/past_due pomija).
- [ ] **Step 2:** `npm run typecheck` → PASS (kompiluje).
- [ ] **Step 3:** Handoff-nota: `npm run test:itest` pod Dockerem.
- [ ] **Step 4:** `/code-review`.

---

## Task 10: Dokumentacja

**Files:** Modify `app/lib/README.md`, `app/lib/auth/README.md` (Task 2), `app/lib/db/README.md` (Task 1), `app/routes/README.md`, `app/routes/marka/README.md`, `app/routes/podopieczny/README.md`, `CLAUDE.md`

- [ ] **Step 1:** `app/lib/README.md` — nowe `ambassadors.ts` (org-scoped: lista/profil+metryki/zaproś/dezaktywuj+reaktywuj, pauza Stripe best-effort; `AmbassadorError`) i `ambassador-types.ts` (`AmbassadorInviteSchema`).
- [ ] **Step 2:** `app/routes/marka/README.md` — nowe trasy `ambasadorzy._index` (lista+zaproszenie) i `ambasadorzy.$trainerId` (profil+dezaktywacja); pozycja „Ambasadorzy" aktywna.
- [ ] **Step 3:** `app/routes/podopieczny/README.md` — nowa trasa `wstrzymane` (poza layoutem; gate przy dezaktywowanym trenerze) + nota o gate w `_layout`.
- [ ] **Step 4:** `app/routes/README.md` — wzmianka o `zaproszenie/:token` obsługującym też zaproszenia trenera.
- [ ] **Step 5:** `CLAUDE.md` — mapa: `app/lib/ambassadors.ts` (+ `ambassador-types.ts`); rozszerzony obszar `/marka` (ambasadorzy).
- [ ] **Step 6:** `/code-review` docs.

---

## Task 11: Bramki końcowe + security-review + handoff

- [ ] **Step 1:** `npx vitest run app` (jednostkowe; NIE itesty) → all PASS. `npm run typecheck`, `npm run lint`, `npm run build` → PASS. Zacytuj wyniki.
- [ ] **Step 2:** `/security-review` — dotyka auth (uogólnione zaproszenia, nowa rola w consume), tenant-scope (org), dezaktywacja (blokada dostępu + Stripe). Zaadresuj findings.
- [ ] **Step 3:** Handoff: lista plików; proponowany commit; **wymagane** `db:generate` (interaktywne — enum `invite_target_role` + kolumny `invites` + CHECK; default backfilluje `target_role='trainee'`) → `db:migrate`; brak env; komenda itestów pod Dockerem; ścieżka ręcznej weryfikacji: prezes → /marka/ambasadorzy → „Zaproś" (region) → otwórz link → załóż konto trenera → zaloguj (/trener); dezaktywuj ambasadora → jego podopieczny widzi „wstrzymane" + (Stripe) subskrypcja paused → reaktywuj.

---

## Notatki dla wykonawcy
- **Org-scope = bezpieczeństwo:** każda funkcja `ambassadors.ts` i loader/akcja `/marka/ambasadorzy*` filtruje po `organizationId` prezesa; trener spoza org → 404.
- **Blokady logowania NIE dotykaj** — `login.tsx`/`readSession` już odrzucają `archived_at`. Dodajesz tylko gate podopiecznego + ekran „wstrzymane".
- **Stripe poza transakcją, best-effort** (loguj błąd, nie wywracaj dezaktywacji); no-op gdy nieskonfigurowany — `pauseSubscription` rzuci `SubscriptionError` przy braku subskrypcji, łapiemy.
- Przy niezgodności nazw (schema/enum) — sprawdź realne w `schema.ts`, nie zgaduj.
- UI po polsku; design-system; brand `kalisthenos` małą literą.
