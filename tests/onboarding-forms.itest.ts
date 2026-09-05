// PLIK DO SKASOWANIA (`git rm tests/onboarding-forms.itest.ts`) — przez Właściciela.
//
// Moduł `app/lib/onboarding-forms.ts` stoi w całości na kontrakcie BE (segment S2,
// 03.09.2026); jego testy leżą obok modułu, przeciw podstawionemu klientowi i bez
// bazy: `app/lib/onboarding-forms.test.ts` (formularz) i `app/lib/auth/invite.test.ts`
// (zaproszenie z formularzem, `POST /v1/invites`). Przepływ „przyjęcie zaproszenia
// przypina formularz" jest od integracji sprawą BE. Agent segmentu nie uruchamia
// komend powłoki (tryb lekki), więc nie mógł usunąć tego pliku sam. Ta zawartość
// istnieje wyłącznie po to, żeby do czasu skasowania `npm run typecheck` nie potykał
// się o importy funkcji, których już nie ma, a `npm run test:itest` widział pominięty
// zestaw zamiast pliku bez testów.
import { describe, it } from "vitest";

describe.skip("onboarding-forms.itest — usunięty; patrz app/lib/onboarding-forms.test.ts", () => {
  it("nic — plik czeka na git rm", () => {});
});
