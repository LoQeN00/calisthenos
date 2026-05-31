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
| `zaproszenie.$token.tsx` | `/zaproszenie/:token` | loader, action, default | public | Konsumpcja zaproszenia: zakłada/odnawia konto podopiecznego, ustawia hasło, tworzy sesję. |
| `files.$fileId.tsx` | `/files/:fileId` | loader | auth | Streaming pliku z magazynu po weryfikacji podpisu HMAC (`exp`/`sig`) i scope'u trenera; obsługa Range (206). |

## Podkatalogi

| Katalog | Prefiks | Zawartość |
|---|---|---|
| [`trener/`](trener/README.md) | `/trener/*` | Pulpit, podopieczni, biblioteka ćwiczeń, edytor planów. Desktop-first. |
| [`podopieczny/`](podopieczny/README.md) | `/podopieczny/*` | Plan, sesje, logowanie treningu, historia, statystyki, sylwetka, Wrapped. Mobile-first/PWA. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
