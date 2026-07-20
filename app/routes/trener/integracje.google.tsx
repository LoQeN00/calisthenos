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
import { getEnv, googleConfigured } from "~/lib/env";
import { deleteConnection, getConnectionStatus } from "~/lib/google/connections";
import { consentUrl, newNonce, oauthClient, signState } from "~/lib/google/oauth";

/** Cookie z nonce wiążącym przepływ OAuth z przeglądarką (anty login-CSRF). */
function nonceCookie(nonce: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `goauth_nonce=${nonce}; HttpOnly; SameSite=Lax; Path=/trener/integracje/google; Max-Age=600${secure}`;
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const status = await getConnectionStatus(db, user.id);
  return { configured: googleConfigured(), status };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "connect") {
    if (!googleConfigured()) return { error: "integracje.google.actionNotConfigured" };
    const nonce = newNonce();
    const state = signState(nonce, Date.now() + 10 * 60_000, getEnv().SESSION_SECRET);
    return redirect(consentUrl(state), { headers: { "Set-Cookie": nonceCookie(nonce) } });
  }
  if (intent === "disconnect") {
    const refreshToken = await deleteConnection(db, user.id);
    if (refreshToken) {
      try {
        await oauthClient().revokeToken(refreshToken);
      } catch {
        // best-effort revoke
      }
    }
    return { success: "integracje.google.actionDisconnected" };
  }
  return null;
}

// Mapowanie kodu z query (?error=…) na sufiks klucza tłumaczenia.
const ERROR_KEY_BY_PARAM: Record<string, string> = {
  denied: "integracje.google.errorDenied",
  state: "integracje.google.errorState",
  exchange: "integracje.google.errorExchange",
};

export default function IntegracjeGoogle() {
  const { configured, status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("trenerPlany");

  const okParam = searchParams.get("ok");
  const errorParam = searchParams.get("error");

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {t("integracje.google.eyebrow")}
          </div>
          <h1>{t("integracje.google.title")}</h1>
          <div className="sub">{t("integracje.google.sub")}</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        {/* Banery z URL search params (po przekierowaniu z callbacku) */}
        {okParam && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            {t("integracje.google.okBanner")}
          </div>
        )}
        {errorParam && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {tDyn(t, ERROR_KEY_BY_PARAM[errorParam] ?? "integracje.google.errorUnexpected")}
          </div>
        )}

        {/* Baner z wyniku akcji (rozłącz / błąd serwera) */}
        {"success" in (actionData ?? {}) && actionData && "success" in actionData && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            {tDyn(t, (actionData as { success: string }).success)}
          </div>
        )}
        {"error" in (actionData ?? {}) && actionData && "error" in actionData && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {tDyn(t, (actionData as { error: string }).error)}
          </div>
        )}

        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>{t("integracje.google.heading")}</h2>

        {!configured ? (
          <p className="muted" style={{ margin: 0 }}>
            {t("integracje.google.notConfigured")}
          </p>
        ) : status.connected ? (
          <div>
            <p style={{ margin: "0 0 16px" }}>
              {t("integracje.google.connectedAccount")}
              <strong>{status.googleEmail}</strong>
            </p>
            <div
              className="alert"
              style={{
                marginBottom: 16,
                fontSize: 13,
                lineHeight: 1.55,
                background: "var(--accent-soft)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                padding: "10px 12px",
              }}
            >
              <strong>{t("integracje.google.hostNoticeStrong")}</strong>
              {t("integracje.google.hostNoticePre")}
              <strong>{status.googleEmail}</strong>
              {t("integracje.google.hostNoticeMid")}
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="disconnect" />
              <button type="submit" className="btn btn-ghost" style={{ color: "var(--danger)" }}>
                {t("integracje.google.disconnect")}
              </button>
            </Form>
          </div>
        ) : (
          <div>
            <p className="muted" style={{ margin: "0 0 16px" }}>
              {t("integracje.google.notConnected")}
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="connect" />
              <button type="submit" className="btn btn-primary">
                {t("integracje.google.connect")}
              </button>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
