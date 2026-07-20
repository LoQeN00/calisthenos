import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { ExerciseProgressionPanel } from "~/components/exercise-progression-panel";
import { Icons } from "~/components/icons";
import { VariationLadder } from "~/components/skill-tree";
import { langToIntlLocale, type Lang } from "~/i18n/config";
import { tDyn } from "~/i18n/translate";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { fmtDate } from "~/lib/format";
import { findTraineeOfTrainer, getExerciseProgression, todayIso } from "~/lib/progression";
import type { ProgressionRange } from "~/lib/progression-math";
import {
  getSkillMapForTrainee,
  recordAdvancement,
  setStartingLevel,
} from "~/lib/skill-progression";
import { SkillError } from "~/lib/skills";
import { AdvancementFormSchema } from "~/lib/skill-types";

const RANGES: ProgressionRange[] = ["4w", "3m", "6m", "all"];

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const skillId = args.params.skillId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });
  const map = await getSkillMapForTrainee(db, user.id, traineeId, { withSuggestions: true });
  const entry = map.find((m) => m.skillId === skillId);
  if (!entry) throw new Response("not found", { status: 404 });

  const url = new URL(args.request.url);
  const raw = url.searchParams.get("zakres");
  const range: ProgressionRange = (RANGES as string[]).includes(raw ?? "")
    ? (raw as ProgressionRange)
    : "3m";
  const view =
    entry.currentHasLogs && entry.currentExerciseId
      ? await getExerciseProgression(db, traineeId, entry.currentExerciseId, range)
      : null;

  return { trainee, entry, view, range, today: todayIso() };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainer" });
  const traineeId = args.params.traineeId ?? "";
  const skillId = args.params.skillId ?? "";
  const trainee = await findTraineeOfTrainer(db, user.id, traineeId);
  if (!trainee) throw new Response("not found", { status: 404 });

  const fd = await args.request.formData();
  const intent = fd.get("intent");
  if (intent !== "advance" && intent !== "set-start") return null;

  const parsed = AdvancementFormSchema.safeParse({
    toVariationId: String(fd.get("toVariationId") ?? ""),
    advancedOn: String(fd.get("advancedOn") ?? ""),
    note: fd.get("note") ? String(fd.get("note")) : undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "trenerRozwoj:umiejetnosc.error.invalid" };
  const { toVariationId, advancedOn, note } = parsed.data;
  try {
    if (intent === "set-start") {
      await setStartingLevel(
        db,
        user.id,
        traineeId,
        skillId,
        toVariationId,
        advancedOn,
        note ?? null,
      );
    } else {
      await recordAdvancement(
        db,
        user.id,
        traineeId,
        skillId,
        toVariationId,
        advancedOn,
        note ?? null,
      );
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof SkillError) return { error: e.userMessage };
    throw e;
  }
}

export default function TrenerRozwojWezel() {
  const { trainee, entry, view, range, today } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { t, i18n } = useTranslation("trenerRozwoj");
  const locale = langToIntlLocale[i18n.language as Lang] ?? "pl-PL";

  const intent = entry.currentVariationId ? "advance" : "set-start";
  const submitLabel = entry.currentVariationId
    ? t("umiejetnosc.submit.save")
    : t("umiejetnosc.submit.setStart");
  const selectLabel = entry.currentVariationId
    ? t("umiejetnosc.select.changeTo")
    : t("umiejetnosc.select.startingLevel");

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="crumbs">
        <Link to="/trener/podopieczni">{t("breadcrumb.podopieczni")}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}`}>{trainee.displayName}</Link>
        <span className="sep">›</span>
        <Link to={`/trener/podopieczni/${trainee.id}/rozwoj`}>{t("breadcrumb.rozwoj")}</Link>
        <span className="sep">›</span>
        <span className="current">{entry.skillName}</span>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="text-xs muted" style={{ marginBottom: 4 }}>
          {trainee.displayName}
        </div>
        <h1 style={{ margin: "0 0 4px" }}>{entry.skillName}</h1>
        <div className="text-sm muted">{t("umiejetnosc.subtitle")}</div>
      </div>

      {actionData != null && "error" in actionData && actionData.error != null && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>
          {tDyn(t, actionData.error)}
        </p>
      )}

      {entry.suggestion === "advance" && (
        <span
          className="badge active"
          style={{ marginBottom: 12, display: "inline-flex", gap: 4, alignItems: "center" }}
        >
          <Icons.Trend /> {t("umiejetnosc.suggestion.advance")}
        </span>
      )}
      {entry.suggestion === "regress" && (
        <span
          className="badge"
          style={{ color: "var(--danger)", marginBottom: 12, display: "inline-block" }}
        >
          {t("umiejetnosc.suggestion.regress")}
        </span>
      )}

      <div style={{ marginBottom: 12 }}>
        <VariationLadder variations={entry.variations} />
      </div>

      {entry.lastAdvancedOn && (
        <div className="text-xs muted" style={{ marginBottom: 16 }}>
          {t("umiejetnosc.lastAdvanced", { date: fmtDate(entry.lastAdvancedOn, locale) })}
        </div>
      )}

      {entry.variations.length > 0 && (
        <Form
          method="post"
          className="card"
          style={{ padding: 16, display: "grid", gap: 12, marginBottom: 22 }}
        >
          <input type="hidden" name="intent" value={intent} />

          <label className="col" style={{ gap: 4 }}>
            <span className="text-sm">{selectLabel}</span>
            <select name="toVariationId" className="input" required defaultValue="">
              <option value="" disabled>
                {t("umiejetnosc.select.placeholder")}
              </option>
              {entry.variations.map((v) => (
                <option key={v.id} value={v.id} disabled={v.isCurrent}>
                  {v.ordinal}. {v.exerciseName}
                </option>
              ))}
            </select>
          </label>

          <label className="col" style={{ gap: 4 }}>
            <span className="text-sm">{t("umiejetnosc.dateLabel")}</span>
            <input type="date" name="advancedOn" className="input" defaultValue={today} required />
          </label>

          <label className="col" style={{ gap: 4 }}>
            <span className="text-sm">{t("umiejetnosc.noteLabel")}</span>
            <input
              type="text"
              name="note"
              className="input"
              maxLength={2000}
              placeholder={t("umiejetnosc.notePlaceholder")}
            />
          </label>

          <button type="submit" className="btn btn-primary">
            {submitLabel}
          </button>
        </Form>
      )}

      {view ? (
        <ExerciseProgressionPanel view={view} range={range} />
      ) : (
        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div className="muted text-sm">
            {entry.currentVariationId
              ? t("umiejetnosc.noData.noLogs")
              : t("umiejetnosc.noData.noLevel")}
          </div>
        </div>
      )}

      {entry.history.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="text-sm" style={{ cursor: "pointer", marginBottom: 8 }}>
            {t("umiejetnosc.history.summary", { count: entry.history.length })}
          </summary>
          <ul className="text-xs muted" style={{ margin: 0, paddingLeft: 16 }}>
            {entry.history.map((h, i) => (
              <li key={`${h.advancedOn}-${i}`}>
                {fmtDate(h.advancedOn, locale)} —{" "}
                {h.fromVariationId
                  ? t("umiejetnosc.history.advance")
                  : t("umiejetnosc.history.startingLevel")}
                {h.note ? ` · „${h.note}"` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
