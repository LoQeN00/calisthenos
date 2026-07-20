import { useTranslation } from "react-i18next";
import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
} from "react-router";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { stripeApiConfigured } from "~/lib/env";
import {
  createOnboardingLink,
  ensureExpressAccount,
  getConnectionStatus,
} from "~/lib/stripe/connections";

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const status = await getConnectionStatus(db, user.id);
  return { configured: stripeApiConfigured(), status };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "connect") {
    if (!stripeApiConfigured()) return { error: "integracje.stripe.actionNotConfigured" };
    const accountId = await ensureExpressAccount(db, user.id, user.email);
    return redirect(await createOnboardingLink(accountId));
  }
  return null;
}

export default function IntegracjeStripe() {
  const { configured, status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("trenerPlany");

  const returnParam = searchParams.get("return");
  const refreshParam = searchParams.get("refresh");

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("integracje.stripe.eyebrow")}
          </div>
          <h1>{t("integracje.stripe.title")}</h1>
          <div className="sub">{t("integracje.stripe.sub")}</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        {/* Banery z URL search params (po powrocie z onboardingu Stripe) */}
        {returnParam && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            {t("integracje.stripe.returnBanner")}
          </div>
        )}
        {refreshParam && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {t("integracje.stripe.refreshBanner")}
          </div>
        )}

        {/* Baner z wyniku akcji (błąd serwera) */}
        {actionData && "error" in actionData && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {tDyn(t, actionData.error)}
          </div>
        )}

        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>{t("integracje.stripe.heading")}</h2>

        {!configured ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("integracje.stripe.notConfigured")}
          </p>
        ) : status.connected && status.chargesEnabled ? (
          <p style={{ margin: 0 }}>{t("integracje.stripe.connectedActive")}</p>
        ) : status.connected ? (
          <div>
            <p className="muted" style={{ margin: "0 0 16px" }}>
              {t("integracje.stripe.finishSetupBody")}
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="connect" />
              <button type="submit" className="btn btn-primary">
                {t("integracje.stripe.finishSetup")}
              </button>
            </Form>
          </div>
        ) : (
          <div>
            <p className="muted" style={{ margin: "0 0 16px" }}>
              {t("integracje.stripe.notConnected")}
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="connect" />
              <button type="submit" className="btn btn-primary">
                {t("integracje.stripe.connect")}
              </button>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
