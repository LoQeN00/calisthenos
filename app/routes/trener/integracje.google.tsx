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
import { ApiError, toRouteResponse } from "~/lib/api/errors";
import {
  disconnectCalendar,
  getCalendarConnection,
  startCalendarAuthorization,
} from "~/lib/calendar";

export async function loader(args: LoaderFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  return { connection: await getCalendarConnection(api) };
}

export async function action(args: ActionFunctionArgs) {
  const { api } = requireUser(args.context, { role: "trainer" });
  const fd = await args.request.formData();
  const intent = fd.get("intent");

  try {
    if (intent === "connect") {
      const { url, setCookie } = await startCalendarAuthorization(api);
      // `Headers.append`, nie literał obiektu: ciastek bywa więcej niż jedno,
      // a obiekt zostawiłby ostatnie. To ciastko wiąże zgodę z przeglądarką —
      // zgubione znaczy odmowę przy powrocie od dostawcy.
      const headers = new Headers();
      for (const cookie of setCookie) headers.append("Set-Cookie", cookie);
      return redirect(url, { headers });
    }
    if (intent === "disconnect") {
      await disconnectCalendar(api);
      return { success: "Konto Google odłączone." };
    }
    return null;
  } catch (e) {
    // `409` to wyłączona integracja na serwerze. `message` z kontraktu jest
    // już po polsku i dla użytkownika, więc idzie na ekran bez tłumaczenia —
    // a granica błędu pokazałaby zamiast tego zupełnie inny ekran.
    if (e instanceof ApiError && e.status === 409) return { error: e.message };
    if (e instanceof ApiError) throw toRouteResponse(e);
    throw e;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Anulowałeś autoryzację lub odmówiłeś dostępu.",
  state: "Żądanie wygasło lub zostało zmodyfikowane — spróbuj ponownie.",
  exchange: "Nie udało się wymienić kodu autoryzacji na tokeny — spróbuj ponownie.",
};

export default function IntegracjeGoogle() {
  const { connection } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  // Nazwy parametrów pochodzą od BE (`callbackRedirect`), nie od FE.
  const calendarParam = searchParams.get("calendar");
  const okParam = calendarParam === "ok";
  const errorParam = calendarParam === "error" ? searchParams.get("reason") : null;

  // `broken` to jest połączenie — zepsute, ale istniejące, a jedyną drogą
  // wyjścia z niego jest „Rozłącz". Ten sam podział, co przed integracją,
  // gdzie decydowała obecność wiersza.
  const polaczone = connection.status !== "disconnected";

  return (
    <div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Trener
          </div>
          <h1>Integracje</h1>
          <div className="sub">
            Połącz konto Google, aby synchronizować konsultacje z kalendarzem.
          </div>
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

        {polaczone ? (
          <div>
            <p style={{ margin: "0 0 16px" }}>
              Połączone konto: <strong>{connection.accountLabel ?? "(połączone)"}</strong>
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
