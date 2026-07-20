# app/lib/auth/ — uwierzytelnianie i autoryzacja sesji

Własna auth: sesje serwerowe (rewokowalne) trzymane w cookie z prefiksem
`__Host-`, hasła Argon2id, zaproszenia jako jedyna ścieżka zakładania konta
podopiecznego. Importuj przez `index.ts`.

| Plik | Rola / kluczowe eksporty |
|---|---|
| `index.ts` | Punkt wejścia + guardy: `getOptionalUser`, `requireUser(request, db, { role? })`, typ `AuthUser` (z polami `organizationId`, `regionId`). Re-eksportuje resztę modułu w tym `Role` i `defaultPathForRole`. |
| `roles.ts` | Jedyne źródło prawdy dla ról i routingu po roli: typ `Role`, funkcja `defaultPathForRole(role)` (trainer→/trener, trainee→/podopieczny, brand_admin→/marka). |
| `roles.test.ts` | Unit testy `defaultPathForRole` (3 testy, Vitest). |
| `session.ts` | Cykl życia sesji (30 dni, auto-odświeżenie <7 dni do końca, leniwy prune): `createSession`, `readSession`, `destroySession`, `refreshIfNearExpiry`, `pruneExpiredSessions`, `maybePruneExpiredSessions`. |
| `cookie.ts` | Budowa/parsowanie cookie sesji: `buildSetCookie`, `clearSessionCookie`, `parseSessionId`, `COOKIE_NAME = "__Host-kth_session"` (HttpOnly, Secure, SameSite=Lax, Path=/). |
| `password.ts` | Argon2id wg minimów OWASP 2023: `hashPassword`, `verifyPassword`, `getDummyPasswordHash` (stały czas), `ARGON2_OPTS`. |
| `invite.ts` | Zaproszenia uogólnione (targetRole: `trainee` \| `trainer`; domyślnie `trainee`). `createInvite`, `consumeInvite` (atomowe `SELECT FOR UPDATE`), `hashToken`. Zaproszenie trenera (ambasador) niesie `organizationId`/`regionId`/`invitedByUserId` i przy konsumpcji tworzy konto `role:"trainer"` z org/regionem; nie ustawia `trainerId`. Ścieżka podopiecznego bez zmian: `trainerId` wymagany, tworzy konto `role:"trainee"`. `createInvite` przyjmuje opcjonalny `monthlyAmountGrosze` (tylko dla trainee; niesiony z zaproszeniem i skonsumowany przy rejestracji do inicjalizacji cennika podopiecznego). |

Uwaga: cookie `__Host-` wymaga `Secure` — w dev działa przez wyjątek dla
`localhost`; testy w LAN po HTTP nie zadziałają (patrz root `README.md`).

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
