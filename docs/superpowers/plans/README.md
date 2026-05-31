# docs/superpowers/plans/ — plany implementacji

Plany realizacji rozbite na fazy/zadania (checkboxy `- [ ]`).

| Plik | Rola |
|---|---|
| `2026-05-23-kalisthenos-v1-phase-1-foundation.md` | Faza 1 (fundament): RR7 + TypeScript + Postgres/Drizzle, auth sesyjna, flow zaproszeń, szkielety layoutów trenera/podopiecznego. Zawiera cel, architekturę, stack i kroki. |
| `2026-05-31-ai-dev-process-tooling.md` | Wdrożenie procesu AI-developmentu: skill `kalisthenos-dev-flow` + commandy `/feature` `/fix`, `.claude/settings.json`, edycja `.gitignore`/`CLAUDE.md`/`README.md` i pamięci (zwrot ku TDD + review-per-task). |
| `2026-05-31-toggle-rpe-cwiczenia.md` | Przełącznik zbierania RPE (trudności 1–10) per ćwiczenie: schemat (`tracks_rpe` + nullowalny `difficulty`), warstwa zapisu (logowanie/biblioteka), reguła odczytu `avgRpe: number \| null` w statystykach/progresji/wrapped, UI detalu/wykresów, testy. 11 zadań + bramki. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
