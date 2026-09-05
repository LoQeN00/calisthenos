import { traineeListControllerQuery, traineesControllerRemove } from "@kalisthenos/api-client";
import type { TraineeListPage, TraineeRef } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";

/**
 * Typy wierszy biorą się z kontraktu, nie z własnych kopii. `TraineeRef`
 * (`{ id, displayName }`) jest tym samym kształtem, którego kontrakt używa
 * w widoku terminu — nazwa podopiecznego to jedna rzecz, więc ma jeden typ.
 */
export type { TraineeListItem, TraineeListPage, TraineeRef } from "@kalisthenos/api-client";

export class TraineeDeleteError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

export type ClientSort = "name_asc" | "name_desc" | "last_session" | "most_sessions" | "newest";
export type PlanFilter = "all" | "with" | "without";

export interface ClientListOpts {
  page: number;
  sort: ClientSort;
  q?: string;
  /** Domyślnie `all` — wtedy parametr nie idzie do kontraktu. */
  plan?: PlanFilter;
}

/**
 * Lista podopiecznych trenera z liczbą sesji i datą ostatniej — pierwszy odczyt
 * tego modułu na kontrakcie (`GET /v1/trainees`, dodany w Etapie 1 właśnie dla
 * niego). Do integracji mieszkał w `workouts.ts` jako `listClientsForTrainer`
 * + `countClientsForTrainer`; przeszedł tu, bo zasób to podopieczni, a po stronie
 * BE model odczytu żyje w `analytics` (przekracza granicę kontekstu — ADR-0009).
 * Strona (30) i licznik przychodzą razem; `q` obejmuje nazwę ALBO e-mail, jak
 * dotychczasowy `ilike` na `users`.
 *
 * Dwie rzeczy, których kontrakt NIE niesie: nazwy aktywnego planu (jest `hasActivePlan`)
 * i daty dołączenia — dołożenie ich jest addytywne po stronie BE. Trzecia różnica
 * jest celowa: `sessionCount` liczy WYŁĄCZNIE treningi odbyte u tego trenera.
 */
export async function listClientsForTrainer(
  api: Api,
  opts: ClientListOpts,
): Promise<TraineeListPage> {
  const { data } = await traineeListControllerQuery({
    client: api,
    query: {
      page: opts.page,
      sort: opts.sort,
      // `all` to BRAK parametru; puste `q=` znaczy „szukaj pustego łańcucha".
      ...(opts.plan != null && opts.plan !== "all" ? { plan: opts.plan } : {}),
      ...(opts.q != null && opts.q.length > 0 ? { q: opts.q } : {}),
    },
    throwOnError: true,
  });
  return data;
}

/**
 * Sklejone strony listy w jedną tablicę, alfabetycznie. Kontrakt stronicuje po 30
 * i nie ma parametru „wszystko" (precedens: `listActiveExercisesForTrainer`
 * w `exercises.ts`, `listAllMyBodyPhotos` w `body-photos.ts`). `totalPages`
 * z PIERWSZEJ odpowiedzi jest granicą pętli, więc nie może się ona rozbiec.
 *
 * `sort: "name_asc"` jawnie, choć to domyślna wartość kontraktu: sklejanie stron
 * ma sens tylko przy porządku stabilnym między żądaniami, a domyślna wartość jest
 * cudzą decyzją, która może się zmienić bez naszego udziału.
 */
async function listAllTrainees(api: Api): Promise<TraineeRef[]> {
  const first = await listClientsForTrainer(api, { page: 1, sort: "name_asc" });
  const items = [...first.items];
  for (let n = 2; n <= first.totalPages; n += 1) {
    const next = await listClientsForTrainer(api, { page: n, sort: "name_asc" });
    items.push(...next.items);
  }
  return items.map((t) => ({ id: t.id, displayName: t.displayName }));
}

/**
 * Aktywni podopieczni trenera — do pickerów (edytor nowego planu). Dawna wersja
 * odfiltrowywała zarchiwizowanych warunkiem `archived_at IS NULL`; po tamtej
 * stronie ten filtr jest wbudowany w zasób: `GET /v1/trainees` to podopieczni
 * z AKTYWNĄ relacją prowadzenia, a były podopieczny jest dla trasy
 * `/v1/trainees/{id}` nieodróżnialny od cudzego (`404`, `docs/04` §Zaproszenia).
 */
export async function listTraineesOfTrainer(api: Api): Promise<TraineeRef[]> {
  return await listAllTrainees(api);
}

/**
 * Nazwa podopiecznego do nagłówka — **obejście, nie rozwiązanie** (luka L S5-2).
 * Kontrakt nie ma `GET /v1/trainees/{id}`, a żaden z widoków, po które te ekrany
 * i tak sięgają (rozwój, progresja, porównanie, galeria sylwetki, formularz
 * startowy, szczegół treningu), nazwy nie niesie. Zamiast powtarzać to samo
 * zapytanie w dziewięciu trasach, stoi ono tutaj, w jednym miejscu, gotowe do
 * zamiany na jedno `GET`, gdy BE trasę doda.
 *
 * `null` znaczy „cudzy albo nieistniejący" — dokładnie to, co dotąd znaczył
 * `findTraineeOfTrainer`, więc trasy zamieniają jedno wywołanie na drugie bez
 * zmiany gałęzi `404`. Bramki tenanta ta funkcja NIE stanowi: egzekwuje ją BE
 * przy każdej trasie `/v1/trainees/{id}/…`.
 */
export async function findTraineeRef(api: Api, traineeId: string): Promise<TraineeRef | null> {
  const trainees = await listAllTrainees(api);
  return trainees.find((t) => t.id === traineeId) ?? null;
}

/**
 * Usuwa podopiecznego wraz z całą jego zawartością — jedno `DELETE`, `204` bez
 * treści. Do integracji była to ręczna kaskada w transakcji plus sprzątanie
 * bajtów z wolumenu; dziś kasuje BE, przez granice kontekstów, razem z planami,
 * dziennikiem, zdjęciami, plikami, postępem umiejętności **i odwzorowaniami
 * kalendarza zewnętrznego** (ADR-0035 po tamtej stronie) — czyli razem z luką
 * L S3-2, która powstała, gdy `syncCancelAllForPair` zniknęło z FE.
 *
 * Nazwy usuniętego podopiecznego odpowiedź nie niesie i nie ma po co: trasa ma
 * ją z nagłówka, który właśnie oglądała. Liczba skasowanych plików (`deletedFiles`)
 * znika bez zamiennika — była szczegółem implementacyjnym kaskady, nie faktem
 * o podopiecznym.
 *
 * `409 TRAINEE_HAS_OTHER_TIES` to odmowa z treścią dla trenera (podmiot prowadzi
 * kogoś innego albo ma rolę inną niż `trainee`), `404` — cudzy, były albo
 * nieistniejący. Oba jako `TraineeDeleteError` do paska akcji; awaria BE zostaje
 * awarią.
 */
export async function deleteTraineeFully(api: Api, traineeId: string): Promise<void> {
  try {
    await traineesControllerRemove({ client: api, path: { traineeId }, throwOnError: true });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 409)) {
      throw new TraineeDeleteError(e.code, e.message);
    }
    throw e;
  }
}
