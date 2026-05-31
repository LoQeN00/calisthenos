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
| `stats.ts` | Agregacje statystyk (hero, PR-y, progres, plateau, heatmapa, effort balance, coverage, `detectNewPRsForLog`, streaki). Współdzielone trener/podopieczny. |
| `wrapped.ts` | Miesięczne podsumowania "Wrapped": dostępne miesiące, `getMonthlyWrapped`, archetypy, porównanie m/m, `parseYM`/`formatYM`. |
| `body-photos.ts` | Zdjęcia sylwetki: list/count/`addBodyPhoto`/`deleteBodyPhoto`, `BodyPhotoError`. `listBodyPhotosForTrainee` przyjmuje `{ sort?: "newest"\|"oldest" }`. Sprzątanie blobów po transakcji. |
| `trainees.ts` | Usuwanie podopiecznego (kaskada + ręczne sprzątanie blobów): `deleteTraineeFully`, `assertTraineeOwnedBy`, `TraineeDeleteError`. |
| `consultation-types.ts` | Schematy Zod walidacji formularza konsultacji: `ConsultationFormSchema`, `ActionItemFormSchema`, `ConsultationItemStatusSchema` + typy. |
| `consultations.ts` | Repozytorium konsultacji: `listConsultationsForTrainee`, `getConsultationDetail`, `createConsultation`, `updateConsultation`, `deleteConsultation`, `setActionItemStatus`, `countOpenItemsForTrainee`, `ConsultationError`. Tenant-scope przez `trainerId`/`traineeId`. `listConsultationsForTrainee` przyjmuje `{ sort?: ConsultationSort, q?, open? }`. |
| `consultation-form.server.ts` | Parser FormData → obiekt formularza: `parseConsultationFormData`. Punkty jako równoległe pola `itemBody[]`/`itemStatus[]`. Tylko server-side. |
| `progression-math.ts` | Czysta logika "Progresja" (bez DB): zakresy dat, agregacja tygodniowa, statusy (`statusFromSessions`, `classifyStatus`), PR-oznaczanie (`markPrs`), % zmiana, normalizacja, sortowanie listy (`sortProgressionRows`), typy `ProgressionListRow`, `SessionPoint`, `ChartPoint`, `ProgressionStatus`. |
| `progression.ts` | Warstwa DB dla Progresji: `loadProgressionSessions` (bazowe zapytanie per-sesja, reużywane przez Tasks 4–5), `listProgressionExercises` (lista landing), `findTraineeOfTrainer` (tenant-scope guard → 404 gdy null), `todayIso`. |
| `list-params.ts` | Parser i helper dla kontrolek list (sortowanie, filtrowanie, szukajka): `parseListControls`, `buildControlHref`, typy `ListControlsSpec`, `ListControlsState`, `SortOption`, `FilterGroup`, `FilterOption`. |

## Podkatalogi

| Katalog | Zawartość |
|---|---|
| [`auth/`](auth/README.md) | Sesje, hasła (Argon2id), cookie (`__Host-`), zaproszenia. |
| [`db/`](db/README.md) | Klient Drizzle, schemat (`schema.ts`), migracje. |
| [`storage/`](storage/README.md) | Interfejs `FileStorage` + implementacja lokalna (wolumen). |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
