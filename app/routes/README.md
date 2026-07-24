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
| `login.tsx` | `/login` | loader, action, default | public | Logowanie email+hasło; weryfikacja Argon2 z dummy-hash (stały czas). Tworzy sesję. |
| `wyloguj.tsx` | `/wyloguj` | loader, action | auth | Usuwa sesję, czyści cookie, redirect na `/login`. |
| `zaproszenie.$token.tsx` | `/zaproszenie/:token` | loader, action, default | public | Konsumpcja zaproszenia: zakłada/odnawia konto podopiecznego, ustawia hasło, tworzy sesję. Gdy zaproszenie niosło `monthlyAmountGrosze` i Stripe jest skonfigurowany, rejestracja przekierowuje do `/podopieczny/platnosci?onboarding=1`. |
| `upload.wideo.tsx` | `/upload/wideo` | action | auth (podopieczny) | **Trasa zasobowa** (bez komponentu): JEDNO nagranie serii → `{ fileId, bytes, mimeType }`. Rozdziela wysyłkę pliku od zapisu sesji: szczyt pamięci JEDNEGO żądania to `MAX_VIDEO_UPLOAD_BYTES` i przestaje rosnąć z liczbą serii w planie (sufit per żądanie, NIE per proces — współbieżność nie jest ograniczona). Powtarza bramkę płatności z `podopieczny/_layout.tsx`, bo trasa leży poza tym layoutem. `kind` jest stałą (`set_video`), `trainerId` wyłącznie z sesji. Rate limit per użytkownik (`RATE_LIMITS.upload`). Zwrócony `fileId` sam w sobie NIC nie uprawnia — właściciela weryfikuje dopiero zapis treningu. |
| `files.$fileId.tsx` | `/files/:fileId` | loader | auth | Streaming pliku z magazynu po weryfikacji podpisu HMAC (`exp`/`sig`) i scope'u trenera; obsługa Range (206). `Cache-Control: private, max-age=3600` — świadomie NIE spięte z kubełkiem `exp` (6 h) i bez `immutable`: zysk z cache bierze się ze stabilności adresu (`fileUrlExp`), a dłuższe okno tylko wydłużyłoby czas, w którym po wylogowaniu da się odtworzyć pliki z dysku przeglądarki. |
| `webhooks.stripe.tsx` | `/webhooks/stripe` | action | public (podpis) | Endpoint webhooka Stripe (bez sesji): weryfikuje podpis na SUROWYM body (`request.text()`), `mapEvent`→`applyChange`; 400 przy braku/złym podpisie, 500 przy błędzie handlera (Stripe ponawia), 200 w pozostałych. |

## Podkatalogi

| Katalog | Prefiks | Zawartość |
|---|---|---|
| [`trener/`](trener/README.md) | `/trener/*` | Pulpit, podopieczni, biblioteka ćwiczeń, edytor planów. Desktop-first. |
| [`podopieczny/`](podopieczny/README.md) | `/podopieczny/*` | Plan, sesje, logowanie treningu, historia, statystyki, sylwetka, Wrapped. Mobile-first/PWA. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
