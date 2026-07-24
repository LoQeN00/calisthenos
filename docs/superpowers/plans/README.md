# docs/superpowers/plans/ — plany implementacji

Plany realizacji rozbite na fazy/zadania (checkboxy `- [ ]`).

| Plik | Rola |
|---|---|
| `2026-05-23-kalisthenos-v1-phase-1-foundation.md` | Faza 1 (fundament): RR7 + TypeScript + Postgres/Drizzle, auth sesyjna, flow zaproszeń, szkielety layoutów trenera/podopiecznego. Zawiera cel, architekturę, stack i kroki. |
| `2026-05-31-ai-dev-process-tooling.md` | Wdrożenie procesu AI-developmentu: skill `kalisthenos-dev-flow` + commandy `/feature` `/fix`, `.claude/settings.json`, edycja `.gitignore`/`CLAUDE.md`/`README.md` i pamięci (zwrot ku TDD + review-per-task). |
| `2026-05-31-toggle-rpe-cwiczenia.md` | Przełącznik zbierania RPE (trudności 1–10) per ćwiczenie: schemat (`tracks_rpe` + nullowalny `difficulty`), warstwa zapisu (logowanie/biblioteka), reguła odczytu `avgRpe: number \| null` w statystykach/progresji/wrapped, UI detalu/wykresów, testy. 11 zadań + bramki. |
| `2026-06-01-konsultacje-harmonogram-faza1.md` | Konsultacje — Faza 1 (rdzeń natywny): przebudowa `consultations` w byt o cyklu życia, `consultation_schedules`, generator dat (`consultation-recurrence.ts`), CRUD harmonogramu + materializacja, statusy/przejścia, UI trenera i kalendarz podopiecznego, ręczny `meeting_url`. **Bez Google.** |
| `2026-07-22-wideo-rozdzielony-upload.md` | Rozdzielenie uploadu nagrań serii od zapisu sesji (plasterek P2 z [`../../audyt.md`](../../audyt.md)): override klucza w rate-limicie + kubełek `upload`, trasa zasobowa `upload/wideo`, walidacja identyfikatorów przy zapisie (`uploaded_by` jako rdzeń bezpieczeństwa), sweeper sierot bez migracji, komponent `VideoUploadField` z postępem XHR, szkic v3. 6 zadań + `/security-review`. |
| `2026-06-02-konsultacje-google-faza2.md` | Konsultacje — Faza 2 (Google Calendar/Meet): tabela `google_calendar_connections`, `app/lib/google/*` (crypto AES-256-GCM, OAuth, klient Calendar, repo połączeń, orkiestracja sync), trasy OAuth połącz/rozłącz, sync wychodzący best-effort wpięty w mutacje, nowe env. 10 zadań + `/security-review`. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
