import {
  redirect,
  Form,
  useActionData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import {
  buildSetCookie,
  createSession,
  defaultPathForRole,
  getDummyPasswordHash,
  parseSessionId,
  readSession,
  verifyPassword,
} from "~/lib/auth";
import { enforceRateLimit, RATE_LIMITS, rateLimited, resetRateLimit } from "~/lib/rate-limit";

const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(1024),
});

const GENERIC_ERROR = "login.error" as const;

export async function loader(args: LoaderFunctionArgs) {
  const sid = parseSessionId(args.request.headers.get("cookie"));
  if (sid) {
    const session = await readSession(db, sid);
    if (session) {
      return redirect(defaultPathForRole(session.user.role));
    }
  }
  return null;
}

export async function action(args: ActionFunctionArgs) {
  const retry = enforceRateLimit(args.request, RATE_LIMITS.login);
  if (retry !== null) return rateLimited(retry);

  const formData = await args.request.formData();
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    // Still spend a constant-time verify to avoid leaking validation-rejection
    // via response latency.
    await verifyPassword(await getDummyPasswordHash(), "x");
    return { error: GENERIC_ERROR };
  }

  const { email, password } = parsed.data;
  const rows = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const user = rows[0];

  // Constant-time path: when the user doesn't exist or has no password, verify
  // against a dummy hash so total request latency doesn't reveal email existence.
  if (!user || !user.passwordHash || user.archivedAt) {
    await verifyPassword(await getDummyPasswordHash(), password);
    return { error: GENERIC_ERROR };
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    return { error: GENERIC_ERROR };
  }

  const { id, expiresAt } = await createSession(db, {
    userId: user.id,
    userAgentHint: args.request.headers.get("user-agent"),
  });
  resetRateLimit("login", args.request);
  return redirect(defaultPathForRole(user.role), {
    headers: { "Set-Cookie": buildSetCookie(id, expiresAt) },
  });
}

export default function Login() {
  const actionData = useActionData<typeof action>();
  const { t } = useTranslation(["auth", "common"]);
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" />
          <span>{t("common:app.name")}</span>
          <span className="brand-dot" />
        </div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {t("login.eyebrow")}
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 18 }}>{t("login.title")}</h1>
        <Form method="post" style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <label htmlFor="login-email">{t("login.email")}</label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor="login-password">{t("login.password")}</label>
            <input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
            />
          </div>
          {actionData && "error" in actionData && (
            <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
              {(t as (k: string) => string)(actionData.error)}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: 4 }}>
            {t("login.submit")}
          </button>
        </Form>
      </div>
    </main>
  );
}
