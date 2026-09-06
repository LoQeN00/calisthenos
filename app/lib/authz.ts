import { hasRole } from "./api/auth";
import type { AuthUser } from "./api/context";

/**
 * Czy użytkownik należy do tenanta `trainerId` — jako jego trener albo jako
 * podopieczny tego trenera.
 *
 * **Oba warunki sprawdzane wprost, nie przez `else`.** Do integracji rola była
 * pojedyncza, więc „nie jestem trenerem" znaczyło „jestem podopiecznym" i
 * gałąź `else` była bezpieczna. ADR-0013 uczynił rolę faktem z okresem: ta sama
 * osoba może być trenerem i czyimś podopiecznym naraz, a między okresami może
 * nie mieć żadnej roli. Przy zwykłym `if/else` pierwszy przypadek gubiłby
 * dostęp do własnych zasobów u swojego trenera (bo gałąź trenera zjadałaby
 * sprawdzenie), a drugi **przyznawałby** dostęp osobie bez roli podopiecznego,
 * której `trainerId` jeszcze wisi.
 */
export function ownsTrainerScope(user: AuthUser, trainerId: string): boolean {
  if (hasRole(user, "trainer") && user.id === trainerId) return true;
  return hasRole(user, "trainee") && user.trainerId === trainerId;
}

export interface Resource {
  trainerId: string;
  /** When set, restricts trainee access to only resources belonging to that user id. */
  ownedByUserId?: string | null;
}

export function canRead(user: AuthUser, resource: Resource): boolean {
  if (!ownsTrainerScope(user, resource.trainerId)) return false;
  // „Jestem trenerem TEGO tenanta", nie „mam gdziekolwiek rolę trenera".
  // Przy pojedynczej roli jedno wynikało z drugiego, bo linia wyżej właśnie to
  // udowodniła; przy liście ról już nie — osoba z obiema rolami przechodziłaby
  // tędy na mocy własnego trenerstwa, omijając sprawdzenie `ownedByUserId`,
  // które trzyma jednego podopiecznego z dala od cudzych wierszy.
  if (user.id === resource.trainerId) return true;
  if (resource.ownedByUserId == null) return true;
  return resource.ownedByUserId === user.id;
}

export function canWrite(user: AuthUser, resource: Resource): boolean {
  return canRead(user, resource);
}
