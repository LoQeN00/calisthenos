import { and, eq } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from "react-router";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDateTime } from "~/lib/format";
import { fmtMoney, MonthlyAmountSchema, parsePlnToGrosze } from "~/lib/money";
import { listPaymentsForPair } from "~/lib/payments";
import { invoiceStatusLabelKey, subscriptionPresentation } from "~/lib/stripe/status";
import {
  cancelSubscription,
  getSubscriptionForPair,
  pauseSubscription,
  resumeSubscription,
  setMonthlyAmount,
  SubscriptionError,
} from "~/lib/stripe/subscriptions";
import { assertTraineeOwnedBy } from "~/lib/trainees";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  await assertTraineeOwnedBy(db, user.id, traineeId);

  const [trainee] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, user.id),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  if (!trainee) throw new Response("not found", { status: 404 });

  const [sub, payments] = await Promise.all([
    getSubscriptionForPair(db, user.id, traineeId),
    listPaymentsForPair(db, user.id, traineeId),
  ]);

  return {
    trainee,
    sub,
    payments,
    presentation: subscriptionPresentation(sub?.status ?? "none"),
  };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  await assertTraineeOwnedBy(db, user.id, traineeId);

  const fd = await args.request.formData();
  const intent = fd.get("intent");

  try {
    if (intent === "set-amount") {
      const grosze = parsePlnToGrosze(String(fd.get("amount") ?? ""));
      const parsed = grosze === null ? null : MonthlyAmountSchema.safeParse(grosze);
      if (!parsed || !parsed.success) {
        return { error: "platnosci.action.amountInvalid" };
      }
      // Czy para ma już aktywną subskrypcję w Stripe — wtedy zmiana kwoty
      // zacznie obowiązywać dopiero od następnego odnowienia.
      const before = await getSubscriptionForPair(db, user.id, traineeId);
      await setMonthlyAmount(db, user.id, traineeId, parsed.data);
      const success = before?.stripeSubscriptionId
        ? "platnosci.action.amountSavedNextRenewal"
        : "platnosci.action.amountSaved";
      return { success };
    }
    if (intent === "cancel") {
      await cancelSubscription(db, user.id, traineeId);
      return { success: "platnosci.action.subscriptionEnded" };
    }
    if (intent === "pause") {
      await pauseSubscription(db, user.id, traineeId);
      return { success: "platnosci.action.subscriptionPaused" };
    }
    if (intent === "resume") {
      await resumeSubscription(db, user.id, traineeId);
      return { success: "platnosci.action.subscriptionResumed" };
    }
  } catch (e) {
    if (e instanceof SubscriptionError) return { error: e.message };
    throw e;
  }
  return null;
}

const TONE_COLOR: Record<string, string> = {
  ok: "var(--ok)",
  warn: "var(--danger)",
  neutral: "var(--muted)",
};

export default function TrenerPlatnosci() {
  const { trainee, sub, payments, presentation } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, i18n } = useTranslation("trenerPodopieczni");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const canCancel = sub?.status === "active" || sub?.status === "past_due";
  const canPause = sub?.status === "active" || sub?.status === "past_due";
  const isPaused = sub?.status === "paused";

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("platnosci.eyebrow", { name: trainee.displayName })}
          </div>
          <h1>{t("platnosci.title")}</h1>
          <div className="sub">
            {t("platnosci.subtitle")}
          </div>
        </div>
      </div>

      {actionData && "success" in actionData && actionData.success && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          {tDyn(t, actionData.success)}
        </div>
      )}
      {actionData && "error" in actionData && actionData.error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {actionData.error.startsWith("platnosci.") ? tDyn(t, actionData.error) : actionData.error}
        </div>
      )}

      <div className="card" style={{ maxWidth: 560, marginBottom: 20 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>{t("platnosci.subscription.heading")}</h2>
        <p style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="muted">{t("platnosci.subscription.statusLabel")}</span>
          <span
            className="badge"
            style={{ color: TONE_COLOR[presentation.tone], whiteSpace: "nowrap" }}
          >
            <span className="badge-dot" style={{ background: TONE_COLOR[presentation.tone] }} />
            {tDyn(t, presentation.labelKey)}
          </span>
        </p>
        {sub ? (
          <p style={{ margin: "0 0 16px" }}>
            {t("platnosci.subscription.monthlyAmount")}{" "}
            <strong>{fmtMoney(sub.amountGrosze, locale, sub.currency)}</strong>
          </p>
        ) : (
          <p className="muted" style={{ margin: "0 0 16px" }}>
            {t("platnosci.subscription.noAmount")}
          </p>
        )}

        <Form method="post" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input type="hidden" name="intent" value="set-amount" />
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              {t("platnosci.subscription.amountField")}
            </span>
            <input
              type="text"
              name="amount"
              inputMode="decimal"
              placeholder={t("platnosci.subscription.amountPlaceholder")}
              defaultValue={sub ? (sub.amountGrosze / 100).toFixed(2) : ""}
              className="input"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            {t("platnosci.subscription.saveAmount")}
          </button>
        </Form>

        {canPause && (
          <Form method="post" style={{ marginTop: 16 }}>
            <input type="hidden" name="intent" value="pause" />
            <button type="submit" className="btn btn-ghost">
              {t("platnosci.subscription.pause")}
            </button>
          </Form>
        )}

        {isPaused && (
          <Form method="post" style={{ marginTop: 16 }}>
            <input type="hidden" name="intent" value="resume" />
            <button type="submit" className="btn btn-primary">
              {t("platnosci.subscription.resume")}
            </button>
          </Form>
        )}

        {canCancel && (
          <Form method="post" style={{ marginTop: 16 }}>
            <input type="hidden" name="intent" value="cancel" />
            <button type="submit" className="btn btn-ghost" style={{ color: "var(--danger)" }}>
              {t("platnosci.subscription.cancel")}
            </button>
          </Form>
        )}
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>{t("platnosci.history.heading")}</h2>
        {payments.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("platnosci.history.empty")}
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {payments.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border, #e5e7eb)",
                }}
              >
                <span>
                  <strong>{fmtMoney(p.amountGrosze, locale, p.currency)}</strong>{" "}
                  <span className="muted" style={{ fontSize: 13 }}>
                    {(() => {
                      const key = invoiceStatusLabelKey(p.status);
                      return key ? tDyn(t, key) : p.status;
                    })()}
                  </span>
                  {p.paidAt && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      {" · "}
                      {fmtDateTime(p.paidAt.toISOString(), locale)}
                    </span>
                  )}
                </span>
                {p.hostedInvoiceUrl && (
                  <a href={p.hostedInvoiceUrl} target="_blank" rel="noreferrer noopener">
                    {t("platnosci.history.invoice")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
