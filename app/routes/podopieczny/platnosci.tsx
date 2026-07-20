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
import { eq } from "drizzle-orm";
import { useTranslation } from "react-i18next";
import { requireUser } from "~/lib/auth";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDate, fmtDateTime } from "~/lib/format";
import { fmtMoney } from "~/lib/money";
import { listPaymentsForTrainee } from "~/lib/payments";
import { invoiceStatusLabelKey, subscriptionPresentation } from "~/lib/stripe/status";
import {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionForPair,
  pauseSubscription,
  resumeSubscription,
  SubscriptionError,
} from "~/lib/stripe/subscriptions";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const trainerId = user.trainerId!;

  const [sub, payments, trainerRow] = await Promise.all([
    getSubscriptionForPair(db, trainerId, user.id),
    listPaymentsForTrainee(db, user.id),
    db
      .select({ name: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, trainerId))
      .limit(1),
  ]);
  const trainerName = trainerRow[0]?.name ?? null;

  const presentation = subscriptionPresentation(sub?.status ?? "none");

  const onboarding = new URL(args.request.url).searchParams.get("onboarding") === "1";

  return { sub, payments, presentation, onboarding, trainerName };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const trainerId = user.trainerId!;

  const fd = await args.request.formData();
  const intent = fd.get("intent");

  try {
    if (intent === "subscribe") {
      const url = await createCheckoutSession(db, {
        trainerId,
        traineeId: user.id,
        traineeEmail: user.email,
        traineeName: user.displayName,
      });
      return redirect(url);
    }
    if (intent === "portal") {
      return redirect(await createPortalSession(db, trainerId, user.id));
    }
    if (intent === "pause") {
      await pauseSubscription(db, user.trainerId!, user.id);
      return null;
    }
    if (intent === "resume") {
      await resumeSubscription(db, user.trainerId!, user.id);
      return null;
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

export default function PodopiecznyPlatnosci() {
  const { sub, payments, presentation, onboarding, trainerName } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation("platnosci");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const subCurrency = sub?.currency ?? "pln";

  const isActive = sub?.status === "active";
  const isPastDue = sub?.status === "past_due";
  const isPaused = sub?.status === "paused";
  const canPause = isActive || isPastDue;
  const needsPortal =
    sub?.status === "active" ||
    sub?.status === "past_due" ||
    sub?.status === "unpaid" ||
    sub?.status === "paused" ||
    sub?.status === "incomplete";

  // Show subscribe button only when trainer has set a price AND subscription is absent or canceled.
  const canSubscribe =
    sub != null &&
    sub.stripePriceId != null &&
    (sub.status === "none" || sub.status === "canceled");

  const trainerHasNoPrice = !sub || !sub.stripePriceId;

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("eyebrow")}
          </div>
          <h1>{t("title")}</h1>
          <div className="sub">{t("subtitle")}</div>
        </div>
      </div>

      {searchParams.get("ok") === "1" && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          {t("alert.activated")}
        </div>
      )}
      {searchParams.get("canceled") === "1" && (
        <div className="alert" style={{ marginBottom: 16 }}>
          {t("alert.canceled")}
        </div>
      )}
      {actionData != null && "error" in actionData && actionData.error != null && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {actionData.error}
        </div>
      )}

      {onboarding && (
        <div className="card" style={{ maxWidth: 560, marginBottom: 20 }}>
          {sub?.amountGrosze ? (
            <>
              <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{t("onboarding.heading")}</h2>
              <p style={{ margin: "0 0 12px" }}>
                {t("onboarding.withPricePrefix")}{" "}
                <strong>{fmtMoney(sub.amountGrosze, locale, subCurrency)}</strong>{" "}
                {t("onboarding.withPriceSuffix")}
              </p>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{t("onboarding.heading")}</h2>
              <p style={{ margin: "0 0 12px" }}>{t("onboarding.noPrice")}</p>
            </>
          )}
          <Link to="/podopieczny" className="muted" style={{ fontSize: 14 }}>
            {t("onboarding.later")}
          </Link>
        </div>
      )}

      {/* Status card */}
      <div className="card" style={{ maxWidth: 560, marginBottom: 20 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>{t("subscription.heading")}</h2>

        <p style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="muted">{t("subscription.statusLabel")}</span>
          <span
            className="badge"
            style={{ color: TONE_COLOR[presentation.tone], whiteSpace: "nowrap" }}
          >
            <span className="badge-dot" style={{ background: TONE_COLOR[presentation.tone] }} />
            {tDyn(t, presentation.labelKey)}
          </span>
        </p>

        {isPastDue && (
          <div className="alert alert-error" style={{ margin: "0 0 12px" }}>
            {t("subscription.pastDueAlert")}
          </div>
        )}

        {sub?.amountGrosze ? (
          <p style={{ margin: "0 0 8px" }}>
            {t("subscription.amountLabel")}{" "}
            <strong>{fmtMoney(sub.amountGrosze, locale, subCurrency)}</strong>{" "}
            {t("subscription.perMonth")}
          </p>
        ) : null}

        {isActive && sub?.currentPeriodEnd ? (
          <p className="muted" style={{ margin: "0 0 16px", fontSize: 13 }}>
            {t("subscription.paidUntil", {
              date: fmtDate(sub.currentPeriodEnd.toISOString(), locale),
            })}
          </p>
        ) : (
          <div style={{ marginBottom: 16 }} />
        )}

        {trainerHasNoPrice ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {t("subscription.noPriceYet")}
          </p>
        ) : canSubscribe ? (
          <>
            {sub?.amountGrosze ? (
              <div
                className="card"
                style={{ margin: "0 0 12px", background: "var(--surface-2, transparent)" }}
              >
                <p style={{ margin: "0 0 6px" }}>
                  {t("subscription.offerTrainerPrefix")}{" "}
                  <strong>{trainerName ?? t("subscription.yourTrainer")}</strong>
                </p>
                <p style={{ margin: "0 0 4px" }}>
                  {t("subscription.payNowLabel")}{" "}
                  <strong>{fmtMoney(sub.amountGrosze, locale, subCurrency)}</strong>
                </p>
                <p className="muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
                  {t("subscription.thenPrefix")}{" "}
                  <strong>{fmtMoney(sub.amountGrosze, locale, subCurrency)}</strong>{" "}
                  {t("subscription.thenSuffix")}
                </p>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {t("subscription.autoRenew")}
                </p>
              </div>
            ) : null}
            <Form method="post">
              <input type="hidden" name="intent" value="subscribe" />
              <button type="submit" className="btn btn-primary">
                {t("subscription.subscribe")}
              </button>
            </Form>
          </>
        ) : null}

        {needsPortal && (
          <Form method="post" style={{ marginTop: canSubscribe ? 12 : 0 }}>
            <input type="hidden" name="intent" value="portal" />
            <button type="submit" className="btn btn-ghost">
              {t("subscription.managePayments")}
            </button>
          </Form>
        )}

        {canPause && (
          <Form method="post" style={{ marginTop: 12 }}>
            <input type="hidden" name="intent" value="pause" />
            <button type="submit" className="btn btn-ghost">
              {t("subscription.pause")}
            </button>
          </Form>
        )}

        {isPaused && (
          <>
            <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>
              {t("subscription.pausedNote")}
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="resume" />
              <button type="submit" className="btn btn-primary">
                {t("subscription.resume")}
              </button>
            </Form>
          </>
        )}
      </div>

      {/* Payment history */}
      <div className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>{t("history.heading")}</h2>
        {payments.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("history.empty")}
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
                  <strong>{fmtMoney(p.amountGrosze, locale, p.currency ?? "pln")}</strong>{" "}
                  <span className="muted" style={{ fontSize: 13 }}>
                    {(() => {
                      const k = invoiceStatusLabelKey(p.status);
                      return k ? tDyn(t, k) : p.status;
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
                    {t("history.invoice")}
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
