# app/routes/podopieczny/ — widoki podopiecznego (`/podopieczny/*`)

Trasy panelu podopiecznego (rola `trainee`). Pod layoutem `_layout.tsx` (poza
`wrapped.$ym.tsx`, które renderuje się pełnoekranowo bez sidenavu). Mobile-first,
instalowalne jako PWA. Mapowanie URL w [`../../routes.ts`](../../routes.ts).

| Plik | URL | Eksporty | Co robi (loader / action) |
|---|---|---|---|
| `_layout.tsx` | `/podopieczny` (layout) | loader, default | Wymaga roli podopiecznego; liczy logi/zdjęcia/sesje do nawigacji; liczy otwarte punkty konsultacji (badge „Konsultacje"). Topbar + sidenav + `<Outlet/>`. |
| `_index.tsx` | `/podopieczny` | loader, default | Pulpit: hero (streak/journey/total/SUT), „ten tydzień", heatmapa aktywności, effort balance RPE, lista Wrapped + aktywny plan, 5 ostatnich logów. |
| `sesje._index.tsx` | `/podopieczny/sesje` | loader, default | Lista sesji z aktywnego planu (pełne drzewo bloków/ćwiczeń). |
| `sesje.$sessionId.tsx` | `/podopieczny/sesje/:sessionId` | loader, default | Szczegóły sesji + demo ćwiczeń (podpisane URL-e). |
| `loguj.$sessionId.tsx` | `/podopieczny/loguj/:sessionId` | loader, action, default | **Logowanie treningu**: per-seria reps/trudność/notatka + opcjonalne wideo (`multipart`); zapis przez `saveWorkoutLog`, wykrywanie nowych PR-ów. |
| `historia._index.tsx` | `/podopieczny/historia` | loader, default | Lista przeszłych treningów z szukajka + sort + filtr wideo (URL params, `<ListControls>`, paginacja 20). |
| `historia.$logId.tsx` | `/podopieczny/historia/:logId` | loader, default | Szczegóły wpisu treningowego + podpisane wideo. |
| `statystyki.tsx` | `/podopieczny/statystyki` (301) | loader | Shim przekierowujący na `/podopieczny`. |
| `rozwoj._index.tsx` | `/podopieczny/rozwoj` | loader, default | **Strona główna Rozwoju**: drzewo umiejętności (`SkillTreeView`) + lista „Pozostałe ćwiczenia" (progresja ćwiczeń nienależących do żadnej umiejętności) z sort + filtr tagów przez URL params (`<ListControls>`), sparkline + status + PR per wiersz, tryb porównania (wybór ≥2 → `/rozwoj/porownanie`). |
| `rozwoj.umiejetnosc.$skillId.tsx` | `/podopieczny/rozwoj/umiejetnosc/:skillId` | loader, default | Szczegół węzła umiejętności (read-only): drabina wariantów (`VariationLadder`) + wykres/KPI bieżącego wariantu (`ExerciseProgressionPanel`). Brak akcji — podopieczny nie może mutować. |
| `rozwoj.cwiczenie.$exerciseId.tsx` | `/podopieczny/rozwoj/cwiczenie/:exerciseId` | loader, default | Szczegóły progresji jednego ćwiczenia: przełącznik zakresu `?zakres=`, KPI + wykresy (`ExerciseProgressionPanel`); 404 gdy ćwiczenie bez logów. |
| `rozwoj.porownanie.tsx` | `/podopieczny/rozwoj/porownanie` | loader, default | Porównanie kilku ćwiczeń na osi „% zmiany od startu okresu" (`?ex=id1,id2`, `?zakres=`): `ComparisonChart` + legenda; komunikat gdy `<2` wybranych. |
| `sylwetka.tsx` | `/podopieczny/sylwetka` | loader, action, default | Galeria zdjęć sylwetki z sort (URL params, `<ListControls>`) + paginacja (60); akcje `add` (upload) / `delete`. |
| `wrapped.$ym.tsx` | `/podopieczny/wrapped/:ym` | loader, default | Pełnoekranowe miesięczne podsumowanie (styl Spotify Wrapped); 404 gdy brak danych; zapamiętuje obejrzenie w localStorage. |
| `konsultacje._index.tsx` | `/podopieczny/konsultacje` | loader, default | Lista konsultacji własnych (cap 200, bez paginacji, read-only): szukajka + sort + filtr otwartych (URL params, `<ListControls>`); data, tytuł, liczniki punktów. |
| `konsultacje.$konsultacjaId.tsx` | `/podopieczny/konsultacje/:konsultacjaId` | loader, default | Szczegóły konsultacji (read-only): tytuł, daty, podsumowanie, lista punktów „do poprawy" ze statusami. |
| `progresja._index.tsx` | `/podopieczny/progresja` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj`. |
| `progresja.$exerciseId.tsx` | `/podopieczny/progresja/:exerciseId` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj/cwiczenie/:exerciseId`. |
| `progresja.porownanie.tsx` | `/podopieczny/progresja/porownanie` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj/porownanie`. |
| `umiejetnosci.tsx` | `/podopieczny/umiejetnosci` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj`. |
| `umiejetnosci.$skillId.tsx` | `/podopieczny/umiejetnosci/:skillId` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj/umiejetnosc/:skillId`. |

Główne moduły wołane stąd: `lib/auth` (`requireUser`), `lib/workouts`,
`lib/wrapped`, `lib/stats`, `lib/body-photos`, `lib/files`, `lib/file-uploads`,
`lib/format`, `lib/consultations`, `lib/skill-progression`, `lib/skill-tree`,
`lib/progression`, `lib/progression-math`, `components/pagination`,
`components/file-dropzone`, `components/photo-*`, `components/exercise-progression-panel`,
`components/progression-list`, `components/skill-tree`.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
