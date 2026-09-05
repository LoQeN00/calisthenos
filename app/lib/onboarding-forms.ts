import {
  myOnboardingFormControllerPending,
  myOnboardingFormControllerSubmit,
  traineeOnboardingFormControllerForTrainer,
} from "@kalisthenos/api-client";
import type {
  OnboardingFormResponse,
  TrainerOnboardingFormResponse,
} from "@kalisthenos/api-client";
import { orNull } from "~/lib/api/client";
import type { Api } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";
import type { OnboardingAnswers } from "~/lib/onboarding-form-types";

/**
 * Formularz startowy — w całości na kontrakcie. Formularz jest prywatny w parze:
 * podopieczny czyta i wypełnia własny, oczekujący (`/v1/me/onboarding-form`),
 * trener czyta wyniki swojego podopiecznego (`/v1/trainees/{id}/onboarding-form`).
 * Zakres tenanta niesie token, egzekwuje BE — `traineeId` został wyłącznie tam,
 * gdzie kontrakt ma go w ścieżce.
 *
 * Co przestało być sprawą tego modułu: tworzenie formularza (jedzie w ciele
 * `POST /v1/invites` — `createInvite` w `auth/invite.ts`, atomowo z zaproszeniem
 * po stronie BE), doczepianie go do konta przy przyjęciu zaproszenia (robi BE),
 * komplet odpowiedzi i drugie wysłanie (`409` z BE), zamrożenie jednostki
 * (pozycja niesie ją z chwili utworzenia — `docs/04`: „zamrożona jednostka").
 */

export type {
  OnboardingFormItemResponse,
  OnboardingFormResponse,
  TrainerOnboardingFormItemResponse,
  TrainerOnboardingFormResponse,
} from "@kalisthenos/api-client";

/**
 * Własny typ błędu obszaru, bo trasa pokazuje `userMessage` w formularzu.
 * Źródłem `userMessage` jest `message` z koperty BE.
 */
export class OnboardingFormError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
  }
}

// ---------------- Podopieczny ----------------

/**
 * Oczekujący formularz z pozycjami. Kontrakt oddaje WYŁĄCZNIE oczekujący
 * (`completed_at IS NULL`): wypełniony i nigdy niedoczepiony wyglądają tak samo
 * — `404`, tu `null` przez `orNull`. Trasa `/v1/me/onboarding-form` jest na
 * białej liście bramki BE (ADR-0025), więc podopieczny z czekającym formularzem
 * może go pobrać — inaczej formularza nie dałoby się wypełnić.
 */
export async function getPendingFormForTrainee(api: Api): Promise<OnboardingFormResponse | null> {
  return await orNull(
    myOnboardingFormControllerPending({ client: api, throwOnError: true }).then((r) => r.data),
  );
}

/**
 * Bramka formularza startowego, wołana JAWNIE z layoutu podopiecznego i z
 * `wrapped.$ym.tsx` — przed czymkolwiek innym, tak jak do integracji. BE ma
 * własną bramkę globalną (`403 ONBOARDING_FORM_PENDING` → `toRouteResponse`
 * → przekierowanie na formularz), ale `wrapped` do fali 2 nie woła żadnej trasy
 * kontraktu, która by ją odpaliła, a layout ma ją odpalać ZANIM policzy
 * cokolwiek. Jedno `GET`; `404` znaczy „nie ma czego wypełniać". Każdy inny
 * błąd leci dalej — awaria BE nie może wyglądać jak brak formularza, bo
 * wpuszczałaby do aplikacji kogoś, kogo bramka ma zatrzymać.
 */
export async function hasPendingOnboarding(api: Api): Promise<boolean> {
  return (await getPendingFormForTrainee(api)) != null;
}

/**
 * Komplet odpowiedzi jednym `POST`. Formularz wybiera BE po tożsamości z tokenu
 * — z przeglądarki przychodzą wyłącznie identyfikatory pozycji, sprawdzane po
 * tamtej stronie względem TEGO formularza. Ciało składane jawnie pole po polu:
 * `OnboardingAnswers` jest strukturalnie zgodne z DTO, ale BE odrzuca pola spoza
 * DTO, a typy nadmiaru nie zgłoszą.
 *
 * Wąsko: `409` (`ONBOARDING_FORM_ALREADY_COMPLETED` — drugie kliknięcie „Gotowe"
 * odbija się od bazy po tamtej stronie, nie od sprawdzenia w kodzie; oraz
 * `ONBOARDING_FORM_INCOMPLETE` — brak pozycji; BE mapuje niezmienniki domenowe
 * na `409`, nie `400`) i `400` (walidacja BE ostrzejsza niż Zod) idą do
 * formularza. `404` — trener nie doczepił formularza — leci dalej: loader
 * odesłałby taką osobę z tej trasy, zanim zobaczyłaby przycisk.
 */
export async function submitOnboardingForm(api: Api, input: OnboardingAnswers): Promise<void> {
  try {
    await myOnboardingFormControllerSubmit({
      client: api,
      body: {
        answers: input.answers.map((answer) => ({
          itemId: answer.itemId,
          value: answer.value,
          comment: answer.comment,
        })),
        traineeNote: input.traineeNote,
      },
      throwOnError: true,
    });
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 409)) {
      throw new OnboardingFormError(e.code, e.message);
    }
    throw e;
  }
}

// ---------------- Trener: odczyt ----------------

/**
 * Wyniki formularza podopiecznego — pozycje z wartością, komentarzem i zamrożoną
 * jednostką, obie notatki, `completedAt` (`null`, dopóki podopieczny nie odesłał
 * kompletu). Cudzy podopieczny i formularz nigdy niedoczepiony dają po tamtej
 * stronie to samo `404` — tu `null`.
 */
export async function getFormForTrainer(
  api: Api,
  traineeId: string,
): Promise<TrainerOnboardingFormResponse | null> {
  return await orNull(
    traineeOnboardingFormControllerForTrainer({
      client: api,
      path: { traineeId },
      throwOnError: true,
    }).then((r) => r.data),
  );
}

/**
 * Plakietka na karcie podopiecznego. Trzy stany wyprowadzone z jednej
 * odpowiedzi: `null` = trener nie doczepił formularza (link się nie renderuje),
 * `completedAtISO: null` = czeka, data = wypełniony. Kontrakt nie ma osobnej
 * trasy statusu, więc to ta sama odpowiedź co `getFormForTrainer`, zawężona do
 * jednego pola — kształt (`completedAtISO`) zostaje ten, który czyta przegląd
 * klienta; S5 przepina tamten ekran w fali 2 i wtedy tę projekcję wchłania.
 */
export async function getFormStatusForTrainee(
  api: Api,
  traineeId: string,
): Promise<{ completedAtISO: string | null } | null> {
  const form = await getFormForTrainer(api, traineeId);
  return form == null ? null : { completedAtISO: form.completedAt };
}
