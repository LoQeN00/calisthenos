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
| `invite.ts` | Zaproszenia trenera (14 dni, token SHA-256, jednorazowe, opcjonalna podmiana konta): `createInvite`, `consumeInvite` (atomowe `SELECT FOR UPDATE`), `hashToken`, `findInviteByToken` (odczyt po SUROWYM tokenie z URL-a — haszuje sama, wołający nigdy nie dotyka hasza). `createInvite` przyjmuje opcjonalny `monthlyAmountGrosze` (zapisywany w `invites.monthly_amount_grosze`) — kwota miesięcznej subskrypcji ustalona przez trenera, niesiona z zaproszeniem i skonsumowana przy rejestracji do inicjalizacji cennika podopiecznego (płatność w onboardingu). `consumeInvite` w tej samej transakcji stempluje `trainee_id` na formularzu startowym doczepionym do zaproszenia (`attachFormToTrainee` z `~/lib/onboarding-forms`) — konto i przypięcie formularza powstają albo oba, albo żadne. `createInviteWithOnboarding` — zaproszenie + opcjonalny formularz startowy w JEDNEJ transakcji (`createInvite` + `createOnboardingForm`), używane przez `/trener/podopieczni`: nigdy nie powstaje link do zaproszenia, któremu formularz nie doszedł, a `inviteId` bierze się WYŁĄCZNIE z wiersza utworzonego w tej transakcji, nigdy z requestu. Mieszka **tutaj, nie w `onboarding-forms.ts`**, bo ten moduł już importuje formularze (`attachFormToTrainee`) — odwrotny import zamknąłby cykl; zaproszenie jest korzeniem tego agregatu, formularz mu towarzyszy. `OnboardingFormError` przechodzi na zewnątrz, mapuje go trasa. |
| `users.ts` | Odczyty użytkowników poza sesją: `findUserByEmail` (logowanie — `null` gdy brak konta, trasa i tak liczy dummy-hash), `findDisplayName` (sama nazwa wyświetlana, do framingu trenera na ekranach podopiecznego). |

Uwaga: cookie `__Host-` wymaga `Secure` — w dev działa przez wyjątek dla
`localhost`; testy w LAN po HTTP nie zadziałają (patrz root `README.md`).

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
