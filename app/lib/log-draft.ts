/**
 * Szkic logu treningu przechowywany w `sessionStorage`. Chroni wpisane serie
 * przed utratą, gdy wysyłka formularza zerwie się na poziomie sieci (np.
 * `TypeError: Failed to fetch` przy uploadzie wideo) — wtedy React Router
 * renderuje ErrorBoundary i odmontowuje komponent, kasując stan Reacta.
 *
 * Trzymamy tylko dane tekstowe serii (powtórzenia / trudność / pominięcie).
 * Samego pliku wideo NIE da się sensownie zapisać w storage — po błędzie trzeba
 * je wybrać ponownie.
 */

export type SetDraft = { reps: string; difficulty: string; skipped: boolean };

// Wersja 2: szkic niesie też listę `exerciseIds` — przywracamy go tylko, gdy
// pasuje do DOKŁADNIE tych samych ćwiczeń w tej samej kolejności. Sama liczba
// serii nie wystarcza: dwa ćwiczenia o tej samej liczbie serii mogłyby zamienić
// się miejscami po zmianie planu i szkic wstawiłby dane do złego ćwiczenia.
type DraftShape = { v: 2; exerciseIds: string[]; sets: SetDraft[][] };

/** Klucz storage per sesja planu — różne sesje mają niezależne szkice. */
export function draftKey(sessionId: string): string {
  return `kalisthenos:log-draft:${sessionId}`;
}

export function serializeDraft(exerciseIds: string[], sets: SetDraft[][]): string {
  return JSON.stringify({ v: 2, exerciseIds, sets } satisfies DraftShape);
}

/**
 * Parsuje szkic, ale zwraca go tylko gdy jego kształt DOKŁADNIE pasuje do
 * bieżącego planu: te same ćwiczenia w tej samej kolejności (`exerciseIds`) oraz
 * ta sama liczba serii w każdym z nich (`setCounts`). Jakikolwiek rozjazd oznacza
 * nieaktualny szkic (trener zmienił plan) — wtedy `null`, żeby nie wstawiać
 * danych do niepasującego formularza.
 */
export function parseDraft(
  raw: string | null,
  expected: { exerciseIds: string[]; setCounts: number[] },
): SetDraft[][] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const d = parsed as { v?: unknown; exerciseIds?: unknown; sets?: unknown };
  if (d.v !== 2 || !Array.isArray(d.exerciseIds) || !Array.isArray(d.sets)) return null;

  // Ćwiczenia: ta sama liczba i te same identyfikatory w tej samej kolejności.
  if (d.exerciseIds.length !== expected.exerciseIds.length) return null;
  for (let i = 0; i < expected.exerciseIds.length; i++) {
    if (d.exerciseIds[i] !== expected.exerciseIds[i]) return null;
  }

  // Serie: ta sama liczba w każdym ćwiczeniu + poprawne typy pól.
  if (d.sets.length !== expected.setCounts.length) return null;
  for (let i = 0; i < expected.setCounts.length; i++) {
    const row = d.sets[i];
    if (!Array.isArray(row) || row.length !== expected.setCounts[i]) return null;
    for (const s of row) {
      if (!s || typeof s !== "object") return null;
      const set = s as { reps?: unknown; difficulty?: unknown; skipped?: unknown };
      if (
        typeof set.reps !== "string" ||
        typeof set.difficulty !== "string" ||
        typeof set.skipped !== "boolean"
      ) {
        return null;
      }
    }
  }
  return d.sets as SetDraft[][];
}

/** Czy szkic niesie cokolwiek wartego przywrócenia (inaczej nie zawracamy głowy). */
export function draftHasContent(sets: SetDraft[][]): boolean {
  return sets.some((row) =>
    row.some((s) => s.skipped || s.reps.trim() !== "" || s.difficulty !== ""),
  );
}
