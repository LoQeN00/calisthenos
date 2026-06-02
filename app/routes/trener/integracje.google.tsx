import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
} from "react-router";
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
    if (!googleConfigured()) return { error: "Integracja Google nie jest skonfigurowana na serwerze." };
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
    return { success: "Konto Google odłączone." };
  }
  return null;
}

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Anulowałeś autoryzację lub odmówiłeś dostępu.",
  state: "Żądanie wygasło lub zostało zmodyfikowane — spróbuj ponownie.",
  exchange: "Nie udało się wymienić kodu autoryzacji na tokeny — spróbuj ponownie.",
};

export default function IntegracjeGoogle() {
  const { configured, status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  const okParam = searchParams.get("ok");
  const errorParam = searchParams.get("error");

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Integracje</h1>
          <div className="sub">Połącz konto Google, aby synchronizować konsultacje z kalendarzem.</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        {/* Banery z URL search params (po przekierowaniu z callbacku) */}
        {okParam && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            Konto Google zostało pomyślnie połączone.
          </div>
        )}
        {errorParam && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {ERROR_MESSAGES[errorParam] ?? "Wystąpił nieoczekiwany błąd — spróbuj ponownie."}
          </div>
        )}

        {/* Baner z wyniku akcji (rozłącz / błąd serwera) */}
        {"success" in (actionData ?? {}) && actionData && "success" in actionData && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            {(actionData as { success: string }).success}
          </div>
        )}
        {"error" in (actionData ?? {}) && actionData && "error" in actionData && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {(actionData as { error: string }).error}
          </div>
        )}

        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Google Calendar</h2>

        {!configured ? (
          <p className="muted" style={{ margin: 0 }}>
            Integracja Google nie jest skonfigurowana na tym serwerze. Skontaktuj się z administratorem.
          </p>
        ) : status.connected ? (
          <div>
            <p style={{ margin: "0 0 16px" }}>
              Połączone konto: <strong>{status.googleEmail}</strong>
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="disconnect" />
              <button type="submit" className="btn btn-ghost" style={{ color: "var(--danger)" }}>
                Rozłącz
              </button>
            </Form>
          </div>
        ) : (
          <div>
            <p className="muted" style={{ margin: "0 0 16px" }}>
              Brak połączonego konta Google. Kliknij poniżej, aby autoryzować dostęp do kalendarza.
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="connect" />
              <button type="submit" className="btn btn-primary">
                Połącz z Google
              </button>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
