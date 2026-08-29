import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  useActionData,
  useLoaderData,
} from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDateTime } from "~/lib/format";
import { fmtMoney, MonthlyAmountSchema, parsePlnToGrosze } from "~/lib/money";
import { listPaymentsForPair } from "~/lib/payments";
import { invoiceStatusLabel, subscriptionPresentation } from "~/lib/stripe/status";
import {
  cancelSubscription,
  getSubscriptionForPair,
  pauseSubscription,
  resumeSubscription,
  setMonthlyAmount,
  SubscriptionError,
} from "~/lib/stripe/subscriptions";
import { assertTraineeOwnedBy, findTraineeOfTrainer } from "~/lib/trainees";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  await assertTraineeOwnedBy(db, user.id, traineeId);

  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
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
        return { error: "Podaj poprawną kwotę (min. 2 zł)." };
      }
      // Czy para ma już aktywną subskrypcję w Stripe — wtedy zmiana kwoty
      // zacznie obowiązywać dopiero od następnego odnowienia.
      const before = await getSubscriptionForPair(db, user.id, traineeId);
      await setMonthlyAmount(db, user.id, traineeId, parsed.data);
      const success = before?.stripeSubscriptionId
        ? "Kwota zapisana. Nowa kwota zacznie obowiązywać od następnego odnowienia."
        : "Kwota zapisana.";
      return { success };
    }
    if (intent === "cancel") {
      await cancelSubscription(db, user.id, traineeId);
      return { success: "Subskrypcja zakończona." };
    }
    if (intent === "pause") {
      await pauseSubscription(db, user.id, traineeId);
      return { success: "Subskrypcja wstrzymana." };
    }
    if (intent === "resume") {
      await resumeSubscription(db, user.id, traineeId);
      return { success: "Subskrypcja wznowiona." };
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
  const canCancel = sub?.status === "active" || sub?.status === "past_due";
  const canPause = sub?.status === "active" || sub?.status === "past_due";
  const isPaused = sub?.status === "paused";

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Podopieczny · {trainee.displayName}
          </div>
          <h1>Płatności</h1>
          <div className="sub">
            Ustal miesięczną kwotę prowadzenia i przeglądaj historię płatności.
          </div>
        </div>
      </div>

      {actionData && "success" in actionData && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          {actionData.success}
        </div>
      )}
      {actionData && "error" in actionData && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          {actionData.error}
        </div>
      )}

      <div className="card" style={{ maxWidth: 560, marginBottom: 20 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Subskrypcja</h2>
        <p style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="muted">Status:</span>
          <span
            className="badge"
            style={{ color: TONE_COLOR[presentation.tone], whiteSpace: "nowrap" }}
          >
            <span className="badge-dot" style={{ background: TONE_COLOR[presentation.tone] }} />
            {presentation.label}
          </span>
        </p>
        {sub ? (
          <p style={{ margin: "0 0 16px" }}>
            Kwota miesięczna: <strong>{fmtMoney(sub.amountGrosze)}</strong>
          </p>
        ) : (
          <p className="muted" style={{ margin: "0 0 16px" }}>
            Kwota nie została jeszcze ustalona.
          </p>
        )}

        <Form method="post" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input type="hidden" name="intent" value="set-amount" />
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              Kwota miesięczna (zł)
            </span>
            <input
              type="text"
              name="amount"
              inputMode="decimal"
              placeholder="np. 200"
              defaultValue={sub ? (sub.amountGrosze / 100).toFixed(2) : ""}
              className="input"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Zapisz kwotę
          </button>
        </Form>

        {canPause && (
          <Form method="post" style={{ marginTop: 16 }}>
            <input type="hidden" name="intent" value="pause" />
            <button type="submit" className="btn btn-ghost">
              Wstrzymaj
            </button>
          </Form>
        )}

        {isPaused && (
          <Form method="post" style={{ marginTop: 16 }}>
            <input type="hidden" name="intent" value="resume" />
            <button type="submit" className="btn btn-primary">
              Wznów
            </button>
          </Form>
        )}

        {canCancel && (
          <Form method="post" style={{ marginTop: 16 }}>
            <input type="hidden" name="intent" value="cancel" />
            <button type="submit" className="btn btn-ghost" style={{ color: "var(--danger)" }}>
              Zakończ subskrypcję
            </button>
          </Form>
        )}
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Historia płatności</h2>
        {payments.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Brak płatności.
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
                  <strong>{fmtMoney(p.amountGrosze)}</strong>{" "}
                  <span className="muted" style={{ fontSize: 13 }}>
                    {invoiceStatusLabel(p.status)}
                  </span>
                  {p.paidAt && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      {" · "}
                      {fmtDateTime(p.paidAt.toISOString())}
                    </span>
                  )}
                </span>
                {p.hostedInvoiceUrl && (
                  <a href={p.hostedInvoiceUrl} target="_blank" rel="noreferrer noopener">
                    Faktura
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
