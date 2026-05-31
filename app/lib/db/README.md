# app/lib/db/ — baza danych (Drizzle + Postgres)

Klient ORM, schemat (źródło prawdy modelu danych) i migracje.

## Pliki w tym katalogu

| Plik | Rola |
|---|---|
| `client.ts` | Konfiguracja Drizzle nad `postgres-js` (leniwy singleton, pula 10 połączeń, logowanie w dev). Eksportuje `db` i typ `Db` (instancja lub transakcja). |
| `schema.ts` | **Źródło prawdy schematu.** Tabele: `users`, `sessions`, `invites`, `files`, `exercises`, `exerciseCategories`, `plans`, `planSessions`, `planBlocks`, `planItems`, `workoutLogs`, `workoutExerciseLogs`, `workoutSetLogs`, `bodyPhotos`. Enumy (`userRole`, `exerciseUnit`, `fileKind`, `planStatus`, `blockKind`, `bodyPhotoView`), CHECK-i (rola, status, kind, trudność 1–10), indeksy oraz typy wynikowe (`User`, `Plan`, `WorkoutLog`, … + warianty `New*`). `trainerId` na tabelach domenowych = izolacja tenantów. |

## Podkatalogi

| Katalog | Zawartość |
|---|---|
| [`migrations/`](migrations/README.md) | Migracje SQL generowane przez Drizzle Kit (+ `meta/` ze snapshotami — nie edytować ręcznie). |

## Workflow zmiany schematu

1. Edytuj `schema.ts`. 2. `npm run db:generate` (tworzy nową migrację z diffa).
3. `npm run db:migrate` (aplikuje). **Nigdy nie edytuj plików w `migrations/`
ręcznie.** Podgląd danych: `npm run db:studio`.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
