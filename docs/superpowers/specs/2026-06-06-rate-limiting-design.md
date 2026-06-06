# Spec: rate-limiting endpointów wrażliwych

> Data: 2026-06-06. Status: zaakceptowany (brainstorm). Następny krok: plan implementacji.
> Powiązane: pozycja 8 audytu „dobre praktyki SaaS” (brak rate-limitingu). Pozycja 9
> (observability) jest osobnym feature'em.

## Cel

Ochrona endpointów wrażliwych przed brute-force i nadużyciem:

- **`POST /login`** — brute-force haseł (główny cel).
- **`POST /zaproszenie/:token`** — akceptacja zaproszenia (ograniczenie abuse/enumeracji;
  same tokeny to 32 bajty losowe, więc zgadywanie i tak niewykonalne — limit jest
  dodatkową warstwą przeciw zalewaniu endpointu).

Bez nowych zależności i usług zewnętrznych.

## Decyzje (rozstrzygnięte w brainstormie)

| Decyzja | Wybór |
|---|---|
| Store | **In-memory** (Mapa w procesie), za interfejsem `RateLimitStore` umożliwiającym późniejszą podmianę na Postgres |
| Algorytm | **Fixed-window + lockout** (O(1) pamięci/klucz, prosty `Retry-After`) |
| Klucz | **Per-IP** (z `X-Forwarded-For`); licznik czyszczony po sukcesie |
| Progi | `login`: **10 prób / 15 min**; `invite`: **10 prób / 15 min** |
| Odpowiedź | **HTTP 429** + nagłówek **`Retry-After`** (sekundy) + polski komunikat |
| Tryb przy błędzie limitera | **Fail-open** (usterka limitera nie blokuje logowania) |

### Uzasadnienia

- **In-memory + 1 instancja:** Railway uruchamia pojedynczą instancję (`react-router-serve`,
  brak konfiguracji replik). Liczniki giną przy restarcie/redeployu — to świadomy kompromis:
  brute-force operuje w krótkim oknie, a atakujący nie wymusi restartu. Interfejs `RateLimitStore`
  zostawia otwartą drogę do trwałego store'a (Postgres), gdy pojawi się skalowanie poziome.
- **Per-IP (nie per-email):** łapie realny scenariusz (jeden host młóci hasła) i **unika
  account-lockout DoS** — atakujący nie zablokuje logowania ofierze, zalewając jej email.
- **Fixed-window:** dopuszcza burst ~2× na styku okien — dla logowania nieistotne; w zamian
  trywialny `Retry-After` (= czas do końca okna) i O(1) pamięci.

## Architektura

Brak warstwy middleware (aplikacja serwowana przez `react-router-serve`, bez własnego serwera
Express). Dlatego rate-limit to **wspólny helper wołany na początku akcji** wrażliwych tras.

### Nowy moduł `app/lib/rate-limit.ts`

Warstwa czysta (testowalna bez DB i bez timerów) oddzielona od I/O:

- **Czysta funkcja okna:**
  ```ts
  interface WindowState { count: number; windowStartMs: number; }
  interface HitResult { state: WindowState; allowed: boolean; retryAfterSec: number; }
  function fixedWindowHit(
    prev: WindowState | undefined,
    nowMs: number,
    limit: number,
    windowMs: number,
  ): HitResult;
  ```
  Reguła: jeśli `prev` brak lub `nowMs - windowStartMs >= windowMs` → nowe okno `{count:1, windowStartMs:nowMs}`, `allowed=true`. Inaczej `count+1`; `allowed = count <= limit`; gdy zablokowane `retryAfterSec = ceil((windowStartMs + windowMs - nowMs)/1000)`.

- **Store in-memory** (`Map<string, WindowState>`) opakowujący czystą funkcję + `Date.now`:
  ```ts
  interface RateLimitStore {
    hit(key: string, limit: number, windowMs: number): HitResult;
    reset(key: string): void;
  }
  ```
  Implementacja `InMemoryRateLimitStore`. **Eviction:** przy każdym `hit` opportunistyczny
  sweep wygasłych wpisów, gdy rozmiar Mapy przekroczy próg (np. 5000), oraz twardy cap
  (ochrona przed memory-DoS z wielu IP).

- **Ekstrakcja IP:** `clientIp(request: Request): string` — leftmost wpis z `X-Forwarded-For`
  (Railway ustawia zaufany XFF za swoim proxy), `trim()`. Brak nagłówka → `"unknown"`
  (wspólny bucket). Założenie o zaufaniu XFF udokumentowane w kodzie.

- **Helper dla tras:**
  ```ts
  // Zwraca retryAfterSec gdy zablokowane, inaczej null. Fail-open: błąd → null (+log).
  function enforceRateLimit(
    request: Request,
    opts: { bucket: string; limit: number; windowMs: number },
  ): number | null;
  function resetRateLimit(bucket: string, request: Request): void;
  // Buduje wynik akcji z RR7 `data({ error }, { status:429, headers:{ "Retry-After" }})`.
  // Zwraca DataWithResponseInit (NIE rzucany Response) — route renderuje się normalnie
  // z actionData.error, a HTTP niesie 429 + Retry-After. Status 4xx z `data()` nie
  // wyzwala ErrorBoundary (w przeciwieństwie do `throw`).
  function rateLimited(retryAfterSec: number): ReturnType<typeof data>;
  ```
  Klucz store'a = `${bucket}:${clientIp(request)}`. Stała `RATE_LIMITS` z progami per bucket.

### Integracja w trasach

- **`app/routes/login.tsx`** (`action`): na samym początku, **przed** parsowaniem formData
  i Argon2:
  ```ts
  const retry = enforceRateLimit(args.request, RATE_LIMITS.login);
  if (retry !== null) return rateLimited(retry);
  ```
  Po **udanym** logowaniu (tuż przed redirectem): `resetRateLimit("login", args.request)`.
- **`app/routes/zaproszenie.$token.tsx`** (`action`): analogicznie, bucket `invite`; reset po
  udanej rejestracji (gałąź sukcesu `consumeInvite`).
- Liczona jest **każda próba**; reset po sukcesie sprawia, że legalny użytkownik nie jest karany,
  a brute-forcer (nigdy nie trafia) nie resetuje licznika.

## Obsługa błędów / edge-cases

- **Fail-open:** `enforceRateLimit` łapie każdy wyjątek wewnętrzny, loguje stały komunikat
  (`console.error`, bez danych wrażliwych) i zwraca `null` — usterka limitera nie może
  zablokować logowania wszystkim.
- **Brak XFF** (dev/lokalnie): bucket `"unknown"` współdzielony; w dev rzadko bije w próg.
- **Reset in-memory** przy redeployu — świadomy kompromis (patrz uzasadnienia).
- **Komunikat 429:** „Za dużo prób. Spróbuj ponownie za X min.” (X = `ceil(retryAfterSec/60)`),
  ton spójny z resztą UI; status 429 + `Retry-After` w sekundach dla klientów automatycznych.

## Bezpieczeństwo

- Per-IP, nie per-email → brak account-lockout DoS.
- `Retry-After` nie ujawnia istnienia konta (limit dotyczy IP, nie zależy od trafienia w email).
- Limiter działa **przed** ścieżką constant-time w `login` — nie psuje istniejącej ochrony
  przed time-based user enumeration (po przekroczeniu zwracamy 429 niezależnie od emaila).
- Brak logowania IP z danymi konta (zgodność z istniejącą polityką nie-logowania wrażliwych).

## Testy

- **Unit (TDD, bez DB)** — `app/lib/rate-limit.test.ts`:
  - `fixedWindowHit`: w limicie → allowed; (limit+1)-sza → zablokowana; po `windowMs` →
    reset i znów allowed; poprawny `retryAfterSec` (matematyka okna).
  - `clientIp`: XFF z wieloma IP (bierze leftmost), brak nagłówka → `"unknown"`, IPv6, spacje.
  - eviction: sweep wygasłych po przekroczeniu progu rozmiaru.
- **Test akcji** (`app/routes/login.test.ts`, uruchamiany ze zwykłym Vitest, bez Dockera):
  rate-limiter **nie ma zależności od DB**, więc itest z testcontainers nic by nie dodał ponad
  testy jednostkowe. Zamiast niego — test akcji `login` z mockowanym `~/lib/db/client` i
  `~/lib/auth`: 11. próba z tego samego IP → `429` + `Retry-After`; inne IP → przepuszczone.
  Reset-on-success pokryty round-tripem `enforceRateLimit`/`resetRateLimit` w `rate-limit.test.ts`.

## Pliki

| Plik | Zmiana |
|---|---|
| `app/lib/rate-limit.ts` | **nowy** — czysta funkcja okna, store in-memory, `clientIp`, `enforceRateLimit`/`resetRateLimit`/`rateLimited`, `RATE_LIMITS` |
| `app/lib/rate-limit.test.ts` | **nowy** — testy jednostkowe (TDD) |
| `app/routes/login.tsx` | integracja limitera + reset po sukcesie |
| `app/routes/zaproszenie.$token.tsx` | integracja limitera + reset po sukcesie |
| `app/routes/login.test.ts` | **nowy** — test akcji z mockowanym db/auth (429 na 11. próbie) |
| `app/lib/README.md` | dopisanie `rate-limit.ts` do tabeli modułów |

## Poza zakresem (YAGNI / osobne)

- Trwały store (Postgres) — interfejs gotowy, implementacja gdy pojawi się skalowanie poziome.
- Rate-limit webhooka Stripe (chroniony podpisem) i innych tras.
- Per-email / globalne liczniki, captcha, progresywny backoff, blokady konta.
- Observability/alerting (osobny feature — pozycja 9 audytu).
