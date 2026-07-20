import { and, eq } from "drizzle-orm";
import { useTranslation } from "react-i18next";
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
import { type Lang, langToIntlLocale } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
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

const CADENCE_KEY: Record<schema.ConsultationCadence, string> = {
  weekly: "cadence.weekly",
  biweekly: "cadence.biweekly",
  monthly: "cadence.monthly",
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
      return { successKey: "akcje.scheduleDeactivated" };
    }
    if (intent === "save-schedule") {
      const parsed = ScheduleFormSchema.safeParse(parseScheduleFormData(fd));
      if (!parsed.success)
        return { errorRaw: parsed.error.issues[0]?.message, errorKey: "akcje.invalidData" };
      await upsertSchedule(db, {
        trainerId: user.id,
        traineeId,
        form: parsed.data,
        fromISO: todayISO(),
      });
      // Skasuj zdarzenia Google terminów odwołanych przez zmianę harmonogramu,
      // zanim zsynchronizujemy nowe (oba zbiory są rozłączne). Best-effort.
      await syncCancelStaleSchedule(db, { trainerId: user.id, traineeId, fromISO: todayISO() });
      const r = await syncBackfillPair(db, { trainerId: user.id, traineeId, nowISO: new Date().toISOString() });
      return r.attempted
        ? { successKey: "akcje.scheduleSavedSynced", params: { synced: r.synced, attempted: r.attempted } }
        : { successKey: "akcje.scheduleSaved" };
    }
    if (intent === "sync-google") {
      const r = await syncBackfillPair(db, { trainerId: user.id, traineeId, nowISO: new Date().toISOString() });
      return r.attempted
        ? { successKey: "akcje.synced", params: { synced: r.synced, attempted: r.attempted } }
        : { successKey: "akcje.nothingToSync" };
    }
    return null;
  } catch (e) {
    if (e instanceof ScheduleError) return { errorRaw: e.userMessage };
    throw e;
  }
}

export default function TrenerKonsultacjeIndex() {
  const { trainee, schedule, occurrences, googleActive } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, i18n } = useTranslation("trenerKonsultacje");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";
  const now = Date.now();

  // action() zwraca klucze i18n (errorKey/successKey + params) albo gotowy
  // komunikat z warstwy lib (errorRaw — ScheduleError/Zod, których nie tłumaczymy).
  const alert: { error?: string; success?: string } | null = actionData
    ? {
        error:
          ("errorKey" in actionData && actionData.errorKey
            ? tDyn(t, actionData.errorKey)
            : undefined) ?? ("errorRaw" in actionData ? actionData.errorRaw : undefined),
        success:
          "successKey" in actionData && actionData.successKey
            ? tDyn(t, actionData.successKey, "params" in actionData ? actionData.params : undefined)
            : undefined,
      }
    : null;

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
              lead={fmtDateTime(o.scheduledAt, locale)}
              title={o.title}
              label={tDyn(t, meta.labelKey)}
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
        <Link to="/trener/podopieczni">{t("lista.crumbTrainees")}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <span className="current">{t("lista.crumbCurrent")}</span>
      </div>

      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {trainee.displayName}
          </div>
          <h1>{t("lista.title")}</h1>
          <div className="sub">
            {schedule
              ? t("lista.scheduleSummary", {
                  cadence: tDyn(t, CADENCE_KEY[schedule.cadence]),
                  time: schedule.timeOfDay.slice(0, 5),
                })
              : t("lista.noActiveSchedule")}
          </div>
        </div>
        <Link to={`${listUrl}/nowa`} className="btn btn-primary">
          <Icons.Plus /> {t("lista.newOccurrence")}
        </Link>
      </div>

      <ConsultationAlert data={alert} />

      {/* Panel harmonogramu */}
      <div className="card" style={{ marginBottom: 22, maxWidth: 760 }}>
        <div className="row between" style={{ alignItems: "center", marginBottom: 16 }}>
          <div className="row" style={{ alignItems: "center", gap: 12 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>
              <Icons.Calendar style={{ marginRight: 8, color: "var(--muted)" }} />
              {t("lista.scheduleCardTitle")}
            </h2>
            {googleActive && (
              <span className="badge" style={{ fontSize: 11 }}>
                {t("lista.googleConnected")}
              </span>
            )}
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {googleActive && (
              <Form method="post">
                <input type="hidden" name="intent" value="sync-google" />
                <button type="submit" className="btn btn-sm btn-ghost">
                  {t("lista.syncWithGoogle")}
                </button>
              </Form>
            )}
            {schedule && (
              <Form method="post">
                <input type="hidden" name="intent" value="deactivate-schedule" />
                <ConfirmSubmitButton
                  className="btn btn-sm btn-ghost"
                  style={{ color: "var(--danger)" }}
                  confirmOptions={{
                    title: t("lista.deactivateConfirmTitle"),
                    message: t("lista.deactivateConfirmMessage"),
                    destructive: true,
                    confirmText: t("lista.deactivateConfirmText"),
                  }}
                >
                  {t("lista.deactivate")}
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
              {schedule ? t("lista.scheduleUpdate") : t("lista.scheduleSave")}
            </button>
          </div>
        </Form>
      </div>

      {/* Nadchodzące terminy */}
      <div style={{ maxWidth: 760 }}>
        <h2 style={{ fontSize: 17, margin: "0 0 12px" }}>{t("lista.upcomingTitle")}</h2>
        {upcoming.length === 0 ? (
          <div className="empty">
            <h3>{t("lista.upcomingEmptyTitle")}</h3>
            <div>{t("lista.upcomingEmptyBody")}</div>
          </div>
        ) : (
          rows(upcoming)
        )}

        {/* Do udokumentowania / minione */}
        <h2 style={{ fontSize: 17, margin: "28px 0 12px" }}>{t("lista.pastTitle")}</h2>
        {past.length === 0 ? (
          <div className="empty">
            <h3>{t("lista.pastEmptyTitle")}</h3>
            <div>{t("lista.pastEmptyBody")}</div>
          </div>
        ) : (
          rows(past)
        )}
      </div>
    </div>
  );
}
