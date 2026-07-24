# Rozdzielony upload wideo (plasterek P2)

**Data:** 2026-07-22
**Status:** spec zatwierdzony, do implementacji
**Kontekst:** [`docs/audyt.md`](../../audyt.md) — sekcja o wideo; plasterek P1 (poprawki tanie) już wdrożony.

## Problem

Formularz logowania treningu wysyła **całą sesję jednym POST-em `multipart/form-data`**,
z osobnym polem pliku na każdą serię (`app/routes/podopieczny/loguj.$sessionId.tsx`).
W akcji `await args.request.formData()` buforuje **całe ciało żądania w pamięci**, zanim
padnie pierwsza walidacja. Limit 30 MB jest egzekwowany per plik, już po zbuforowaniu.

Trzy skutki:

1. **Brak sufitu na rozmiar żądania.** Ile serii ma sesja, tyle nagrań może być w jednym
   POST-cie — do ~700 MB przy sesji 6 ćwiczeń × 4 serie. Realnie 60–150 MB, ale granicy nie
   ma żadnej, a mnoży się przez liczbę równoczesnych wysyłek.
2. **Wysyłka „wszystko albo nic".** 150 MB przy typowym uploadzie mobilnym to 2–4 minuty;
   Railway ucina żądania po ~5 min. Zerwanie sieci kosztuje całą sesję.
3. **Zero informacji o postępie.** Podopieczny widzi zablokowany przycisk i nic więcej.

## Zakres

**W zakresie:** wyłącznie `set_video` — nagrania serii w formularzu logowania treningu.

**Poza zakresem (świadomie):** zdjęcia sylwetki (`body_photo`) i demo ćwiczeń
(`exercise_demo`). To formularze **jednoplikowe** — ich szczyt pamięci jest z definicji
ograniczony jednym plikiem i limitem `maxUploadBytesFor`, więc problem „wiele plików w
jednym żądaniu" ich nie dotyczy. Zostają na obecnej ścieżce inline-multipart.

**ODWOŁANE (decyzja właściciela, 2026-07-22):** nagrywanie w aplikacji (MediaRecorder),
pierwotnie planowane jako plasterek P3. Aplikacja webowa przyjmuje wyłącznie **gotowe**
nagrania; nagrywanie trafi do przyszłej natywnej aplikacji mobilnej.

Konsekwencja, którą trzeba rozwiązać inaczej: P3 miał usunąć problem **u źródła**,
kontrolując bitrate przy nagrywaniu (30 s ≈ 7 MB zamiast 60–100 MB). Bez niego zostają
dwie otwarte sprawy, opisane w [`docs/audyt.md`](../../audyt.md):

1. **Limit 30 MB jest ciasny dla realnego nagrania serii.** Przy 1080p30 mieści ~16–35 s,
   przy 4K ~5 s. Po rozdzieleniu uploadu podniesienie limitu jest jednak znacznie
   bezpieczniejsze niż wcześniej (jeden plik na żądanie, strumieniowo na dysk), a
   `MAX_VIDEO_UPLOAD_BYTES` jest strojone przez env — bez zmiany kodu. Praktyczny sufit
   wyznacza dziś nie pamięć, lecz ~5-minutowy limit żądania Railway wobec uplinku mobilnego.
2. **Zgodność kodeków.** Skoro przyjmujemy, co wyprodukuje telefon, HEVC w `.mov` z iPhone'a
   może się nie odtworzyć u trenera w Chrome na Windows.

## Architektura

### 1. Trasa zasobowa `upload/wideo`

Nowy plik `app/routes/upload.wideo.tsx` + wpis w `app/routes.ts`. Sama `action`, bez
komponentu (trasa zasobowa).

```
POST /upload/wideo
Content-Type: multipart/form-data
  file: <jeden plik>

200 → { fileId: string, bytes: number, mimeType: string }
4xx → { error: string }   // komunikat po polsku, prosto z UploadError.userMessage
```

Reguły:

- `requireUser(request, db, { role: "trainee" })` — trasa obsługuje wyłącznie `set_video`.
- `kind` **nie jest** czytany z żądania — jest stałą `"set_video"`. Klient nie decyduje,
  co wgrywa.
- `trainerId` bierzemy z `user.trainerId` (sesja), nigdy z ciała żądania.
- Upload przez istniejące `uploadFile` — cała walidacja (rozmiar, MIME, magic-bytes,
  sprzątanie przy błędzie) zostaje niezmieniona.
- Rate limit per użytkownik (patrz niżej).

### 2. Klient — `VideoUploadField`

Nowy komponent `app/components/video-upload-field.tsx`.

**`FileDropzone` zostaje nietknięty** — jego trzy pozostałe wywołania (sylwetka, dwa
formularze biblioteki) mają działać dokładnie tak jak dziś. Nie dokładamy do niego trybu
warunkowego; nowy komponent jest osobnym bytem o innej odpowiedzialności: on nie tylko
wybiera plik, on nim zarządza w czasie.

Maszyna stanów jednego pola:

```
pusty → (wybór pliku) → wysyłanie(%) → wgrane(fileId)
                            │              │
                            ├─ (Anuluj) ───┤
                            └─ (błąd) ─────┴→ pusty + komunikat
```

- Wysyłka startuje **natychmiast po wyborze pliku**, przez `XMLHttpRequest`
  (`upload.onprogress` — `fetch` nie raportuje postępu wysyłki).
- Postęp procentowy na pole, przycisk „Anuluj" (`xhr.abort()`).
- Po sukcesie `fileId` ląduje w `<input type="hidden" name="e_{i}_s_{j}_video_id">`.
- Błąd wysyłki jest lokalny dla pola — nie wywraca formularza, można spróbować ponownie.

### 3. Formularz treningu

- `encType="multipart/form-data"` **znika** — finalny POST nie niesie już binariów.
- Akcja czyta `videoFileId` ze stringów zamiast wołać `uploadFile`. `UploadCleanupQueue`
  w tej akcji przestaje być potrzebna (pliki są już zapisane; nieużyte sprzątnie sweeper).
- `saveWorkoutLog` **bez zmian** — już dziś przyjmuje `videoFileId: string | null` na serię.
- Zapis jest zablokowany, dopóki trwa jakakolwiek wysyłka; komunikat „Trwa wysyłka N
  nagrań… zapis ruszy sam, gdy się skończą" i automatyczne odblokowanie.

### 4. Walidacja identyfikatorów przy zapisie — **rdzeń bezpieczeństwa**

Dziś `videoFileId` nie jest weryfikowany, bo pochodzi z `uploadFile` w tym samym żądaniu.
Po rozdzieleniu **przychodzi od klienta**, więc każdy identyfikator musi przejść komplet:

| Warunek | Przed czym chroni |
|---|---|
| wiersz istnieje w `files` | podpięcie nieistniejącego/sprzątniętego pliku |
| `kind = 'set_video'` | podpięcie cudzego zdjęcia sylwetki jako nagrania serii |
| `trainer_id = user.trainerId` | wyjście poza tenant |
| **`uploaded_by = user.id`** | **podopieczny A podpina nagranie podopiecznego B** — mają wspólnego trenera, więc sam `trainer_id` NIE wystarcza |
| brak istniejącego `workout_set_logs.video_file_id = id` | ponowne użycie jednego uploadu w wielu seriach/treningach |

Niespełnienie któregokolwiek → odrzucenie całego zapisu z komunikatem po polsku, bez
zdradzania, który konkretnie warunek zawiódł.

Nowa funkcja repo w `app/lib/workouts.ts`:
`assertOwnedUnclaimedVideos(db, { traineeId, trainerId, fileIds }): Promise<void>`
— jedno zapytanie po wszystkie identyfikatory naraz, rzuca `WorkoutSaveError`.

Czysta część decyzji (mając wiersze z bazy i żądane id — które są nieprawidłowe) wydzielona
jako funkcja testowalna bez DB.

### 5. Sweeper plików-sierot

Upload wyprzedza zapis, więc między nimi istnieje wiersz `files` bez właściciela. Sesja
porzucona = sierota na wolumenie.

**Bez migracji.** Sierota jest wykrywalna zapytaniem:

```sql
DELETE FROM files
WHERE kind = 'set_video'
  AND created_at < now() - interval '24 hours'
  AND NOT EXISTS (SELECT 1 FROM workout_set_logs w WHERE w.video_file_id = files.id)
RETURNING storage_path
```

Bloby kasowane po commicie (spójnie z `deleteFileRow` / `deleteFileBlob`).

**Wyzwalanie:** wzorcem, który już jest w repo — `maybePruneExpiredSessions`
(`app/lib/auth/session.ts:78`): leniwie z loadera `root.tsx`, najwyżej raz na godzinę na
proces, fire-and-forget, wynik logowany. Repo nie ma crona i P2 go nie wprowadza.

**Karencja 24 h** jest hojna wobec sesji zostawionej otwartej na noc. Gdyby mimo to plik
został sprzątnięty przed zapisem, walidacja z punktu 4 odrzuci zapis z czytelnym
komunikatem zamiast rzucić błędem FK.

### 6. Szkic v3 — nagrania przestają przepadać

`app/lib/log-draft.ts` niesie dziś tylko dane tekstowe, a jego komentarz stwierdza wprost:
„Samego pliku wideo NIE da się sensownie zapisać w storage". Po rozdzieleniu uploadu **to
przestaje być prawdą** — `fileId` jest zwykłym stringiem.

- `SetDraft` zyskuje `videoFileId: string | null`.
- Wersja szkicu `v: 2` → `v: 3`. Szkice v2 są odrzucane (są krótkotrwałe, per sesja
  przeglądarki — migrowanie ich nie jest warte kodu).
- Efekt: ubicie karty PWA w trakcie logowania nie kasuje już wgranych nagrań.

### 7. Rate limit uploadu

Trasa uploadu to nowa ścieżka zapisu na dysk. `app/lib/rate-limit.ts` obejmuje dziś tylko
logowanie i zaproszenia.

- Nowy kubełek `upload`: **100 wysyłek / 15 min**, hojnie — ciężka sesja to ~20 nagrań.
- Kluczowanie **per użytkownik**, nie per IP: endpoint jest uwierzytelniony, a kilku
  podopiecznych może siedzieć za jednym NAT-em.
- `enforceRateLimit` dostaje opcjonalny override klucza (wstecznie zgodny — domyślnie IP).

## Obsługa błędów

| Sytuacja | Zachowanie |
|---|---|
| Plik za duży / zły MIME | 4xx z `UploadError.userMessage`, pole pokazuje komunikat, reszta formularza działa |
| Zerwana sieć w trakcie wysyłki | Błąd lokalny dla pola, przycisk „Spróbuj ponownie"; pozostałe nagrania nietknięte |
| Anulowanie przez użytkownika | `xhr.abort()`; jeśli plik zdążył powstać — zostanie sierotą i sprzątnie go sweeper |
| Zapis z nieprawidłowym `fileId` | Cały zapis odrzucony, komunikat po polsku, `logger.warn` z liczbą odrzuconych id |
| Zapis w trakcie wysyłek | Przycisk nieaktywny, licznik trwających wysyłek |

## Plan testów

**Jednostkowe (bez DB, w pętli):**
- `log-draft.ts` — round-trip v3, odrzucanie v2, odrzucanie niepasującego kształtu,
  `videoFileId` przechodzi przez serializację
- czysta część walidacji identyfikatorów — które id są nieprawidłowe, mając wiersze z bazy
- `rate-limit.ts` — override klucza nie psuje domyślnego kluczowania po IP

**Integracyjne (`*.itest.ts`, uruchamia właściciel pod Dockerem)** — to krytyczny przepływ
(upload + tenant scope), więc wymagane:
- upload: `trainerId` z sesji, nie z żądania
- **odrzucenie `fileId` należącego do innego podopiecznego tego samego trenera**
- odrzucenie `fileId` o rodzaju `body_photo`
- odrzucenie `fileId` już podpiętego do innej serii
- sweeper: kasuje sieroty starsze niż karencja, **nie rusza** plików podpiętych ani świeżych

## Dług i decyzje odłożone

- **Idempotencja zapisu treningu.** P1 dodał blokadę kliencką, ale zerwanie sieci po
  wykonaniu akcji nadal pozwala utworzyć duplikat. Po P2 okno maleje (finalny POST jest
  mały i szybki), ale nie znika. Pełne domknięcie = token idempotencji + `UNIQUE` w bazie,
  czyli migracja. **Świadomie poza P2** — spina się z osobną decyzją, czy dwa treningi tej
  samej sesji tego samego dnia są legalne.
- **Indeks pod sweeper.** Zapytanie filtruje `kind` + `created_at` globalnie; istniejący
  `files_trainer_kind_idx` jest na `(trainer_id, kind)`. Przy obecnej objętości `files` to
  bez znaczenia (seq scan na kilkuset wierszach). Do rewizji przy ~100 tys. plików.
- **`exercise_demo` na tej samej trasie.** Trasa jest dziś celowo tylko dla podopiecznych.
  Rozszerzenie o demo trenera to prosta zmiana, ale bez potrzeby — formularze biblioteki
  są jednoplikowe.

---
Konwencja i zasady procesu: [`../../../CLAUDE.md`](../../../CLAUDE.md).
