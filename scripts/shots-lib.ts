export type Role = "trainer" | "trainee";

export interface ShotTarget {
  path: string;
  role: Role;
}

/** "/trener/biblioteka" → "trener_biblioteka"; "/" → "root". */
export function slugForPath(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  if (trimmed === "") return "root";
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Argumenty pozycyjne → lista ścieżek (z wiodącym slashem) albo null = pełny manifest.
 * Oczekuje argów użytkownika (czyli `process.argv.slice(2)`), nie surowego `process.argv`.
 */
export function parseShotArgs(argv: string[]): string[] | null {
  const positional = argv.filter((arg) => !arg.startsWith("-"));
  if (positional.length === 0) return null;
  return positional.map((p) => (p.startsWith("/") ? p : `/${p}`));
}

/** Dobiera trasy do zrzutu wg zalogowanej roli. Cel jest pomijany, gdy jego rola ≠ zalogowana. */
export function selectTargets(input: {
  manifest: ShotTarget[];
  paths: string[] | null;
  role: Role;
}): { targets: ShotTarget[]; skipped: ShotTarget[] } {
  const { manifest, paths, role } = input;
  const candidates: ShotTarget[] =
    paths === null
      ? manifest
      : paths.map((path) => manifest.find((m) => m.path === path) ?? { path, role });

  const targets = candidates.filter((c) => c.role === role);
  const skipped = candidates.filter((c) => c.role !== role);
  return { targets, skipped };
}
