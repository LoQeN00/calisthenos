# scripts/ — skrypty operacyjne

Skrypty uruchamiane spoza serwera (przez `tsx`), głównie do bootstrapu bazy.

| Plik | Rola |
|---|---|
| `seed.ts` | Idempotentny seed (`npm run db:seed`). Tworzy **wyłącznie domyślnego trenera** z `SEED_TRAINER_EMAIL` / `SEED_TRAINER_PASSWORD` (≥8 znaków) / `SEED_TRAINER_NAME`, i tylko gdy tabela `users` jest pusta. **Nie** seeduje ćwiczeń — bibliotekę trener buduje w UI. Hasło trzeba zmienić po pierwszym logowaniu. |
| `shots.ts` | Screenshot-loop (`npm run shots [-- /trasa ...]`). Loguje się jako seedowany trener (`SEED_TRAINER_EMAIL`/`PASSWORD`), renderuje trasy na viewportach desktop+mobile i zapisuje PNG do `screenshots/` (gitignore). Wymaga działającego dev servera + Postgresa oraz jednorazowo `npx playwright install chromium`. |
| `shots.manifest.ts` | Lista docelowych tras (`{ path, role }`) dla pełnego przebiegu `npm run shots`. |
| `shots-lib.ts` | Czyste funkcje narzędzia (slug, parser argów, filtr manifestu); pokryte `shots-lib.test.ts`. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
