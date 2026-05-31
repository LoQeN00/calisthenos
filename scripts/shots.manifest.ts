import type { ShotTarget } from "./shots-lib";

/**
 * Docelowe trasy do zrzutu. Tylko URL-e bez parametrów ścieżki.
 * `role` decyduje, którą sesją trasa jest osiągalna; w MVP logujemy tylko
 * trenera, więc trasy `trainee` są pomijane (wymagają zaproszonego podopiecznego).
 * Dodanie trasy = jedna linijka tutaj.
 */
export const manifest: ShotTarget[] = [
  { path: "/trener", role: "trainer" },
  { path: "/trener/biblioteka", role: "trainer" },
  { path: "/trener/biblioteka/nowe", role: "trainer" },
  { path: "/trener/plany", role: "trainer" },
  { path: "/trener/plany/nowy", role: "trainer" },
  { path: "/trener/podopieczni", role: "trainer" },
  // Trasy podopiecznego — pomijane w MVP (brak seedowanego podopiecznego):
  { path: "/podopieczny", role: "trainee" },
  { path: "/podopieczny/sesje", role: "trainee" },
  { path: "/podopieczny/historia", role: "trainee" },
  { path: "/podopieczny/statystyki", role: "trainee" },
  { path: "/podopieczny/sylwetka", role: "trainee" },
];
