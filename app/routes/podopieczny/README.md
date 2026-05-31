# app/routes/podopieczny/ — widoki podopiecznego (`/podopieczny/*`)

Trasy panelu podopiecznego (rola `trainee`). Pod layoutem `_layout.tsx` (poza
`wrapped.$ym.tsx`, które renderuje się pełnoekranowo bez sidenavu). Mobile-first,
instalowalne jako PWA. Mapowanie URL w [`../../routes.ts`](../../routes.ts).

| Plik | URL | Eksporty | Co robi (loader / action) |
|---|---|---|---|
| `_layout.tsx` | `/podopieczny` (layout) | loader, default | Wymaga roli podopiecznego; liczy logi/zdjęcia/sesje do nawigacji. Topbar + sidenav + `<Outlet/>`. |
| `_index.tsx` | `/podopieczny` | loader, default | Pulpit "Mój plan": podsumowanie aktywnego planu, 5 ostatnich logów, liczniki, baner Wrapped. |
| `sesje._index.tsx` | `/podopieczny/sesje` | loader, default | Lista sesji z aktywnego planu (pełne drzewo bloków/ćwiczeń). |
| `sesje.$sessionId.tsx` | `/podopieczny/sesje/:sessionId` | loader, default | Szczegóły sesji + demo ćwiczeń (podpisane URL-e). |
| `loguj.$sessionId.tsx` | `/podopieczny/loguj/:sessionId` | loader, action, default | **Logowanie treningu**: per-seria reps/trudność/notatka + opcjonalne wideo (`multipart`); zapis przez `saveWorkoutLog`, wykrywanie nowych PR-ów. |
| `historia._index.tsx` | `/podopieczny/historia` | loader, default | Lista przeszłych treningów (paginacja 20). |
| `historia.$logId.tsx` | `/podopieczny/historia/:logId` | loader, default | Szczegóły wpisu treningowego + podpisane wideo. |
| `statystyki.tsx` | `/podopieczny/statystyki` | loader, default | Dashboard statystyk własnych (hero, PR-y, heatmapa, sparkline'y, effort balance, dostępne miesiące Wrapped). |
| `sylwetka.tsx` | `/podopieczny/sylwetka` | loader, action, default | Galeria zdjęć sylwetki + paginacja (60); akcje `add` (upload) / `delete`. |
| `wrapped.$ym.tsx` | `/podopieczny/wrapped/:ym` | loader, default | Pełnoekranowe miesięczne podsumowanie (styl Spotify Wrapped); 404 gdy brak danych; zapamiętuje obejrzenie w localStorage. |

Główne moduły wołane stąd: `lib/auth` (`requireUser`), `lib/workouts`,
`lib/wrapped`, `lib/stats`, `lib/body-photos`, `lib/files`, `lib/file-uploads`,
`lib/format`, `components/pagination`, `components/file-dropzone`,
`components/photo-*`.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
