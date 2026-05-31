# app/routes/podopieczny/ — widoki podopiecznego (`/podopieczny/*`)

Trasy panelu podopiecznego (rola `trainee`). Pod layoutem `_layout.tsx` (poza
`wrapped.$ym.tsx`, które renderuje się pełnoekranowo bez sidenavu). Mobile-first,
instalowalne jako PWA. Mapowanie URL w [`../../routes.ts`](../../routes.ts).

| Plik | URL | Eksporty | Co robi (loader / action) |
|---|---|---|---|
| `_layout.tsx` | `/podopieczny` (layout) | loader, default | Wymaga roli podopiecznego; liczy logi/zdjęcia/sesje do nawigacji; liczy otwarte punkty konsultacji (badge „Konsultacje"). Topbar + sidenav + `<Outlet/>`. |
| `_index.tsx` | `/podopieczny` | loader, default | Pulpit "Mój plan": podsumowanie aktywnego planu, 5 ostatnich logów, liczniki, baner Wrapped. |
| `sesje._index.tsx` | `/podopieczny/sesje` | loader, default | Lista sesji z aktywnego planu (pełne drzewo bloków/ćwiczeń). |
| `sesje.$sessionId.tsx` | `/podopieczny/sesje/:sessionId` | loader, default | Szczegóły sesji + demo ćwiczeń (podpisane URL-e). |
| `loguj.$sessionId.tsx` | `/podopieczny/loguj/:sessionId` | loader, action, default | **Logowanie treningu**: per-seria reps/trudność/notatka + opcjonalne wideo (`multipart`); zapis przez `saveWorkoutLog`, wykrywanie nowych PR-ów. |
| `historia._index.tsx` | `/podopieczny/historia` | loader, default | Lista przeszłych treningów z szukajka + sort + filtr wideo (URL params, `<ListControls>`, paginacja 20). |
| `historia.$logId.tsx` | `/podopieczny/historia/:logId` | loader, default | Szczegóły wpisu treningowego + podpisane wideo. |
| `statystyki.tsx` | `/podopieczny/statystyki` | loader, default | Dashboard statystyk własnych (hero, PR-y, heatmapa, sparkline'y, effort balance, dostępne miesiące Wrapped). |
| `progresja._index.tsx` | `/podopieczny/progresja` | loader, default | Lista ćwiczeń z progresją: sort + filtr tagów przez URL params (`<ListControls>`), sparkline + status + PR per wiersz, tryb porównania (wybór ≥2 ćwiczeń → `/progresja/porownanie`). |
| `progresja.$exerciseId.tsx` | `/podopieczny/progresja/:exerciseId` | loader, default | Szczegóły progresji jednego ćwiczenia (`getExerciseProgression`): przełącznik zakresu `?zakres=4w\|3m\|6m\|all` (domyślnie `3m`, SSR), KPI (PR all-time + zmiana/sesje/RPE w okresie), wykresy `ProgressionLineChart` / `VolumeBars` / `RepsVsEffortChart`; 404 gdy ćwiczenie bez logów. |
| `progresja.porownanie.tsx` | `/podopieczny/progresja/porownanie` | loader, default | Porównanie kilku ćwiczeń na jednej osi „% zmiany od startu okresu" (`getProgressionComparison`): wybór ćwiczeń przez `?ex=id1,id2`, przełącznik zakresu `?zakres=…` (domyślnie `3m`, zachowuje `?ex=`), wykres `ComparisonChart` + `ComparisonChartLegend`, lista pominiętych ćwiczeń; komunikat gdy `<2` wybranych. Statyczny segment ma priorytet nad `:exerciseId`. |
| `sylwetka.tsx` | `/podopieczny/sylwetka` | loader, action, default | Galeria zdjęć sylwetki z sort (URL params, `<ListControls>`) + paginacja (60); akcje `add` (upload) / `delete`. |
| `wrapped.$ym.tsx` | `/podopieczny/wrapped/:ym` | loader, default | Pełnoekranowe miesięczne podsumowanie (styl Spotify Wrapped); 404 gdy brak danych; zapamiętuje obejrzenie w localStorage. |
| `konsultacje._index.tsx` | `/podopieczny/konsultacje` | loader, default | Lista konsultacji własnych (cap 200, bez paginacji, read-only): szukajka + sort + filtr otwartych (URL params, `<ListControls>`); data, tytuł, liczniki punktów. |
| `konsultacje.$konsultacjaId.tsx` | `/podopieczny/konsultacje/:konsultacjaId` | loader, default | Szczegóły konsultacji (read-only): tytuł, daty, podsumowanie, lista punktów „do poprawy" ze statusami. |

Główne moduły wołane stąd: `lib/auth` (`requireUser`), `lib/workouts`,
`lib/wrapped`, `lib/stats`, `lib/body-photos`, `lib/files`, `lib/file-uploads`,
`lib/format`, `lib/consultations`, `components/pagination`, `components/file-dropzone`,
`components/photo-*`.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
