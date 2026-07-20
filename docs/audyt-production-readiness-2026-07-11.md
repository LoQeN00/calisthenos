# Audyt production-readiness — 2026-07-11

Przegląd całej aplikacji (stan working tree z 2026-07-11) pod kątem gotowości
produkcyjnej i profesjonalnego wykończenia. Wykonany w sześciu równoległych
wymiarach: **bezpieczeństwo**, **ops/observability/deploy**, **UX/a11y/i18n/PWA**,
**warstwa danych i wydajność**, **kompletność produktu (w tym prawo/RODO)**,
**testy i jakość**. Każde znalezisko było weryfikowane w kodzie (ścieżki plików
przy punktach); to analiza statyczna — pozycje oznaczone „zweryfikuj" wymagają
potwierdzenia na żywym środowisku.

Priorytety: **[W]** wysoki · **[Ś]** średni · **[N]** niski. Checkboxy służą do
odhaczania w miarę realizacji.

---

## Werdykt

Fundament jest nietypowo solidny: architektura bezpieczeństwa, izolacja
tenantów, transakcje i higiena logów są przemyślane lepiej niż w wielu
komercyjnych produktach. Do „production ready" brakuje **ostatniej mili**:
kilku realnych bugów konfiguracyjnych (sekcja 0), warstwy produktowo-prawnej
płatnego SaaS-u (sekcja A) oraz wykończenia UX (sekcja E). Nic z poniższego nie
wymaga przebudowy architektury.

## Mocne strony (nie ruszać — to atuty)

- Argon2id (OWASP-2023) + logowanie w stałym czasie (dummy-hash dla
  nieistniejących kont); sesje `__Host-` w DB, świeża sesja przy loginie (brak
  fixation), logout kasuje wiersz serwerowo.
- Scoping per tenant egzekwowany **i w loaderach, i w akcjach** — pokryta
  pułapka RR7 „layout loader nie chroni akcji dzieci"; jednolita konwencja 404.
- Podpisane URL-e plików: HMAC-SHA256, timing-safe compare, TTL, re-weryfikacja
  tenant-scope po stronie serwera + wymóg żywej sesji (`app/lib/files.ts`,
  `app/routes/files.$fileId.tsx`).
- Webhook Stripe: weryfikacja podpisu obu destination secrets, idempotencja po
  `event.id` z rollbackiem markera przy błędzie handlera → Stripe ponawia
  (`app/routes/webhooks.stripe.tsx:35-66`).
- Transakcje z `SELECT … FOR UPDATE` tam, gdzie trzeba: invite single-use,
  publish/draft planów, `saveWorkoutLog`, `deleteTraineeFully` (RODO-aware:
  wiersze + bloby + Stripe + Google).
- Google sync w pełni best-effort (awaria Google nigdy nie wywala akcji
  użytkownika), tokeny AES-256-GCM at rest, OAuth state z HMAC + nonce cookie.
- Strukturalne logi JSON z celową redakcją sekretów (nigdy `err.message` —
  ochrona przed tokenami w komunikatach SDK) (`app/lib/logger.ts`).
- TypeScript w pełni strict (w tym `noUncheckedIndexedAccess`), zero
  `TODO/FIXME`, 1 `any` w `app/lib`, zero `console.log` w `app/`.
- Docker multi-stage, non-root, tini + su-exec; walidacja env Zodem
  (`min(32)` na sekretach); magic-bytes na wszystkich uploadach w jednym
  chokepoincie `uploadFile`.
- Pieniądze w groszach end-to-end z CHECK-ami; paginacja na wszystkich dużych
  listach; parytet kluczy i18n pl/fr pilnowany testem.

---

## 0. Napraw najpierw — realne bugi, mały koszt

- [ ] **[W] Migracje nie uruchamiają się na Railway.** `railway.toml:12`
  (`startCommand = "npm run start"`) nadpisuje CMD z `Dockerfile:69`
  (`db:migrate && db:seed && start`); komentarz w railway.toml twierdzi, że są
  „in sync" — nie są. Każda zmiana schematu poleci na produkcję bez migracji
  (runtime 500 przy pierwszym zapytaniu o nową kolumnę; świeża baza = brak
  tabel i konta bootstrap). **Fix:** usuń `startCommand` (niech rządzi CMD)
  albo zrównaj treść; docelowo osobny krok release/pre-deploy na migracje.
- [ ] **[W] Healthcheck nic nie weryfikuje.** `railway.toml:14`
  (`healthcheckPath = "/"`) trafia w `app/routes/_index.tsx`, który dla
  anonima robi redirect i zero zapytań do DB — kontener zgłasza „healthy" przy
  leżącym/niezmigrowanym Postgresie (maskuje punkt wyżej). **Fix:** trasa
  `/healthz` z `SELECT 1` → 200/503 i wskazanie jej w railway.toml.
- [ ] **[W] Brak `ErrorBoundary` i trasy catch-all w całej aplikacji.**
  Konwencja authz celowo rzuca 404 — użytkownik dostaje wtedy surowy angielski
  ekran React Routera; to samo przy 500 i nieznanych URL-ach. **Fix:**
  `export function ErrorBoundary` w `app/root.tsx` (`isRouteErrorResponse` →
  markowe polskie 404/500 z kopią w locales) + `route("*", …)` w
  `app/routes.ts`. Uwaga: `app/README.md` błędnie twierdzi, że boundary już
  istnieje — poprawić przy okazji.
- [ ] **[W] Wylogowanie działa na GET.** `app/routes/wyloguj.tsx:13`
  (`loader = performLogout`) — nawigacja top-level GET niesie cookie przy
  SameSite=Lax, więc obcy `<img src>`/link wylogowuje użytkownika (logout
  CSRF). **Fix:** usunąć loader, zostawić wyłącznie akcję POST.
- [ ] **[W] Rate-limit do ominięcia spoofowanym `X-Forwarded-For` + DoS przez
  Argon2.** `app/lib/rate-limit.ts:43-48` bierze **lewy** (kliencki) wpis XFF;
  jeśli proxy Railway dokleja, a nie zastępuje nagłówek, atakujący dostaje
  świeży bucket na każde żądanie → nielimitowane credential stuffing, a każda
  próba to ~19 MiB/50 ms weryfikacji Argon2. **Fix:** brać wpis od strony
  zaufanego proxy (prawy / stała liczba hopów); **zweryfikuj** zachowanie XFF
  na Railway.

---

## A. Produkt — czego oczekuje płacący użytkownik (i prawnik)

Must-have przed komercyjnym launchem:

- [ ] **[W] Infrastruktura e-mail** — w aplikacji nie ma żadnej wysyłki
  (grep po nodemailer/resend/sendgrid/postmark/smtp pusty). Konsekwencje: brak
  resetu hasła, zaproszenia kopiowane ręcznie (`InviteCreatedCard` w
  `podopieczni._index.tsx` zbiera e-mail, ale go nie wysyła), zero powiadomień.
  Pojedyncza największa dźwignia — odblokowuje trzy kolejne punkty. **Fix:**
  provider transakcyjny (Resend/Postmark) za cienkim interfejsem.
- [ ] **[W] Reset hasła** („zapomniałem hasła") — `app/routes.ts` ma tylko
  `/login`; flow tokenowy e-mailem. Zależy od punktu wyżej.
- [ ] **[W] Strony prawne i stopka** — brak regulaminu, polityki prywatności,
  polityki cookies i jakiejkolwiek stopki z danymi firmy (grep po
  regulamin/polityk/prywatnoś/NIP pusty w `app/`). Aplikacja przechowuje
  zdjęcia sylwetki i dane treningowe oraz pobiera płatności.
- [ ] **[W] Zgody przy rejestracji** — `zaproszenie.$token.tsx` zbiera tylko
  imię i hasło; tabela `users` nie ma kolumn zgód. Wymagane: akceptacja
  regulaminu + polityki (timestamp + wersja) oraz wyraźna zgoda na
  przetwarzanie zdjęć sylwetki (dane wrażliwe-adjacent, art. 9 RODO).
- [ ] **[W] Samodzielne usunięcie konta (art. 17)** — dziś kasować podopiecznego
  może tylko trener (`deleteTraineeFully` jest dobrą bazą); podopieczny ani
  trener nie usuną własnego konta.
- [ ] **[W] Eksport własnych danych (art. 20)** — brak; „pobierz moje dane"
  (JSON/ZIP: logi, zdjęcia, płatności).

Zaufanie i kompletność:

- [ ] **[Ś] Strona `/konto`** — zmiana hasła po zalogowaniu, zmiana e-maila
  (z re-weryfikacją), nazwa wyświetlana. `user-menu.tsx` ma dziś tylko motyw
  i wylogowanie.
- [ ] **[Ś] Lista aktywnych sesji + „wyloguj wszędzie"** — tabela `sessions` ma
  już `userAgentHint`, brakuje UI. Przy okazji: `refreshIfNearExpiry`
  (`app/lib/auth/session.ts:94`) to martwy kod — nigdy nie wywoływany;
  podpiąć sliding expiry albo usunąć.
- [ ] **[Ś] Powiadomienia** (e-mail wystarczy na start): opublikowany plan,
  zbliżająca się konsultacja, nieudana płatność, nowy log treningowy (trener).
- [ ] **[Ś] Odwracalna dezaktywacja podopiecznego** — dziś jedyny offboarding
  to twarde `delete-trainee`; brakuje archiwizacji zachowującej historię.
- [ ] **[Ś] Rozłączenie Stripe przez trenera** — `integracje.stripe.tsx` umie
  tylko połączyć; brak flow odłączenia z guardrailami (najpierw
  rozliczenie/anulowanie aktywnych subskrypcji).
- [ ] **[Ś] Pomoc/kontakt** — `wstrzymane.tsx` każe „skontaktować się z
  trenerem lub marką", nie dając żadnego kanału; brak `/pomoc` i adresu wsparcia.
- [ ] **[N] Checklist pierwszego uruchomienia** dla świeżego trenera (empty
  states z CTA już są — brakuje przewodnika po krokach).
- [ ] **[N] Zwroty (refund)** — brak UI i dokumentacji procesu ręcznego w Stripe.
- [ ] **[N] Faktury VAT / merchant-of-record** — README świadomie odsyła do
  księgowej; domknąć decyzję przed launchem.
- [ ] **[N] Audit log wrażliwych akcji** (kto usunął podopiecznego/zdjęcie,
  kto zmienił kwotę) — append-only tabela.

Uwaga: brak self-serve rejestracji trenera/organizacji (bootstrap przez seed +
zaproszenia brand admina) wygląda na świadomą decyzję B2B — potwierdzić i
udokumentować, żeby nie czytano tego jako braku.

---

## B. Poprawność i prywatność danych

- [ ] **[W] Strefy czasowe konsultacji to naiwny UTC.** Zapis dokleja `Z` do
  wartości z `datetime-local` (`app/lib/consultations.ts:245,287,347`), Google
  dostaje `timeZone: "Etc/UTC"` (`app/lib/google/calendar.ts:34-35`),
  a `format.ts:56-80` wyświetla `getUTC*`. Skutek: aplikacja pokazuje „18:00",
  kalendarz podopiecznego 20:00 (lato), serie tygodniowe dryfują ±1h przy
  zmianie czasu. **Fix:** model strefy (Europe/Warsaw, docelowo per region) —
  interpretacja wejścia, zapis właściwego instantu, IANA zone do Google,
  formatowanie w strefie.
- [ ] **[W] Zdjęcia sylwetki trzymane bajt-w-bajt — EXIF z GPS zostaje**
  i jest serwowany trenerowi (`file-uploads.ts:149-176` tylko sprawdza magic
  bytes; `sylwetka.tsx` podpisuje oryginał). **Fix:** re-enkodowanie obrazów
  (sharp) przy uploadzie — usuwa metadane, a przy okazji podstawa pod miniatury
  (sekcja D).
- [ ] **[Ś] Stripe: brak ochrony przed zdarzeniami out-of-order** —
  `applySubscriptionUpdate` (`app/lib/stripe/subscriptions.ts:250-290`) zapisuje
  cokolwiek przyjdzie; spóźniony `subscription.created` (`incomplete`) po
  `…updated` (`active`) cofa lokalny status. **Fix:** ignorować przejścia
  starsze niż stan zapisany albo re-fetch żywej subskrypcji w handlerze.
- [ ] **[Ś] Brak rekonsyliacji z Stripe** — utracony na stałe webhook (rotacja
  sekretu, retention) = trwały dryf `coaching_subscriptions`/`subscription_payments`.
  **Fix:** okresowy reconcile po znanych customerach.
- [ ] **[N] Podwójny zapis logu treningu** — `saveWorkoutLog` bez unikalności
  ani idempotency tokenu; double-tap na słabym łączu = duplikat zawyżający
  wszystkie statystyki. (Łączy się z brakiem pending state, sekcja E.)
- [ ] **[N] MRR ambasadorów zawyżone po zmianie kwoty** — lokalna kwota zmienia
  się od razu, Stripe od następnego cyklu (`proration_behavior: "none"`).
- [ ] **[N] Google: brak retry po nieudanym insert/patch** (poza ręcznym
  backfill) i brak reconcile eventów usuniętych bezpośrednio w Google;
  na `patchEvent` 404 — fallback do insert.

---

## C. Bezpieczeństwo — dokręcenie śrub

(Punkty 0.4 i 0.5 — logout na GET i XFF — wyżej.)

- [ ] **[Ś] Wspólny `assertSameOrigin(request)` we wszystkich akcjach** —
  SameSite=Lax nie chroni przed „rodzeństwem" na współdzielonej domenie
  (dowolna apka na `*.railway.app` jest same-site dla `<ty>.railway.app`).
- [ ] **[Ś] `/files/$fileId` omija nagłówki bezpieczeństwa** — resource route
  buduje własny `Response` (`files.$fileId.tsx:68-73`), więc nie dostaje nic z
  `root.tsx headers()`. Jedyny endpoint serwujący treści użytkowników bez
  `X-Content-Type-Options: nosniff`. **Fix:** `nosniff` +
  `Content-Security-Policy: default-src 'none'` w tej trasie.
- [ ] **[Ś] Rate-limit store: in-memory, per proces, fail-open**
  (`rate-limit.ts:97,104-116`) — reset przy każdym deployu, a błąd wewnętrzny
  przepuszcza ruch. **Fix:** store w Postgresie; na ścieżce logowania
  fail-closed. (Skalowanie horyzontalne mnoży limit — patrz też F, założenie
  single-replica.)
- [ ] **[Ś] Minimalna długość hasła 8** przy rejestracji
  (`zaproszenie.$token.tsx:27-30`) — podnieść do 12 + rozważyć HIBP
  (k-anonymity).
- [ ] **[N] Autoryzacja plików podopiecznego jest na poziomie tenanta trenera**
  (`files.$fileId.tsx:49-54` — `ownsTrainerScope`): podpis user-bound wydają
  tylko loadery własnych wierszy, więc dziś nieeksploitowalne, ale izolacja
  per-osoba wisi na jednym założeniu. **Fix:** dla `body_photo`/`set_video`
  dodatkowo sprawdzać `uploadedBy` gdy żąda podopieczny.
- [ ] **[N] Loader `/zaproszenie/:token` bez rate-limitu** (akcja ma) — token
  256-bit, więc tylko DoS na DB; dołożyć bucket do loadera.
- [ ] **[N] CSP `script-src 'unsafe-inline'`** (udokumentowane, wymusza je
  inline theme-script) — docelowo nonce/hash.

---

## D. Wydajność — zanim przyjdą użytkownicy

- [ ] **[W] Nieskopowane CTE agregują całą platformę na najgorętszych
  widokach.** `log_stats` w `listLogsForTrainee` (`app/lib/workouts.ts:327-348`)
  i `client_stats` w `listClientsForTrainer` (`workouts.ts:614-623`) liczą
  agregaty po **wszystkich** logach/seriach bez `WHERE`, po czym joinują do
  strony wyników. Działa na dashboardach trenera i podopiecznego, historii
  i detalu podopiecznego — koszt O(wierszy całej platformy) na request na dwóch
  największych tabelach. **Fix:** dofiltrować CTE po `trainer_id`/`trainee_id`
  (zdenormalizowane i zindeksowane) albo agregować tylko po id-kach strony.
- [ ] **[W] Brakujące indeksy FK** (Postgres nie indeksuje FK automatycznie):
  `workout_logs.plan_id` (`deletePlan` robi COUNT bez filtra → seq scan),
  `workout_set_logs.video_file_id` (kasowanie plików/podopiecznego nulluje
  referencje seq-scanem), `workout_exercise_logs.exercise_id` (progresja
  filtruje wprost). Pomniejsze: `plan_items.exercise_id`, `body_photos.file_id`,
  `subscription_payments.trainer_id`.
- [ ] **[Ś] Podpisane URL-e mają świeży `exp` przy każdym renderze**
  (`files.ts:11-16`) — URL zmienia się co wejście, więc
  `Cache-Control: private, max-age=3600` nigdy nie trafia; galeria pobiera
  wszystkie pełnowymiarowe zdjęcia od nowa. **Fix:** kwantyzacja `exp` do
  stałego okna + ETag; **miniatury** do siatki (sharp — wspólnie z B/EXIF).
- [ ] **[Ś] Multipart buforowany w całości w RAM** — akcje wołają
  `request.formData()` (`loguj.$sessionId.tsx`, `sylwetka.tsx`), limit
  250 MB/plik (`env.ts:9`) sprawdzany **po** zbuforowaniu
  (`file-uploads.ts:132-138`), a formularz logowania ma input wideo per seria
  → kilka równoległych submitów = OOM małego kontenera. **Fix:** streaming
  handler na dysk tymczasowy + twardy limit łączny żądania + niższy default.
- [ ] **[Ś] Brak kwot magazynowych i GC sierot** — bez limitu bajtów per
  podopieczny/tenant i bez okresowego reconcile wierszy `files` vs bloby na
  dysku wzrost wolumenu jest nieograniczony.
- [ ] **[N] N+1 w porównaniu progresji** (`progression.ts:272-294` — jedno
  zapytanie per ćwiczenie) → jedno zapytanie z `inArray`.
- [ ] **[N] Sugestie skill-map liczą pełną historię 3×** na request
  (`skill-progression.ts:127-135` → trzykrotny `loadPerExerciseHistory`)
  → policzyć raz i przekazać.

---

## E. UX — żeby „czuło się" dopracowanie

- [ ] **[W] Stany pending formularzy.** Poza edytorem planów
  (`plany.$planId.tsx`) i dropzone żaden formularz nie używa `useNavigation` —
  przyciski nie blokują się podczas submitu. Najboleśniejsze przy **zapisie
  treningu z wideo do 250 MB** (`loguj.$sessionId.tsx:402`): podopieczny tapie
  „Zapisz", nic się nie dzieje, tapie znowu (→ duplikat, patrz B). **Fix:**
  wspólny `<SubmitButton>` na `useNavigation().state`.
- [ ] **[W] Progress uploadu.** `file-dropzone.tsx:352` pokazuje tylko
  statyczne „Wysyłanie…" — przy wideo z telefonu potrzebny realny procent
  (XHR/fetch `upload.onprogress`).
- [ ] **[Ś] Globalny wskaźnik nawigacji** — cienki górny progress bar na
  `useNavigation().state`; dziś wolny loader wygląda jak zamrożenie.
- [ ] **[Ś] Formularze gubią wpisaną treść po błędzie walidacji** — akcje
  zwracają sam `errorKey`, inputy nie dostają `defaultValue` z submitu
  (np. `biblioteka.nowe.tsx:37-51`). Echo wartości w `actionData`.
- [ ] **[Ś] Błędy per pole + semantyka a11y** — w całej aplikacji zero
  `aria-invalid`/`aria-describedby`; wszędzie jeden błąd na cały formularz.
- [ ] **[Ś] Toasty po mutacjach niekonsekwentne** — `useToast` tylko w 2
  trasach; ćwiczenia/plany/konsultacje/zaproszenia/zdjęcia bez potwierdzenia.
- [ ] **[Ś] Zero tytułów stron** — żadna trasa nie eksportuje `meta`; każda
  karta przeglądarki nazywa się tak samo, login bez description/og. Tanie,
  a bardzo widoczne.
- [ ] **[Ś] PWA/iOS:** manifest ma tylko SVG (`purpose: "any maskable"`, brak
  PNG) a `apple-touch-icon` jest SVG (`root.tsx:66`) — iOS ignoruje → pusta
  ikona na home screen; niepaddowany SVG jako maskable jest przycinany.
  Dodać PNG 192/512 + osobny padded maskable + PNG apple-touch-icon.
- [ ] **[Ś] Brak strony offline** — `vite.config.ts:24` `navigateFallback:
  null`; offline nawigacja = błąd przeglądarki. Precache prostego
  `offline.html`.
- [ ] **[Ś] Topbar podopiecznego wchodzi pod notch iOS** — `.topbar`
  (`tokens.css:301-312`) bez `env(safe-area-inset-top)` przy
  `black-translucent` status barze (dół jest obsłużony).
- [ ] **[Ś] Francuski istnieje, ale nie da się go wybrać** — brak przełącznika
  języka w `user-menu.tsx`; dostępny tylko przez Accept-Language. Do tego twarde
  polskie stringi: `modal.tsx:65`, `video-modal.tsx:94`,
  `toast-provider.tsx:130`, `file-dropzone.tsx:197`, `loguj…` `label="Video"`.
- [ ] **[N] Confirm destrukcyjny auto-fokusuje przycisk potwierdzenia**
  (`confirm-provider.tsx:100-103`) — Enter natychmiast kasuje; fokus na Anuluj.
- [ ] **[N] Ciche aktualizacje SW** (`registerType: "autoUpdate"` +
  `skipWaiting`) — assets podmieniają się w trakcie sesji; toast „Nowa wersja —
  odśwież".
- [ ] **[N] Cele dotykowe < 44 px** w gęstych widokach logowania serii
  (`loguj…:699,825` — 24 px; `.btn-sm` 30 px).
- [ ] **[N] Brak `robots.txt`** (apka za loginem → `Disallow: /`).
- [ ] **[N] Drobiazgi:** `background_color` manifestu `#FAFAF8` ≠ `--bg`
  `#F7F7F4`; manifest bez `shortcuts`/`screenshots`; aria-label wykresów mówi
  „co to za wykres", nie „co pokazuje".

---

## F. Inżynieria i ciągłość działania

- [ ] **[W] Brak CI** (nie ma `.github/`) — żadna bramka nie odpala się
  automatycznie. Minimalny workflow na PR: `typecheck` + `lint` + `build` +
  `test:unit` (bez DB), `test:itest` jako job z Dockerem (testcontainers),
  plus `npm audit`. Uwaga: `npm test` to watch — bramką jest `test:unit`.
- [ ] **[W] Backup i restore runbook** — wolumen `/data` (wszystkie
  zdjęcia/wideo użytkowników) nie backupuje się na Railway sam; utrata =
  bezpowrotna. Udokumentowany, cykliczny `pg_dump` + snapshot wolumenu +
  procedura odtworzenia.
- [ ] **[Ś] Playwright wskazuje nieistniejący katalog** —
  `playwright.config.ts` → `tests/e2e/`, którego nie ma; `npm run e2e`
  przechodzi pusto (fałszywa bramka). Jeden smoke spec (login → zapis treningu
  → wylogowanie) albo usunięcie gate'a.
- [ ] **[Ś] Luki testowe czterech kluczowych przepływów** (zero importów w
  testach): publish/wersjonowanie planów (`plans.ts`), `uploadFile` z walidacją
  magic-bytes (komentarz w `brand-catalog.itest.ts:144` **błędnie** twierdzi,
  że pokryte w `catalog-exercises.itest.ts` — tam wiersze `files` wstawiane są
  wprost), Wrapped (`wrapped.ts`), zdjęcia sylwetki (`body-photos.ts` +
  trasy `sylwetka`). Do tego: unhappy-paths zaproszeń (wygasłe/zużyte —
  `consumeInvite` obsługuje, nic nie testuje), cykl sesji (expiry, logout,
  `destroySession`), branch-e loadera `/files/$fileId` (`parseRange`, 410,
  brand-demo), `saveWorkoutLog` multi-set z wideo + odrzucenie cross-tenant.
- [ ] **[Ś] Alerting/monitoring** — świadomie odłożone w
  `docs/superpowers/specs/2026-06-06-observability-design.md`; logger jest
  czysty i gotowy pod sink (Sentry / alert Railway na
  `stripe_webhook.apply_failed`, `google_sync.failed`). Dołożyć też:
  request-id w kontekście logów, handlery `unhandledRejection`/
  `uncaughtException`, oraz zamienić surowy `console.error` w
  `entry.server.tsx:100` na logger (omija redakcję sekretów).
- [ ] **[Ś] Błędy zapisu uploadu nie są logowane** —
  `file-uploads.ts:182-196` mapuje EACCES/ENOSPC na `UploadError` dla
  użytkownika, ale ops nie widzi pełnego dysku/uprawnień wolumenu.
- [ ] **[Ś] Obraz produkcyjny ciągnie ~120 MB+ dev-tooli** —
  `Dockerfile:39-40` robi pełne `npm ci` w stage runtime (biome, typescript,
  vitest, vite, playwright…), a potrzebne są tylko `drizzle-kit` + `tsx`.
  `--omit=dev` + doinstalowanie dwóch paczek, albo osobny kontener migracji.
  Do obrazu kopiują się też `app/**/*.test.ts`.
- [ ] **[N] Zamykanie zasobów przy SIGTERM** — pool postgres-js nigdy nie
  dostaje `client.end()`, drain bez deadline'u (wolny upload 250 MB blokuje
  shutdown do SIGKILL).
- [ ] **[N] `GOOGLE_TOKEN_ENC_KEY` poza schematem env** (`google/crypto.ts:11`
  czyta `process.env` wprost) — zły klucz wybucha lazily przy pierwszym OAuth,
  nie na boot; dołożyć do Zoda. Przy okazji: jawne `getEnv()` na starcie
  serwera zamiast polegania na imporcie `db/client.ts`.
- [ ] **[N] Duplikacja `marka/*` ↔ `trener/*`** — 6 luster tras;
  `biblioteka.nowe.tsx` w obu drzewach to ~90% copy-paste (ten sam schemat,
  akcja, JSX). Wydzielić wspólny `ExerciseForm` + helper akcji, bo poprawki
  przestaną się propagować.
- [ ] **[N] Odświeżenie zależności** — React 18 (19 GA), drizzle-orm 0.36,
  Vite 6/Vitest 2, i18next 26; SDK Stripe zgodny z pinowaną wersją API (OK).
  `noExplicitAny` w Biome to `warn` — podnieść do `error`, póki użycie ~zero.
  Testy używają realnego zegara (36 wystąpień `new Date()` w itestach, zero
  fake timers) — ryzyko flake na granicy dnia/strefy.
- [ ] **[N] Założenie single-replica udokumentować** — in-memory rate limit,
  lazy prune sesji i pool `max:10` mają sens przy jednej replice; skalowanie
  horyzontalne wymaga limitera w DB i przeliczenia połączeń vs limit Railway
  Postgres.

---

## Proponowana kolejność

| Fala | Zakres |
|---|---|
| **1. Teraz (dni)** | Sekcja 0 w całości + tytuły `meta` + minimalny CI |
| **2. Przed launchem** | E-maile → reset hasła → `/konto`; regulamin/polityka/zgody/stopka; RODO self-delete + eksport; strefy czasowe konsultacji; EXIF; backup runbook; pending states + progress uploadu; ikony PWA (iOS) |
| **3. Przed wzrostem** | Scope CTE + indeksy FK; miniatury + cache plików; streaming uploadów + kwoty; rekonsyliacja i ordering Stripe; smoke e2e + brakujące testy; Sentry/alerting; odchudzenie obrazu |

Każdy checkbox nadaje się na osobny `/fix` lub mały `/feature` zgodnie z
procesem z `CLAUDE.md`; pozycje dotykające auth / `trainer_id` / podpisanych
URL / uploadu wymagają `/security-review` w bramkach.
