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
