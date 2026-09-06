import {
  myPlanControllerActivePlan,
  myPlanControllerSession,
  myWorkoutLogsControllerById,
  myWorkoutLogsControllerMine,
  traineeWorkoutLogsControllerById,
  traineeWorkoutLogsControllerList,
  workoutLogsControllerCreate,
} from "@kalisthenos/api-client";
import type {
  CreatedWorkoutLogView,
  MyPlanView,
  SessionDetailView,
  WorkoutLogDetailView,
  WorkoutLogListPage,
} from "@kalisthenos/api-client";
import { orNull, publicFileUrl } from "~/lib/api/client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";

// ============================================================
// Domain types
// ============================================================

/**
 * A flattened "entry" the trainee logs against. Each plan item produces one
 * entry; for dropset blocks, each drop becomes its own entry (with the block's
 * sets count). Entries are ordered by (sessionOrdinal, blockOrdinal, itemOrdinal).
 */
export interface LoggingEntry {
  /** The plan_item id this entry maps to (for reference; not directly used by writers). */
  planItemId: string;
  exerciseId: string;
  exerciseName: string;
  unit: "REPS" | "SEC";
  /** Number of sets the trainee is expected to perform. */
  expectedSets: number;
  /** Target reps (or seconds) per set. */
  expectedReps: number;
  /** Optional trainer note. */
  note: string | null;
  /** Whether this entry belongs to a dropset block (UI affordance only). */
  isDropsetItem: boolean;
  /** Czy ćwiczenie zbiera ocenę trudności (RPE) per seria. */
  tracksRpe: boolean;
}

// ============================================================
// Aktywny plan i sesja podopiecznego — kontrakt
// ============================================================

/**
 * Aktywny plan podopiecznego z pełnym drzewem sesji → bloków → pozycji. Brak
 * planu to po stronie BE `404 PLAN_NOT_FOUND` — „stan normalny, nie awaria"
 * (docblock trasy) — więc `| null` i `orNull`. Liczby wykonań per sesja tu nie ma
 * (`docs/03` „Sesje: pełne drzewo"); niesie je `activePlan` pulpitu (`views.ts`).
 */
export async function loadMyActivePlan(api: Api): Promise<MyPlanView | null> {
  return await orNull(
    myPlanControllerActivePlan({ client: api, throwOnError: true }).then((r) => r.data),
  );
}

/**
 * `demoUrl` z kontraktu jest ŚCIEŻKĄ — origin dokłada moduł (jak `videoUrl`
 * w `withPublicVideoUrls` niżej i `demoUrl` w `exercises.ts`).
 */
function withPublicDemoUrls(session: SessionDetailView): SessionDetailView {
  return {
    ...session,
    blocks: session.blocks.map((block) => ({
      ...block,
      items: block.items.map((item) =>
        item.demoUrl == null ? item : { ...item, demoUrl: publicFileUrl(item.demoUrl) },
      ),
    })),
  };
}

/**
 * Sesja do wykonania — z jednostką, flagą RPE i podpisanym demo per pozycja.
 * Przynależność sesji do planu aktywnego ALBO archiwalnego tej pary rozstrzyga
 * BE (zaległy trening ze starszej wersji planu jest legalny — `docs/01` §D);
 * sesja szkicu to `409 PLAN_NOT_PUBLISHED`, które leci dalej jako `ApiError`,
 * a cudza lub nieistniejąca to `404`, tu `null`. `findActivePlanForTrainee`
 * przestało więc istnieć: trasa nie pyta „jaki jest aktywny plan", tylko
 * „daj mi tę sesję".
 */
export async function loadSessionForLogging(
  api: Api,
  sessionId: string,
): Promise<SessionDetailView | null> {
  const session = await orNull(
    myPlanControllerSession({ client: api, path: { sessionId }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
  return session == null ? null : withPublicDemoUrls(session);
}

/**
 * Spłaszczenie sesji do wpisów formularza logowania — jedna pozycja planu = jeden
 * wpis; w dropsecie liczbę serii niesie BLOK, a pozycje mają `sets: null`.
 * Czysta funkcja: do integracji robił to `loadSessionForLogging(db)` po drodze
 * z bazy, więc nie miała testu. Kształt `LoggingEntry` zostaje — formularz
 * i akcja czytają go bez zmian.
 */
export function toLoggingEntries(session: SessionDetailView): LoggingEntry[] {
  const entries: LoggingEntry[] = [];
  for (const block of session.blocks) {
    const isDropset = block.kind === "dropset";
    for (const item of block.items) {
      entries.push({
        planItemId: item.id,
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        unit: item.unit,
        expectedSets: isDropset ? (block.sets ?? 1) : (item.sets ?? 1),
        expectedReps: item.reps,
        note: item.note,
        isDropsetItem: isDropset,
        tracksRpe: item.tracksRpe,
      });
    }
  }
  return entries;
}

// ============================================================
// Workout log lists + detail
// ============================================================

export type LogSort = "date_desc" | "date_asc" | "hardest" | "easiest" | "sets_desc";
export type VideoFilter = "all" | "with" | "without";

export interface LogListOpts {
  page: number;
  sort: LogSort;
  q?: string;
  /** Domyślnie `all` — wtedy parametr nie idzie do kontraktu. */
  video?: VideoFilter;
}

function logListQuery(opts: LogListOpts) {
  return {
    page: opts.page,
    sort: opts.sort,
    // `all` to BRAK parametru (wzorzec `status` w planach); puste `q=` znaczy
    // „szukaj pustego łańcucha", więc też nie wychodzi. Rozłożone warunkowo, nie
    // przez `q: opts.q`: klucz z `undefined` i brak klucza to dla serializatora
    // zapytań dwie różne rzeczy.
    ...(opts.video != null && opts.video !== "all" ? { video: opts.video } : {}),
    ...(opts.q != null && opts.q.length > 0 ? { q: opts.q } : {}),
  };
}

/**
 * Własna historia podopiecznego — cała strona z kontraktu (`items`, `page`,
 * `totalPages`, `total`), więc `countLogsForTrainee` znika bez zamiennika, a rozmiar
 * strony (20) i przycięcie `page` spoza zakresu należą do BE (`docs/04` §5).
 * Wartości `sort` są identyczne z zakładkowalnym adresem listy, więc — jak
 * w planach — nie ma słownika. Lista niesie wyłącznie `hasVideo`; podpisany adres
 * nagrania przychodzi dopiero w szczególe.
 */
export async function listMyLogs(api: Api, opts: LogListOpts): Promise<WorkoutLogListPage> {
  const { data } = await myWorkoutLogsControllerMine({
    client: api,
    query: logListQuery(opts),
    throwOnError: true,
  });
  return data;
}

/**
 * Historia podopiecznego oglądana przez trenera — te same filtry. Cudzy
 * podopieczny daje PUSTĄ stronę, nie `404` (tak zdecydował kontrakt), więc
 * o `404` decyduje wcześniejsze `findTraineeRef` (`trainees.ts`) w tej samej trasie.
 */
export async function listTraineeLogs(
  api: Api,
  traineeId: string,
  opts: LogListOpts,
): Promise<WorkoutLogListPage> {
  const { data } = await traineeWorkoutLogsControllerList({
    client: api,
    path: { traineeId },
    query: logListQuery(opts),
    throwOnError: true,
  });
  return data;
}

/**
 * `videoUrl` z kontraktu jest ŚCIEŻKĄ (`/v1/files/…`), nie adresem — origin
 * dokłada moduł, nie trasa (ten sam powód co `demoUrl` w `exercises.ts`).
 * Adres jest podpisany tożsamością PYTAJĄCEGO: trener i podopieczny dostają na
 * to samo nagranie różne adresy, i tak ma być (`docs/04` §Dziennik treningowy).
 */
function withPublicVideoUrls(detail: WorkoutLogDetailView): WorkoutLogDetailView {
  return {
    ...detail,
    exercises: detail.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) =>
        set.videoUrl == null ? set : { ...set, videoUrl: publicFileUrl(set.videoUrl) },
      ),
    })),
  };
}

/**
 * Własny trening z pełnym drzewem serii. `| null` w sygnaturze mapuje `404` przez
 * `orNull` — cudzy log jest po tamtej stronie nieodróżnialny od nieistniejącego.
 * Liczby oczekiwanych serii kontrakt nie niesie: pominięte serie w środku czyta
 * się z luk w `ordinal`, a o ogonie mówi `allDone`.
 */
export async function loadMyLog(api: Api, logId: string): Promise<WorkoutLogDetailView | null> {
  const detail = await orNull(
    myWorkoutLogsControllerById({ client: api, path: { id: logId }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
  return detail == null ? null : withPublicVideoUrls(detail);
}

/**
 * Trening podopiecznego oglądany przez trenera. Parę (podopieczny, log) sprawdza
 * BE — niezgodna albo spoza tenanta to `404`, tu `null`. Nazwy podopiecznego ten
 * widok nie niesie; trasa bierze ją z `findTraineeRef` (`trainees.ts`, luka L S5-2).
 */
export async function loadTraineeLog(
  api: Api,
  traineeId: string,
  logId: string,
): Promise<WorkoutLogDetailView | null> {
  const detail = await orNull(
    traineeWorkoutLogsControllerById({
      client: api,
      path: { traineeId, id: logId },
      throwOnError: true,
    }).then((r) => r.data),
  );
  return detail == null ? null : withPublicVideoUrls(detail);
}

// ============================================================
// Saves
// ============================================================

export class WorkoutSaveError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export interface SaveSetInput {
  /**
   * Pozycja serii w planie (od 0). Zachowana, nie przenumerowana przy zapisie —
   * dzięki temu szczegół widzi, KTÓRE serie pominięto: brakujący `ordinal`
   * w środku to pominięcie.
   */
  ordinal: number;
  reps: number;
  difficulty: number | null;
  videoFileId: string | null;
}

export interface SaveExerciseLogInput {
  exerciseId: string;
  sets: SaveSetInput[];
}

/**
 * Bez `trainerId`, `traineeId`, `planId` i `sessionName` — BE wyprowadza je z tokenu
 * i z sesji planu. `LogWorkoutDto` nie ma tych pól, a `forbidNonWhitelisted` zamienia
 * każde nadmiarowe w `400`.
 */
export interface SaveWorkoutLogInput {
  planSessionId: string;
  /** `YYYY-MM-DD`; górną granicę (dziś + 1 dzień w strefie aplikacji) egzekwuje BE. */
  performedOn: string;
  note: string | null;
  allDone: boolean;
  exercises: SaveExerciseLogInput[];
}

export interface SaveWorkoutLogOptions {
  /**
   * Klucz idempotencji (`docs/04` §6): powtórzenie z tym samym kluczem oddaje
   * PIERWOTNY wynik zamiast drugiego treningu.
   *
   * Zasięg jest węższy, niż się wydaje: nadaje go loader trasy raz na WYŚWIETLENIE
   * formularza, więc chroni przed podwójną wysyłką TEGO SAMEGO renderu — drugim
   * kliknięciem i ponowionym `fetch`-em przeglądarki. Po przemontowaniu trasy
   * (powrót po `ErrorBoundary` ze szkicem z `sessionStorage`) klucz jest NOWY
   * i takie ponowienie założy drugi log. Klucz trwały, zapisywany razem ze
   * szkicem, to osobna decyzja — luka L10.
   */
  idempotencyKey?: string;
}

/**
 * Zapis treningu — jedno żądanie, atomowo po stronie BE. Zwraca utworzony log
 * RAZEM z listą pobitych rekordów, więc `detectNewPRsForLog` zniknęło: rekordy
 * są częścią odpowiedzi `201`, nie osobnym zapytaniem po zapisie.
 *
 * Co przestało być sprawą FE: własność i dostępność nagrań (`409
 * SET_VIDEO_UNAVAILABLE`, dawne `assertOwnedUnclaimedVideos`), przynależność
 * ćwiczeń do sesji (`409 EXERCISE_NOT_IN_SESSION`), reguły oceny trudności
 * per ćwiczenie (`409 DIFFICULTY_*`), data z przyszłości (`400
 * PERFORMED_ON_IN_FUTURE`), pusty trening (`409 EMPTY_WORKOUT_LOG`).
 *
 * Wąski `catch`: trasa pokazuje `userMessage` w formularzu, więc własny typ
 * dostają `400`, `404` i `409`. Reszta leci `ApiError`-em — awaria ma zostać awarią.
 */
export async function saveWorkoutLog(
  api: Api,
  input: SaveWorkoutLogInput,
  opts: SaveWorkoutLogOptions = {},
): Promise<CreatedWorkoutLogView> {
  try {
    const { data } = await workoutLogsControllerCreate({
      client: api,
      body: {
        planSessionId: input.planSessionId,
        performedOn: input.performedOn,
        note: input.note,
        allDone: input.allDone,
        exercises: input.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          sets: exercise.sets.map((set) => ({
            ordinal: set.ordinal,
            reps: set.reps,
            difficulty: set.difficulty,
            videoFileId: set.videoFileId,
          })),
        })),
      },
      ...(opts.idempotencyKey ? { headers: { "Idempotency-Key": opts.idempotencyKey } } : {}),
      throwOnError: true,
    });
    return data;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 409)) {
      throw new WorkoutSaveError(e.code, e.message);
    }
    throw e;
  }
}
