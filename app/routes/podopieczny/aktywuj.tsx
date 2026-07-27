import { eq } from "drizzle-orm";
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
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtMoney } from "~/lib/money";
import { hasTraineeAppAccess } from "~/lib/stripe/gate";
import { createCheckoutSession, SubscriptionError } from "~/lib/stripe/subscriptions";

// ============================================================
// Loader: ekran aktywacji żyje POZA layoutem podopiecznego (bez sidenav),
// żeby gate w _layout.tsx nie wpadał w pętlę redirectów. Gdy podopieczny
// ma już dostęp (lub płatność niewymagana) — odsyłamy do dashboardu.
// ============================================================

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request, db, { role: "trainee" });

  // Jedna implementacja bramki dla całej aplikacji (`lib/stripe/gate`) — ta trasa
  // jest CELEM redirectu z tej bramki, więc własna kopia reguły oznaczałaby przy
  // pierwszej zmianie pętlę przekierowań. `sub` bierzemy stąd, żeby nie pytać o
  // subskrypcję drugi raz. Konto bez trenera dostaje `hasAccess: true` — czyli tak
  // jak dotąd wypada tu redirect na dashboard (`paymentRequired` było wtedy
  // `false`, bo bez trenera nie ma ani `chargesEnabled`, ani ceny).
  const { hasAccess, sub } = await hasTraineeAppAccess(db, user);
  if (hasAccess) throw redirect("/podopieczny");

  // Brak dostępu implikuje przypisanego trenera (patrz wyżej), więc `trainerId`
  // jest tu na pewno ustawione.
  const trainerRow = await db
    .select({ name: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, user.trainerId!))
    .limit(1);

  return {
    trainerName: trainerRow[0]?.name ?? null,
    amountGrosze: sub?.amountGrosze ?? null,
  };
}

// ============================================================
// Action: start Checkout. Tenant-scope do własnej pary trener+podopieczny.
// ============================================================

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request, db, { role: "trainee" });
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
  const { trainerName, amountGrosze } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const canceled = searchParams.get("canceled") === "1";

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" />
          <span>calisthenos</span>
          <span className="brand-dot" />
        </div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Dostęp
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Aktywuj subskrypcję</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          Aby korzystać z aplikacji, opłać subskrypcję u {trainerName ?? "swojego trenera"}.
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
              Prowadzenie treningowe — {trainerName ?? "Twój trener"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {fmtMoney(amountGrosze)} miesięcznie
            </div>
            <div className="text-xs muted">
              Subskrypcja odnawia się automatycznie; możesz ją anulować w panelu płatności.
            </div>
          </div>
        )}

        {canceled && (
          <p className="alert" style={{ marginBottom: 14 }}>
            Płatność anulowana — spróbuj ponownie.
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
            Opłać i aktywuj
          </button>
        </Form>

        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/wyloguj" className="muted text-sm">
            Wyloguj
          </Link>
        </div>
      </div>
    </main>
  );
}
