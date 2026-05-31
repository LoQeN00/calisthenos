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
| `biblioteka.$exerciseId.tsx` | `/trener/biblioteka/:exerciseId` | loader, action, default | Edycja ćwiczenia; checkbox „Zbieraj RPE"; podmiana/usuwanie demo; archiwizacja/przywracanie. |
| `plany._index.tsx` | `/trener/plany` | loader, action, default | Lista planów z szukajka + sort + filtr statusu (URL params, `<ListControls>`, paginacja 20); akcja `delete-plan` (archiwizuje gdy są logi, inaczej kasuje). |
| `plany.nowy.tsx` | `/trener/plany/nowy` | loader, action, default | Nowy pusty plan dla wybranego podopiecznego; odbija do istniejącego draftu jeśli jest. |
| `plany.$planId.tsx` | `/trener/plany/:planId` | loader, action, default | **Edytor planów** — serce panelu. Tryby: view-active / edit-draft / view-archived. Akcje: `save`, `publish`, `delete`, `discard`. Bloki single/superset/dropset, leniwe tworzenie draftu z aktywnego, dirty-tracking + `beforeunload`. |
| `podopieczni._index.tsx` | `/trener/podopieczni` | loader, action, default | Lista podopiecznych z szukajka + sort + filtr planu (URL params, `<ListControls>`, paginacja 30); akcja tworzy zaproszenie i zwraca URL (14 dni). |
| `podopieczni.$traineeId.tsx` | `/trener/podopieczni/:traineeId` | loader, action, default | Szczegóły podopiecznego: plany (aktywny/draft), logi z szukajka + sort + filtr wideo (URL params, `<ListControls>`, paginacja 20); akcja `delete-trainee`. |
| `podopieczni.$traineeId.log.$logId.tsx` | `…/log/:logId` | loader, default | Szczegóły wpisu treningowego z podpisanymi URL-ami wideo per-seria. |
| `podopieczni.$traineeId.sylwetka.tsx` | `…/sylwetka` | loader, default | Galeria zdjęć sylwetki + pary "przed/po"; podpisane URL-e. |
| `podopieczni.$traineeId.statystyki.tsx` | `…/statystyki` | loader, default | Dashboard statystyk (heatmapa, sparkline'y, PR-y, plateau, coverage…) — równoległe zapytania do `lib/stats.ts`. |
| `podopieczni.$traineeId.progresja._index.tsx` | `…/progresja` | loader, default | Lista progresji ćwiczeń podopiecznego: sort + filtr tagów przez URL params (`<ListControls>`), sparkline + status + PR per wiersz, pasek podsumowania statusów, tryb porównania. Tenant-scope przez `findTraineeOfTrainer` (→404). |
| `podopieczni.$traineeId.progresja.$exerciseId.tsx` | `…/progresja/:exerciseId` | loader, default | Oś czasu pojedynczego ćwiczenia podopiecznego: 4 KPI (PR all-time, ostatnia sesja + delta, zmiana % w okresie, sesje + śr. RPE), przełącznik zakresu (`?zakres=`), wykres najmocniejszej serii, objętość, reps-vs-RPE. Tenant-scope przez `findTraineeOfTrainer` (→404). |
| `podopieczni.$traineeId.progresja.porownanie.tsx` | `…/progresja/porownanie` | loader, default | Porównanie kilku ćwiczeń podopiecznego znormalizowanych do „% od startu okresu" (`?ex=` lista ID, `?zakres=`): nakładany `ComparisonChart` + legenda, stan <2 ćwiczeń, „Za mało danych", lista pominiętych. Statyczny segment wygrywa z `:exerciseId`. Tenant-scope przez `findTraineeOfTrainer` (→404). |
| `podopieczni.$traineeId.konsultacje._index.tsx` | `…/konsultacje` | loader, default | Lista konsultacji podopiecznego (cap 200, bez paginacji): szukajka + sort + filtr otwartych (URL params, `<ListControls>`); data, tytuł, liczniki punktów; przycisk "Nowa konsultacja". |
| `podopieczni.$traineeId.konsultacje.nowa.tsx` | `…/konsultacje/nowa` | loader, action, default | Formularz nowej konsultacji; po sukcesie redirect do listy. |
| `podopieczni.$traineeId.konsultacje.$konsultacjaId.tsx` | `…/konsultacje/:konsultacjaId` | loader, action, default | Szczegóły konsultacji: tryb view (lista punktów z przełącznikiem statusu, usuwanie) i tryb edit (`?edit=1`). Akcje: `delete`, `toggle-item`, `update`. |

Główne moduły wołane stąd: `lib/auth` (`requireUser`), `lib/plans`, `lib/workouts`,
`lib/categories`, `lib/trainees`, `lib/stats`, `lib/body-photos`, `lib/files`,
`lib/file-uploads`, `lib/format`, `components/pagination`.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
