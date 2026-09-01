import { createContext } from "react-router";
import type { Api } from "./client";

export type Role = "trainer" | "trainee";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /**
   * LISTA, nie pojedyncza wartość. ADR-0013 uczynił rolę faktem z okresem
   * i dopuścił `trainer` oraz `trainee` naraz, więc kontrola roli jest
   * sprawdzeniem przynależności, nie równością.
   */
  roles: Role[];
  trainerId: string | null;
  /** Z `MeDto.coach.displayName` — oszczędza osobne zapytanie o nazwę trenera. */
  trainerName: string | null;
}

export interface ApiBundle {
  api: Api;
  user: AuthUser | null;
}

/** Jedyny klucz kontekstu tej warstwy. */
export const apiContext = createContext<ApiBundle>();
