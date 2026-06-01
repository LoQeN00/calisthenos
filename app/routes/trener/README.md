# app/routes/trener/ — widoki trenera (`/trener/*`)

Trasy panelu trenera (rola `trainer`). Wszystkie pod layoutem `_layout.tsx`,
który wymusza rolę i liczy odznaki nawigacji. Desktop-first. Mapowanie URL w
[`../../routes.ts`](../../routes.ts).

| Plik | URL | Eksporty | Co robi (loader / action) |
|---|---|---|---|
| `_layout.tsx` | `/trener` (layout) | loader, default | Wymaga roli trenera; liczy podopiecznych/ćwiczenia/plany do nawigacji. Topbar + sidenav + `<Outlet/>`. |
| `_index.tsx` | `/trener` | loader, default | Pulpit: lista klientów, 6 ostatnich sesji, liczniki aktywnych planów/draftów/sesji 7-dniowych. |
| `biblioteka._index.tsx` | `/trener/biblioteka` | loader, action, default | Lista ćwiczeń z sort + filtr jednostki + szukajka (URL params, `<ListControls>`, paginacja 24); podpisuje URL-e demo. Akcje: dodaj/usuń kategorię. |
| `biblioteka.nowe.tsx` | `/trener/biblioteka/nowe` | loader, action, default | Formularz nowego ćwiczenia (nazwa, jednostka REPS/SEC, opis, checkbox „Zbieraj RPE", tagi, demo wideo); upload przez `uploadFile`. |
| `biblioteka.$exerciseId.tsx` | `/trener/biblioteka/:exerciseId` | loader, action, default | Edycja ćwiczenia; checkbox „Zbieraj RPE"; podmiana/usuwanie demo; archiwizacja/przywracanie (archiwizacja zablokowana, gdy ćwiczenie jest wariantem aktywnej umiejętności). |
| `plany._index.tsx` | `/trener/plany` | loader, action, default | Lista planów z szukajka + sort + filtr statusu (URL params, `<ListControls>`, paginacja 20); akcja `delete-plan` (archiwizuje gdy są logi, inaczej kasuje). |
| `plany.nowy.tsx` | `/trener/plany/nowy` | loader, action, default | Nowy pusty plan dla wybranego podopiecznego; odbija do istniejącego draftu jeśli jest. |
| `plany.$planId.tsx` | `/trener/plany/:planId` | loader, action, default | **Edytor planów** — serce panelu. Tryby: view-active / edit-draft / view-archived. Akcje: `save`, `publish`, `delete` (na draftcie bez logów = twarde usunięcie, więc pełni też rolę „odrzuć"). Bloki single/superset/dropset, leniwe tworzenie draftu z aktywnego, dirty-tracking + `beforeunload`. |
| `podopieczni._index.tsx` | `/trener/podopieczni` | loader, action, default | Lista podopiecznych z szukajka + sort + filtr planu (URL params, `<ListControls>`, paginacja 30); akcja tworzy zaproszenie i zwraca URL (14 dni). |
| `podopieczni.$traineeId.tsx` | `/trener/podopieczni/:traineeId` | loader, action, default | Widok klienta: health tiles, heatmapa aktywności, plateau, plan usage + totals, coverage (video/zdjęcia), rozkład tagów; plany (aktywny/draft), logi z szukajka + sort + filtr wideo (URL params, `<ListControls>`, paginacja 20); akcja `delete-trainee`. |
| `podopieczni.$traineeId.log.$logId.tsx` | `…/log/:logId` | loader, default | Szczegóły wpisu treningowego z podpisanymi URL-ami wideo per-seria. |
| `podopieczni.$traineeId.sylwetka.tsx` | `…/sylwetka` | loader, default | Galeria zdjęć sylwetki + pary "przed/po"; podpisane URL-e. |
| `podopieczni.$traineeId.statystyki.tsx` | `…/statystyki` (301) | loader | Shim przekierowujący na `/trener/podopieczni/:traineeId`. |
| `podopieczni.$traineeId.rozwoj._index.tsx` | `…/rozwoj` | loader, default | **Strona główna Rozwoju** podopiecznego: drzewo umiejętności (`SkillTreeView`) + lista „Pozostałe ćwiczenia" z sort + filtr tagów (`<ListControls>`), tryb porównania. Tenant-scope przez `findTraineeOfTrainer` (→404). |
| `podopieczni.$traineeId.rozwoj.umiejetnosc.$skillId.tsx` | `…/rozwoj/umiejetnosc/:skillId` | loader, action, default | Drill-in umiejętności: drabina wariantów (`VariationLadder`) + wykres/KPI bieżącego wariantu; akcje `set-start`, `advance`. Tenant-scope przez `findTraineeOfTrainer` (→404). |
| `podopieczni.$traineeId.rozwoj.cwiczenie.$exerciseId.tsx` | `…/rozwoj/cwiczenie/:exerciseId` | loader, default | Szczegóły progresji ćwiczenia podopiecznego: przełącznik zakresu, KPI + wykresy (`ExerciseProgressionPanel`). Tenant-scope przez `findTraineeOfTrainer` (→404). |
| `podopieczni.$traineeId.rozwoj.porownanie.tsx` | `…/rozwoj/porownanie` | loader, default | Porównanie kilku ćwiczeń podopiecznego znormalizowanych do „% od startu okresu" (`?ex=`, `?zakres=`): `ComparisonChart` + legenda, stan <2 ćwiczeń. Tenant-scope przez `findTraineeOfTrainer` (→404). |
| `podopieczni.$traineeId.konsultacje._index.tsx` | `…/konsultacje` | loader, default | Lista konsultacji podopiecznego (cap 200, bez paginacji): szukajka + sort + filtr otwartych (URL params, `<ListControls>`); data, tytuł, liczniki punktów; przycisk "Nowa konsultacja". |
| `podopieczni.$traineeId.konsultacje.nowa.tsx` | `…/konsultacje/nowa` | loader, action, default | Formularz nowej konsultacji; po sukcesie redirect do listy. |
| `podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx` | `…/konsultacje/:konsultacjaId` | loader, action, default | Szczegóły konsultacji: tryb view (lista punktów z przełącznikiem statusu, usuwanie) i tryb edit (`?edit=1`). Akcje: `delete`, `toggle-item`, `update`. |
| `podopieczni.$traineeId.progresja._index.tsx` | `…/progresja` (301) | loader | Shim przekierowujący na `…/rozwoj`. |
| `podopieczni.$traineeId.progresja.$exerciseId.tsx` | `…/progresja/:exerciseId` (301) | loader | Shim przekierowujący na `…/rozwoj/cwiczenie/:exerciseId`. |
| `podopieczni.$traineeId.progresja.porownanie.tsx` | `…/progresja/porownanie` (301) | loader | Shim przekierowujący na `…/rozwoj/porownanie`. |
| `podopieczni.$traineeId.umiejetnosci.tsx` | `…/umiejetnosci` (301) | loader | Shim przekierowujący na `…/rozwoj`. |
| `podopieczni.$traineeId.umiejetnosci.$skillId.tsx` | `…/umiejetnosci/:skillId` (301) | loader | Shim przekierowujący na `…/rozwoj/umiejetnosc/:skillId`. |
| `umiejetnosci._index.tsx` | `/trener/umiejetnosci` | loader, default | **Authoring umiejętności** (bez zmian): lista umiejętności trenera z liczbą wariantów; przycisk "Nowa umiejętność". |
| `umiejetnosci.nowa.tsx` | `/trener/umiejetnosci/nowa` | loader, action, default | Formularz nowej umiejętności (nazwa, opis); akcja `createSkill` → redirect do szczegółów. |
| `umiejetnosci.$skillId.tsx` | `/trener/umiejetnosci/:skillId` | loader, action, default | Edycja umiejętności: aktualizacja nazwy/opisu, zarządzanie wariantami (dodaj/usuń/reorder przez drag-or-arrows), sekcja „Wymaga:" (prerekwizyty — dodaj/usuń); archiwizacja. Akcje: `update`, `add-variation`, `remove-variation`, `reorder`, `add-prerequisite`, `remove-prerequisite`. |

Główne moduły wołane stąd: `lib/auth` (`requireUser`), `lib/plans`, `lib/workouts`,
`lib/categories`, `lib/trainees`, `lib/stats`, `lib/body-photos`, `lib/files`,
`lib/file-uploads`, `lib/format`, `components/pagination`.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
