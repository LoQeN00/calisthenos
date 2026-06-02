# app/lib/ — logika domenowa i infrastruktura

Warstwa repozytoriów (dostęp do DB, reguły domenowe) oraz infrastruktury (auth,
storage, env, formatowanie). Trasy w `app/routes/` wołają te funkcje w loaderach
i akcjach. **Zasada tenant-scope:** funkcje przyjmują wymagany `trainerId` lub
`traineeId` i filtrują po nim — nie omijaj tego.

## Pliki w tym katalogu (moduły domenowe i pomocnicze)

| Plik | Rola / kluczowe eksporty |
|---|---|
| `authz.ts` | Reguły dostępu tenant-scope: `ownsTrainerScope`, `canRead`, `canWrite`, typ `Resource`. |
| `env.ts` | Walidacja i leniwy dostęp do zmiennych środowiskowych (Zod): `getEnv()`, `env`, typ `Env`. Opcjonalne klucze `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI/TOKEN_ENC_KEY` + predykat `googleConfigured()`. |
| `format.ts` | Formatowanie dat/liczb po polsku: `fmtDate`, `fmtDateShort`, `fmtDateTime` (data+godzina UTC), `fmtTime` (sama godzina UTC), `daysAgo`, `todayISO`, `pluralizePl`; helpery miesiąca kalendarza: `monthRangeUTC` (zakres „YYYY-MM" → ISO UTC + rok/miesiąc), `shiftMonth`. |
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
| `consultation-recurrence.ts` | Czyste liczenie dat terminów z reguły cyklu (bez DB, bez `Date.now`): `nextOccurrences`, typ `RecurrenceRule`. UTC, okno `[from, from+horizonDays]`. Obsługuje weekly/biweekly (kotwica `weekday`) i monthly (`dayOfMonth` ≤28). |
| `consultation-status.ts` | Jedno źródło prawdy dla prezentacji statusu terminu (czyste, cel testów): `consultationPresentation` (etykieta+ton, świadome roli — `planned` przyszły/miniony), `mostUrgentTone` (kropka dnia), mapy `TONE_TEXT`/`TONE_DOT`, typy `ConsultationTone`/`ConsultationPresentation`. Używane przez OBA panele, by status nie wyglądał inaczej zależnie od widoku. |
| `consultation-types.ts` | Zod + czyste guardy przejść: `ScheduleFormSchema`, `ConsultationDocFormSchema`, `ActionItemFormSchema`, `TraineeActionSchema`, `ConsultationItemStatusSchema` + typy; guardy `canTraineeAct`, `canTrainerReschedule`/`canTrainerCancel`, `canDocument`. |
| `consultation-schedules.ts` | Repo harmonogramu (tenant-scope `trainerId`): `getActiveSchedule`, `upsertSchedule` (jeden aktywny na parę; regeneruje przyszłe `planned`, anuluje stare niepotwierdzone), `deactivateSchedule`, `ensureOccurrences` (idempotentna materializacja po `(schedule_id, scheduled_at)`), `defaultTitle`, stała `HORIZON_DAYS`, `ScheduleError`. |
| `consultations.ts` | Repo okazji (tenant-scope `trainerId`/`traineeId`): `listOccurrencesForTrainee` (zakres dat, pomija cancelled), `listOccurrencesForTrainer`, `listTrainerOccurrencesInRange` (zbiorczy kalendarz trenera — wszyscy podopieczni w zakresie, z `displayName`, bez cancelled), `getConsultationDetail`, `createAdhocConsultation`, `documentConsultation`, `rescheduleOccurrence`, `cancelOccurrence`, `respondToOccurrence` (confirm/decline/request_change — guardy statusów), `setActionItemStatus`, `deleteConsultation`, `countPendingForTrainee`, `nextUpcomingForTrainee`, `ConsultationError`. Helpery synchronizacji Google: `getSyncRow`, `listUnsyncedForSync`, `setGoogleEventId`, interfejs `ConsultationSyncRow`. |
| `consultation-form.server.ts` | Parsery FormData → obiekty do walidacji Zodem: `parseConsultationDocFormData` (termin/dokumentacja; punkty jako równoległe `itemBody[]`/`itemStatus[]`), `parseScheduleFormData` (reguła harmonogramu). Tylko server-side. |
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
| [`google/`](google/README.md) | Integracja Google (OAuth, szyfrowanie tokenów AES-256-GCM, synchronizacja z Google Calendar — WYCHODZĄCA, best-effort). |
| [`storage/`](storage/README.md) | Interfejs `FileStorage` + implementacja lokalna (wolumen). |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
