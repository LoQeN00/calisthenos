import { useMemo, useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { FileDropzone } from "~/components/file-dropzone";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import {
  UploadCleanupQueue,
  UploadError,
  uploadFile,
} from "~/lib/file-uploads";
import { todayISO } from "~/lib/format";
import {
  findActivePlanForTrainee,
  loadSessionForLogging,
  saveWorkoutLog,
  WorkoutSaveError,
} from "~/lib/workouts";

const PerformedOnSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Nieprawidłowa data.");
const NoteSchema = z.string().max(2000).optional();

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  const sessionId = args.params.sessionId ?? "";

  const plan = await findActivePlanForTrainee(db, user.id);
  if (!plan) throw new Response("brak aktywnego planu", { status: 404 });

  const detail = await loadSessionForLogging(db, plan.id, sessionId);
  if (!detail) throw new Response("not found", { status: 404 });

  return { user, plan, session: detail.session, entries: detail.entries };
}

export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) {
    return { error: "Konto bez przypisanego trenera." };
  }
  const sessionId = args.params.sessionId ?? "";

  const plan = await findActivePlanForTrainee(db, user.id);
  if (!plan) return { error: "Nie masz aktywnego planu." };

  const detail = await loadSessionForLogging(db, plan.id, sessionId);
  if (!detail) {
    throw new Response("not found", { status: 404 });
  }

  const fd = await args.request.formData();
  const performedOnParse = PerformedOnSchema.safeParse(fd.get("performedOn"));
  if (!performedOnParse.success) {
    return { error: "Sprawdź pole daty." };
  }
  const noteParse = NoteSchema.safeParse(fd.get("note") ?? undefined);
  const note = (noteParse.success ? noteParse.data?.trim() : "") || null;

  const cleanup = new UploadCleanupQueue(db);
  try {
    const exercisesPayload: Array<{
      exerciseId: string;
      sets: Array<{ reps: number; difficulty: number; videoFileId: string | null }>;
    }> = [];

    let anySetLogged = false;
    let allSetsFilled = true;

    for (const [eIdx, entry] of detail.entries.entries()) {
      const sets: Array<{ reps: number; difficulty: number; videoFileId: string | null }> = [];
      for (let sIdx = 0; sIdx < entry.expectedSets; sIdx++) {
        const repsRaw = fd.get(`e_${eIdx}_s_${sIdx}_reps`);
        const diffRaw = fd.get(`e_${eIdx}_s_${sIdx}_diff`);
        const videoBlob = fd.get(`e_${eIdx}_s_${sIdx}_video`);
        const hasReps = repsRaw != null && repsRaw !== "";
        const hasDiff = diffRaw != null && diffRaw !== "";
        const hasVideo = videoBlob instanceof File && videoBlob.size > 0;

        if (!hasReps && !hasDiff && !hasVideo) {
          // Row left blank.
          allSetsFilled = false;
          continue;
        }

        // Partial row — both reps and difficulty must be present together.
        if (!hasReps || !hasDiff) {
          return {
            error: `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: uzupełnij liczbę powtórzeń i trudność (1-10).`,
          };
        }

        const reps = Number(repsRaw);
        const difficulty = Number(diffRaw);
        if (!Number.isFinite(reps) || reps < 1 || reps > 1000) {
          return { error: `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: liczba powtórzeń poza zakresem (1-1000).` };
        }
        if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10) {
          return { error: `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: trudność musi być 1-10.` };
        }

        let videoFileId: string | null = null;
        if (hasVideo) {
          const uploaded = await uploadFile(
            db,
            {
              file: videoBlob as File,
              kind: "set_video",
              trainerId: user.trainerId,
              uploadedBy: user.id,
            },
            cleanup,
          );
          videoFileId = uploaded.id;
        }

        sets.push({ reps, difficulty, videoFileId });
        anySetLogged = true;
      }

      exercisesPayload.push({ exerciseId: entry.exerciseId, sets });
    }

    if (!anySetLogged) {
      await cleanup.cleanup();
      return { error: "Zapisz co najmniej jedną serię." };
    }

    const newLogId = await saveWorkoutLog(db, {
      trainerId: user.trainerId,
      traineeId: user.id,
      planId: plan.id,
      planSessionId: detail.session.id,
      sessionName: detail.session.name,
      performedOn: performedOnParse.data,
      note,
      allDone: allSetsFilled,
      exercises: exercisesPayload,
    });
    cleanup.commit();
    throw redirect(`/podopieczny/historia/${newLogId}`);
  } catch (e) {
    if (e instanceof Response) throw e; // redirect bubbles
    await cleanup.cleanup();
    if (e instanceof UploadError) return { error: e.userMessage };
    if (e instanceof WorkoutSaveError) return { error: e.userMessage };
    throw e;
  }
}

type SetState = { reps: string; difficulty: string };

export default function LogForm() {
  const { user, session, entries } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Lift set-level state up so we can compute progress + power the
  // "copy from #1" affordance. The form's submit still relies on the
  // name attributes on each input — we just control their values.
  //
  // reps starts empty (placeholder shows the target); picking difficulty
  // auto-fills reps with the target. This way an untouched row stays a
  // clean "skipped" submission instead of forcing the trainee to clear
  // pre-filled numbers.
  const [setStates, setSetStates] = useState<SetState[][]>(() =>
    entries.map((entry) =>
      Array.from({ length: entry.expectedSets }, () => ({
        reps: "",
        difficulty: "",
      })),
    ),
  );

  const updateSet = (eIdx: number, sIdx: number, patch: Partial<SetState>) => {
    setSetStates((prev) =>
      prev.map((sets, i) =>
        i === eIdx
          ? sets.map((s, j) => (j === sIdx ? { ...s, ...patch } : s))
          : sets,
      ),
    );
  };

  const copyFromFirst = (eIdx: number) => {
    setSetStates((prev) =>
      prev.map((sets, i) => {
        if (i !== eIdx) return sets;
        const first = sets[0];
        if (!first) return sets;
        return sets.map((s, j) =>
          j === 0
            ? s
            : {
                reps: s.reps || first.reps,
                difficulty: s.difficulty || first.difficulty,
              },
        );
      }),
    );
  };

  // Progress: a set counts as "filled" when both reps and difficulty are set.
  const stats = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (const sets of setStates) {
      for (const s of sets) {
        total++;
        if (s.reps.trim() !== "" && s.difficulty !== "") filled++;
      }
    }
    return { total, filled };
  }, [setStates]);

  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny">Mój plan</Link>
        <span className="sep">›</span>
        <span className="current">{session.name}</span>
      </div>
      <div className="pagehead">
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            Nowa sesja · {entries.length} {pluralizeCwiczenie(entries.length)}
          </div>
          <h1>{session.name}</h1>
          <div className="sub">
            Zarejestruj wykonane serie. Pominięte rzędy = nieukończone serie.
          </div>
        </div>
      </div>

      <Form method="post" encType="multipart/form-data" style={{ display: "grid", gap: 14 }}>
        <div className="card">
          <div className="grid grid-2" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="log-date">Data</label>
              <input
                id="log-date"
                name="performedOn"
                type="date"
                required
                defaultValue={todayISO()}
                className="input"
              />
            </div>
            <div className="field">
              <label htmlFor="log-note">Notatka (opcjonalnie)</label>
              <input
                id="log-note"
                name="note"
                type="text"
                maxLength={2000}
                placeholder="Jak było? Co czuć, co poszło dobrze…"
                className="input"
              />
            </div>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="empty">
            <h3>Brak ćwiczeń</h3>
            <div>Ta sesja nie ma jeszcze ćwiczeń. Trener musi wypełnić plan.</div>
          </div>
        ) : (
          entries.map((entry, eIdx) => (
            <EntryCard
              key={`${entry.planItemId}-${eIdx}`}
              entry={entry}
              eIdx={eIdx}
              totalEntries={entries.length}
              sets={setStates[eIdx] ?? []}
              onUpdateSet={(sIdx, patch) => updateSet(eIdx, sIdx, patch)}
              onCopyFromFirst={() => copyFromFirst(eIdx)}
            />
          ))
        )}

        {actionData?.error != null && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>
            {actionData.error}
          </p>
        )}

        {entries.length > 0 && (
          <ProgressBar filled={stats.filled} total={stats.total} />
        )}

        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={entries.length === 0}
          >
            <Icons.Check /> Zapisz sesję
          </button>
          <Link to="/podopieczny" className="btn btn-ghost btn-lg">
            Anuluj
          </Link>
        </div>
      </Form>

      <div className="text-xs muted-2" style={{ marginTop: 18 }}>
        Zalogowany jako {user.displayName}.
      </div>
    </div>
  );
}

function ProgressBar({ filled, total }: { filled: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
  const complete = filled === total && total > 0;
  return (
    <div
      className="card"
      style={{
        padding: "10px 14px",
        background: complete ? "var(--accent-soft)" : "var(--surface)",
        borderColor: complete ? "var(--accent)" : undefined,
      }}
    >
      <div className="row between" style={{ marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {complete ? (
            <>
              <Icons.Check style={{ color: "var(--ok)" }} /> Wszystkie serie
              wypełnione
            </>
          ) : (
            <>
              <span className="mono">{filled}</span> z{" "}
              <span className="mono">{total}</span> {pluralizeSeria(total)}{" "}
              wypełnion{filled === 1 ? "a" : "ych"}
            </>
          )}
        </span>
        <span className="mono text-xs muted">{pct}%</span>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--surface-2)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: complete ? "var(--ok)" : "var(--accent)",
            transition: "width .15s ease, background .15s ease",
          }}
        />
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  eIdx,
  totalEntries,
  sets,
  onUpdateSet,
  onCopyFromFirst,
}: {
  entry: import("~/lib/workouts").LoggingEntry;
  eIdx: number;
  totalEntries: number;
  sets: SetState[];
  onUpdateSet: (sIdx: number, patch: Partial<SetState>) => void;
  onCopyFromFirst: () => void;
}) {
  const showCopyButton = entry.expectedSets > 1;
  const firstFilled =
    sets.length > 0 &&
    (sets[0]?.reps?.trim() !== "" || sets[0]?.difficulty !== "");

  return (
    <div className="card card-padless">
      <div
        className="row between"
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--line)",
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="row"
            style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}
          >
            <span className="mono text-xs muted">
              Ćwiczenie {eIdx + 1}/{totalEntries}
            </span>
            {entry.isDropsetItem && <span className="badge">dropset</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>
            {entry.exerciseName}
          </div>
          <div className="text-xs muted" style={{ marginTop: 3 }}>
            Cel: <strong className="mono" style={{ color: "var(--ink)" }}>{entry.expectedSets}</strong>{" "}
            seria(e) ×{" "}
            <strong className="mono" style={{ color: "var(--ink)" }}>{entry.expectedReps}</strong>{" "}
            {entry.unit === "SEC" ? "sek." : "powt."}
          </div>
          {entry.note != null && entry.note.length > 0 && (
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-2)",
                marginTop: 6,
                fontStyle: "italic",
              }}
            >
              „{entry.note}"
            </div>
          )}
        </div>
        {showCopyButton && (
          <button
            type="button"
            onClick={onCopyFromFirst}
            disabled={!firstFilled}
            className="btn btn-sm"
            title="Skopiuj liczby i trudność z serii #1 do pozostałych pustych"
            style={{ flexShrink: 0 }}
          >
            Wypełnij jak #1
          </button>
        )}
      </div>

      <div style={{ padding: 12, display: "grid", gap: 10 }}>
        {sets.map((set, sIdx) => (
          <SetRow
            // biome-ignore lint/suspicious/noArrayIndexKey: deterministic enumeration; rows never reorder.
            key={sIdx}
            eIdx={eIdx}
            sIdx={sIdx}
            unit={entry.unit}
            expectedReps={entry.expectedReps}
            set={set}
            onChange={(patch) => onUpdateSet(sIdx, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function tierFor(value: number): "easy" | "mid" | "hard" {
  if (value <= 4) return "easy";
  if (value <= 7) return "mid";
  return "hard";
}

function SetRow({
  eIdx,
  sIdx,
  unit,
  expectedReps,
  set,
  onChange,
}: {
  eIdx: number;
  sIdx: number;
  unit: "REPS" | "SEC";
  expectedReps: number;
  set: SetState;
  onChange: (patch: Partial<SetState>) => void;
}) {
  const diffName = `e_${eIdx}_s_${sIdx}_diff`;

  // Picking a difficulty implies "I did this set" — backfill reps with the
  // target so the trainee doesn't have to type a number they hit on plan.
  // They can still override afterwards.
  const onDifficultyChange = (v: string) => {
    if (!set.reps.trim()) {
      onChange({ difficulty: v, reps: String(expectedReps) });
    } else {
      onChange({ difficulty: v });
    }
  };

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: 10,
        display: "grid",
        gap: 8,
      }}
    >
      <div
        className="row"
        style={{
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <span className="mono text-xs muted" style={{ width: 28 }}>
          #{sIdx + 1}
        </span>
        <div className="field" style={{ minWidth: 0, flex: 1 }}>
          <label
            className="uppercase-label"
            htmlFor={`reps-${eIdx}-${sIdx}`}
            style={{ fontSize: 10 }}
          >
            {unit === "SEC" ? "Sekundy" : "Powtórzenia"}
          </label>
          <input
            id={`reps-${eIdx}-${sIdx}`}
            name={`e_${eIdx}_s_${sIdx}_reps`}
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            value={set.reps}
            placeholder={String(expectedReps)}
            onChange={(e) => onChange({ reps: e.target.value })}
            className="input input-num"
          />
        </div>
        <FileDropzone
          name={`e_${eIdx}_s_${sIdx}_video`}
          idSuffix={`${eIdx}-${sIdx}`}
          kind="video"
          label="Video"
          compact
          capture
          maxBytes={250_000_000}
        />
      </div>
      <div>
        <div className="uppercase-label" style={{ fontSize: 10, marginBottom: 4 }}>
          Trudność 1–10
        </div>
        <div className="diff-radio">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <div key={v}>
              <input
                id={`${diffName}-${v}`}
                name={diffName}
                type="radio"
                value={v}
                checked={set.difficulty === String(v)}
                onChange={() => onDifficultyChange(String(v))}
              />
              <label htmlFor={`${diffName}-${v}`} data-tier={tierFor(v)}>
                {v}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function pluralizeCwiczenie(n: number): string {
  if (n === 1) return "ćwiczenie";
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return "ćwiczeń";
  if (last >= 2 && last <= 4) return "ćwiczenia";
  return "ćwiczeń";
}

function pluralizeSeria(n: number): string {
  if (n === 1) return "seria";
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return "serii";
  if (last >= 2 && last <= 4) return "serie";
  return "serii";
}
