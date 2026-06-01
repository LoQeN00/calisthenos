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
| `progression-tenant-scope.itest.ts` | Tenant-scope Progresji (`app/lib/progression.ts`): `findTraineeOfTrainer` (obcy trener → null, właściwy → podopieczny), `listProgressionExercises` (lista P_A bez logów innego podopiecznego), `getExerciseProgression` (dane tylko z logów P_A, cudze ćwiczenie → null), `getProgressionComparison` (serie + pominięte). |
| `lists-sort-filter-tenant-scope.itest.ts` | Tenant-scope + poprawność sort/filtr/szukajki dla list: `listLogsForTrainee` (sort=hardest/easiest/sets_desc, video=with/without, q, izolacja traineeB), `countLogsForTrainee` (video+q), `listClientsForTrainer` (sort=most_sessions + paginacja, q, plan=with/without, izolacja trenerów), `listConsultationsForTrainee` (open=with_open, q, sort=most_open/date_asc, izolacja traineeB). |
| `rpe-toggle.itest.ts` | Przełącznik RPE per ćwiczenie (`exercises.tracksRpe`): zapis `difficulty = NULL` dla ćwiczenia bez RPE, sesja mieszana liczy `avgDifficulty` tylko z ocenionych serii, `getExerciseProgression` zwraca `avgRpeInRange = null` gdy brak ocen, `getEffortBalance` pomija sesje bez RPE (nie rzuca i zwraca liczbę). |
| `skills.itest.ts` | Umiejętności/awanse (`app/lib/skills.ts`, `app/lib/skill-progression.ts`): tenant-scope (obcy trener → null/`SkillError`), pełny cykl create→addVariation×3→reorder→setStartingLevel→awans→regres + `getSkillMapForTrainee` (poprawny `currentVariationId` = najnowsze zdarzenie, historia), `UNIQUE(exercise_id)` („exercise taken"), `ON DELETE RESTRICT` przy `removeVariation` („referenced"), guardy `recordAdvancement` („no start"/„same level"). |

Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
