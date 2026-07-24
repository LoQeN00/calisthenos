# docs/ — dokumentacja, plany i logi

Materiały projektowe: specyfikacja, plany implementacji, notatki o zmianach oraz
surowe logi z buildów/deployów (do diagnostyki).

## Pliki w tym katalogu

| Plik | Rola |
|---|---|
| `innovate.md` | Backlog kierunków rozwoju z sesji innowacyjnej (A–E): wyróżnik produktowy, statusy, na czym bazują, sugerowana kolejność. Lista do wyboru pod kolejne `/feature`. |
| `statistics-plan.md` | Pełny katalog propozycji statystyk (trener o podopiecznym i podopieczny o sobie) z oceną wartości. Bazuje na obecnym schemacie. |
| `mvp-statistics.md` | Zawężenie powyższego do MVP — proste agregacje SQL bez nowych tabel i wykresów. |
| `error.md` | Zrzut logu błędu runtime (m.in. `EACCES mkdir '/data/body'` — uprawnienia wolumenu). Kontekst diagnostyczny. |
| `audyt.md` | Audyt wydajności, niezawodności i obserwowalności (2026-07-22, 7 użytkowników prod). Stan logowania i plan jego naprawy, znaleziska niezawodnościowe (migracje na Railway, timeouty, graceful shutdown), proponowana kolejność wdrożenia + załącznik ze 108 potwierdzonymi znaleziskami. |

## Podkatalogi

| Katalog | Zawartość |
|---|---|
| [`superpowers/`](superpowers/README.md) | Spec produktu, plany faz, notatki zmian, logi build/deploy z Railway. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
