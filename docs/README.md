# docs/ — dokumentacja, plany i logi

Materiały projektowe: specyfikacja, plany implementacji, notatki o zmianach oraz
surowe logi z buildów/deployów (do diagnostyki).

## Pliki w tym katalogu

| Plik | Rola |
|---|---|
| `audyt-production-readiness-2026-07-11.md` | Audyt całej aplikacji pod kątem gotowości produkcyjnej (6 wymiarów: bezpieczeństwo, ops, UX/PWA, dane/wydajność, kompletność produktu/RODO, testy). Priorytetyzowane znaleziska z checkboxami i ścieżkami plików + proponowana kolejność (fale 1–3). Backlog pod `/fix`/`/feature`. |
| `innovate.md` | Backlog kierunków rozwoju z sesji innowacyjnej (A–E): wyróżnik produktowy, statusy, na czym bazują, sugerowana kolejność. Lista do wyboru pod kolejne `/feature`. |
| `statistics-plan.md` | Pełny katalog propozycji statystyk (trener o podopiecznym i podopieczny o sobie) z oceną wartości. Bazuje na obecnym schemacie. |
| `mvp-statistics.md` | Zawężenie powyższego do MVP — proste agregacje SQL bez nowych tabel i wykresów. |
| `error.md` | Zrzut logu błędu runtime (m.in. `EACCES mkdir '/data/body'` — uprawnienia wolumenu). Kontekst diagnostyczny. |

## Podkatalogi

| Katalog | Zawartość |
|---|---|
| [`ddd/`](ddd/README.md) | Metodyka Domain-Driven Design: pełne flow analizy strategicznej DDD (generyczny playbook — 8 kroków, techniki warsztatowe, context mapping). |
| [`superpowers/`](superpowers/README.md) | Spec produktu, plany faz, notatki zmian, logi build/deploy z Railway. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
