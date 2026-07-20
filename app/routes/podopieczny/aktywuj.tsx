import { eq } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { assertTrainerActive } from "~/lib/trainee-access";
import { stripeApiConfigured } from "~/lib/env";
import { fmtMoney } from "~/lib/money";
import { hasAppAccess, paymentRequired } from "~/lib/stripe/access";
import { getConnectionRow } from "~/lib/stripe/connections";
import {
  createCheckoutSession,
  getSubscriptionForPair,
  SubscriptionError,
} from "~/lib/stripe/subscriptions";

// ============================================================
// Loader: ekran aktywacji żyje POZA layoutem podopiecznego (bez sidenav),
// żeby gate w _layout.tsx nie wpadał w pętlę redirectów. Gdy podopieczny
// ma już dostęp (lub płatność niewymagana) — odsyłamy do dashboardu.
// ============================================================

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request, db, { role: "trainee" });
  // Wstrzymanie ma pierwszeństwo nad aktywacją płatności (trasa poza layoutem).
  await assertTrainerActive(db, user);
  const trainerId = user.trainerId!;

  const sub = await getSubscriptionForPair(db, trainerId, user.id);
  const conn = await getConnectionRow(db, trainerId);
  const trainerRow = await db
    .select({ name: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, trainerId))
    .limit(1);

  const required = paymentRequired({
    stripeConfigured: stripeApiConfigured(),
    chargesEnabled: Boolean(conn?.chargesEnabled),
    hasPrice: Boolean(sub?.stripePriceId),
  });
  const access = hasAppAccess({ paymentRequired: required, status: sub?.status ?? null });
  // Już ma dostęp / płatność niewymagana — nie ma po co tu być.
  if (access) throw redirect("/podopieczny");

  return {
    trainerName: trainerRow[0]?.name ?? null,
    amountGrosze: sub?.amountGrosze ?? null,
    currency: sub?.currency ?? "pln",
  };
}

// ============================================================
// Action: start Checkout. Tenant-scope do własnej pary trener+podopieczny.
// ============================================================

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request, db, { role: "trainee" });
  // Wstrzymany podopieczny nie może inicjować płatności (Checkout) — gate jawnie.
  await assertTrainerActive(db, user);
  const fd = await request.formData();
  const intent = fd.get("intent");
  if (intent === "subscribe") {
    try {
      const url = await createCheckoutSession(db, {
        trainerId: user.trainerId!,
        traineeId: user.id,
        traineeEmail: user.email,
        traineeName: user.displayName,
      });
      return redirect(url);
    } catch (e) {
      if (e instanceof SubscriptionError) return { error: e.message };
      throw e;
    }
  }
  return null;
}

// ============================================================
// Widok: pełnoekranowa, wyśrodkowana karta brandowa (jak zaproszenie/login).
// ============================================================

export default function AktywujPage() {
  const { trainerName, amountGrosze, currency } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const canceled = searchParams.get("canceled") === "1";
  const { t, i18n } = useTranslation("podopieczny");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {t("aktywuj.eyebrow")}
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t("aktywuj.title")}</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          {trainerName
            ? t("aktywuj.leadWithTrainer", { trainer: trainerName })
            : t("aktywuj.leadNoTrainer")}
        </p>

        {amountGrosze != null && (
          <div
            className="card"
            style={{
              padding: 16,
              marginBottom: 18,
              background: "var(--surface-2)",
              display: "grid",
              gap: 4,
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {trainerName
                ? t("aktywuj.planNameWithTrainer", { trainer: trainerName })
                : t("aktywuj.planNameNoTrainer")}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {t("aktywuj.perMonth", { amount: fmtMoney(amountGrosze, locale, currency) })}
            </div>
            <div className="text-xs muted">{t("aktywuj.renewNote")}</div>
          </div>
        )}

        {canceled && (
          <p className="alert" style={{ marginBottom: 14 }}>
            {t("aktywuj.canceled")}
          </p>
        )}

        {actionData && "error" in actionData && (
          <p className="alert alert-error" style={{ marginBottom: 14 }}>
            {actionData.error}
          </p>
        )}

        <Form method="post" style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="intent" value="subscribe" />
          <button type="submit" className="btn btn-primary btn-lg">
            {t("aktywuj.submit")}
          </button>
        </Form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/wyloguj" className="muted text-sm">
            {t("aktywuj.logout")}
          </Link>
        </div>
      </div>
    </main>
  );
}
