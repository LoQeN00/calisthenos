import {
  redirect,
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useTranslation } from "react-i18next";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  buildSetCookie,
  consumeInvite,
  createSession,
  defaultPathForRole,
  hashPassword,
  hashToken,
} from "~/lib/auth";
import { enforceRateLimit, RATE_LIMITS, rateLimited, resetRateLimit } from "~/lib/rate-limit";
import { stripeApiConfigured } from "~/lib/env";
import { errorMeta, logger } from "~/lib/logger";
import { setMonthlyAmount } from "~/lib/stripe/subscriptions";

const AcceptSchema = z.object({
  displayName: z.string().min(1).max(80),
  password: z.string().min(8).max(1024),
});

export async function loader(args: LoaderFunctionArgs) {
  const token = args.params.token ?? "";
  const hash = hashToken(token);
  const rows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, hash))
    .limit(1);
  const invite = rows[0];
  // Treat unknown / consumed / expired invites identically as 404 so a probe can't
  // distinguish "wrong token" from "right token but used/expired".
  if (!invite || invite.consumedAt || invite.expiresAt.getTime() < Date.now()) {
    throw new Response("invite not found", { status: 404 });
  }
  return {
    displayName: invite.displayName,
    emailHint: invite.email,
    targetRole: invite.targetRole,
  };
}

export async function action(args: ActionFunctionArgs) {
  const retry = enforceRateLimit(args.request, RATE_LIMITS.invite);
  if (retry !== null) return rateLimited(retry);

  const token = args.params.token ?? "";
  const fd = await args.request.formData();
  const parsed = AcceptSchema.safeParse({
    displayName: fd.get("displayName"),
    password: fd.get("password"),
  });
  if (!parsed.success) {
    return { error: "invite.invalid_fields" };
  }

  // Email is authoritative from the invite — set by the inviter (trainer dla
  // podopiecznego, prezes dla ambasadora-trenera), accepted by the invitee.
  // Wymagane dla obu ról. Don't trust anything the form posted under that name.
  const inviteRows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.tokenHash, hashToken(token)))
    .limit(1);
  const invite = inviteRows[0];
  if (!invite || invite.consumedAt || invite.expiresAt.getTime() < Date.now()) {
    return { error: "invite.invalid" };
  }
  if (!invite.email) {
    return { error: "invite.no_email" };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  let user: schema.User;
  let resultKind: "created" | "replaced";
  try {
    const result = await consumeInvite(db, {
      token,
      chosenEmail: invite.email,
      chosenDisplayName: parsed.data.displayName,
      newPasswordHash: passwordHash,
    });
    user = result.user;
    resultKind = result.kind;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (/expired/i.test(msg)) return { error: "invite.expired" };
    if (/used/i.test(msg)) return { error: "invite.used" };
    return { error: "invite.invalid" };
  }
  const { id, expiresAt } = await createSession(db, {
    userId: user.id,
    userAgentHint: args.request.headers.get("user-agent"),
  });
  resetRateLimit("invite", args.request);
  const redirectTo = defaultPathForRole(user.role);
  // Best-effort: zapisz kwotę miesięczną z zaproszenia. Po /podopieczny gate
  // w layoutcie sam odeśle nieopłaconych do /podopieczny/aktywuj — nie ma już
  // specjalnego celu ?onboarding=1.
  if (
    resultKind === "created" &&
    invite.targetRole === "trainee" &&
    invite.trainerId != null &&
    invite.monthlyAmountGrosze != null &&
    stripeApiConfigured()
  ) {
    try {
      await setMonthlyAmount(db, invite.trainerId, user.id, invite.monthlyAmountGrosze);
    } catch (err) {
      // Nie blokuj założenia konta. Trener ustawi kwotę później.
      logger.error("onboarding.set_amount_failed", errorMeta(err));
    }
  }
  return redirect(redirectTo, { headers: { "Set-Cookie": buildSetCookie(id, expiresAt) } });
}

export default function InviteAccept() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation(["auth", "common"]);
  const isTrainer = loaderData.targetRole === "trainer";
  const eyebrow = isTrainer ? t("invite.trainerEyebrow") : t("invite.eyebrow");
  const title = isTrainer
    ? t("invite.trainerTitle", { name: loaderData.displayName })
    : t("invite.title", { name: loaderData.displayName });
  const subtitle = isTrainer ? t("invite.trainerSubtitle") : t("invite.subtitle");
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" />
          <span>{t("common:app.name")}</span>
          <span className="brand-dot" />
        </div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {eyebrow}
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          {subtitle}
        </p>
        <Form method="post" style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <label htmlFor="inv-email">{t("invite.email")}</label>
            <input
              id="inv-email"
              name="email"
              type="email"
              value={loaderData.emailHint ?? ""}
              readOnly
              autoComplete="email"
              className="input"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            />
            <div className="text-xs muted" style={{ marginTop: 4 }}>
              {t("invite.email_hint")}
            </div>
          </div>
          <div className="field">
            <label htmlFor="inv-name">{t("invite.display_name")}</label>
            <input
              id="inv-name"
              name="displayName"
              type="text"
              required
              defaultValue={loaderData.displayName}
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="inv-password">{t("invite.password")}</label>
            <input
              id="inv-password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
            />
          </div>
          {actionData && "error" in actionData && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
              {(t as (k: string) => string)(actionData.error)}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: 4 }}>
            {t("invite.submit")}
          </button>
        </Form>
      </div>
    </main>
  );
}
