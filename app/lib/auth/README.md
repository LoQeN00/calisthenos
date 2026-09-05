# app/lib/auth/ — zaproszenia trenera i odczyty użytkowników

**Sesje i hasła stąd wyprowadziły się** do [`../api/`](../api/README.md) w kroku 2 Etapu 2:
tożsamość niesie ciastko `__Host-kth_api` z tokenami BE, a `session.ts`, `cookie.ts` oraz
pułapka z dwiema funkcjami `clearSessionCookie` o tej samej nazwie zniknęły razem ze starą
sesją bazodanową. Pilnuje tego bramka `app/routes/no-stara-sesja.test.ts`.

**Wystawianie zaproszeń przeszło na kontrakt** (segment S2, 03.09.2026): `createInvite(api, …)`
woła `POST /v1/invites`, a zaproszenie i formularz startowy powstają atomowo po stronie BE.
Zostało to, czego BE jeszcze nie przejął po tej stronie: przyjmowanie zaproszenia na Drizzle
(bez wywołującego w `app/`) i dwa odczyty użytkowników — jedno i drugie znika w S6 razem
z bazą. Importuj przez `index.ts`.

| Plik | Rola / kluczowe eksporty |
|---|---|
| `index.ts` | Fasada re-eksportów nad `invite.ts` i `users.ts` — nic więcej. `password.ts` celowo NIE jest tu wystawiony: nic w `app/` nie ma już powodu dotykać haseł. |
| `password.ts` | Zostaje **wyłącznie** dla `scripts/seed.ts`, który bierze stąd `ARGON2_OPTS`, żeby zasiane konta miały hasze zgodne z produkcyjnymi. Hasła użytkowników weryfikuje BE. Znika razem z bazą w S6. |
| `invite.ts` | **Wystawianie na kontrakcie, przyjmowanie na Drizzle.** `createInvite(api, { displayName, email, monthlyAmountGrosze, onboardingForm })` → `InviteCreatedResponse` (`token`, `url`, `expiresAt`) — jedno `POST /v1/invites`; zaproszenie i opcjonalny formularz startowy (1–12 ćwiczeń + notatka) powstają **atomowo po stronie BE**, więc dawna transakcja `createInviteWithOnboarding` zniknęła bez zamiennika, tak jak generowanie i haszowanie tokenu (robi BE; surowy token opuszcza serwer wyłącznie w tej odpowiedzi). Ciało składane jawnie pole po polu, bez `trainerId` (wynika z tokenu) i bez `replacesTraineeId` (odnowienie dostępu — żadna trasa FE go dziś nie wystawia). `InviteError` (`userMessage` z koperty BE) wąsko: `404` (ćwiczenie z szablonu spoza biblioteki albo zarchiwizowane — BE sprawdza to PRZED wstawieniem czegokolwiek; komunikat BE jest ogólny: „Nie znaleziono zasobu."), `409` (`ONBOARDING_FORM_ALREADY_PENDING`), `400`. **Uwaga:** `url` z odpowiedzi to `{APP_PUBLIC_URL}/join/{token}`, a FE przyjmuje zaproszenia pod `/zaproszenie/:token` — trasa `/trener/podopieczni` składa odnośnik z `token` (luka L S2-1). Test: `invite.test.ts` (podstawiony klient, bez bazy). **Na Drizzle do S6:** `consumeInvite` (atomowe `SELECT FOR UPDATE`; w tej samej transakcji stempluje `trainee_id` na formularzu doczepionym do zaproszenia przez prywatny `attachFormToTrainee`, przeniesiony tu z `onboarding-forms.ts` bez zmiany zachowania, gdy tamten moduł przeszedł w całości na kontrakt), `hashToken`, `findInviteByToken` (odczyt po SUROWYM tokenie z URL-a — haszuje sama, wołający nigdy nie dotyka hasza). Cała ta trójka nie ma wywołującego w `app/` (przyjęcie zaproszenia robi BE — `acceptInvite` w `api/auth-session.ts`); `findInviteByToken`/`hashToken` trzyma test integracyjny `tests/auth-repo.itest.ts`, `consumeInvite` nie ma już żadnego testu (jego itest zniknął razem z formularzem na Drizzle). |
| `users.ts` | `findDisplayName` — sama nazwa wyświetlana, do framingu trenera na ekranach podopiecznego (`aktywuj.tsx`, `platnosci.tsx`; `formularz.tsx` bierze już `user.trainerName` z sesji). `findUserByEmail` **straciło wywołującego**: logowanie przeszło na BE, więc zostaje tylko dla testu integracyjnego, do S6. |

Uwaga: cookie `__Host-` wymaga `Secure` — w dev działa przez wyjątek dla
`localhost`; testy w LAN po HTTP nie zadziałają (patrz root `README.md`).

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
