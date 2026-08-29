import {
  redirect,
  Form,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { db } from "~/lib/db/client";
import type * as schema from "~/lib/db/schema";
import {
  buildSetCookie,
  consumeInvite,
  createSession,
  findInviteByToken,
  hashPassword,
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
  const invite = await findInviteByToken(db, token);
  // Treat unknown / consumed / expired invites identically as 404 so a probe can't
  // distinguish "wrong token" from "right token but used/expired".
  if (!invite || invite.consumedAt || invite.expiresAt.getTime() < Date.now()) {
    throw new Response("invite not found", { status: 404 });
  }
  return { displayName: invite.displayName, emailHint: invite.email };
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
    return { error: "Sprawdź pola formularza." };
  }

  // Email is authoritative from the invite — the trainer sets it, the trainee
  // accepts it. Don't trust anything the form posted under that name.
  const invite = await findInviteByToken(db, token);
  if (!invite || invite.consumedAt || invite.expiresAt.getTime() < Date.now()) {
    return { error: "Zaproszenie nieprawidłowe." };
  }
  if (!invite.email) {
    return { error: "To zaproszenie nie ma przypisanego emaila — poproś trenera o nowe." };
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
    if (/expired/i.test(msg)) return { error: "Zaproszenie wygasło." };
    if (/used/i.test(msg)) return { error: "Zaproszenie już użyte." };
    return { error: "Zaproszenie nieprawidłowe." };
  }
  const { id, expiresAt } = await createSession(db, {
    userId: user.id,
    userAgentHint: args.request.headers.get("user-agent"),
  });
  resetRateLimit("invite", args.request);
  const redirectTo = user.role === "trainer" ? "/trener" : "/podopieczny";
  // Best-effort: zapisz kwotę miesięczną z zaproszenia. Po /podopieczny gate
  // w layoutcie sam odeśle nieopłaconych do /podopieczny/aktywuj — nie ma już
  // specjalnego celu ?onboarding=1.
  if (resultKind === "created" && invite.monthlyAmountGrosze != null && stripeApiConfigured()) {
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
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Zaproszenie
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Witaj, {loaderData.displayName}.</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          Trener Cię zaprosił. Ustaw email i hasło.
        </p>
        <Form method="post" style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <label htmlFor="inv-email">Email</label>
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
              Email ustawia trener — nie da się go tu zmienić.
            </div>
          </div>
          <div className="field">
            <label htmlFor="inv-name">Nazwa wyświetlana</label>
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
            <label htmlFor="inv-password">Hasło (min. 8 znaków)</label>
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
              {actionData.error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: 4 }}>
            Załóż konto
          </button>
        </Form>
      </div>
    </main>
  );
}
