import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
} from "react-router";
import { requireUser } from "~/lib/api/auth";
import { db } from "~/lib/db/client";
import { stripeApiConfigured } from "~/lib/env";
import {
  createOnboardingLink,
  ensureExpressAccount,
  getConnectionStatus,
} from "~/lib/stripe/connections";

export async function loader(args: LoaderFunctionArgs) {
  const { user } = requireUser(args.context, { role: "trainer" });
  const status = await getConnectionStatus(db, user.id);
  return { configured: stripeApiConfigured(), status };
}

export async function action(args: ActionFunctionArgs) {
  const { user } = requireUser(args.context, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  if (intent === "connect") {
    if (!stripeApiConfigured()) return { error: "Płatności nie są skonfigurowane na serwerze." };
    const accountId = await ensureExpressAccount(db, user.id, user.email);
    return redirect(await createOnboardingLink(accountId));
  }
  return null;
}

export default function IntegracjeStripe() {
  const { configured, status } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  const returnParam = searchParams.get("return");
  const refreshParam = searchParams.get("refresh");

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Płatności</h1>
          <div className="sub">Połącz konto Stripe, aby pobierać płatności od podopiecznych.</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        {/* Banery z URL search params (po powrocie z onboardingu Stripe) */}
        {returnParam && (
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            Konfiguracja Stripe zaktualizowana.
          </div>
        )}
        {refreshParam && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            Link wygasł — spróbuj ponownie.
          </div>
        )}

        {/* Baner z wyniku akcji (błąd serwera) */}
        {actionData && "error" in actionData && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>
            {actionData.error}
          </div>
        )}

        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Stripe</h2>

        {!configured ? (
          <p className="muted" style={{ margin: 0 }}>
            Płatności nie są skonfigurowane na tym serwerze.
          </p>
        ) : status.connected && status.chargesEnabled ? (
          <p style={{ margin: 0 }}>Połączone — płatności aktywne.</p>
        ) : status.connected ? (
          <div>
            <p className="muted" style={{ margin: "0 0 16px" }}>
              Dokończ konfigurację konta Stripe.
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="connect" />
              <button type="submit" className="btn btn-primary">
                Dokończ konfigurację
              </button>
            </Form>
          </div>
        ) : (
          <div>
            <p className="muted" style={{ margin: "0 0 16px" }}>
              Brak połączonego konta Stripe. Kliknij poniżej, aby skonfigurować płatności.
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="connect" />
              <button type="submit" className="btn btn-primary">
                Połącz ze Stripe
              </button>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
