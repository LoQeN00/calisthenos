# scripts/ — skrypty operacyjne

Skrypty uruchamiane spoza serwera (przez `tsx`), głównie do bootstrapu bazy.

| Plik | Rola |
|---|---|
| `seed.ts` | Idempotentny seed (`npm run db:seed`). Tworzy **wyłącznie domyślnego trenera** z `SEED_TRAINER_EMAIL` / `SEED_TRAINER_PASSWORD` (≥8 znaków) / `SEED_TRAINER_NAME`, i tylko gdy tabela `users` jest pusta. **Nie** seeduje ćwiczeń — bibliotekę trener buduje w UI. Hasło trzeba zmienić po pierwszym logowaniu. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
