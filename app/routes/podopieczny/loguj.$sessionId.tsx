import { useEffect, useMemo, useState } from "react";
import {
  Form,
  isRouteErrorResponse,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useRouteError,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { z } from "zod";
import { FileDropzone } from "~/components/file-dropzone";
import { Icons } from "~/components/icons";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { maxUploadBytesFor, UploadCleanupQueue, UploadError, uploadFile } from "~/lib/file-uploads";
import { pluralizePl, todayISO, type PlForms } from "~/lib/format";
import { draftHasContent, draftKey, parseDraft, serializeDraft, type SetDraft } from "~/lib/log-draft";
import { detectNewPRsForLog } from "~/lib/stats";
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

  return {
    user,
    plan,
    session: detail.session,
    entries: detail.entries,
    // Klient egzekwuje ten sam limit co serwer PRZED wysłaniem — za duże nagranie
    // nie opuszcza urządzenia (unikamy zerwanego uploadu: timeout proxy / OOM).
    maxVideoBytes: maxUploadBytesFor("set_video"),
  };
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
      sets: Array<{
        ordinal: number;
        reps: number;
        difficulty: number | null;
        videoFileId: string | null;
      }>;
    }> = [];

    let anySetLogged = false;
    let allSetsFilled = true;

    for (const [eIdx, entry] of detail.entries.entries()) {
      const sets: Array<{
        ordinal: number;
        reps: number;
        difficulty: number | null;
        videoFileId: string | null;
      }> = [];
      for (let sIdx = 0; sIdx < entry.expectedSets; sIdx++) {
        const repsRaw = fd.get(`e_${eIdx}_s_${sIdx}_reps`);
        const diffRaw = fd.get(`e_${eIdx}_s_${sIdx}_diff`);
        const videoBlob = fd.get(`e_${eIdx}_s_${sIdx}_video`);
        const hasReps = repsRaw != null && repsRaw !== "";
        const hasDiff = diffRaw != null && diffRaw !== "";
        const hasVideo = videoBlob instanceof File && videoBlob.size > 0;

        const tracksRpe = entry.tracksRpe;

        // Pusty wiersz: dla ćwiczeń z RPE „pusty” = brak reps/diff/wideo;
        // dla ćwiczeń bez RPE „pusty” = brak reps/wideo (trudności i tak nie ma).
        const isBlank = tracksRpe ? !hasReps && !hasDiff && !hasVideo : !hasReps && !hasVideo;
        if (isBlank) {
          allSetsFilled = false;
          continue;
        }

        // Wiersz częściowy: reps zawsze wymagane; trudność tylko gdy tracksRpe.
        if (!hasReps || (tracksRpe && !hasDiff)) {
          return {
            error: tracksRpe
              ? `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: uzupełnij liczbę powtórzeń i trudność (1-10).`
              : `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: uzupełnij liczbę powtórzeń.`,
          };
        }

        const reps = Number(repsRaw);
        if (!Number.isFinite(reps) || reps < 1 || reps > 1000) {
          return {
            error: `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: liczba powtórzeń poza zakresem (1-1000).`,
          };
        }

        let difficulty: number | null = null;
        if (tracksRpe) {
          difficulty = Number(diffRaw);
          if (!Number.isFinite(difficulty) || difficulty < 1 || difficulty > 10) {
            return {
              error: `Ćwiczenie ${entry.exerciseName}, seria #${sIdx + 1}: trudność musi być 1-10.`,
            };
          }
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

        sets.push({ ordinal: sIdx, reps, difficulty, videoFileId });
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

    // Detect new PRs set in this log and pass exercise IDs via the URL so the
    // log detail page can fire a toast. Read-only side query; failure is a
    // non-event (we just skip the toast).
    const params = new URLSearchParams();
    try {
      const prs = await detectNewPRsForLog(db, user.id, newLogId);
      if (prs.length > 0) params.set("pr", prs.map((p) => p.exerciseId).join(","));
    } catch {
      // Swallow — toast is purely additive.
    }
    // Sygnał dla strony docelowej: zapis się powiódł, można wyczyścić szkic tej
    // sesji z sessionStorage (klucz = id sesji planu).
    params.set("saved", detail.session.id);
    const qs = params.toString();
    throw redirect(`/podopieczny/historia/${newLogId}${qs ? `?${qs}` : ""}`);
  } catch (e) {
    if (e instanceof Response) throw e; // redirect bubbles
    await cleanup.cleanup();
    if (e instanceof UploadError) return { error: e.userMessage };
    if (e instanceof WorkoutSaveError) return { error: e.userMessage };
    throw e;
  }
}

type SetState = SetDraft;

const CWICZENIE: PlForms = { one: "ćwiczenie", few: "ćwiczenia", many: "ćwiczeń" };
const SERIA: PlForms = { one: "seria", few: "serie", many: "serii" };

export default function LogForm() {
  const { user, session, entries, maxVideoBytes } = useLoaderData<typeof loader>();
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
        skipped: false,
      })),
    ),
  );

  const updateSet = (eIdx: number, sIdx: number, patch: Partial<SetState>) => {
    setSetStates((prev) =>
      prev.map((sets, i) =>
        i === eIdx ? sets.map((s, j) => (j === sIdx ? { ...s, ...patch } : s)) : sets,
      ),
    );
  };

  // Mark a set as explicitly skipped. Clears any partial input so it doesn't
  // resurface if the trainee later "Cofnij"-clicks it (they'll start fresh).
  const skipSet = (eIdx: number, sIdx: number) => {
    setSetStates((prev) =>
      prev.map((sets, i) =>
        i === eIdx
          ? sets.map((s, j) => (j === sIdx ? { reps: "", difficulty: "", skipped: true } : s))
          : sets,
      ),
    );
  };

  const unskipSet = (eIdx: number, sIdx: number) => {
    setSetStates((prev) =>
      prev.map((sets, i) =>
        i === eIdx
          ? sets.map((s, j) => (j === sIdx ? { reps: "", difficulty: "", skipped: false } : s))
          : sets,
      ),
    );
  };

  const copyFromFirst = (eIdx: number) => {
    setSetStates((prev) =>
      prev.map((sets, i) => {
        if (i !== eIdx) return sets;
        const first = sets[0];
        if (!first || first.skipped) return sets;
        return sets.map((s, j) =>
          j === 0 || s.skipped
            ? s
            : {
                reps: s.reps || first.reps,
                difficulty: s.difficulty || first.difficulty,
                skipped: false,
              },
        );
      }),
    );
  };

  // Progress: filled = reps + difficulty set; skipped = explicitly opted-out.
  // Pending = neither (still needs trainee attention before submit feels done).
  const stats = useMemo(() => {
    let total = 0;
    let filled = 0;
    let skipped = 0;
    setStates.forEach((sets, eIdx) => {
      const tracksRpe = entries[eIdx]?.tracksRpe ?? true;
      for (const s of sets) {
        total++;
        if (s.skipped) skipped++;
        else if (s.reps.trim() !== "" && (!tracksRpe || s.difficulty !== "")) filled++;
      }
    });
    return { total, filled, skipped };
  }, [setStates, entries]);

  const setCounts = useMemo(() => entries.map((e) => e.expectedSets), [entries]);
  const exerciseIds = useMemo(() => entries.map((e) => e.exerciseId), [entries]);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [draftReady, setDraftReady] = useState(false);

  const emptyState = (): SetState[][] =>
    entries.map((entry) =>
      Array.from({ length: entry.expectedSets }, () => ({
        reps: "",
        difficulty: "",
        skipped: false,
      })),
    );

  // Po hydracji: przywróć szkic z sessionStorage — tylko gdy pasuje do bieżącego
  // planu (te same ćwiczenia w tej samej kolejności + liczby serii) i cokolwiek
  // zawiera. Celowo NIE w inicjalizatorze useState — SSR renderuje pusto, więc
  // odczyt storage tam rozjechałby hydrację.
  // biome-ignore lint/correctness/useExhaustiveDependencies: raz po zamontowaniu
  useEffect(() => {
    try {
      const restored = parseDraft(sessionStorage.getItem(draftKey(session.id)), {
        exerciseIds,
        setCounts,
      });
      if (restored && draftHasContent(restored)) {
        setSetStates(restored);
        setRestoredDraft(true);
      }
    } catch {
      // sessionStorage niedostępny (tryb prywatny itd.) — pomijamy przywracanie.
    }
    setDraftReady(true);
  }, []);

  // Zapisuj szkic przy każdej zmianie serii — ale dopiero PO próbie przywrócenia,
  // żeby pusty stan startowy nie nadpisał zapisanego szkicu. Pusty stan czyścimy
  // zamiast zapisywać (mniej śmieci; spójne z „Wyczyść szkic").
  useEffect(() => {
    if (!draftReady) return;
    try {
      if (draftHasContent(setStates)) {
        sessionStorage.setItem(draftKey(session.id), serializeDraft(exerciseIds, setStates));
      } else {
        sessionStorage.removeItem(draftKey(session.id));
      }
    } catch {
      // Best-effort — brak storage nie może wywrócić logowania.
    }
  }, [draftReady, setStates, session.id, exerciseIds]);

  const clearDraft = () => {
    setSetStates(emptyState());
    setRestoredDraft(false);
    try {
      sessionStorage.removeItem(draftKey(session.id));
    } catch {
      // ignore
    }
  };

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
            Nowa sesja · {entries.length} {pluralizePl(entries.length, CWICZENIE)}
          </div>
          <h1>{session.name}</h1>
          <div className="sub">
            Zarejestruj wykonane serie. Pominięte serie nie wliczają się do statystyk — kliknij
            „Pomiń" obok serii, której nie zrobiłeś.
          </div>
        </div>
      </div>

      <Form method="post" encType="multipart/form-data" style={{ display: "grid", gap: 14 }}>
        {restoredDraft && (
          <output
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              background: "var(--accent-soft)",
              borderColor: "var(--accent)",
            }}
          >
            <span style={{ fontSize: 13 }}>
              <Icons.Check /> Przywrócono niezapisany szkic tej sesji.{" "}
              <span className="muted">Nagrania wideo trzeba dodać ponownie.</span>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={clearDraft}
              style={{ flexShrink: 0 }}
            >
              Wyczyść szkic
            </button>
          </output>
        )}
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
              maxVideoBytes={maxVideoBytes}
              onUpdateSet={(sIdx, patch) => updateSet(eIdx, sIdx, patch)}
              onSkipSet={(sIdx) => skipSet(eIdx, sIdx)}
              onUnskipSet={(sIdx) => unskipSet(eIdx, sIdx)}
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
          <ProgressBar filled={stats.filled} skipped={stats.skipped} total={stats.total} />
        )}

        <div className="row" style={{ gap: 8, marginTop: 6 }}>
          <button type="submit" className="btn btn-primary btn-lg" disabled={entries.length === 0}>
            <Icons.Check /> Zapisz sesję
          </button>
          <Link to="/podopieczny" className="btn btn-ghost btn-lg">
            Anuluj
          </Link>
        </div>
      </Form>

      <div className="text-xs muted" style={{ marginTop: 18 }}>
        Zalogowany jako {user.displayName}.
      </div>
    </div>
  );
}

/**
 * Łapie błędy loadera/akcji tej trasy — w szczególności zerwaną wysyłkę
 * formularza (`TypeError: Failed to fetch`), gdy upload wideo nie dojdzie do
 * serwera. Zamiast surowego „Application Error" pokazujemy czytelny komunikat.
 * Wpisane serie są bezpieczne w sessionStorage — powrót do formularza je odtworzy.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div>
      <div className="crumbs">
        <Link to="/podopieczny">Mój plan</Link>
      </div>
      <div className="empty" style={{ marginTop: 24 }}>
        <h3>{isNotFound ? "Nie znaleziono sesji" : "Nie udało się zapisać treningu"}</h3>
        <div style={{ maxWidth: 460, margin: "8px auto 0", lineHeight: 1.5 }}>
          {isNotFound ? (
            "Ta sesja nie istnieje albo nie masz do niej dostępu."
          ) : (
            <>
              Coś przerwało wysyłkę — najczęściej słabe połączenie albo zbyt duże nagranie wideo.
              Twoje wpisane serie zostały zachowane w tej przeglądarce; wróć do formularza i spróbuj
              ponownie <span className="muted">(nagrania dodaj jeszcze raz)</span>.
            </>
          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <Link to={isNotFound ? "/podopieczny" : "."} className="btn btn-primary">
            {isNotFound ? "Wróć do planu" : "Wróć do formularza"}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  filled,
  skipped,
  total,
}: {
  filled: number;
  skipped: number;
  total: number;
}) {
  const accounted = filled + skipped;
  const pct = total === 0 ? 0 : Math.round((accounted / total) * 100);
  const filledPct = total === 0 ? 0 : (filled / total) * 100;
  const skippedPct = total === 0 ? 0 : (skipped / total) * 100;
  const allFilled = filled === total && total > 0;
  const allAccounted = accounted === total && total > 0;
  const pending = total - accounted;

  return (
    <div
      className="card"
      style={{
        padding: "10px 14px",
        background: allFilled ? "var(--accent-soft)" : "var(--surface)",
        borderColor: allFilled ? "var(--accent)" : undefined,
      }}
    >
      <div className="row between" style={{ marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {allFilled ? (
            <>
              <Icons.Check style={{ color: "var(--ok)" }} /> Wszystkie serie wypełnione
            </>
          ) : allAccounted ? (
            <>
              <span className="mono">{filled}</span> wypełnion
              {filled === 1 ? "a" : "ych"}
              {skipped > 0 && (
                <>
                  {" · "}
                  <span className="mono" style={{ color: "var(--muted)" }}>
                    {skipped}
                  </span>{" "}
                  <span className="muted">
                    {pluralizePl(skipped, {
                      one: "pominięta",
                      few: "pominięte",
                      many: "pominiętych",
                    })}
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <span className="mono">{filled}</span> z <span className="mono">{total}</span>{" "}
              {pluralizePl(total, SERIA)} wypełnion{filled === 1 ? "a" : "ych"}
              {skipped > 0 && (
                <>
                  {" · "}
                  <span className="mono" style={{ color: "var(--muted)" }}>
                    {skipped}
                  </span>{" "}
                  <span className="muted">pominięte</span>
                </>
              )}
              {pending > 0 && (
                <>
                  {" · "}
                  <span className="mono" style={{ color: "var(--muted)" }}>
                    {pending}
                  </span>{" "}
                  <span className="muted">do uzupełnienia</span>
                </>
              )}
            </>
          )}
        </span>
        <span className="mono text-xs muted">{pct}%</span>
      </div>
      <div
        style={{
          display: "flex",
          height: 4,
          background: "var(--surface-2)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${filledPct}%`,
            height: "100%",
            background: allFilled ? "var(--ok)" : "var(--accent)",
            transition: "width .15s ease, background .15s ease",
          }}
        />
        <div
          style={{
            width: `${skippedPct}%`,
            height: "100%",
            background: "var(--muted-2)",
            transition: "width .15s ease",
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
  maxVideoBytes,
  onUpdateSet,
  onSkipSet,
  onUnskipSet,
  onCopyFromFirst,
}: {
  entry: import("~/lib/workouts").LoggingEntry;
  eIdx: number;
  totalEntries: number;
  sets: SetState[];
  maxVideoBytes: number;
  onUpdateSet: (sIdx: number, patch: Partial<SetState>) => void;
  onSkipSet: (sIdx: number) => void;
  onUnskipSet: (sIdx: number) => void;
  onCopyFromFirst: () => void;
}) {
  const showCopyButton = entry.expectedSets > 1;
  const firstFilled =
    sets.length > 0 &&
    !sets[0]?.skipped &&
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
          <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span className="mono text-xs muted">
              Ćwiczenie {eIdx + 1}/{totalEntries}
            </span>
            {entry.isDropsetItem && <span className="badge">dropset</span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{entry.exerciseName}</div>
          <div className="text-xs muted" style={{ marginTop: 3 }}>
            Cel:{" "}
            <strong className="mono" style={{ color: "var(--ink)" }}>
              {entry.expectedSets}
            </strong>{" "}
            seria(e) ×{" "}
            <strong className="mono" style={{ color: "var(--ink)" }}>
              {entry.expectedReps}
            </strong>{" "}
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
        {sets.map((set, sIdx) =>
          set.skipped ? (
            <SkippedSetRow
              // biome-ignore lint/suspicious/noArrayIndexKey: deterministic enumeration; rows never reorder.
              key={sIdx}
              sIdx={sIdx}
              onUnskip={() => onUnskipSet(sIdx)}
            />
          ) : (
            <SetRow
              // biome-ignore lint/suspicious/noArrayIndexKey: deterministic enumeration; rows never reorder.
              key={sIdx}
              eIdx={eIdx}
              sIdx={sIdx}
              unit={entry.unit}
              expectedReps={entry.expectedReps}
              tracksRpe={entry.tracksRpe}
              set={set}
              maxVideoBytes={maxVideoBytes}
              onChange={(patch) => onUpdateSet(sIdx, patch)}
              onSkip={() => onSkipSet(sIdx)}
            />
          ),
        )}
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
  tracksRpe,
  set,
  maxVideoBytes,
  onChange,
  onSkip,
}: {
  eIdx: number;
  sIdx: number;
  unit: "REPS" | "SEC";
  expectedReps: number;
  tracksRpe: boolean;
  set: SetState;
  maxVideoBytes: number;
  onChange: (patch: Partial<SetState>) => void;
  onSkip: () => void;
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
      <div className="row between" style={{ alignItems: "center", marginBottom: -2 }}>
        <span className="mono text-xs muted">Seria #{sIdx + 1}</span>
        <button
          type="button"
          onClick={onSkip}
          className="btn btn-sm btn-ghost"
          style={{
            fontSize: 11,
            color: "var(--muted)",
            padding: "2px 8px",
            height: 24,
          }}
          title="Oznacz tę serię jako pominiętą (nie wlicza się do statystyk)"
        >
          <Icons.X style={{ fontSize: 11 }} /> Pomiń
        </button>
      </div>
      <div
        className="row"
        style={{
          gap: 10,
          alignItems: "flex-end",
        }}
      >
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
          maxBytes={maxVideoBytes}
        />
      </div>
      {tracksRpe ? (
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
      ) : (
        <div className="text-xs muted" style={{ fontStyle: "italic" }}>
          To ćwiczenie nie zbiera oceny trudności.
        </div>
      )}
    </div>
  );
}

/**
 * Compact placeholder for a set that the trainee explicitly marked as skipped.
 * Renders no form inputs — the action's "row left blank" path already treats
 * missing fields as skipped (no DB row, doesn't pollute stats).
 */
function SkippedSetRow({
  sIdx,
  onUnskip,
}: {
  sIdx: number;
  onUnskip: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px dashed var(--line-2)",
        borderRadius: 8,
        padding: "10px 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <span className="mono text-xs muted">Seria #{sIdx + 1}</span>
        <span
          className="mono"
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--muted)",
            fontWeight: 600,
          }}
        >
          Pominięta
        </span>
        <span className="text-xs muted" style={{ fontStyle: "italic" }}>
          nie wlicza się do statystyk
        </span>
      </div>
      <button
        type="button"
        onClick={onUnskip}
        className="btn btn-sm btn-ghost"
        style={{ fontSize: 11, padding: "2px 8px", height: 24 }}
      >
        Cofnij
      </button>
    </div>
  );
}
