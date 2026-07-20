import type { AuthUser } from "./auth";

export function ownsTrainerScope(user: AuthUser, trainerId: string): boolean {
  if (user.role === "trainer") return user.id === trainerId;
  return user.trainerId === trainerId;
}

export interface Resource {
  trainerId: string;
  /** When set, restricts trainee access to only resources belonging to that user id. */
  ownedByUserId?: string | null;
}

export function canRead(user: AuthUser, resource: Resource): boolean {
  if (!ownsTrainerScope(user, resource.trainerId)) return false;
  if (user.role === "trainer") return true;
  if (resource.ownedByUserId == null) return true;
  return resource.ownedByUserId === user.id;
}

export function canWrite(user: AuthUser, resource: Resource): boolean {
  return canRead(user, resource);
}

export interface CatalogRow {
  trainerId: string | null;
  organizationId: string | null;
}

/**
 * Odczyt wiersza katalogu (exercise/skill): markowy (trainer_id NULL) jest czytelny
 * dla każdego z tej samej organizacji; trenerski tylko dla właściciela (lub jego
 * podopiecznego — przez ownsTrainerScope). Zapis markowego ZAWSZE niedozwolony
 * (osobny guard w repo — fork zamiast zapisu).
 */
export function canReadCatalogRow(user: AuthUser, row: CatalogRow): boolean {
  if (row.trainerId == null) {
    return row.organizationId != null && row.organizationId === user.organizationId;
  }
  return ownsTrainerScope(user, row.trainerId);
}

/**
 * Czy użytkownik jest prezesem (brand_admin) działającym w obrębie danej
 * organizacji. Jedyna ścieżka autoryzacji do zapisu/odczytu markowego katalogu
 * z poziomu marki. Brak organizationId → false.
 */
export function ownsBrandScope(user: AuthUser, organizationId: string): boolean {
  return user.role === "brand_admin" && user.organizationId === organizationId;
}

/**
 * Czy prezes może ZAPISAĆ ten wiersz katalogu marki: musi być markowy
 * (trainer_id NULL) i należeć do organizacji prezesa.
 */
export function canWriteBrandCatalogRow(user: AuthUser, row: CatalogRow): boolean {
  if (row.trainerId != null || row.organizationId == null) return false;
  return ownsBrandScope(user, row.organizationId);
}
