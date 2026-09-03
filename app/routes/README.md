# app/routes/ — trasy RR7

Trasy aplikacji w konwencji file-based React Router v7. Mapowanie URL→plik
definiuje [`../routes.ts`](../routes.ts) — **dodając/zmieniając trasę edytuj
oba**: plik trasy i `routes.ts`. Większość plików eksportuje część z:
`loader` (odczyt danych SSR), `action` (mutacje), `default` (komponent),
`ErrorBoundary`, `meta`.

## Trasy top-level (w tym katalogu)

| Plik | URL | Eksporty | Rola | Co robi |
|---|---|---|---|---|
| `_index.tsx` | `/` | loader | public | Przekierowanie: trener→`/trener`, podopieczny→`/podopieczny`, gość→`/login`. |
| `login.tsx` | `/login` | loader, action, default | public | Logowanie email+hasło przez `POST /v1/auth/login` (`startSession`). Hasło weryfikuje BE — u siebie liczy pełny hasz także dla nieistniejącego konta i tam też stoi limit prób, kluczowany **adresem e-mail**, nie IP. Loader jest synchroniczny: zalogowanego rozpoznaje po `context` z middleware'u, bez zapytania. |
| `wyloguj.tsx` | `/wyloguj` | loader, action | auth | Gasi sesję w BE (`POST /v1/auth/logout`) i czyści ciastko. Czyszczenie jest **bezwarunkowe**, gaszenie best-effort — odwrotna zależność zostawiałaby użytkownika zalogowanego w przeglądarce, gdy backend akurat nie odpowiada. |
| `zaproszenie.$token.tsx` | `/zaproszenie/:token` | loader, action, default | public | Podgląd (`GET /v1/invites/{token}`) i przyjęcie (`POST /v1/invites/{token}/accept`). BE zakłada albo odnawia konto, stempluje formularz startowy i zużywa zaproszenie **w jednej transakcji**. Nieistniejące, zużyte i wygasłe zaproszenie dają jeden `404` — osobne kody byłyby wyrocznią. Redirect idzie na `/`, nie do sekcji: odpowiedź przyjęcia typuje role szerzej niż `MeDto`, więc sekcję rozstrzyga `_index.tsx` na wąskim `/v1/me`. Kwotę miesięczną z zaproszenia zapisuje BE zdarzeniem `TraineeJoined` — FE już tego nie robi. |
| `upload.wideo.tsx` | `/upload/wideo` | action | auth (podopieczny) | **Trasa zasobowa** (bez komponentu): JEDNO nagranie serii → `{ fileId, bytes }` przez kontrakt (`uploadSetVideo`, dwie fazy). Trasa zostaje po stronie FE, bo XHR z paskiem postępu woła własny origin. Bramka płatności (`hasTraineeAppAccess` → 402) zostaje; bramka formularza startowego i limit wysyłek przeszły do BE — ich odmowy wracają jako JSON z komunikatem BE i tym samym statusem (`403`, `429` + `Retry-After`). `kind` wynika z operacji kontraktu. Zwrócony `fileId` sam w sobie NIC nie uprawnia — własność weryfikuje BE przy zapisie treningu. |
| `files.$fileId.tsx` | `/files/:fileId` | loader | auth | Streaming pliku z magazynu po weryfikacji podpisu HMAC (`exp`/`sig`) i scope'u trenera; obsługa Range (206). `Cache-Control: private, max-age=3600` — świadomie NIE spięte z kubełkiem `exp` (6 h) i bez `immutable`: zysk z cache bierze się ze stabilności adresu (`fileUrlExp`), a dłuższe okno tylko wydłużyłoby czas, w którym po wylogowaniu da się odtworzyć pliki z dysku przeglądarki. |
| `webhooks.stripe.tsx` | `/webhooks/stripe` | action | public (podpis) | Endpoint webhooka Stripe (bez sesji): weryfikuje podpis na SUROWYM body (`request.text()`), `mapEvent`→`applyChange`; 400 przy braku/złym podpisie, 500 przy błędzie handlera (Stripe ponawia), 200 w pozostałych. |
| `healthz.tsx` | `/healthz` | loader | public | **Trasa zasobowa** (bez komponentu): sonda żywotności pod `healthcheckPath` z `railway.toml`. Zwraca `200 "ok"`, nie dotykając bazy ani sesji. Railway uznaje deploy za zdrowy WYŁĄCZNIE po 200, więc `/` się nie nadaje — `_index.tsx` przekierowuje zawsze, a 302 platforma raportuje jako „failed with service unavailable". Świadomie płytka: odpytywanie Postgresa kładłoby kontener przy każdym mrugnięciu bazy (`restartPolicyType = "ON_FAILURE"`). Brak eksportu `default` → RR7 nie odpala loadera `root.tsx`, więc sonda nie budzi sprzątaczek sesji i plików. |

## Strażnik szwu app/lib

Trasy nie sięgają do bazy bezpośrednio: wolno przekazać `db` do funkcji z
`app/lib/*`, ale nie wolno budować zapytań (`db.select/insert/update/delete/$with`)
ani otwierać transakcji (`db.transaction`), ani importować `~/lib/db/schema` (poza
`import type`). Pilnuje tego `no-direct-db.test.ts` w tym katalogu.

## Podkatalogi

| Katalog | Prefiks | Zawartość |
|---|---|---|
| [`trener/`](trener/README.md) | `/trener/*` | Pulpit, podopieczni, biblioteka ćwiczeń, edytor planów. Desktop-first. |
| [`podopieczny/`](podopieczny/README.md) | `/podopieczny/*` | Plan, sesje, logowanie treningu, historia, statystyki, sylwetka, Wrapped. Mobile-first/PWA. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
