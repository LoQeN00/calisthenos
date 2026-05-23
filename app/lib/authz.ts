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
