# tests/ — testy integracyjne

Testy integracyjne `*.itest.ts` uruchamiane na realnym PostgreSQL przez
**testcontainers** (Docker). Pokrywają krytyczne przepływy, których nie da się
sprawdzić bez bazy (tenant-scope, zapisy transakcyjne, kaskady, autoryzacja).

- Uruchamia je właściciel pod Dockerem: `npm run test:itest`
  (vitest z dłuższym timeoutem; filtr ścieżki `tests`).
- Testy jednostkowe (bez DB) leżą przy kodzie jako `app/**/*.test.ts` i lecą
  przez `npm run test:unit` — `tests/` ich nie zawiera.

| Plik | Zakres |
|---|---|
| `consultations.itest.ts` | Repo konsultacji (`app/lib/consultations.ts`): tworzenie z punktami, izolacja tenantów (obcy trener/podopieczny → brak dostępu), guard własności przy zmianie statusu punktu, podmiana punktów przy edycji, kaskadowe usuwanie, liczniki. |

Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
