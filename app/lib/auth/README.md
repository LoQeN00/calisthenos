# app/lib/auth/ — zaproszenia trenera i odczyty użytkowników

**Sesje i hasła stąd wyprowadziły się** do [`../api/`](../api/README.md) w kroku 2 Etapu 2:
tożsamość niesie ciastko `__Host-kth_api` z tokenami BE, a `session.ts`, `cookie.ts` oraz
pułapka z dwiema funkcjami `clearSessionCookie` o tej samej nazwie zniknęły razem ze starą
sesją bazodanową. Pilnuje tego bramka `app/routes/no-stara-sesja.test.ts`.

Zostało to, czego BE jeszcze nie przejął: zaproszenia wystawiane przez trenera i dwa odczyty
użytkowników. Jedno i drugie znika w krokach 3 i 6 Etapu 2. Importuj przez `index.ts`.

| Plik | Rola / kluczowe eksporty |
|---|---|
| `index.ts` | Fasada re-eksportów nad `invite.ts` i `users.ts` — nic więcej. `password.ts` celowo NIE jest tu wystawiony: nic w `app/` nie ma już powodu dotykać haseł. |
| `password.ts` | Zostaje **wyłącznie** dla `scripts/seed.ts`, który bierze stąd `ARGON2_OPTS`, żeby zasiane konta miały hasze zgodne z produkcyjnymi. Hasła użytkowników weryfikuje BE. Znika razem z bazą w kroku 6. |
| `invite.ts` | **Wystawianie** zaproszeń wciąż tutaj, **przyjmowanie** przeszło do BE (krok 2): `consumeInvite` i `findInviteByToken` nie mają już wywołującego w `app/` — trzymają je testy integracyjne pokrywające transakcję, która żyje do kroku 6. Zaproszenia trenera (14 dni, token SHA-256, jednorazowe, opcjonalna podmiana konta): `createInvite`, `consumeInvite` (atomowe `SELECT FOR UPDATE`), `hashToken`, `findInviteByToken` (odczyt po SUROWYM tokenie z URL-a — haszuje sama, wołający nigdy nie dotyka hasza). `createInvite` przyjmuje opcjonalny `monthlyAmountGrosze` (zapisywany w `invites.monthly_amount_grosze`) — kwota miesięcznej subskrypcji ustalona przez trenera, niesiona z zaproszeniem i skonsumowana przy rejestracji do inicjalizacji cennika podopiecznego (płatność w onboardingu). `consumeInvite` w tej samej transakcji stempluje `trainee_id` na formularzu startowym doczepionym do zaproszenia (`attachFormToTrainee` z `~/lib/onboarding-forms`) — konto i przypięcie formularza powstają albo oba, albo żadne. `createInviteWithOnboarding` — zaproszenie + opcjonalny formularz startowy w JEDNEJ transakcji (`createInvite` + `createOnboardingForm`), używane przez `/trener/podopieczni`: nigdy nie powstaje link do zaproszenia, któremu formularz nie doszedł, a `inviteId` bierze się WYŁĄCZNIE z wiersza utworzonego w tej transakcji, nigdy z requestu. Mieszka **tutaj, nie w `onboarding-forms.ts`**, bo ten moduł już importuje formularze (`attachFormToTrainee`) — odwrotny import zamknąłby cykl; zaproszenie jest korzeniem tego agregatu, formularz mu towarzyszy. `OnboardingFormError` przechodzi na zewnątrz, mapuje go trasa. |
| `users.ts` | `findDisplayName` — sama nazwa wyświetlana, do framingu trenera na ekranach podopiecznego (trzy trasy w `podopieczny/`). `findUserByEmail` **straciło wywołującego**: logowanie przeszło na BE, więc zostaje tylko dla testu integracyjnego, do kroku 6. |

Uwaga: cookie `__Host-` wymaga `Secure` — w dev działa przez wyjątek dla
`localhost`; testy w LAN po HTTP nie zadziałają (patrz root `README.md`).

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
