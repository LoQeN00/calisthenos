# app/lib/auth/ — uwierzytelnianie i autoryzacja sesji

Własna auth: sesje serwerowe (rewokowalne) trzymane w cookie z prefiksem
`__Host-`, hasła Argon2id, zaproszenia jako jedyna ścieżka zakładania konta
podopiecznego. Importuj przez `index.ts`.

| Plik | Rola / kluczowe eksporty |
|---|---|
| `index.ts` | Punkt wejścia + guardy: `getOptionalUser`, `requireUser(request, db, { role? })`, typ `AuthUser`, `Role`. Re-eksportuje resztę modułu. |
| `session.ts` | Cykl życia sesji (30 dni, auto-odświeżenie <7 dni do końca, leniwy prune): `createSession`, `readSession`, `destroySession`, `refreshIfNearExpiry`, `pruneExpiredSessions`, `maybePruneExpiredSessions`. |
| `cookie.ts` | Budowa/parsowanie cookie sesji: `buildSetCookie`, `clearSessionCookie`, `parseSessionId`, `COOKIE_NAME = "__Host-kth_session"` (HttpOnly, Secure, SameSite=Lax, Path=/). |
| `password.ts` | Argon2id wg minimów OWASP 2023: `hashPassword`, `verifyPassword`, `getDummyPasswordHash` (stały czas), `ARGON2_OPTS`. |
| `invite.ts` | Zaproszenia trenera (14 dni, token SHA-256, jednorazowe, opcjonalna podmiana konta): `createInvite`, `consumeInvite` (atomowe `SELECT FOR UPDATE`), `hashToken`. |

Uwaga: cookie `__Host-` wymaga `Secure` — w dev działa przez wyjątek dla
`localhost`; testy w LAN po HTTP nie zadziałają (patrz root `README.md`).

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
