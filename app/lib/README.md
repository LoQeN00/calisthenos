# app/lib/ — logika domenowa i infrastruktura

Warstwa repozytoriów (dostęp do DB, reguły domenowe) oraz infrastruktury (auth,
storage, env, formatowanie). Trasy w `app/routes/` wołają te funkcje w loaderach
i akcjach. **Zasada tenant-scope:** funkcje przyjmują wymagany `trainerId` lub
`traineeId` i filtrują po nim — nie omijaj tego.

## Pliki w tym katalogu (moduły domenowe i pomocnicze)

| Plik | Rola / kluczowe eksporty |
|---|---|
| `authz.ts` | Reguły dostępu tenant-scope: `ownsTrainerScope`, `canRead`, `canWrite`, typ `Resource`. |
| `env.ts` | Walidacja i leniwy dostęp do zmiennych środowiskowych (Zod): `getEnv()`, `env`, typ `Env`. |
| `format.ts` | Formatowanie dat/liczb po polsku: `fmtDate`, `fmtDateShort`, `daysAgo`, `todayISO`, `pluralizePl`. |
| `files.ts` | Ścieżki plików + podpisywanie URL-i HMAC: `signFileUrl`, `verifyFileUrl`, `extForMime`, `*Path`, `newFileId`, `ALLOWED_*_MIME`. |
| `file-uploads.ts` | Upload z walidacją MIME/magic-bytes/limitów + kolejka sprzątająca przy rollbacku: `uploadFile`, `deleteFile*`, `UploadCleanupQueue`, `UploadError`. |
| `exercises.ts` | Normalizacja tagów ćwiczeń: `normalizeTags`. |
| `categories.ts` | CRUD kategorii ćwiczeń per-trener: `listCategoriesForTrainer`, `addCategory`, `deleteCategory`, `filterToKnownCategoryNames`, `CategoryError`. |
| `plan-types.ts` | Schematy Zod formularza planu (single/superset/dropset): `PlanFormSchema`, `SessionFormSchema`, `BlockFormSchema`, `ItemFormSchema` + typy. |
| `plans.ts` | Repozytorium planów: load/list, `createBlankPlan`, `createDraftFromActive`, `saveDraftPlan`, `publishPlan`, `deletePlan`, `PlanRepoError`. Wersjonowanie i deep-clone. |
| `workouts.ts` | Treningi: aktywny plan, sesja do logowania, lista/szczegóły logów, klienci trenera, `saveWorkoutLog`, `WorkoutSaveError`. Autoryzacja widza wbudowana. `listLogsForTrainee`/`countLogsForTrainee` przyjmują `{ sort?: LogSort, q?, video? }`. `listClientsForTrainer`/`countClientsForTrainer` przyjmują `{ sort?: ClientSort, q?, plan? }`. |
| `stats.ts` | Agregacje statystyk: `getHeroStats`, `getThisWeekStats`, `getActivityHeatmap`, `getEffortBalance`, `getHealthStats`, `getPlateauExercises`, `getActivePlanSessionUsage`, `getCurrentPlanTotals`, `getVideoCoverage`, `getBodyPhotoCoverage`, `getTagDistribution`, `getExerciseProgress`, `getEasierAtSameReps`, `getSideBySidePhotoPairs`, `detectNewPRsForLog`, `computeStreak`, `computeLongestStreak`. Współdzielone trener/podopieczny. (Usunięto: `getMonthSummary`, `getTopExerciseSparklines`, `getPersonalRecords`, `MONTH_NAMES`.) |
| `wrapped.ts` | Miesięczne podsumowania "Wrapped": dostępne miesiące, `getMonthlyWrapped`, archetypy, porównanie m/m, `parseYM`/`formatYM`. |
| `body-photos.ts` | Zdjęcia sylwetki: list/count/`addBodyPhoto`/`deleteBodyPhoto`, `BodyPhotoError`. `listBodyPhotosForTrainee` przyjmuje `{ sort?: "newest"\|"oldest" }`. Sprzątanie blobów po transakcji. |
| `trainees.ts` | Usuwanie podopiecznego (kaskada + ręczne sprzątanie blobów): `deleteTraineeFully`, `assertTraineeOwnedBy`, `TraineeDeleteError`. |
| `consultation-types.ts` | Schematy Zod walidacji formularza konsultacji: `ConsultationFormSchema`, `ActionItemFormSchema`, `ConsultationItemStatusSchema` + typy. |
| `consultations.ts` | Repozytorium konsultacji: `listConsultationsForTrainee`, `getConsultationDetail`, `createConsultation`, `updateConsultation`, `deleteConsultation`, `setActionItemStatus`, `countOpenItemsForTrainee`, `ConsultationError`. Tenant-scope przez `trainerId`/`traineeId`. `listConsultationsForTrainee` przyjmuje `{ sort?: ConsultationSort, q?, open? }`. |
| `consultation-form.server.ts` | Parser FormData → obiekt formularza: `parseConsultationFormData`. Punkty jako równoległe pola `itemBody[]`/`itemStatus[]`. Tylko server-side. |
| `progression-math.ts` | Czysta logika "Progresja" (bez DB): zakresy dat, agregacja tygodniowa, statusy (`statusFromSessions` komputuje z `best` — rekordu, `classifyStatus`), PR-oznaczanie (`markPrs`), % zmiana, normalizacja, sortowanie listy (`sortProgressionRows`), polski skrót jednostki (`unitLabelPl` mapuje REPS/SEC), filtrowanie wierszy po ID ćwiczenia (`excludeByExerciseId`), wybór ujęcia wykresu dla okresu (`seriesForRange` — tygodniowe dla 6m/all, ale fallback do per-sesja gdy zwinęłoby do <2 punktów, by szerszy okres nie pokazywał mniej niż węższy), typy `ProgressionListRow`, `SessionPoint`, `ChartPoint`, `ProgressionStatus`. |
| `progression.ts` | Warstwa DB dla Progresji: `loadProgressionSessions` (bazowe zapytanie per-sesja, reużywane przez Tasks 4–5; wyklucza zarchiwizowane ćwiczenia), `listProgressionExercises` (lista landing), `findTraineeOfTrainer` (tenant-scope guard → 404 gdy null), `todayIso`. `ComparisonSeries` nosi `startValue`/`endValue` (surowe best na starcie i końcu okresu; do tabeli „Konkretnie" w porównaniu). |
| `skill-progression-math.ts` | Czysta logika "Umiejętności" (bez DB): `currentLevelFromEvents` (najświeższe zdarzenie awansu → bieżący wariant), `suggestAdvancement` (miękka sugestia awansu/cofnięcia na podstawie sygnałów), typy `AdvancementEvent`, `AdvanceSignals`, `AdvancementSuggestion`, stałe `MIN_SESSIONS_FOR_SUGGESTION`, `HIGH_RPE`. |
| `skill-types.ts` | Schematy Zod walidacji formularzy umiejętności: `SkillFormSchema`, `AdvancementFormSchema`, `ReorderFormSchema`, `PrerequisiteFormSchema` + typy `SkillForm`, `AdvancementForm`, `ReorderForm`. |
| `skills.ts` | Repozytorium umiejętności: `listSkillsForTrainer`, `getSkillWithVariations`, `createSkill`, `updateSkill`, `archiveSkill`, `addVariation`, `removeVariation`, `reorderVariations`, `listAssignableExercises`, `findSkillForExercise`, `SkillError`. Prerequisite CRUD: `addPrerequisite`, `removePrerequisite`, `listPrerequisitesForSkill`, `listAssignablePrerequisites`. Tenant-scope przez `trainerId`; UNIQUE(exercise_id) i ON DELETE RESTRICT na awansach obsługiwane jako przyjazne błędy. `addVariation` odrzuca zarchiwizowane ćwiczenie; `removeVariation` przepakowuje `ordinal` (bez dziur); `archiveSkill` czyści krawędzie prerekwizytów w transakcji; `findSkillForExercise` zwraca aktywną umiejętność, której ćwiczenie jest wariantem (blokada archiwizacji ćwiczenia-wariantu). |
| `skill-tree.ts` | Repozytorium drzewa umiejętności: `getSkillTreeForTrainer` (szkielet DAG dla autora), `getSkillTreeForTrainee` (drzewo z per-podopieczny stanami węzłów); typy `TreeNode`, `SkillTree`. |
| `skill-tree-math.ts` | Czysta logika drzewa prerekwizytów (bez DB): `wouldCreateCycle`, `assignLayers`, `orderWithinLayer`, `nodeState`, `topoOrder`; typy `Edge`, `NodeState`. |
| `skill-progression.ts` | Repozytorium postępów umiejętności: `getSkillMapForTrainee` (mapa wszystkich umiejętności trenera z bieżącym wariantem podopiecznego, historią i opcjonalną sugestią awansu), `setStartingLevel` (pierwszy wpis: fromVariationId = null), `recordAdvancement` (awans/cofnięcie; sprawdza "no start" i "same level"). Współdzielone trener/podopieczny. |
| `list-params.ts` | Parser i helper dla kontrolek list (sortowanie, filtrowanie, szukajka): `parseListControls`, `buildControlHref`, typy `ListControlsSpec`, `ListControlsState`, `SortOption`, `FilterGroup`, `FilterOption`. |

## Podkatalogi

| Katalog | Zawartość |
|---|---|
| [`auth/`](auth/README.md) | Sesje, hasła (Argon2id), cookie (`__Host-`), zaproszenia. |
| [`db/`](db/README.md) | Klient Drizzle, schemat (`schema.ts`), migracje. |
| [`storage/`](storage/README.md) | Interfejs `FileStorage` + implementacja lokalna (wolumen). |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
