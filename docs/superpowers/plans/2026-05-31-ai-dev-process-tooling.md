# Proces AI-developmentu — plan wdrożenia narzędzia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Adaptacja do projektu:** to praca konfiguracyjno-dokumentacyjna (skill/commandy/markdown/JSON), nie kod aplikacji — dlatego **bez TDD** (brak logiki do testowania) i **bez gita** (commity zastępuje handoff §Task 9; git wykonuje właściciel). Bramki statyczne (`npm run typecheck/lint/build`) **nie dotyczą** plików `.claude/**` ani `docs/**`, więc nie uruchamiamy ich w tym planie.

**Goal:** Wdrożyć powtarzalny proces AI-developmentu jako skill `kalisthenos-dev-flow` + commandy `/feature` i `/fix`, wraz z konfiguracją i aktualizacją dokumentacji/pamięci.

**Architecture:** Orkiestrator-skill trzyma całą logikę procesu (ścieżki FEATURE/FIX, TDD, review-per-task, bramki, handoff, reguły projektowe). Commandy to cienkie wejścia delegujące do skilla. `.gitignore` odsłania `.claude/skills|commands|settings.json` do wersjonowania. `CLAUDE.md`/`README.md`/pamięć aktualizowane pod nową normę (TDD + review-per-task).

**Tech Stack:** Claude Code skills (`SKILL.md` + frontmatter), slash commands (markdown + frontmatter), `.claude/settings.json`, Markdown.

**Źródło prawdy:** [`../specs/2026-05-31-ai-dev-process-design.md`](../specs/2026-05-31-ai-dev-process-design.md).

---

## Mapa plików

| Plik | Odpowiedzialność |
|---|---|
| `.gitignore` | Odsłonięcie katalogów `.claude/skills/`, `.claude/commands/` i `.claude/settings.json`. |
| `.claude/settings.json` | Współdzielona allowlista bezpiecznych komend pętli (test/typecheck/lint/build). |
| `.claude/skills/kalisthenos-dev-flow/SKILL.md` | Orkiestrator — cała logika procesu. |
| `.claude/commands/feature.md` | Wejście ścieżki FEATURE. |
| `.claude/commands/fix.md` | Wejście ścieżki FIX. |
| `CLAUDE.md` | Sekcja „Proces AI-developmentu" + odwrócenie dwóch konwencji. |
| `README.md` (root) | Komendy testowe w „Useful commands". |
| `C:\Users\Mateusz\.claude\projects\D--praca-calisthenos\memory\feedback_no_tests.md` | Zamiana zasady na „TDD jest normą". |
| `C:\Users\Mateusz\.claude\projects\D--praca-calisthenos\memory\feedback_code_first_review_last.md` | Zamiana zasady na „review per task". |
| `…\memory\MEMORY.md` | Aktualizacja dwóch wpisów indeksu. |

---

## Task 1: Odsłonić `.claude` w `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Zamień wpis ignorujący cały `.claude/`**

Znajdź w sekcji `# IDE`:

```
.claude/
```

Zamień na:

```
# Claude Code — ignoruj lokalne, wersjonuj współdzielone
.claude/*
!.claude/skills/
!.claude/commands/
!.claude/settings.json
.claude/settings.local.json
```

- [ ] **Step 2: Weryfikacja**

Sprawdź, że `.gitignore` zawiera powyższy blok i nie zawiera już gołego `.claude/`. (Efekt w gicie zweryfikuje właściciel przy `git status` w Task 9.)

---

## Task 2: Współdzielona allowlista komend

**Files:**
- Create: `.claude/settings.json`

- [ ] **Step 1: Utwórz `.claude/settings.json`**

```json
{
  "permissions": {
    "allow": [
      "Bash(npm test)",
      "Bash(npm run test:unit)",
      "Bash(npm run typecheck)",
      "Bash(npm run lint)",
      "Bash(npm run build)",
      "PowerShell(npm test)",
      "PowerShell(npm run test:unit)",
      "PowerShell(npm run typecheck)",
      "PowerShell(npm run lint)",
      "PowerShell(npm run build)"
    ]
  }
}
```

- [ ] **Step 2: Weryfikacja**

Plik to poprawny JSON (brak trailing comma). Nie dubluje wpisów z `settings.local.json` (tam są `npm run *`, `npm install *`, drizzle generate — zostają lokalne).

---

## Task 3: Orkiestrator-skill `kalisthenos-dev-flow`

**Files:**
- Create: `.claude/skills/kalisthenos-dev-flow/SKILL.md`

- [ ] **Step 1: Utwórz `SKILL.md` z frontmatter i pełną treścią**

```markdown
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
- UI po polsku; aktualizuj README katalogu / `CLAUDE.md`.

## Handoff (granica gita — ZAWSZE na końcu)

Zatrzymaj się przed gitem i wypisz:
- podsumowanie + lista zmienionych plików,
- proponowany komunikat commita (tekst, bez wykonania),
- notatki: czy `npm run db:generate`/`db:migrate`, seed, nowe env,
- lista testów do odpalenia pod Dockerem (komendy),
- sugerowana ścieżka ręcznej weryfikacji w aplikacji.
Właściciel: branch/commit/push/migrate/deploy.
```

- [ ] **Step 2: Weryfikacja**

Frontmatter ma `name` zgodny z nazwą katalogu (`kalisthenos-dev-flow`) i `description` z triggerami (feature/fix/zmiana). Markdown bez zerwanych nagłówków. Zagnieżdżony blok ```` ```markdown ```` zamknięty poprawnie.

---

## Task 4: Command `/feature`

**Files:**
- Create: `.claude/commands/feature.md`

- [ ] **Step 1: Utwórz `feature.md`**

```markdown
---
description: Uruchom proces FEATURE (brainstorm → spec → plan → TDD+review → bramki → handoff) dla kalisthenos.
argument-hint: <krótki opis feature'a>
---

Wejdź w skill `kalisthenos-dev-flow` w trybie **FEATURE** i poprowadź pełną
ścieżkę dla zadania opisanego jako:

$ARGUMENTS

Trzymaj się zasad-fundamentów (nigdy git/docker, npm, TDD, review per task,
handoff na końcu). Jeśli opis okaże się drobną zmianą/bugfixem — zaproponuj
przejście na `/fix`.
```

- [ ] **Step 2: Weryfikacja**

Frontmatter poprawny; `$ARGUMENTS` obecne; treść deleguje do skilla.

---

## Task 5: Command `/fix`

**Files:**
- Create: `.claude/commands/fix.md`

- [ ] **Step 1: Utwórz `fix.md`**

```markdown
---
description: Uruchom proces FIX (debug → fix → review → bramki → handoff) dla kalisthenos.
argument-hint: <opis błędu / drobnej zmiany>
---

Wejdź w skill `kalisthenos-dev-flow` w trybie **FIX** i poprowadź lekką ścieżkę
dla zadania opisanego jako:

$ARGUMENTS

Jeśli to bug — zacznij od `superpowers:systematic-debugging` (root-cause przed
poprawką). Zachowaj bramki (typecheck/lint/build, testy jednostkowe,
`/code-review`) i zakończ handoffem. Jeśli zakres okaże się dużym feature'em —
zaproponuj przejście na `/feature`.
```

- [ ] **Step 2: Weryfikacja**

Frontmatter poprawny; `$ARGUMENTS` obecne; treść deleguje do skilla.

---

## Task 6: Sekcja procesu + odwrócenie konwencji w `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Odwróć zasadę testów**

Znajdź punkt:

```
- **Brak testów automatycznych w tym projekcie** (decyzja właściciela). Nie pisz
  `*.test.ts` / `*.itest.ts` / `*.spec.ts`; review nie zgłasza braku coverage.
  (Pliki konfiguracyjne Vitest/Playwright zostają, ale testów nie dopisujemy.)
```

Zamień na:

```
- **TDD jest normą.** Logikę testowalną bez DB piszemy test-first (`*.test.ts`,
  Vitest, `npm test`). Testy integracyjne (`*.itest.ts`, testcontainers) piszemy
  dla krytycznych przepływów (auth, publish planu, zapis logu, tenant-scope) i
  uruchamia je właściciel (Docker). Szczegóły: proces AI-developmentu poniżej.
```

- [ ] **Step 2: Odwróć zasadę kolejności review**

W tej samej sekcji „Kluczowe konwencje" dodaj punkt zaraz po zasadzie TDD:

```
- **Review per task.** Po każdym kroku implementacji robimy przegląd
  (`/code-review` / `superpowers:requesting-code-review`) przed kolejnym — nie
  jeden przegląd na końcu.
```

- [ ] **Step 3: Dodaj sekcję „Proces AI-developmentu"**

Wstaw przed sekcją „⚠️ Zasada utrzymania dokumentacji":

```
## Proces AI-developmentu (jak wchodzą zmiany)

Każda zmiana idzie powtarzalnym procesem zakodowanym jako skill
`kalisthenos-dev-flow` + commandy:

- **`/feature <opis>`** — nowy feature: brainstorm → spec → plan → implementacja
  TDD z review per task → bramki → handoff.
- **`/fix <opis>`** — bugfix/drobna zmiana: debug → fix → review → bramki →
  handoff.

Bramki „done": `npm test` + `npm run typecheck` + `npm run lint` +
`npm run build`, `/code-review`, oraz `/security-review` gdy zmiana dotyka
auth / `trainer_id` / podpisanych URL / uploadu. Claude nigdy nie dotyka gita ani
Dockera — proces kończy się handoffem (opis commita, migracji, testów do
odpalenia). Pełny opis:
[`docs/superpowers/specs/2026-05-31-ai-dev-process-design.md`](docs/superpowers/specs/2026-05-31-ai-dev-process-design.md).
```

- [ ] **Step 4: Weryfikacja**

Stary punkt o braku testów zniknął; nowe punkty (TDD, review per task) i sekcja procesu obecne; link do spec poprawny.

---

## Task 7: Komendy testowe w root `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Dodaj komendy testowe do „Useful commands"**

W bloku ```` ```bash ```` sekcji „Useful commands", po linii `npm run dev …`, dodaj:

```
npm test              # vitest (testy jednostkowe)
npm run test:unit     # vitest run, bez *.itest.ts
npm run test:itest    # vitest integracyjne (*.itest.ts) — wymaga Dockera/Postgresa
npm run e2e           # playwright (E2E) — wymaga uruchomionej aplikacji
```

- [ ] **Step 2: Weryfikacja**

Komendy dopisane w bloku; reszta README bez zmian.

---

## Task 8: Aktualizacja pamięci pod nową normę

**Files:**
- Modify: `C:\Users\Mateusz\.claude\projects\D--praca-calisthenos\memory\feedback_no_tests.md`
- Modify: `C:\Users\Mateusz\.claude\projects\D--praca-calisthenos\memory\feedback_code_first_review_last.md`
- Modify: `C:\Users\Mateusz\.claude\projects\D--praca-calisthenos\memory\MEMORY.md`

- [ ] **Step 1: Zastąp treść `feedback_no_tests.md`**

```markdown
---
name: tdd-is-the-norm
description: TDD is the project norm — write unit tests test-first; integration tests for critical flows, run by the owner.
metadata:
  type: feedback
---

TDD jest normą w kalisthenos (zmiana decyzji z 2026-05-31, wcześniej było „zero testów"). Logikę testowalną bez DB piszemy test-first jako `*.test.ts` (Vitest). Testy integracyjne `*.itest.ts` (testcontainers/Postgres) piszemy tylko dla krytycznych przepływów (auth, publish planu, zapis logu, tenant-scope) i uruchamia je właściciel (Docker).

**Why:** Właściciel uznał TDD za najbezpieczniejszą siatkę przy braku innych gwarancji.
**How to apply:** W ścieżkach `/feature` i `/fix` rób pętlę red-green dla logiki bez DB; testy z Postgresem pisz, ale nie uruchamiaj (Docker po stronie właściciela). Patrz [[review-per-task]] i proces `kalisthenos-dev-flow`.
```

> Uwaga: zmiana `name` w frontmatter wymaga aktualizacji wpisu w `MEMORY.md` (Step 3). Plik fizycznie zostaje pod tą samą ścieżką.

- [ ] **Step 2: Zastąp treść `feedback_code_first_review_last.md`**

```markdown
---
name: review-per-task
description: Review per task — after each implementation step run code review before the next; not one review at the end.
metadata:
  type: feedback
---

Review per task (zmiana decyzji z 2026-05-31, wcześniej było „code-first, review-last"). Po każdym kroku implementacji robimy przegląd (`/code-review` lub `superpowers:requesting-code-review`) i nanosimy poprawki, zanim ruszymy dalej.

**Why:** Wcześniejsze łapanie błędów; zgodne z natywnym trybem superpowers.
**How to apply:** W ścieżce `/feature` przeglądaj diff po każdym tasku planu. Patrz [[tdd-is-the-norm]] i proces `kalisthenos-dev-flow`.
```

- [ ] **Step 3: Zaktualizuj dwa wpisy w `MEMORY.md`**

Znajdź linie:

```
- [Code-first, review-last](feedback_code_first_review_last.md) — When implementing a plan, write all production code first, defer tests/reviews/run-the-app to a single final pass.
```
```
- [No automated tests](feedback_no_tests.md) — Project-wide: skip unit/integration/E2E tests entirely. Never write `*.test.ts` / `*.itest.ts` / `*.spec.ts`. Reviews don't flag missing coverage.
```

Zamień (zachowując nazwy plików) na:

```
- [Review per task](feedback_code_first_review_last.md) — Po każdym kroku implementacji rób code review przed kolejnym; nie jeden przegląd na końcu.
```
```
- [TDD is the norm](feedback_no_tests.md) — Pisz unit testy test-first; integracyjne dla krytycznych przepływów uruchamia właściciel (Docker).
```

- [ ] **Step 4: Weryfikacja**

Oba pliki feedback mają nowy frontmatter i treść; `MEMORY.md` wskazuje nowe opisy; linki `[[…]]` spójne. Brak innego wpisu w `MEMORY.md` opisującego „brak testów"/„code-first".

---

## Task 9: Weryfikacja końcowa i handoff

**Files:** — (bez zmian; krok weryfikacyjny)

- [ ] **Step 1: Walidacja artefaktów**

Potwierdź istnienie i poprawność:
- `.claude/settings.json` (poprawny JSON),
- `.claude/skills/kalisthenos-dev-flow/SKILL.md` (frontmatter `name`+`description`),
- `.claude/commands/feature.md`, `.claude/commands/fix.md` (frontmatter + `$ARGUMENTS`),
- `.gitignore` (blok odsłaniający `.claude`),
- `CLAUDE.md`, root `README.md`, oba pliki pamięci + `MEMORY.md` zaktualizowane.

- [ ] **Step 2: Dymny test triggerowania**

W nowej sesji (lub po `/reload-plugins`) sprawdź, że `/feature` i `/fix` są na liście komend, a skill `kalisthenos-dev-flow` pojawia się w dostępnych skillach. (Nie uruchamiaj pełnej ścieżki — to dymny test.)

- [ ] **Step 3: Handoff do właściciela**

Wypisz:
- listę utworzonych/zmienionych plików,
- proponowany komunikat commita, np.:
  `chore(process): add kalisthenos-dev-flow skill + /feature /fix commands, flip to TDD + review-per-task`,
- przypomnienie: scommituj `.claude/skills`, `.claude/commands`, `.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `README.md`, oraz spec/plan w `docs/` (pliki pamięci są poza repo),
- info, że nie ma migracji/seed/env do ruszenia,
- sugestia: po commicie odpal `fewer-permission-prompts`, by dobić allowlistę.

---

## Self-review (pokrycie spec)

- §3 architektura → Tasks 2–5. §4 FEATURE / §5 FIX / §6 testy / §7 bramki / §8
  handoff / §9 reguły → wbudowane w SKILL.md (Task 3). §11 artefakty → Tasks 1–8.
  §12 pluginy → Task 9 Step 3 (fewer-permission-prompts). §13 zmiana konwencji i
  pamięci → Tasks 6, 8. §14 kryteria akceptacji → Task 9. Brak luk.
- Placeholdery: brak — wszystkie pliki mają pełną treść.
- Spójność nazw: skill `kalisthenos-dev-flow` (katalog = `name`), commandy
  `/feature` `/fix`, memory `tdd-is-the-norm` + `review-per-task` (z linkami
  `[[…]]`) — spójne w całym planie.
