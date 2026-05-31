# Proces AI-developmentu w kalisthenos — projekt (design spec)

**Status:** zaakceptowany w sesji brainstormingu (2026-05-31), czeka na review pliku
**Autor:** Mateusz Kozłowski (z Claude)
**Data:** 2026-05-31

> Ten dokument jest **źródłem prawdy** dla powtarzalnego, bezpiecznego procesu
> wprowadzania zmian w kalisthenos przez agenta AI (Claude Code). Wykonywalnym
> kodowaniem tego procesu jest skill `kalisthenos-dev-flow` + commandy `/feature`
> i `/fix`. Gdy zmienia się proces — edytuj ten plik **oraz** skill (reguła
> utrzymania dokumentacji z `CLAUDE.md`).

---

## 1. Cel i kontekst

Chcemy, żeby **każdy feature i każda poprawka wchodziły dokładnie tak samo** —
proces ma być powtarzalny, bezpieczny i niezależny od chwili/nastroju. Bazujemy
na zainstalowanym pluginie **superpowers** (jego natywny tryb to TDD +
review-checkpointy), dopasowując go do twardych zasad projektu.

Decyzje z sesji:

| Wymiar | Decyzja |
|---|---|
| Kręgosłup | Adaptowany **superpowers** (re-używamy fazy, nadpisujemy sprzeczne kawałki). |
| Poziomy | Dwa: **FEATURE** (pełny) i **FIX** (lekki, bramki zostają). |
| Forma | **Orkiestrator-skill** + cienkie commandy `/feature` `/fix` + ten dokument. |
| Przód FEATURE | Pełny ślad: **spec** (`docs/superpowers/specs/`) + **plan** (`docs/superpowers/plans/`). |
| Jakość | **TDD** (jednostkowy w pętli) + **review per task**. |
| Bramki „done" | typecheck + lint + build + testy jednostkowe; `/code-review`; `/security-review` warunkowo. |

---

## 2. Zasady-fundamenty (twarde ograniczenia)

Obowiązują w obu ścieżkach, zawsze:

- **Git prowadzi właściciel.** Claude **nigdy** nie uruchamia operacji git
  (init/add/commit/branch/merge/push/tag…). Proces kończy się na granicy gita
  handoffem (§8).
- **Docker prowadzi właściciel.** Claude nie uruchamia `docker compose
  up/down/build`. Testy wymagające Postgresa (testcontainers) / przeglądarki
  (Playwright) uruchamia właściciel (§6).
- **npm, nie pnpm.** `npm install`, `npm run <skrypt>`, `npx`.
- **Context7 (MCP) gdzie tylko się da.** Po aktualną dokumentację i best
  practices bibliotek (React Router v7, Drizzle, Zod, postgres-js,
  vite-plugin-pwa, @node-rs/argon2…) sięgamy przez MCP `context7` — w brainstormie,
  planie i implementacji, zamiast zgadywać API z pamięci. Wymaga podłączonego
  serwera MCP `context7` (§12).
- **TDD jest normą** (zmiana zasady — patrz §13). Logikę testowalną bez DB
  piszemy test-first.
- **Review per task** (zmiana zasady — patrz §13). Przegląd po każdym kroku, nie
  jeden na końcu.
- **UI po polsku**; brand `kalisthenos` małą literą; angielskie tylko nazwy
  ćwiczeń.
- **Reguła utrzymania dokumentacji** z `CLAUDE.md` jest częścią definicji
  „done".

---

## 3. Architektura narzędzia

```
.claude/skills/kalisthenos-dev-flow/SKILL.md   ← orkiestrator (cała logika)
.claude/commands/feature.md                    ← cienkie wejście → skill (tryb FEATURE)
.claude/commands/fix.md                        ← cienkie wejście → skill (tryb FIX)
docs/.../2026-05-31-ai-dev-process-design.md   ← ten dokument (ludzkie źródło prawdy)
```

- **Skill** zawiera *jedną prawdę*: obie ścieżki, politykę testów, bramki, reguły
  projektowe, handoff. Odpala się też automatycznie, gdy opiszesz zadanie bez
  komendy.
- **Commandy** to 3-linijkowe wejścia: ustawiają tryb (FEATURE/FIX), przekazują
  `$ARGUMENTS` jako opis zadania i delegują do skilla. Zero duplikacji logiki.
- **Dokument** (ten plik) jest linkowany z `CLAUDE.md`.

---

## 4. Ścieżka FEATURE — `/feature <opis>`

Dla nowego zachowania / nowej powierzchni produktu.

1. **Bramka poziomu.** Potwierdź, że to feature. Jeśli to drobiazg/bugfix →
   odeślij do `/fix`.
2. **Brainstorm** (`superpowers:brainstorming`) → interaktywne doprecyzowanie →
   zapis **spec** do `docs/superpowers/specs/YYYY-MM-DD-<temat>-design.md`.
   *Override:* Claude **zapisuje plik, ale go nie commituje** — git robi
   właściciel (§8).
3. **Plan** (`superpowers:writing-plans`) → **plan** do
   `docs/superpowers/plans/YYYY-MM-DD-<temat>.md`. Każdy task w planie ma:
   - *plan testów jednostkowych* (co testujemy bez DB),
   - flagę *czy dotyka krytycznego przepływu* (auth / publish planu / zapis logu
     / tenant-scope) → wtedy piszemy też test integracyjny,
   - **checklistę projektową** (§9).
4. **Implementacja task-po-tasku** (`superpowers:executing-plans` lub
   `subagent-driven-development`, tryb natywny z TDD + review):
   - **TDD** dla logiki testowalnej bez DB: napisz failujący test (Vitest) →
     `npm test` (czerwony) → implementacja → zielony → refactor.
   - Logika DB/tras (Drizzle, loadery/akcje): implementacja wprost; dla
     krytycznych przepływów **piszemy** test integracyjny (testcontainers), ale
     **go nie uruchamiamy** (Docker) — oznaczamy „do uruchomienia" (§6, §8).
   - **Review per task** po każdym tasku (`superpowers:requesting-code-review`
     lub `/code-review`) → poprawki (`superpowers:receiving-code-review`) →
     dopiero następny task.
   - Reguły projektowe (§9) stosowane na bieżąco.
5. **Bramki końcowe** (§7).
6. **Handoff** (§8).

---

## 5. Ścieżka FIX — `/fix <opis>`

Dla bugfixów i drobnych zmian. Bez spec i planu.

1. **Diagnoza.** Jeśli bug → `superpowers:systematic-debugging` (najpierw
   root-cause). Jeśli logika jest testowalna bez DB → **napisz failujący test
   jednostkowy odtwarzający błąd**, potem fix do zielonego.
2. **Implementacja** poprawki.
3. **Review** zmiany (zwykle jeden task = jeden przegląd `/code-review`).
4. **Bramki — wariant FIX** (§7).
5. **Handoff** (§8).

---

## 6. Polityka testów (TDD + granica Dockera)

- **W pętli TDD u Claude (bez Dockera):** testy **jednostkowe** (Vitest,
  `npm test` / `npm run test:unit`) dla logiki bez DB — m.in. `lib/format.ts`,
  podpisy URL w `lib/files.ts`, schematy Zod w `lib/plan-types.ts`, czyste
  funkcje w `lib/stats.ts` / `lib/wrapped.ts` (`computeStreak`, archetypy,
  `parseYM`…), `normalizeTags`, `normalizeCategoryName`, `extForMime`.
- **Integracyjne (testcontainers + Postgres):** piszemy **tylko** dla
  krytycznych przepływów (logowanie, konsumpcja zaproszenia, publish/wersjonowanie
  planu, zapis logu treningu, odmowa cross-tenant). Traktowane jako
  **opcjonalne/końcowe** — Claude je tworzy, **uruchamia właściciel** (Docker).
- **E2E (Playwright):** poza domyślną pętlą; opcjonalnie dla największych
  przepływów, uruchamiane przez właściciela.
- Nazewnictwo: testy jednostkowe `*.test.ts`, integracyjne `*.itest.ts` (zgodnie
  z istniejącymi skryptami `test:unit` / `test:itest`).

---

## 7. Bramki „done"

**FEATURE — wszystkie zielone, z dowodem (`superpowers:verification-before-completion`):**

1. `npm test` (jednostkowe) — zielone.
2. `npm run typecheck` (tsc strict).
3. `npm run lint` (Biome; w razie potrzeby `npm run format`).
4. `npm run build`.
5. **Dokumentacja** zaktualizowana wg reguły z `CLAUDE.md` (README katalogu /
   mapa / sekcje przekrojowe).
6. `/code-review` na całości diffu (ponad review per-task) → triage findings.
7. `/security-review` **jeśli** zmiana dotyka auth / `trainer_id` / podpisanych
   URL / uploadu plików.
8. Testy integracyjne/E2E: Claude raportuje, które napisał, i **prosi
   właściciela o uruchomienie pod Dockerem** przed mergem.

**FIX:** punkty 1–4 + `/code-review`; `/security-review` warunkowo;
dokumentacja, jeśli zmieniła się treść/zachowanie.

Zasada: **żadnego twierdzenia „gotowe" bez zielonego dowodu** (wynik komendy).

---

## 8. Handoff (granica gita)

Claude zatrzymuje się przed gitem i wypisuje:

- podsumowanie zmiany + **lista zmienionych plików**,
- **proponowany komunikat commita** (tekst — bez wykonania gita),
- notatki migracji (czy trzeba `npm run db:generate` / `npm run db:migrate`),
  seed, nowe zmienne env,
- **lista testów do odpalenia pod Dockerem** (integracyjne/E2E) z komendami,
- sugerowana ścieżka **ręcznej weryfikacji** w aplikacji.

Właściciel wykonuje: branch / commit / push / `db:migrate` / uruchomienie testów
docker / deploy.

---

## 9. Reguły projektowe wstrzykiwane do planu i implementacji

Te punkty trafiają do checklisty planu (FEATURE) i są pilnowane w implementacji
(obie ścieżki). Pełny opis: `CLAUDE.md` → „Kluczowe konwencje".

- **Tenant-scope:** funkcje repozytorium przyjmują wymagany `trainerId`/`traineeId`
  i filtrują po nim; brak autoryzacji → **404** (nie 403).
- **Trasy:** nowa/zmieniona trasa = plik + wpis w `app/routes.ts`; nazewnictwo
  `segment.$param.tsx`, `_index.tsx`, `_layout.tsx`.
- **Schemat = źródło prawdy:** zmiana modelu = edycja `app/lib/db/schema.ts`, potem
  `npm run db:generate`; **nigdy** ręczna edycja `migrations/`.
- **Pliki:** tylko przez `FileStorage` + podpisane URL-e (`signFileUrl`/
  `verifyFileUrl`, trasa `files/$fileId`); upload przez `uploadFile` z walidacją
  magic-bytes.
- **Loadery czytają, akcje mutują;** brak osobnego API; mutacje plikowe to
  `multipart/form-data`.
- **Frontend/UI-UX → `frontend-design`.** Jeśli zmiana dodaje lub modyfikuje
  warstwę wizualną (widok, komponent, layout, stylowanie), implementację UI
  prowadzi skill `frontend-design:frontend-design`, zgodnie z design-systemem
  (`design-system/README.md`, `app/styles/tokens.css`).
- **UI po polsku;** brand małą literą.
- **Aktualizacja dokumentacji** (README katalogu / `CLAUDE.md`) w tym samym kroku.

---

## 10. Mapowanie na skille superpowers

| Faza | Skill superpowers | Status |
|---|---|---|
| Doprecyzowanie | `brainstorming` | re-używamy; **override:** spec zapisany, nie commitowany. |
| Plan | `writing-plans` | re-używamy; wzbogacamy o checklistę projektową (§9) i plan testów (§6). |
| Implementacja | `executing-plans` / `subagent-driven-development` | re-używamy tryb natywny (TDD + review per task). |
| UI/UX | `frontend-design:frontend-design` | używamy gdy zmiana dotyka warstwy wizualnej (§9). |
| TDD | `test-driven-development` | aktywny dla logiki bez DB (§6). |
| Debug (FIX) | `systematic-debugging` | re-używamy. |
| Review | `requesting-code-review` / `receiving-code-review` | re-używamy per task + na końcu. |
| Weryfikacja | `verification-before-completion` | re-używamy (bramki §7). |
| Zakończenie | `finishing-a-development-branch` / `using-git-worktrees` | **nie używamy** — git/worktree po stronie właściciela; zastąpione handoffem (§8). |

---

## 11. Artefakty i zmiany konfiguracji

| Plik | Akcja |
|---|---|
| `.claude/skills/kalisthenos-dev-flow/SKILL.md` | nowy — orkiestrator. |
| `.claude/commands/feature.md`, `.claude/commands/fix.md` | nowe — cienkie wejścia. |
| `.claude/settings.json` | nowy (współdzielony) — allowlist komend pętli: `npm test`, `npm run typecheck/lint/build/test:unit`. |
| `.gitignore` | edycja — odsłonięcie `.claude/skills/`, `.claude/commands/`, `.claude/settings.json`; `settings.local.json` dalej ignorowany. |
| `.mcp.json` | nowy (współdzielony) — serwer MCP `context7` (hosted HTTP). |
| `CLAUDE.md` | edycja — sekcja „Proces AI-developmentu" + odwrócenie konwencji (§13). |
| `README.md` (root) | edycja lekka — komendy testowe w „Useful commands". |
| `docs/superpowers/specs/2026-05-31-ai-dev-process-design.md` | ten plik. |

---

## 12. Pluginy / tooling

- **Nie instalujemy nowych pluginów.** Dźwignia jest we własnym skillu +
  commandach, nie w kolejnych pluginach.
- **Używamy posiadanych:** `superpowers` (kręgosłup), `skill-creator` (budowa i
  strojenie naszego skilla, evale triggerowania), `frontend-design` (feature'y
  UI), wbudowane `/code-review`, `/security-review`, `/run`, `/verify`.
- **Context7 (MCP) — używamy gdzie tylko się da** po aktualną dokumentację i
  best practices bibliotek (§2). Wymaga podłączenia serwera MCP `context7`
  (np. `.mcp.json` w repo — współdzielone, wersjonowane). To jedyny dodatkowy
  serwer MCP, który włączamy.
- **Jednorazowo:** `fewer-permission-prompts`, by dobić allowlistę i nie
  przerywać pętli pytaniami o zgodę.
- **Opcjonalnie, NIE teraz:** Postgres-MCP / Playwright-MCP (żywa weryfikacja
  DB/przeglądarki) — wchodzą w granicę Docker/run, którą trzyma właściciel.

---

## 13. Zmiana konwencji i pamięci (odwrócenie dwóch zasad)

Ten proces **odwraca** dwie wcześniejsze decyzje właściciela. Przy wdrożeniu
aktualizujemy je we wszystkich miejscach:

- **„Zero testów automatycznych" → „TDD jest normą".** Edytujemy `CLAUDE.md`
  (sekcja konwencji), pamięć (`feedback_no_tests.md` → nowa norma TDD) i `MEMORY.md`.
  Piszemy `*.test.ts` (jednostkowe) zawsze, `*.itest.ts` dla krytycznych
  przepływów.
- **„Code-first, review-last" → „review per task".** Edytujemy pamięć
  (`feedback_code_first_review_last.md` → review-per-task) i `MEMORY.md`.

---

## 14. Kryteria akceptacji (kiedy proces jest wdrożony)

1. `/feature <opis>` uruchamia pełną ścieżkę §4 (brainstorm→spec→plan→TDD+review→
   bramki→handoff).
2. `/fix <opis>` uruchamia ścieżkę §5.
3. Skill `kalisthenos-dev-flow` zawiera całą logikę; commandy są cienkie.
4. `.gitignore` odsłania skille/commandy/`settings.json`; te pliki są w repo
   (po commicie właściciela).
5. `CLAUDE.md` ma sekcję „Proces AI-developmentu" i odwrócone konwencje;
   pamięć i `MEMORY.md` zaktualizowane.
6. Handoff nigdy nie wykonuje gita ani Dockera — tylko je opisuje.

---

## 15. Poza zakresem

- Automatyczne uruchamianie testów integracyjnych/E2E przez Claude (Docker).
- Operacje git/deploy po stronie Claude.
- Pełne pokrycie testami integracyjnymi całej warstwy DB (tylko krytyczne
  przepływy).
- MCP-y do żywej weryfikacji (odłożone).
