# scripts/ — skrypty operacyjne

Skrypty uruchamiane spoza serwera (przez `tsx`), głównie do bootstrapu bazy.

| Plik | Rola |
|---|---|
| `seed.ts` | Idempotentny seed (`npm run db:seed`). Tworzy **domyślnego trenera** z `SEED_TRAINER_EMAIL` / `SEED_TRAINER_PASSWORD` (≥8 znaków) / `SEED_TRAINER_NAME` (tylko gdy tabela `users` jest pusta). Opcjonalnie (gdy ustawione `BRAND_NAME` + `BRAND_ADMIN_EMAIL` + `BRAND_ADMIN_PASSWORD`) — idempotentny bootstrap tenancy marki: tworzy organizację, regiony PL i FR (idempotentnie) oraz konto `brand_admin`, backfill istniejących trenerów i podopiecznych do tej organizacji/regionu, a następnie **idempotentna promocja katalogu trenera-założyciela do marki** (`promoteTrainerCatalogToBrand` — własne, niesforkowane ćwiczenia/umiejętności + krawędzie prereq foundera stają się markowe IN PLACE, bez zmiany id). Sterowany env: `BRAND_NAME`, `BRAND_ADMIN_EMAIL`, `BRAND_ADMIN_PASSWORD`, `BRAND_ADMIN_NAME` (opcjonalne; domyślnie = `BRAND_NAME`). **Nie** seeduje ćwiczeń — bibliotekę trener buduje w UI. Hasło trenera/admina trzeba zmienić po pierwszym logowaniu. |
| `shots.ts` | Screenshot-loop (`npm run shots [-- /trasa ...]`). Loguje się jako seedowany trener (`SEED_TRAINER_EMAIL`/`PASSWORD`), renderuje trasy na viewportach desktop+mobile i zapisuje PNG do `screenshots/` (gitignore). Wymaga działającego dev servera + Postgresa oraz jednorazowo `npx playwright install chromium`. |
| `shots.manifest.ts` | Lista docelowych tras (`{ path, role }`) dla pełnego przebiegu `npm run shots`. |
| `shots-lib.ts` | Czyste funkcje narzędzia (slug, parser argów, filtr manifestu); pokryte `shots-lib.test.ts`. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
