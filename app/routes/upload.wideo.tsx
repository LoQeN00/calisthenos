import type { ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/api/auth";
import { db } from "~/lib/db/client";
import { UploadError, uploadFile } from "~/lib/file-uploads";
import { errorMeta, logger } from "~/lib/logger";
import { hasPendingOnboarding } from "~/lib/onboarding-forms";
import { enforceRateLimit, RATE_LIMITS } from "~/lib/rate-limit";
import { hasTraineeAppAccess } from "~/lib/stripe/gate";

/**
 * Zawsze JAWNY `Response.json`, nigdy goły obiekt ani `data()`.
 *
 * Dokumentacja React Router: trasy zasobowe konsumowane ZEWNĘTRZNIE mają zwracać
 * instancje `Response`, żeby kodowanie odpowiedzi było jawne, zamiast zależeć od tego,
 * jak RR przekonwertuje `data() -> Response` pod spodem. Tę trasę woła surowy
 * XMLHttpRequest (`components/video-upload-field.tsx`), który robi `JSON.parse` na
 * `responseText` — musi dostać czysty JSON, a nie format wewnętrzny RR.
 */
function json(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

/**
 * Trasa zasobowa (bez komponentu): JEDNO nagranie serii → `fileId`.
 *
 * Rozdziela wysyłkę pliku od zapisu sesji. Wcześniej cała sesja szła jednym POST-em
 * `multipart/form-data`, a `request.formData()` buforowało WSZYSTKIE nagrania w pamięci,
 * zanim padła pierwsza walidacja — bez żadnego sufitu poza liczbą serii w planie.
 *
 * Tutaj szczyt pamięci JEDNEGO żądania jest ograniczony do `MAX_VIDEO_UPLOAD_BYTES`.
 * UWAGA: to sufit per żądanie, a NIE per proces — nic nie ogranicza liczby równoległych
 * wysyłek (limit 100/15 min nie jest limitem współbieżności). Realną poprawą jest to,
 * że rozmiar pojedynczego żądania przestał rosnąć z liczbą serii w planie.
 *
 * Bezpieczeństwo:
 * - `kind` jest STAŁĄ, nie parametrem — klient nie decyduje, co wgrywa.
 * - `trainerId` pochodzi wyłącznie z sesji; pole o tej nazwie w ciele żądania jest ignorowane.
 * - Identyfikator zwrócony stąd NIE jest jeszcze niczym uprawniony — dopiero zapis
 *   treningu weryfikuje właściciela (`assertOwnedUnclaimedVideos` w `lib/workouts.ts`).
 */
export async function action(args: ActionFunctionArgs) {
  const { user } = requireUser(args.context, { role: "trainee" });
  if (!user.trainerId) {
    return json({ error: "Konto bez przypisanego trenera." }, 400);
  }

  // Obie bramki MUSZĄ być powtórzone tutaj, w tej samej kolejności co w loaderze
  // `podopieczny/_layout.tsx` — ta trasa jest zasobowa i leży POZA tym layoutem.
  // Bez nich podopieczny, który nie jest w stanie zapisać treningu, mógłby i tak
  // wysłać do 100 nagrań na 15 minut. Każdy taki plik byłby z definicji sierotą,
  // czyli darmowym kanałem zapełniania wolumenu.
  const { hasAccess } = await hasTraineeAppAccess(db, user);
  if (!hasAccess) {
    return json({ error: "Subskrypcja nieaktywna. Odśwież stronę." }, 402);
  }
  if (await hasPendingOnboarding(db, user.id)) {
    return json({ error: "Najpierw wypełnij formularz startowy. Odśwież stronę." }, 403);
  }

  // Limit per użytkownik, nie per IP — endpoint jest uwierzytelniony, a podopieczni
  // mogą dzielić NAT.
  const retryAfter = enforceRateLimit(args.request, { ...RATE_LIMITS.upload, key: user.id });
  if (retryAfter != null) {
    const mins = Math.max(1, Math.ceil(retryAfter / 60));
    return json({ error: `Za dużo wysyłek. Spróbuj ponownie za ${mins} min.` }, 429, {
      "Retry-After": String(retryAfter),
    });
  }

  const fd = await args.request.formData();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return json({ error: "Brak pliku." }, 400);
  }

  try {
    const rec = await uploadFile(db, {
      file,
      kind: "set_video",
      trainerId: user.trainerId,
      uploadedBy: user.id,
    });
    logger.info("upload.set_video.ok", { fileId: rec.id, bytes: rec.bytes });
    return json({ fileId: rec.id, bytes: rec.bytes, mimeType: rec.mimeType }, 200);
  } catch (err) {
    if (err instanceof UploadError) {
      // Komunikat już jest po polsku i bezpieczny do pokazania (rozmiar/format).
      return json({ error: err.userMessage }, 400);
    }
    logger.error("upload.set_video.failed", errorMeta(err));
    return json({ error: "Nie udało się wgrać nagrania. Spróbuj ponownie." }, 500);
  }
}
