// PLIK DO SKASOWANIA (`git rm tests/feature-requests.itest.ts`) — przez Właściciela.
//
// Moduł `app/lib/feature-requests.ts` stoi w całości na kontrakcie BE (segment S2,
// 03.09.2026); jego testy leżą obok modułu, przeciw podstawionemu klientowi i bez
// bazy: `app/lib/feature-requests.test.ts`. Agent segmentu nie uruchamia komend
// powłoki (tryb lekki), więc nie mógł usunąć tego pliku sam. Ta zawartość istnieje
// wyłącznie po to, żeby do czasu skasowania `npm run typecheck` nie potykał się
// o importy funkcji, których już nie ma, a `npm run test:itest` widział pominięty
// zestaw zamiast pliku bez testów.
import { describe, it } from "vitest";

describe.skip("feature-requests.itest — usunięty; patrz app/lib/feature-requests.test.ts", () => {
  it("nic — plik czeka na git rm", () => {});
});
