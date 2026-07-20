# app/ — źródło aplikacji React Router v7

Korzeń kodu aplikacji (framework mode RR7, SSR). To katalog-indeks; szczegóły są
w `README.md` podkatalogów.

## Pliki w tym katalogu

| Plik | Rola |
|---|---|
| `root.tsx` | Powłoka dokumentu HTML (locale `pl`, motyw z cookie), globalne providery `ToastProvider` + `ConfirmProvider`, nagłówki bezpieczeństwa (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), root loader (leniwe czyszczenie wygasłych sesji), `ErrorBoundary`. |
| `routes.ts` | Drzewo tras RR7: top-level (`/`, `login`, `wyloguj`, `zaproszenie/:token`, `files/:fileId`) + prefiksy `trener/*` i `podopieczny/*` z layoutami. Każda nowa trasa musi tu trafić. |

## Podkatalogi

| Katalog | Zawartość |
|---|---|
| [`routes/`](routes/README.md) | Trasy (loadery, akcje, komponenty). Podział na [`trener/`](routes/trener/README.md) i [`podopieczny/`](routes/podopieczny/README.md). |
| [`components/`](components/README.md) | Współdzielone komponenty UI (modale, to'sty, dropzone, ikony, widżety statystyk…). |
| [`lib/`](lib/README.md) | Logika domenowa + infrastruktura: [`auth/`](lib/auth/README.md), [`db/`](lib/db/README.md), [`storage/`](lib/storage/README.md) oraz moduły domenowe (plany, treningi, statystyki…). |
| [`styles/`](styles/README.md) | Globalne tokeny CSS (`tokens.css`). |
| [`i18n/`](i18n/README.md) | Konfiguracja i18next, `pickLang`, `resources` (import słowników) i typowanie `CustomTypeOptions`. |
| [`locales/`](locales/README.md) | Słowniki JSON per język (`pl/`, `fr/`) i test parzystości kluczy. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
