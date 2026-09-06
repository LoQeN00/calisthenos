# scripts/ — skrypty operacyjne

Skrypty uruchamiane spoza serwera (przez `tsx`).

`seed.ts` zniknął w segmencie S6 razem z bazą po stronie FE: konta zakłada dziś
BE (własny seeder w `calisthenos-be`), a FE nie ma czego ani czym zasiewać.

| Plik | Rola |
|---|---|
| `shots.ts` | Screenshot-loop (`npm run shots [-- /trasa ...]`). Loguje się kontem trenera z `SEED_TRAINER_EMAIL`/`PASSWORD` (konto zakłada seeder BE), renderuje trasy na viewportach desktop+mobile i zapisuje PNG do `screenshots/` (gitignore). Wymaga działającego dev servera FE i BE oraz jednorazowo `npx playwright install chromium`. |
| `shots.manifest.ts` | Lista docelowych tras (`{ path, role }`) dla pełnego przebiegu `npm run shots`. |
| `shots-lib.ts` | Czyste funkcje narzędzia (slug, parser argów, filtr manifestu); pokryte `shots-lib.test.ts`. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
