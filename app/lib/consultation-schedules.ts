import {
  consultationSchedulesControllerDisable,
  consultationSchedulesControllerGet,
  consultationSchedulesControllerSave,
} from "@kalisthenos/api-client";
import type { ConsultationScheduleView } from "@kalisthenos/api-client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";
import type { ScheduleForm } from "~/lib/consultation-types";

/** Re-eksport dla tras — trasa nie importuje pakietu klienta wprost. */
export type { ConsultationScheduleView };
export type ConsultationCadence = ConsultationScheduleView["cadence"];

export class ScheduleError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * Aktywny harmonogram pary albo `null`. Odpowiedź jest OPAKOWANA
 * (`{ schedule: … | null }`), nie `404`: para bez cyklu to stan normalny,
 * a `404` kazałby odróżniać „nie ma cyklu” od „nie twój podopieczny” — to
 * drugie ma zostać nieodróżnialne od nieistnienia. Dlatego bez `orNull`:
 * `404` (cudzy podopieczny) leci dalej `ApiError`-em. Bez `trainerId` —
 * zakres niesie token; `traineeId` zostaje, bo jest w ścieżce kontraktu.
 */
export async function getActiveSchedule(
  api: Api,
  traineeId: string,
): Promise<ConsultationScheduleView | null> {
  const { data } = await consultationSchedulesControllerGet({
    client: api,
    path: { traineeId },
    throwOnError: true,
  });
  return data.schedule;
}

/**
 * Wąski `catch`: trasa pokazuje `userMessage` w pasku akcji, więc własny typ
 * dostają `400` (walidacja BE ostrzejsza niż Zod — np. czas trwania 5–480 min),
 * `404` (cudzy podopieczny) i `409`. Reszta leci `ApiError`-em.
 */
function toScheduleError(e: unknown): never {
  if (e instanceof ApiError && (e.status === 400 || e.status === 404 || e.status === 409)) {
    throw new ScheduleError(e.code, e.message);
  }
  throw e;
}

export interface UpsertScheduleInput {
  traineeId: string;
  form: ScheduleForm;
}

/**
 * Jeden aktywny cykl na parę. `PUT` jest idempotentny i różnicowy po stronie
 * BE: zapis bez zmian niczego nie rusza, zmieniona reguła odtwarza siatkę
 * i odwołuje przyszłe niepotwierdzone (potwierdzone zostają). Materializację
 * terminów i przesuwanie horyzontu robi BE (zapis + praca cykliczna workera),
 * więc dawne `ensureOccurrences`/`HORIZON_DAYS` zniknęły bez zamiennika.
 *
 * Do ciała idzie WYŁĄCZNIE kotwica pasująca do częstotliwości: DTO ma
 * `weekday?`/`dayOfMonth?` jako liczby bez `null`, a formularz niesie oba pola
 * (`null` dla nieużywanego). Klucz z `null` byłby polem spoza DTO — `400`.
 */
export async function upsertSchedule(
  api: Api,
  input: UpsertScheduleInput,
): Promise<ConsultationScheduleView> {
  const f = input.form;
  const monthly = f.cadence === "monthly";
  try {
    const { data } = await consultationSchedulesControllerSave({
      client: api,
      path: { traineeId: input.traineeId },
      body: {
        cadence: f.cadence,
        ...(!monthly && f.weekday != null ? { weekday: f.weekday } : {}),
        ...(monthly && f.dayOfMonth != null ? { dayOfMonth: f.dayOfMonth } : {}),
        timeOfDay: f.timeOfDay,
        durationMin: f.durationMin,
        startsOn: f.startsOn,
        defaultMeetingUrl: f.defaultMeetingUrl ?? null,
      },
      throwOnError: true,
    });
    return data;
  } catch (e) {
    return toScheduleError(e);
  }
}

/**
 * Wyłącza harmonogram („nigdy”): BE dezaktywuje cykl i odwołuje przyszłe
 * niepotwierdzone terminy. Powtórne wyłączenie NIE daje `409` — ponowienie po
 * zerwanym połączeniu to nie naruszenie niezmiennika. Zdarzenia w kalendarzu
 * zewnętrznym zdejmuje BE przez outbox, trasa niczego nie dosyła.
 */
export async function deactivateSchedule(api: Api, traineeId: string): Promise<void> {
  try {
    await consultationSchedulesControllerDisable({
      client: api,
      path: { traineeId },
      throwOnError: true,
    });
  } catch (e) {
    toScheduleError(e);
  }
}

/**
 * Nagłówek terminu, np. „Konsultacja — 11.06.2026”. Kontrakt nie niesie tytułu
 * (`title` nie istnieje w `/v1` — BE nadaje własny i żaden ekran z `docs/03`
 * go nie pokazuje), więc obie role liczą nagłówek stąd, z czasu ściennego
 * w konwencji FE (komponenty UTC).
 */
export function defaultTitle(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `Konsultacja — ${dd}.${mm}.${d.getUTCFullYear()}`;
}
