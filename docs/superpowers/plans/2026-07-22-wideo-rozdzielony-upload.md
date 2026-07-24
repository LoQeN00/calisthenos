# Rozdzielony upload wideo (P2) — plan implementacji

> **Dla wykonawcy:** zadania idą po kolei, każde kończy się bramkami i review.
> **UWAGA — odstępstwo od szablonu superpowers:** w tym repo **nie wykonujemy operacji git**
> (prowadzi je właściciel). Wszędzie, gdzie szablon każe commitować, robimy zamiast tego
> **bramki + review per task**. Cała zmiana kończy się jednym handoffem.

**Cel:** nagrania serii wysyłają się pojedynczo, od razu po wyborze, zamiast lecieć razem z całą sesją w jednym POST-cie.

**Architektura:** nowa trasa zasobowa `upload/wideo` przyjmuje jeden plik i zwraca `fileId`; klient trzyma `fileId` w ukrytym polu; finalny zapis sesji nie niesie binariów, tylko identyfikatory, które serwer weryfikuje pod kątem właściciela i tenanta; nieużyte pliki sprząta leniwy sweeper.

**Stack:** React Router v7 (trasa zasobowa + akcje), Drizzle, Zod, Vitest, XMLHttpRequest (postęp wysyłki).

**Spec:** [`docs/superpowers/specs/2026-07-22-wideo-rozdzielony-upload-design.md`](../specs/2026-07-22-wideo-rozdzielony-upload-design.md)

## Ograniczenia globalne

- **Nigdy git, nigdy docker.** Testy `*.itest.ts` PISZEMY, ale ich NIE uruchamiamy.
- **npm**, nie pnpm. Komendy pojedynczo, bez łańcuchowania i potoków.
- **UI po polsku.** Brand `kalisthenos` małą literą.
- **Tenant-scope:** funkcje repo przyjmują wymagany `trainerId`/`traineeId`; brak autoryzacji → 404.
- **Nowa trasa = plik + wpis w `app/routes.ts`.**
- **Zmiana UI → skill `frontend-design:frontend-design`**, design-system z `app/styles/tokens.css`.
- **Zakres:** wyłącznie `kind = "set_video"`. Sylwetka i demo ćwiczeń zostają bez zmian.
- **Bez migracji.** Schemat nie jest ruszany; `db:generate` nie jest potrzebne.

## Mapa plików

| Plik | Odpowiedzialność | Zadanie |
|---|---|---|
| `app/lib/rate-limit.ts` | override klucza + kubełek `upload` | 1 |
| `app/routes/upload.wideo.tsx` | **nowy** — trasa zasobowa, jeden plik → `fileId` | 2 |
| `app/routes.ts` | wpis trasy | 2 |
| `app/lib/workouts.ts` | walidacja identyfikatorów przy zapisie | 3 |
| `app/lib/orphan-files.ts` | **nowy** — sweeper sierot | 4 |
| `app/root.tsx` | wyzwalanie sweepera | 4 |
| `app/components/video-upload-field.tsx` | **nowy** — pole z wysyłką i postępem | 5 |
| `app/lib/log-draft.ts` | szkic v3 z `videoFileId` | 6 |
| `app/routes/podopieczny/loguj.$sessionId.tsx` | przepięcie formularza i akcji | 6 |

---

### Zadanie 1: Override klucza w rate-limicie + kubełek `upload`

Trasa uploadu jest uwierzytelniona, więc limit ma być **per użytkownik**, nie per IP —
kilku podopiecznych może siedzieć za jednym NAT-em.

**Pliki:**
- Modyfikacja: `app/lib/rate-limit.ts`
- Test: `app/lib/rate-limit.test.ts` (istnieje — dopisujemy)

**Interfejsy — produkuje:**
- `RATE_LIMITS.upload: { bucket: "upload"; limit: 100; windowMs: 900000 }`
- `enforceRateLimit(request, { bucket, limit, windowMs, key?: string }): number | null`

- [ ] **Krok 1: Test czerwony**

```ts
describe("enforceRateLimit — override klucza", () => {
  it("kluczuje po podanym `key`, ignorując IP", () => {
    const req = (ip: string) =>
      new Request("https://x.test", { headers: { "x-forwarded-for": ip } });
    const opts = { bucket: "t-key", limit: 1, windowMs: 60_000, key: "user-1" };

    expect(enforceRateLimit(req("1.1.1.1"), opts)).toBeNull();
    // Inne IP, ten sam użytkownik → limit już wyczerpany.
    expect(enforceRateLimit(req("2.2.2.2"), opts)).not.toBeNull();
  });

  it("bez `key` nadal kluczuje po IP", () => {
    const req = (ip: string) =>
      new Request("https://x.test", { headers: { "x-forwarded-for": ip } });
    const opts = { bucket: "t-ip", limit: 1, windowMs: 60_000 };

    expect(enforceRateLimit(req("3.3.3.3"), opts)).toBeNull();
    expect(enforceRateLimit(req("4.4.4.4"), opts)).toBeNull();
    expect(enforceRateLimit(req("3.3.3.3"), opts)).not.toBeNull();
  });
});
```

- [ ] **Krok 2: Uruchom, potwierdź czerwień**

`npx vitest run app/lib/rate-limit.test.ts` → FAIL (`key` nie istnieje w typie opts).

- [ ] **Krok 3: Implementacja**

W `enforceRateLimit` zamień budowanie klucza:

```ts
export function enforceRateLimit(
  request: Request,
  opts: { bucket: string; limit: number; windowMs: number; key?: string },
): number | null {
  try {
    // `key` (np. id użytkownika) dla endpointów uwierzytelnionych — IP jest tam
    // złym podmiotem, bo kilku podopiecznych może dzielić NAT.
    const subject = opts.key ?? clientIp(request);
    const key = `${opts.bucket}:${subject}`;
    const r = store.hit(key, opts.limit, opts.windowMs);
    return r.allowed ? null : r.retryAfterSec;
  } catch (err) {
    logger.error("rate_limit.enforce_failed", errorMeta(err));
    return null;
  }
}
```

Dopisz kubełek — hojnie, bo ciężka sesja to ~20 nagrań:

```ts
export const RATE_LIMITS = {
  login: { bucket: "login", limit: 10, windowMs: 15 * 60_000 },
  invite: { bucket: "invite", limit: 10, windowMs: 15 * 60_000 },
  upload: { bucket: "upload", limit: 100, windowMs: 15 * 60_000 },
} as const;
```

- [ ] **Krok 4: Zielono** — `npx vitest run app/lib/rate-limit.test.ts`
- [ ] **Krok 5: Bramki + review** — `npm run typecheck`, `npm run lint`, review zadania

---

### Zadanie 2: Trasa zasobowa `upload/wideo`

**Pliki:**
- Utworzenie: `app/routes/upload.wideo.tsx`
- Modyfikacja: `app/routes.ts`
- Test: `tests/upload-wideo.itest.ts` (**napisz, NIE uruchamiaj**)

**Interfejsy — konsumuje:** `RATE_LIMITS.upload`, `enforceRateLimit(.., { key })` z zadania 1.
**Interfejsy — produkuje:** `POST /upload/wideo` → `{ fileId, bytes, mimeType }` albo `{ error }`.

- [ ] **Krok 1: Trasa**

```tsx
import { data, type ActionFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { db } from "~/lib/db/client";
import { UploadError, uploadFile } from "~/lib/file-uploads";
import { errorMeta, logger } from "~/lib/logger";
import { enforceRateLimit, RATE_LIMITS, rateLimited } from "~/lib/rate-limit";

/**
 * Trasa zasobowa: JEDNO nagranie serii → `fileId`. Rozdziela wysyłkę pliku od zapisu
 * sesji, dzięki czemu w pamięci procesu nigdy nie ląduje więcej niż jeden plik.
 *
 * `kind` jest STAŁĄ, nie parametrem — klient nie decyduje, co wgrywa. `trainerId`
 * pochodzi wyłącznie z sesji.
 */
export async function action(args: ActionFunctionArgs) {
  const user = await requireUser(args.request, db, { role: "trainee" });
  if (!user.trainerId) {
    return data({ error: "Konto bez przypisanego trenera." }, { status: 400 });
  }

  const retryAfter = enforceRateLimit(args.request, { ...RATE_LIMITS.upload, key: user.id });
  if (retryAfter != null) return rateLimited(retryAfter);

  const fd = await args.request.formData();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return data({ error: "Brak pliku." }, { status: 400 });
  }

  try {
    const rec = await uploadFile(db, {
      file,
      kind: "set_video",
      trainerId: user.trainerId,
      uploadedBy: user.id,
    });
    logger.info("upload.set_video.ok", { fileId: rec.id, bytes: rec.bytes });
    return { fileId: rec.id, bytes: rec.bytes, mimeType: rec.mimeType };
  } catch (err) {
    if (err instanceof UploadError) {
      return data({ error: err.userMessage }, { status: 400 });
    }
    logger.error("upload.set_video.failed", errorMeta(err));
    return data({ error: "Nie udało się wgrać nagrania. Spróbuj ponownie." }, { status: 500 });
  }
}
```

- [ ] **Krok 2: Wpis w `app/routes.ts`**

Obok pozostałych tras infrastrukturalnych, po `route("files/:fileId", ...)`:

```ts
route("upload/wideo", "routes/upload.wideo.tsx"),
```

- [ ] **Krok 3: Test integracyjny (PISZ, nie uruchamiaj)**

`tests/upload-wideo.itest.ts` — wzoruj się na istniejących plikach w `tests/`.
Przypadki:
1. podopieczny wgrywa mp4 → wiersz w `files` ma `kind='set_video'`, `trainer_id` równy trenerowi podopiecznego, `uploaded_by` równy podopiecznemu;
2. trener trafiający na tę trasę → odrzucony (trasa jest tylko dla podopiecznych);
3. plik o nieprawidłowych magic-bytes → 400, ZERO wierszy w `files`;
4. `trainerId` NIE jest brany z ciała żądania — dorzucenie pola `trainerId` do formData niczego nie zmienia.

- [ ] **Krok 4: Bramki + review** — `npm run typecheck`, `npm run lint`, `npm run build`

---

### Zadanie 3: Walidacja identyfikatorów przy zapisie treningu

**To jest rdzeń bezpieczeństwa całego plasterka.** Do tej pory `videoFileId` pochodził
z `uploadFile` w tym samym żądaniu, więc nie wymagał weryfikacji. Teraz przychodzi od
klienta.

**Pliki:**
- Modyfikacja: `app/lib/workouts.ts`
- Test: `app/lib/workouts.test.ts` (**nowy** — czysta funkcja)
- Test: `tests/workout-video-ids.itest.ts` (**napisz, NIE uruchamiaj**)

**Interfejsy — produkuje:**
- `findUnusableVideoIds(requested: string[], usable: Array<{ id: string }>): string[]`
- `assertOwnedUnclaimedVideos(db, { traineeId, trainerId, fileIds }): Promise<void>`

- [ ] **Krok 1: Test czerwony (czysta funkcja)**

`app/lib/workouts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findUnusableVideoIds } from "./workouts";

describe("findUnusableVideoIds", () => {
  it("przepuszcza komplet, gdy każde żądane id wróciło z bazy", () => {
    expect(findUnusableVideoIds(["a", "b"], [{ id: "a" }, { id: "b" }])).toEqual([]);
  });

  it("zgłasza id, którego baza nie zwróciła (cudze, złego rodzaju albo już sprzątnięte)", () => {
    expect(findUnusableVideoIds(["a", "b"], [{ id: "a" }])).toEqual(["b"]);
  });

  it("zgłasza duplikat, nawet gdy id jest skądinąd poprawne", () => {
    // Jeden upload podpięty do dwóch serii — baza zwróci go raz i wyglądałby na OK.
    expect(findUnusableVideoIds(["a", "a"], [{ id: "a" }])).toEqual(["a"]);
  });

  it("pusta lista żądań jest poprawna", () => {
    expect(findUnusableVideoIds([], [])).toEqual([]);
  });
});
```

- [ ] **Krok 2: Uruchom, potwierdź czerwień** — `npx vitest run app/lib/workouts.test.ts`

- [ ] **Krok 3: Implementacja czystej funkcji** (w `app/lib/workouts.ts`)

```ts
/**
 * Czysta: które z żądanych id nie nadają się do podpięcia. Dwie reguły — id nie wróciło
 * z bazy (cudze / zły rodzaj / poza tenantem / już sprzątnięte) ALBO powtarza się w
 * żądaniu (jeden upload nie może obsłużyć dwóch serii).
 */
export function findUnusableVideoIds(
  requested: string[],
  usable: Array<{ id: string }>,
): string[] {
  const ok = new Set(usable.map((r) => r.id));
  const seen = new Set<string>();
  const bad: string[] = [];
  for (const id of requested) {
    if (!ok.has(id) || seen.has(id)) bad.push(id);
    seen.add(id);
  }
  return bad;
}
```

- [ ] **Krok 4: Zielono** — `npx vitest run app/lib/workouts.test.ts`

- [ ] **Krok 5: Funkcja repo**

Dopisz importy `inArray`, `notExists`, `sql` z `drizzle-orm` (część już jest) oraz:

```ts
/**
 * Rzuca, jeśli którekolwiek z podanych nagrań nie należy do TEGO podopiecznego,
 * nie jest rodzaju `set_video`, wypada poza tenant albo jest już podpięte do innej serii.
 *
 * `uploaded_by` jest tu KLUCZOWE: sam `trainer_id` nie wystarcza, bo podopieczni jednego
 * trenera dzielą tę samą wartość — bez tego warunku podopieczny A podpiąłby nagranie B.
 */
export async function assertOwnedUnclaimedVideos(
  db: Db,
  args: { traineeId: string; trainerId: string; fileIds: string[] },
): Promise<void> {
  if (args.fileIds.length === 0) return;

  const rows = await db
    .select({ id: schema.files.id })
    .from(schema.files)
    .where(
      and(
        inArray(schema.files.id, args.fileIds),
        eq(schema.files.kind, "set_video"),
        eq(schema.files.trainerId, args.trainerId),
        eq(schema.files.uploadedBy, args.traineeId),
        notExists(
          db
            .select({ x: sql`1` })
            .from(schema.workoutSetLogs)
            .where(eq(schema.workoutSetLogs.videoFileId, schema.files.id)),
        ),
      ),
    );

  const bad = findUnusableVideoIds(args.fileIds, rows);
  if (bad.length > 0) {
    // Bez id w logu — sama liczba wystarcza do diagnozy, a nie zdradza cudzych zasobów.
    logger.warn("workout.video_ids_rejected", {
      count: bad.length,
      traineeId: args.traineeId,
    });
    throw new WorkoutSaveError(
      `rejected ${bad.length} of ${args.fileIds.length} video ids`,
      "Któreś z nagrań nie jest już dostępne. Odśwież stronę i dodaj je ponownie.",
    );
  }
}
```

Dopisz import loggera na górze pliku, jeśli go tam nie ma:
`import { logger } from "~/lib/logger";`

- [ ] **Krok 6: Test integracyjny (PISZ, nie uruchamiaj)**

`tests/workout-video-ids.itest.ts`:
1. własne, nieużyte nagranie → przechodzi;
2. **nagranie innego podopiecznego TEGO SAMEGO trenera → odrzucone** (najważniejszy przypadek);
3. plik rodzaju `body_photo` → odrzucony;
4. nagranie już podpięte do innej serii → odrzucone;
5. nieistniejące id → odrzucone;
6. pusta lista → przechodzi bez zapytania.

- [ ] **Krok 7: Bramki + review**

---

### Zadanie 4: Sweeper plików-sierot

**Pliki:**
- Utworzenie: `app/lib/orphan-files.ts`
- Modyfikacja: `app/root.tsx`
- Test: `tests/orphan-sweeper.itest.ts` (**napisz, NIE uruchamiaj**)

**Interfejsy — produkuje:**
- `sweepOrphanSetVideos(db, nowMs?): Promise<number>`
- `maybeSweepOrphanSetVideos(db): void`

- [ ] **Krok 1: Moduł**

```ts
import { and, eq, lt, notExists, sql } from "drizzle-orm";
import type { Db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { deleteFileBlob } from "~/lib/file-uploads";
import { errorMeta, logger } from "~/lib/logger";

/**
 * Karencja: nagranie wgrane, ale niepodpięte do żadnej serii, uznajemy za porzucone
 * dopiero po dobie. Hojnie — sesja zostawiona otwarta na noc ma się zapisać.
 */
export const ORPHAN_GRACE_MS = 24 * 3600 * 1000;

/**
 * Kasuje nagrania serii, których nie podpięto do żadnego logu. Rozdzielony upload
 * tworzy wiersz `files` PRZED zapisem sesji, więc porzucona sesja zostawia sierotę.
 *
 * Świadomie bez migracji: sierotę wykrywa zapytanie, nie kolumna stanu.
 */
export async function sweepOrphanSetVideos(db: Db, nowMs: number = Date.now()): Promise<number> {
  const cutoff = new Date(nowMs - ORPHAN_GRACE_MS);
  const rows = await db
    .delete(schema.files)
    .where(
      and(
        eq(schema.files.kind, "set_video"),
        lt(schema.files.createdAt, cutoff),
        notExists(
          db
            .select({ x: sql`1` })
            .from(schema.workoutSetLogs)
            .where(eq(schema.workoutSetLogs.videoFileId, schema.files.id)),
        ),
      ),
    )
    .returning({ storagePath: schema.files.storagePath });

  // Bloby po zatwierdzeniu skasowania wierszy — odwrotna kolejność osierociłaby plik
  // na dysku, gdyby DELETE się wycofał.
  for (const r of rows) {
    try {
      await deleteFileBlob(r.storagePath);
    } catch (err) {
      logger.error("orphan_sweep.blob_delete_failed", {
        storagePath: r.storagePath,
        ...errorMeta(err),
      });
    }
  }
  return rows.length;
}

// Kadencja leniwego sweepa — wzorzec z `maybePruneExpiredSessions`. Repo nie ma crona.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
let lastSweepAt = 0;

/** Wołane z często trafianego loadera. Najwyżej raz na godzinę na proces, bez czekania. */
export function maybeSweepOrphanSetVideos(db: Db): void {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  sweepOrphanSetVideos(db)
    .then((n) => {
      if (n > 0) logger.info("orphan_sweep.done", { count: n });
    })
    .catch((err) => {
      logger.error("orphan_sweep.failed", errorMeta(err));
    });
}
```

- [ ] **Krok 2: Wyzwalanie w `app/root.tsx`**

```ts
export async function loader() {
  // Leniwe sprzątanie w tle: każde najwyżej raz na godzinę na proces, fire-and-forget.
  maybePruneExpiredSessions(db);
  maybeSweepOrphanSetVideos(db);
  return null;
}
```

- [ ] **Krok 3: Test integracyjny (PISZ, nie uruchamiaj)**

`tests/orphan-sweeper.itest.ts`:
1. nagranie starsze niż karencja i niepodpięte → skasowane (wiersz i plik);
2. nagranie starsze niż karencja, ale **podpięte** do serii → NIE ruszone;
3. nagranie niepodpięte, ale **świeższe** niż karencja → NIE ruszone;
4. `body_photo` starsze niż karencja i nigdzie niepodpięte → NIE ruszone (sweeper dotyczy tylko `set_video`).

- [ ] **Krok 4: Bramki + review**

---

### Zadanie 5: Komponent `VideoUploadField`

**To zadanie dotyka warstwy wizualnej → prowadź je skillem `frontend-design:frontend-design`.**
Trzymaj się `app/styles/tokens.css` i wyglądu `FileDropzone` w trybie `compact` (pole wideo
przy serii jest gęste — nagłówek `uppercase-label` 10 px, kontrolka wysokości 36 px).

**Pliki:**
- Utworzenie: `app/components/video-upload-field.tsx`

**`FileDropzone` zostaje NIETKNIĘTY.** Jego trzy pozostałe wywołania mają działać dokładnie
jak dziś; nie dokładamy do niego trybu warunkowego.

**Interfejsy — produkuje:**

```ts
export interface VideoUploadFieldProps {
  /** Nazwa ukrytego pola z identyfikatorem, np. `e_0_s_1_video_id`. */
  name: string;
  label: string;
  maxBytes: number;
  idSuffix: string;
  /** Wartość początkowa (przywrócona ze szkicu). */
  initialFileId?: string | null;
  /** Zgłasza zmianę stanu w górę — formularz blokuje zapis, gdy cokolwiek leci. */
  onStateChange: (state: { uploading: boolean; fileId: string | null }) => void;
}
```

- [ ] **Krok 1: Maszyna stanów**

`pusty → wysyłanie(%) → wgrane(fileId)`, z przejściami `Anuluj` i `błąd` z powrotem do `pusty`.

- [ ] **Krok 2: Wysyłka przez XHR**

`fetch` NIE raportuje postępu wysyłki — dlatego XHR:

```ts
function uploadVideo(
  file: File,
  onProgress: (pct: number) => void,
): { promise: Promise<{ fileId: string }>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<{ fileId: string }>((resolve, reject) => {
    xhr.open("POST", "/upload/wideo");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { fileId?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // pusty obiekt → komunikat ogólny niżej
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.fileId) {
        resolve({ fileId: body.fileId });
      } else {
        reject(new Error(body.error ?? "Nie udało się wgrać nagrania."));
      }
    };
    xhr.onerror = () => reject(new Error("Brak połączenia. Spróbuj ponownie."));
    xhr.onabort = () => reject(new Error("ABORTED"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
  return { promise, abort: () => xhr.abort() };
}
```

- [ ] **Krok 3: Walidacja kliencka przed wysyłką**

Ten sam limit i lista MIME co w `FileDropzone` (`video/mp4,video/quicktime,video/webm`,
`maxBytes`) — plik przekraczający limit **nie opuszcza urządzenia**.

- [ ] **Krok 4: Ukryte pole**

`<input type="hidden" name={name} value={fileId ?? ""} />` — renderowane tylko gdy `fileId != null`.

- [ ] **Krok 5: Anulowanie**

Przycisk „Anuluj" woła `abort()`. Odrzucenie z komunikatem `"ABORTED"` traktuj jako
przejście do stanu `pusty` bez komunikatu błędu.

- [ ] **Krok 6: Bramki + review**

---

### Zadanie 6: Przepięcie formularza treningu + szkic v3

**Pliki:**
- Modyfikacja: `app/lib/log-draft.ts`
- Modyfikacja: `app/lib/log-draft.test.ts`
- Modyfikacja: `app/routes/podopieczny/loguj.$sessionId.tsx`

**Interfejsy — konsumuje:** `VideoUploadField` (zad. 5), `assertOwnedUnclaimedVideos` (zad. 3).

- [ ] **Krok 1: Test czerwony — szkic v3**

Dopisz w `app/lib/log-draft.test.ts`:

```ts
it("przechowuje videoFileId przez serializację (nagranie przeżywa ubicie karty)", () => {
  const sets = [[{ reps: "8", difficulty: "7", skipped: false, videoFileId: "f-1" }]];
  const raw = serializeDraft(["ex-1"], sets);
  const parsed = parseDraft(raw, { exerciseIds: ["ex-1"], setCounts: [1] });
  expect(parsed?.[0]?.[0]?.videoFileId).toBe("f-1");
});

it("odrzuca szkic w starej wersji v2", () => {
  const rawV2 = JSON.stringify({
    v: 2,
    exerciseIds: ["ex-1"],
    sets: [[{ reps: "8", difficulty: "7", skipped: false }]],
  });
  expect(parseDraft(rawV2, { exerciseIds: ["ex-1"], setCounts: [1] })).toBeNull();
});
```

- [ ] **Krok 2: Uruchom, potwierdź czerwień** — `npx vitest run app/lib/log-draft.test.ts`

- [ ] **Krok 3: Szkic v3**

W `app/lib/log-draft.ts`: `SetDraft` zyskuje `videoFileId: string | null`, `DraftShape`
zmienia `v: 2` na `v: 3`, walidacja kształtu sprawdza `typeof set.videoFileId === "string" || set.videoFileId === null`,
a `d.v !== 2` staje się `d.v !== 3`. Zaktualizuj komentarz na górze pliku — twierdzenie
„samego pliku wideo NIE da się sensownie zapisać w storage" przestało być prawdziwe,
bo szkic niesie teraz identyfikator, a nie bajty.

- [ ] **Krok 4: Zielono** — `npx vitest run app/lib/log-draft.test.ts`

- [ ] **Krok 5: Akcja czyta identyfikatory zamiast plików**

W `action` w `loguj.$sessionId.tsx`:
- `fd.get(\`e_${eIdx}_s_${sIdx}_video\`)` → `fd.get(\`e_${eIdx}_s_${sIdx}_video_id\`)`;
- `hasVideo` liczone z niepustego stringa, nie z `File`;
- wywołanie `uploadFile` **znika** z tej akcji, `UploadCleanupQueue` również;
- przed `saveWorkoutLog` zbierz wszystkie niepuste id i zawołaj:
  `await assertOwnedUnclaimedVideos(db, { traineeId: user.id, trainerId: user.trainerId, fileIds })`.

- [ ] **Krok 6: Formularz**

- `encType="multipart/form-data"` usunięte z `<Form>` — POST nie niesie już binariów.
- `SetState` (alias `SetDraft`) ma `videoFileId`.
- `FileDropzone` przy serii zastąpiony przez `VideoUploadField`; `initialFileId` ze szkicu.
- Licznik trwających wysyłek w stanie komponentu; przycisk zapisu nieaktywny gdy `> 0`,
  z komunikatem „Trwa wysyłka N nagrań… zapis ruszy sam, gdy się skończą."
- Zachowaj blokadę `isSubmitting` z P1 — obie przesłanki się sumują.

- [ ] **Krok 7: Bramki końcowe**

`npx vitest run app`, `npm run typecheck`, `npm run lint`, `npm run build` — wszystkie zielone.

- [ ] **Krok 8: Dokumentacja**

- `app/routes/README.md` — wpis `upload.wideo.tsx`
- `app/routes/podopieczny/README.md` — zmieniony opis `loguj.$sessionId.tsx`
- `app/components/README.md` — wpis `video-upload-field.tsx`
- `app/lib/README.md` — `orphan-files.ts`, zmiana w `rate-limit.ts`, `log-draft.ts`, `workouts.ts`
- `tests/README.md` — trzy nowe pliki `*.itest.ts`
- `CLAUDE.md` — bez zmian (brak nowych katalogów)

- [ ] **Krok 9: `/code-review` na całości + `/security-review`**

Zmiana dotyka uploadu, `trainer_id` i podpisanych URL-i → `/security-review` jest obowiązkowy.

- [ ] **Krok 10: Handoff**

---

## Kolejność i zależności

```
Zad. 1 (rate-limit) ──┐
                      ├──> Zad. 2 (trasa) ──┐
Zad. 3 (walidacja) ───┴─────────────────────┼──> Zad. 6 (przepięcie)
Zad. 4 (sweeper) ─── niezależne             │
Zad. 5 (komponent) ─────────────────────────┘
```

Zadania 3, 4 i 5 są wzajemnie niezależne. Zadanie 6 domyka całość i dopiero po nim
przepływ działa end-to-end.
