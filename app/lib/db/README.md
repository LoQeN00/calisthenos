# app/lib/db/ — baza danych (Drizzle + Postgres)

Klient ORM, schemat (źródło prawdy modelu danych) i migracje.

## Pliki w tym katalogu

| Plik | Rola |
|---|---|
| `client.ts` | Konfiguracja Drizzle nad `postgres-js` (leniwy singleton, pula 10 połączeń, logowanie w dev). Eksportuje `db` i typ `Db` (instancja lub transakcja). |
| `schema.ts` | **Źródło prawdy schematu.** Tabele: `organizations`, `regions`, `users`, `sessions`, `invites`, `files`, `exercises`, `exerciseCategories`, `plans`, `planSessions`, `planBlocks`, `planItems`, `workoutLogs`, `workoutExerciseLogs`, `workoutSetLogs`, `bodyPhotos`, `consultationSchedules`, `consultations`, `consultationActionItems`, `googleCalendarConnections`, `skills`, `skillVariations`, `skillAdvancements`, `skillPrerequisites`, `stripeConnections`, `coachingSubscriptions`, `subscriptionPayments`, `processedWebhookEvents` (dedup zdarzeń webhooka Stripe po `event.id`). Enumy (`userRole` — wartości: `trainer`, `trainee`, `brand_admin`; `exerciseUnit`, `fileKind`, `planStatus`, `blockKind`, `bodyPhotoView`, `consultationStatus`, `consultationCadence`, `consultationItemStatus`, `subscriptionStatus`, `inviteTargetRole` — wartości: `trainee`, `trainer`), CHECK-i (rola, status, kind, trudność 1–10 lub NULL), indeksy oraz typy wynikowe (`User`, `Plan`, `WorkoutLog`, `Skill`, `SkillVariation`, `SkillAdvancement`, `CoachingSubscription`, `SubscriptionPayment`, … + warianty `New*`). `trainerId` na tabelach domenowych = izolacja tenantów. `users.organization_id` i `users.region_id` (nullable FK RESTRICT) łączą użytkownika z tenancją marki (`organizations`/`regions`). `exercises.tracks_rpe` (boolean, domyślnie `true`) steruje zbieraniem oceny RPE per seria; `workoutSetLogs.difficulty` jest nullowalne (brak oceny gdy `tracks_rpe = false`). **Dwupoziomowa własność plików (`files`):** `trainer_id` jest nullable — plik jest albo **trenerski** (`trainer_id` ustawione, `organization_id NULL`) albo **markowy** (`trainer_id NULL`, `organization_id` ustawione; np. demo ćwiczenia markowego wgrywane przez prezesa marki); CHECK `files_owner_check` egzekwuje dokładnie jednego właściciela; indeks `files_org_kind_idx` na `(organization_id, kind)`. **Dwupoziomowa własność katalogu (`exercises`, `skills`, `skill_prerequisites`):** `trainer_id` i `organization_id` są nullowalne — wiersz jest albo **markowy** (`trainer_id NULL`, `organization_id` ustawione) albo **trenerski** (`trainer_id` ustawione, `organization_id NULL`); CHECK `*_owner_check` egzekwuje dokładnie jednego właściciela. `exercises`/`skills` mają też `origin_id` (FK na własną tabelę, ON DELETE SET NULL) wskazujące markowy oryginał sforkowany przez trenera (copy-on-write); CHECK `*_origin_check` dopuszcza `origin_id` tylko na wierszu trenerskim. Unikalne indeksy `exercises_trainer_origin_uniq` / `skills_trainer_origin_uniq` na `(trainer_id, origin_id)` gwarantują ≤1 fork danego origin na trenera (NULL-e w Postgresie rozróżnialne → nie-forki bez ograniczeń; backują idempotencję `forkExercise`/`forkSkill`). `skills`/`skill_variations`/`skill_advancements` — drabina umiejętności: globalny `UNIQUE(exercise_id)` na `skill_variations` USUNIĘTO (byłby błędny przy katalogu markowym + forkach); reguła „ćwiczenie należy do ≤1 umiejętności w efektywnym widoku" przeniesiona do repo (`skills.ts:addVariation`). ON DELETE RESTRICT na `toVariationId` w `skill_advancements` chroni historię awansów. `skill_prerequisites` — krawędzie DAG prerekwizytów między umiejętnościami (`skill_id` wymaga `requires_skill_id`); tenant-scope przez `trainer_id`/`organization_id` (jak wyżej); unikalność krawędzi i CHECK anti-selfloop; acykliczność egzekwowana w repozytorium. **Uogólnione zaproszenia (`invites`):** `target_role` (enum `invite_target_role`: `trainee`\|`trainer`, domyślnie `trainee`) determinuje typ zaproszenia; `trainer_id` nullable — ustawiony tylko dla zaproszeń podopiecznego; nowe kolumny: `organization_id` (FK RESTRICT do `organizations`), `region_id` (FK RESTRICT do `regions`), `invited_by_user_id` (FK RESTRICT do `users`); CHECK `invites_target_check` egzekwuje: `trainee` → `trainer_id IS NOT NULL`; `trainer` → `invited_by_user_id IS NOT NULL AND organization_id IS NOT NULL AND trainer_id IS NULL`. |

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
