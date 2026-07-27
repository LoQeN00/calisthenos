import { and, eq } from "drizzle-orm";
import {
  type ActionFunctionArgs,
  Form,
  type LoaderFunctionArgs,
  Link,
  useActionData,
  useLoaderData,
} from "react-router";
import { ConfirmSubmitButton } from "~/components/confirm-provider";
import { ConsultationAlert } from "~/components/consultation-alert";
import { ConsultationRow } from "~/components/consultation-row";
import { Icons } from "~/components/icons";
import { ScheduleForm } from "~/components/schedule-form";
import { requireUser } from "~/lib/auth";
import { parseScheduleFormData } from "~/lib/consultation-form.server";
import { isGoogleSyncActive, syncBackfillPair, syncCancelStaleSchedule } from "~/lib/google/sync";
import {
  ScheduleError,
  deactivateSchedule,
  ensureOccurrences,
  getActiveSchedule,
  upsertSchedule,
} from "~/lib/consultation-schedules";
import { consultationPresentation } from "~/lib/consultation-status";
import { ScheduleFormSchema } from "~/lib/consultation-types";
import { listOccurrencesForTrainer } from "~/lib/consultations";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { fmtDateTime, todayISO } from "~/lib/format";

const CADENCE_LABEL: Record<schema.ConsultationCadence, string> = {
  weekly: "co tydzień",
  biweekly: "co 2 tygodnie",
  monthly: "co miesiąc",
};

async function loadTrainee(traineeId: string, trainerId: string) {
  const [t] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, traineeId),
        eq(schema.users.trainerId, trainerId),
        eq(schema.users.role, "trainee"),
      ),
    )
    .limit(1);
  return t ?? null;
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const trainee = await loadTrainee(traineeId, user.id);
  if (!trainee) throw new Response("not found", { status: 404 });

  const schedule = await getActiveSchedule(db, { trainerId: user.id, traineeId });
  if (schedule) await ensureOccurrences(db, schedule.id, todayISO());
  const raw = await listOccurrencesForTrainer(db, { trainerId: user.id, traineeId });
  // Normalizujemy timestamptz → ISO string (komponent operuje na stringach UTC).
  const occurrences = raw.map((o) => ({
    id: o.id,
    scheduledAt: o.scheduledAt.toISOString(),
    durationMin: o.durationMin,
    status: o.status,
    title: o.title,
  }));
  const googleActive = await isGoogleSyncActive(db, user.id);
  return { trainee, schedule, occurrences, googleActive };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const fd = await args.request.formData();
  const intent = fd.get("intent");
  try {
    if (intent === "deactivate-schedule") {
      await deactivateSchedule(db, { trainerId: user.id, traineeId, fromISO: todayISO() });
      // Posprzątaj zdarzenia Google odwołanych terminów (best-effort).
      await syncCancelStaleSchedule(db, { trainerId: user.id, traineeId, fromISO: todayISO() });
      return { success: "Harmonogram wyłączony." };
    }
    if (intent === "save-schedule") {
      const parsed = ScheduleFormSchema.safeParse(parseScheduleFormData(fd));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane." };
      await upsertSchedule(db, {
        trainerId: user.id,
        traineeId,
        form: parsed.data,
        fromISO: todayISO(),
      });
      // Skasuj zdarzenia Google terminów odwołanych przez zmianę harmonogramu,
      // zanim zsynchronizujemy nowe (oba zbiory są rozłączne). Best-effort.
      await syncCancelStaleSchedule(db, { trainerId: user.id, traineeId, fromISO: todayISO() });
      const r = await syncBackfillPair(db, {
        trainerId: user.id,
        traineeId,
        nowISO: new Date().toISOString(),
      });
      return {
        success: `Harmonogram zapisany.${r.attempted ? ` Zsynchronizowano z Google: ${r.synced}/${r.attempted}.` : ""}`,
      };
    }
    if (intent === "sync-google") {
      const r = await syncBackfillPair(db, {
        trainerId: user.id,
        traineeId,
        nowISO: new Date().toISOString(),
      });
      // Bez tego „0/0" wyglądałoby jak sukces także wtedy, gdy połączenie jest martwe
      // (np. cofnięta zgoda w Google) — a wtedy nic się nie synchronizuje po cichu.
      if (!r.connected) {
        return {
          error: "Nie udało się połączyć z kontem Google. Sprawdź integrację w ustawieniach.",
        };
      }
      return {
        success: r.attempted
          ? `Zsynchronizowano: ${r.synced}/${r.attempted}.`
          : "Brak terminów do synchronizacji.",
      };
    }
    return null;
  } catch (e) {
    if (e instanceof ScheduleError) return { error: e.userMessage };
    throw e;
  }
}

export default function TrenerKonsultacjeIndex() {
  const { trainee, schedule, occurrences, googleActive } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const now = Date.now();

  const upcoming = occurrences.filter(
    (o) =>
      o.status !== "documented" &&
      o.status !== "cancelled" &&
      new Date(o.scheduledAt).getTime() >= now,
  );
  const past = occurrences.filter(
    (o) =>
      o.status === "documented" ||
      (o.status !== "cancelled" && new Date(o.scheduledAt).getTime() < now),
  );
  // Najnowsze pozycje minione na górze.
  past.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  const listUrl = `/trener/podopieczni/${trainee.id}/konsultacje`;

  function rows(items: typeof occurrences) {
    return (
      <div className="list">
        {items.map((o) => {
          const meta = consultationPresentation({
            status: o.status,
            scheduledAtISO: o.scheduledAt,
            nowMs: now,
            viewer: "trainer",
          });
          return (
            <ConsultationRow
              key={o.id}
              to={`${listUrl}/${o.id}`}
              lead={fmtDateTime(o.scheduledAt)}
              title={o.title}
              label={meta.label}
              tone={meta.tone}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="crumbs">
        <Link to="/trener/podopieczni">Podopieczni</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">Konsultacje</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>Konsultacje</h1>
          <div className="sub">
            {schedule
              ? `Harmonogram: ${CADENCE_LABEL[schedule.cadence]} · ${schedule.timeOfDay.slice(0, 5)}`
              : "Brak aktywnego harmonogramu."}
          </div>
        </div>
        <Link to={`${listUrl}/nowa`} className="btn btn-primary">
          <Icons.Plus /> Nowy termin
        </Link>
      </div>

      <ConsultationAlert data={actionData} />

      {/* Panel harmonogramu */}
      <div className="card" style={{ marginBottom: 22, maxWidth: 760 }}>
        <div className="row between" style={{ alignItems: "center", marginBottom: 16 }}>
          <div className="row" style={{ alignItems: "center", gap: 12 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>
              <Icons.Calendar style={{ marginRight: 8, color: "var(--muted)" }} />
              Harmonogram cykliczny
            </h2>
            {googleActive && (
              <span className="badge" style={{ fontSize: 11 }}>
                Google: połączony
              </span>
            )}
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {googleActive && (
              <Form method="post">
                <input type="hidden" name="intent" value="sync-google" />
                <ConfirmSubmitButton
                  className="btn btn-sm btn-ghost"
                  confirmOptions={{
                    title: "Zsynchronizować z Google?",
                    message:
                      "Nadchodzące terminy trafią do kalendarza, a te już wysłane zostaną wyrównane do godzin z aplikacji. Google powiadomi podopiecznego mailem o zaproszeniach i zmianach godziny.",
                    confirmText: "Synchronizuj",
                  }}
                >
                  Synchronizuj z Google
                </ConfirmSubmitButton>
              </Form>
            )}
            {schedule && (
              <Form method="post">
                <input type="hidden" name="intent" value="deactivate-schedule" />
                <ConfirmSubmitButton
                  className="btn btn-sm btn-ghost"
                  style={{ color: "var(--danger)" }}
                  confirmOptions={{
                    title: "Wyłączyć harmonogram?",
                    message:
                      "Generowanie nowych terminów zatrzyma się, a przyszłe niepotwierdzone terminy zostaną odwołane. Potwierdzone i udokumentowane zostają.",
                    destructive: true,
                    confirmText: "Wyłącz harmonogram",
                  }}
                >
                  Wyłącz
                </ConfirmSubmitButton>
              </Form>
            )}
          </div>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="save-schedule" />
          <ScheduleForm
            defaultStartsOn={todayISO()}
            defaultValue={
              schedule
                ? {
                    cadence: schedule.cadence,
                    weekday: schedule.weekday,
                    dayOfMonth: schedule.dayOfMonth,
                    timeOfDay: schedule.timeOfDay,
                    durationMin: schedule.durationMin,
                    startsOn: schedule.startsOn,
                    defaultMeetingUrl: schedule.defaultMeetingUrl,
                  }
                : null
            }
          />
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid var(--line)",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button type="submit" className="btn btn-primary">
              {schedule ? "Zaktualizuj harmonogram" : "Zapisz harmonogram"}
            </button>
          </div>
        </Form>
      </div>

      {/* Nadchodzące terminy */}
      <div style={{ maxWidth: 760 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>Nadchodzące terminy</h2>
        {upcoming.length === 0 ? (
          <div className="empty">
            <h3>Brak nadchodzących terminów</h3>
            <div>Ustaw harmonogram powyżej albo dodaj pojedynczy termin.</div>
          </div>
        ) : (
          rows(upcoming)
        )}

        {/* Do udokumentowania / minione */}
        <h2 style={{ fontSize: 17, margin: "28px 0 12px" }}>Do udokumentowania / minione</h2>
        {past.length === 0 ? (
          <div className="empty">
            <h3>Brak minionych terminów</h3>
            <div>Tu pojawią się terminy po ich dacie oraz udokumentowane spotkania.</div>
          </div>
        ) : (
          rows(past)
        )}
      </div>
    </div>
  );
}
