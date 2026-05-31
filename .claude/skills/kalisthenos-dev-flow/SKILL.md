---
name: kalisthenos-dev-flow
description: Powtarzalny proces wprowadzania zmian w kalisthenos. Użyj na początku KAŻDEGO zadania implementacyjnego w tym repo — dodania feature'a, budowy widoku/trasy/komponentu, zmiany schematu, oraz bugfixów. Wymusza ścieżki FEATURE i FIX, TDD (jednostkowy), review per task, bramki jakości i handoff na granicy gita. Triggeruj gdy użytkownik prosi o nową funkcję, zmianę zachowania lub naprawę błędu w kalisthenos.
---

# kalisthenos — proces developmentu

Wykonywalny proces dla tego repo. Pełny opis i uzasadnienia:
`docs/superpowers/specs/2026-05-31-ai-dev-process-design.md`.

## Zasady-fundamenty (ZAWSZE)

- **Nigdy git.** Żadnych operacji git — kończysz handoffem (poniżej). Git robi właściciel.
- **Nigdy docker.** Nie uruchamiasz `docker compose` ani testów wymagających Dockera (testcontainers/Playwright) — uruchamia je właściciel.
- **npm**, nie pnpm.
- **Context7 (MCP) gdzie tylko się da.** Po aktualną dokumentację i best
  practices bibliotek (React Router v7, Drizzle, Zod, postgres-js,
  vite-plugin-pwa, @node-rs/argon2…) sięgaj przez MCP `context7` — w brainstormie,
  planie i implementacji, zamiast zgadywać API z pamięci.
- **TDD** dla logiki testowalnej bez DB. **Review per task.**
- **UI po polsku**; brand `kalisthenos` małą literą.
- Aktualizacja dokumentacji (README katalogu / `CLAUDE.md`) jest częścią „done".

## Wybór ścieżki

- **FEATURE** — nowe zachowanie/powierzchnia produktu → pełna ceremonia.
- **FIX** — bugfix/drobna zmiana → bez spec/planu, bramki zostają.
Niejasne? Dopytaj jednym pytaniem; przy wątpliwości traktuj jak FEATURE.

## Ścieżka FEATURE

1. **Bramka poziomu** — potwierdź, że to feature; jeśli drobiazg → przejdź do FIX.
2. **Brainstorm** — `superpowers:brainstorming` → zapis spec do
   `docs/superpowers/specs/YYYY-MM-DD-<temat>-design.md`. NIE commituj.
3. **Plan** — `superpowers:writing-plans` → plan do
   `docs/superpowers/plans/YYYY-MM-DD-<temat>.md`. Do każdego tasku dopisz:
   plan testów jednostkowych, flagę krytycznego przepływu (auth/publish/zapis
   logu/tenant-scope → test integracyjny), oraz checklistę projektową (sekcja
   „Reguły projektowe").
4. **Implementacja task-po-tasku** — `superpowers:executing-plans` lub
   `superpowers:subagent-driven-development`:
   - TDD bez DB: failujący `npm test` → implementacja → zielony → refactor.
   - Logika DB/tras: implementacja wprost; dla krytycznych przepływów PISZ test
     integracyjny (`*.itest.ts`), ale go NIE uruchamiaj (Docker) — oznacz „do
     uruchomienia".
   - **Frontend/UI-UX:** jeśli zmiana dodaje lub modyfikuje warstwę wizualną
     (widok, komponent, layout, stylowanie), użyj skilla
     `frontend-design:frontend-design` do projektu i implementacji UI.
   - Review per task: `superpowers:requesting-code-review` → poprawki
     (`superpowers:receiving-code-review`) → następny task.
5. **Bramki końcowe** (poniżej).
6. **Handoff** (poniżej).

## Ścieżka FIX

1. Bug? → `superpowers:systematic-debugging` (root-cause). Jeśli logika
   testowalna bez DB — napisz failujący test jednostkowy odtwarzający błąd, potem
   fix do zielonego.
2. Implementacja poprawki.
3. Review zmiany (`/code-review`).
4. Bramki (wariant FIX). 5. Handoff.

## Polityka testów

- W pętli (bez Dockera): jednostkowe `*.test.ts` (Vitest, `npm test` /
  `npm run test:unit`) dla logiki bez DB: `lib/format.ts`, podpisy w
  `lib/files.ts`, Zod w `lib/plan-types.ts`, czyste funkcje w `lib/stats.ts` /
  `lib/wrapped.ts`, `normalizeTags`, `normalizeCategoryName`, `extForMime`.
- Integracyjne `*.itest.ts` (testcontainers): tylko krytyczne przepływy; PISZ,
  uruchamia właściciel.

## Bramki „done" (z dowodem — `superpowers:verification-before-completion`)

FEATURE — wszystkie zielone:
1. `npm test` (jednostkowe) 2. `npm run typecheck` 3. `npm run lint`
4. `npm run build` 5. dokumentacja zaktualizowana 6. `/code-review` na diffie
7. `/security-review` jeśli auth/`trainer_id`/podpisane URL/upload
8. testy integracyjne/E2E: zaraportuj i poproś właściciela o uruchomienie.

FIX: 1–4 + `/code-review`; `/security-review` warunkowo; docs jeśli zmiana treści.

Nie twierdź „gotowe" bez zielonego wyniku komendy.

## Reguły projektowe (pilnuj w planie i implementacji)

- Tenant-scope: funkcje repo przyjmują wymagany `trainerId`/`traineeId`; brak
  autoryzacji → 404.
- Trasy: nowa/zmieniona = plik + wpis w `app/routes.ts`.
- Schemat = źródło prawdy: edytuj `app/lib/db/schema.ts`, potem
  `npm run db:generate`; nigdy ręcznie `migrations/`.
- Pliki: tylko przez `FileStorage` + podpisane URL-e; upload przez `uploadFile`.
- Loadery czytają, akcje mutują; mutacje plikowe = `multipart/form-data`.
- **Frontend/UI-UX → `frontend-design:frontend-design`.** Każda zmiana dotykająca
  warstwy wizualnej (nowy/zmieniony widok, komponent, layout, stylowanie) idzie
  przez ten skill; trzymaj się design-systemu (`design-system/README.md`,
  `app/styles/tokens.css`) i polskiego UI.
- UI po polsku; aktualizuj README katalogu / `CLAUDE.md`.

## Handoff (granica gita — ZAWSZE na końcu)

Zatrzymaj się przed gitem i wypisz:
- podsumowanie + lista zmienionych plików,
- proponowany komunikat commita (tekst, bez wykonania),
- notatki: czy `npm run db:generate`/`db:migrate`, seed, nowe env,
- lista testów do odpalenia pod Dockerem (komendy),
- sugerowana ścieżka ręcznej weryfikacji w aplikacji.
Właściciel: branch/commit/push/migrate/deploy.
