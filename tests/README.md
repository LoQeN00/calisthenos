# tests/ — testy przez sieć

**Testy integracyjne `*.itest.ts` zniknęły w segmencie S6** razem z bazą po
stronie FE: stały na testcontainerach i realnym Postgresie, a FE nie ma już
czego integrować — dane bierze z kontraktu BE. Ich rolę przejęły dwie rzeczy:

- **testy modułów `app/lib/*.test.ts`** przeciw podstawionemu klientowi
  (`createApiClient` z podstawionym `fetch`) — kontrakt jest typowany, więc
  atrapa nie rozjedzie się z prawdą w ciszy;
- **Playwright przeciw prawdziwemu BE** dla przepływów, które muszą przejść
  przez sieć: logowanie z rotacją tokenu, publikacja planu, zapis treningu,
  zakres tenanta, bramka formularza startowego (spec integracji §10).

Katalog `tests/e2e/` (wskazywany przez `playwright.config.ts`, uruchamiany
przez `npm run e2e`) jest na te testy przygotowany, ale **jeszcze pusty** —
powstają po cutoverze, gdy będzie przeciw czemu je uruchamiać.

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
