# app/lib/db/ — baza danych (Drizzle + Postgres)

Klient ORM, schemat (źródło prawdy modelu danych) i migracje.

## Pliki w tym katalogu

| Plik | Rola |
|---|---|
| `client.ts` | Konfiguracja Drizzle nad `postgres-js` (leniwy singleton, pula 10 połączeń, logowanie w dev). Eksportuje `db` i typ `Db` (instancja lub transakcja). |
| `schema.ts` | **Źródło prawdy schematu.** Tabele: `users`, `sessions`, `invites`, `files`, `exercises`, `exerciseCategories`, `plans`, `planSessions`, `planBlocks`, `planItems`, `workoutLogs`, `workoutExerciseLogs`, `workoutSetLogs`, `bodyPhotos`, `consultationSchedules`, `consultations`, `consultationActionItems`, `googleCalendarConnections`, `skills`, `skillVariations`, `skillAdvancements`, `skillPrerequisites`, `stripeConnections`, `coachingSubscriptions`, `subscriptionPayments`, `processedWebhookEvents` (dedup zdarzeń webhooka Stripe po `event.id`), `featureRequests`, `onboardingForms`, `onboardingFormItems`. Enumy (`userRole`, `exerciseUnit`, `fileKind`, `planStatus`, `blockKind`, `bodyPhotoView`, `consultationStatus`, `consultationCadence`, `consultationItemStatus`, `subscriptionStatus`, `skillTier`, `featureRequestKind`, `featureRequestStatus`), CHECK-i (rola, status, kind, trudność 1–10 lub NULL), indeksy oraz typy wynikowe (`User`, `Plan`, `WorkoutLog`, `Skill`, `SkillVariation`, `SkillAdvancement`, `CoachingSubscription`, `SubscriptionPayment`, … + warianty `New*`). `trainerId` na tabelach domenowych = izolacja tenantów. `exercises.tracks_rpe` (boolean, domyślnie `true`) steruje zbieraniem oceny RPE per seria; `workoutSetLogs.difficulty` jest nullowalne (brak oceny gdy `tracks_rpe = false`). `skills`/`skill_variations`/`skill_advancements` — drabina umiejętności: UNIQUE(exercise_id) zapewnia, że ćwiczenie jest wariantem co najwyżej jednej umiejętności; ON DELETE RESTRICT na `toVariationId` w `skill_advancements` chroni historię awansów. `skills.tier` (`skill_tier`: `basic`/`intermediate`/`advanced`/`expert`, NOT NULL, DEFAULT `basic`) — stopień trudności; steruje pasem piramidy w drzewie umiejętności; migracja nadaje wszystkim istniejącym umiejętnościom `basic`. `skill_prerequisites` — krawędzie DAG prerekwizytów między umiejętnościami (`skill_id` wymaga `requires_skill_id`); tenant-scope przez `trainer_id`; unikalność krawędzi i CHECK anti-selfloop; acykliczność egzekwowana w repozytorium. `feature_requests` — zgłoszenia podopiecznych („Pomysły"): `kind` (`feature_request_kind`: `idea`/`bug`/`other`, DEFAULT `idea`), `status` (`feature_request_status`: `new`/`considering`/`planned`/`done`/`rejected`, DEFAULT `new`), `trainer_response` + `responded_at` (odpowiedź trenera). `trainer_id` zdenormalizowany (jak w `workout_logs`), żeby skrzynka trenera była jednym zapytaniem; indeksy `(trainee_id, created_at)`, `(trainer_id, status)`, `(trainer_id, created_at)`. `onboarding_forms`/`onboarding_form_items` — formularz startowy doczepiony do zaproszenia (`invite_id`, UNIQUE): `trainee_id` jest NULL do przyjęcia zaproszenia (patrz `consumeInvite`/`attachFormToTrainee`), a unikalny częściowy indeks `onboarding_forms_trainee_pending_uniq` (`WHERE completed_at IS NULL`) pilnuje co najwyżej jednego CZEKAJĄCEGO formularza na podopiecznego. Pozycje (`onboarding_form_items`) snapshotują `unit` (`exercise_unit`) z chwili tworzenia — późniejsza zmiana jednostki ćwiczenia w bibliotece nie zmienia znaczenia już zapisanego wyniku; `value` ma CHECK 0–10000 albo NULL (jeszcze nieodpowiedziane). Migracja `0018_natural_reptil.sql`. |

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
