# docs/superpowers/specs/ — specyfikacje

| Plik | Rola |
|---|---|
| `2026-05-23-kalisthenos-fullstack-v1-design.md` | **Źródło prawdy architektury V1.** Cele i non-goals, model tenancy, stack, model danych (SQL), auth+autoryzacja, edytor i wersjonowanie planów, logowanie treningów, PWA/responsywność, upload/serwowanie plików, konfiguracja, strategia testów, migracja z prototypu, layout repo, deployment, zakres V2, ryzyka i kryteria akceptacji. |
| `2026-05-31-ai-dev-process-design.md` | **Źródło prawdy procesu AI-developmentu.** Powtarzalny proces wprowadzania zmian: ścieżki FEATURE/FIX, TDD + review-per-task, polityka testów (granica Dockera), bramki „done", handoff na granicy gita, reguły projektowe, mapowanie na superpowers, artefakty i zmiany konwencji. |
| `2026-05-31-toggle-rpe-cwiczenia-design.md` | Przełącznik zbierania RPE (trudności 1–10) per ćwiczenie: flaga `exercises.tracks_rpe`, nullowalne `workout_set_logs.difficulty`, reguła odczytu `avgRpe: number \| null`, wpływ na logowanie/statystyki/progresję, decyzje o danych historycznych. |
| `2026-07-26-pomysly-zgloszenia-design.md` | Zgłoszenia podopiecznych („Pomysły"): tabela `feature_requests` (typ pomysł/błąd/inne, status, odpowiedź trenera), prywatna widoczność autor+trener, trasa podopiecznego `/podopieczny/pomysly` i zbiorcza skrzynka trenera `/trener/pomysly` + szczegół z odpowiedzią, odznaka „nowe" w sidenavie trenera. |
| `2026-07-26-formularz-startowy-design.md` | Formularz startowy (onboarding podopiecznego): opcjonalnie doczepiany do zaproszenia zestaw 1–12 ćwiczeń z biblioteki + notatka trenera, tabele `onboarding_forms`/`onboarding_form_items` ze snapshotem jednostki, twarda bramka w layoucie podopiecznego (za bramką płatności) na trasę `/podopieczny/formularz` poza layoutem, widok wyników trenera `/trener/podopieczni/:traineeId/formularz`. |
| `2026-07-22-wideo-rozdzielony-upload-design.md` | Rozdzielenie uploadu nagrań serii od zapisu sesji (plasterek P2 z [`docs/audyt.md`](../../audyt.md)): trasa zasobowa `upload/wideo`, komponent `VideoUploadField` z postępem XHR, walidacja identyfikatorów przy zapisie (rdzeń bezpieczeństwa — `uploaded_by`), sweeper plików-sierot bez migracji, szkic v3 przechowujący `fileId`, rate limit uploadu. Zawiera też decyzję o **odwołaniu** nagrywania w aplikacji (dawny P3) i wynikające z niej otwarte sprawy: ciasny limit 30 MB i zgodność kodeków (HEVC/`.mov`). |

Przy istotnych zmianach kierunku produktu aktualizuj ten dokument (lub dodaj
nowy spec) i wskaż go w root [`README.md`](../../../README.md).

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
