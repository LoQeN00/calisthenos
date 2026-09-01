import { describe, expect, it } from "vitest";
import type { AuthUser } from "./api/context";
import { canRead, ownsTrainerScope } from "./authz";

const TRENER = "t-1";
const COACH = "c-9";

function osoba(roles: AuthUser["roles"], trainerId: string | null, id = TRENER): AuthUser {
  return { id, email: "a@e.pl", displayName: "Anna", roles, trainerId, trainerName: null };
}

/**
 * Ta funkcja rozstrzyga dostęp międzytenantowy dla `files/$fileId` — jedynego
 * jej wywołania. Tabela jest po to, żeby przejście z pojedynczej roli na listę
 * (ADR-0013) dało się porównać przypadek po przypadku, a nie „na oko": dwa
 * ostatnie wiersze to kształty, których stary model nie umiał wyrazić, więc
 * nikt ich nigdy nie sprawdził.
 */
describe("ownsTrainerScope — przynależność do tenanta przy roli jako liście", () => {
  it("trener widzi swój tenant, cudzego nie", () => {
    expect(ownsTrainerScope(osoba(["trainer"], null), TRENER)).toBe(true);
    expect(ownsTrainerScope(osoba(["trainer"], null), "obcy")).toBe(false);
  });

  it("podopieczny widzi tenant swojego trenera, cudzego nie", () => {
    const p = osoba(["trainee"], COACH, "p-1");
    expect(ownsTrainerScope(p, COACH)).toBe(true);
    expect(ownsTrainerScope(p, "obcy")).toBe(false);
  });

  it("osoba z OBIEMA rolami widzi i swój tenant, i tenant swojego trenera", () => {
    // Kształt, którego stary model nie umiał wyrazić. Przy `if/else` gałąź
    // trenera zjadałaby sprawdzenie podopiecznego i takiej osobie łamałyby się
    // wszystkie własne zdjęcia u jej trenera — strona się renderuje, obrazki
    // dają 403.
    const oboje = osoba(["trainee", "trainer"], COACH);
    expect(ownsTrainerScope(oboje, TRENER)).toBe(true);
    expect(ownsTrainerScope(oboje, COACH)).toBe(true);
  });

  it("osoba BEZ ról nie widzi nic, nawet gdy trener wciąż jest przypięty", () => {
    // Drugi kształt nie do wyrażenia w starym modelu, i ten jest groźny:
    // rola jest faktem z okresem, więc `trainerId` może wisieć po jego końcu.
    // Gałąź `else` przyznawałaby tu dostęp.
    const nikt = osoba([], COACH, "x-1");
    expect(ownsTrainerScope(nikt, COACH)).toBe(false);
    expect(ownsTrainerScope(nikt, TRENER)).toBe(false);
  });
});

describe("canRead — trener TEGO tenanta, nie ktokolwiek z rolą trenera", () => {
  it("trener czyta cudze zasoby w swoim tenancie", () => {
    expect(canRead(osoba(["trainer"], null), { trainerId: TRENER, ownedByUserId: "p-7" })).toBe(
      true,
    );
  });

  it("podopieczny czyta wspólne, ale nie cudze", () => {
    const p = osoba(["trainee"], COACH, "p-1");
    expect(canRead(p, { trainerId: COACH, ownedByUserId: null })).toBe(true);
    expect(canRead(p, { trainerId: COACH, ownedByUserId: "p-1" })).toBe(true);
    expect(canRead(p, { trainerId: COACH, ownedByUserId: "p-7" })).toBe(false);
  });

  it("trener u SWOJEGO trenera jest zwykłym podopiecznym", () => {
    // Sedno tej poprawki: własna rola trenera nie może otwierać cudzych
    // wierszy w tenancie, w którym jest się tylko podopiecznym.
    const oboje = osoba(["trainee", "trainer"], COACH);
    expect(canRead(oboje, { trainerId: COACH, ownedByUserId: TRENER })).toBe(true);
    expect(canRead(oboje, { trainerId: COACH, ownedByUserId: "p-7" })).toBe(false);
  });
});
