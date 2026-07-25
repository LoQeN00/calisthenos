# app/lib/db/migrations/ — migracje SQL (generowane)

Migracje generowane przez **Drizzle Kit** na podstawie diffa z
[`../schema.ts`](../schema.ts). **Nie edytuj tych plików ręcznie** — zmieniaj
schemat i uruchom `npm run db:generate`, a potem `npm run db:migrate`.

| Element | Rola |
|---|---|
| `0000_*.sql … 0016_*.sql` | Kolejne migracje (np. `0000` zakłada schemat + `CREATE EXTENSION citext`, `0005` dodaje kategorie ćwiczeń, `0007` dodaje `exercises.tracks_rpe` i robi `difficulty` nullowalnym, `0008–0009` dodają umiejętności/drzewo, `0010` zmienia unikalność nazwy umiejętności na częściową — `WHERE archived_at IS NULL`, by zarchiwizowana nie blokowała nazwy; `0016` dodaje enum `skill_tier` i kolumnę `skills.tier` z `DEFAULT 'basic' NOT NULL`, co nadaje tier wszystkim istniejącym umiejętnościom). Aplikowane w kolejności. |
| `meta/_journal.json` + `meta/*_snapshot.json` | Stan wewnętrzny Drizzle Kit (dziennik + snapshoty schematu). Generowane — nie ruszać. |

Pierwsza migracja wymaga uprawnień do `CREATE EXTENSION citext` (na Railway rola
bazy je ma — patrz root `README.md`).

> Katalog `meta/` jest generowany i celowo nie ma własnego `README.md`.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../../CLAUDE.md`](../../../../CLAUDE.md).
