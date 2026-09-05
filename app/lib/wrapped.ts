import { wrappedControllerSummary } from "@kalisthenos/api-client";
import type { TraineeWrappedMonthItem, WrappedSummaryView } from "@kalisthenos/api-client";
import { orNull } from "~/lib/api/client";
import type { Api } from "~/lib/api/client";

// ============================================================
// Miesięczne podsumowanie „Wrapped" — retrospektywa w klimacie Spotify.
// Otwiera się pierwszego dnia miesiąca po tym, który opisuje.
//
// **Cała arytmetyka przeszła do BE.** Sumy, ćwiczenie wiodące, rekordy miesiąca,
// najcięższy dzień, wybór archetypu i porównanie z poprzednim miesiącem liczy
// `GET /v1/me/wrapped/{ym}` jednym żądaniem; sześć zapytań i ok. 400 linii
// agregacji zniknęło stąd bez zamiennika. Zostały dwie rzeczy, których kontrakt
// nie niesie i nieść nie powinien: **polskie etykiety** (nazwa miesiąca, nazwa
// i opis archetypu) oraz **czyste helpery miesiąca** dla trasy.
// ============================================================

/** Typy podsumowania biorą się z kontraktu, nie z własnych kopii. */
export type {
  WrappedArchetypeView,
  WrappedHeaviestDayView,
  WrappedPrItem,
  WrappedSummaryView,
  WrappedTopExerciseView,
  WrappedVsPreviousView,
} from "@kalisthenos/api-client";

const MONTH_NAMES = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Now's year+month (1-12) in UTC. */
function currentYM(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** Is the given (year, month) strictly before the current UTC month? */
export function isPastMonth(year: number, month: number): boolean {
  const { year: cy, month: cm } = currentYM();
  return year < cy || (year === cy && month < cm);
}

/** Parse "YYYY-MM" → {year, month} or null. */
export function parseYM(raw: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function formatYM(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ============================================================
// Available months — lista przychodzi z kontraktu (`GET /v1/me/home`), tu
// zostaje wyłącznie wybór najświeższego miesiąca pod baner pulpitu.
// ============================================================

/**
 * Najświeższy miesiąc z listy podsumowań — napędza baner „świeży wrapped".
 * Porządek `wrappedMonths` z kontraktu nie jest częścią kontraktu, więc wybór
 * idzie po `ym` (`YYYY-MM` porównuje się leksykograficznie), nie po pozycji.
 */
export function latestWrappedMonth(
  months: readonly TraineeWrappedMonthItem[],
): TraineeWrappedMonthItem | null {
  let latest: TraineeWrappedMonthItem | null = null;
  for (const month of months) {
    if (latest == null || month.ym > latest.ym) latest = month;
  }
  return latest;
}

// ============================================================
// Podsumowanie miesiąca
// ============================================================

/**
 * Podsumowanie jednego miesiąca. `| null` mapuje `404` przez `orNull` — kontrakt
 * odpowiada nim na miesiąc **bez danych** (`docs/04`: „`404`, gdy brak danych"),
 * więc dawne pole `hasData` znika: brak treningów i nieistniejący miesiąc to po
 * tamtej stronie jedna odpowiedź, dokładnie tak, jak trasa je dotąd traktowała.
 *
 * **`path.ym` jest w wygenerowanym kliencie tablicą** (`Array<string>`), choć
 * ścieżka `/v1/me/wrapped/{ym}` ma jeden segment — to artefakt generatora, nie
 * kształt trasy (zgłoszony jako L S5-4). Jednoelementowa tablica serializuje się
 * stylem `simple` bez `explode`, czyli do gołego `2026-08`, więc wywołanie jest
 * poprawne; opakowanie stoi TUTAJ, w jednym miejscu, żeby zniknęło jednym
 * ruchem, gdy generator odda `string`.
 */
export async function loadWrappedSummary(api: Api, ym: string): Promise<WrappedSummaryView | null> {
  return await orNull(
    wrappedControllerSummary({ client: api, path: { ym: [ym] }, throwOnError: true }).then(
      (r) => r.data,
    ),
  );
}

// ============================================================
// Archetypy — etykiety i opisy po polsku
// ============================================================

export type ArchetypeKey = WrappedSummaryView["archetype"]["key"];

export interface Archetype {
  key: ArchetypeKey;
  label: string;
  description: string;
  emoji: string;
}

/**
 * Nazwy archetypów po polsku. Wybór archetypu (dziewięć reguł w kolejności od
 * najbardziej wyróżniającej do domyślnej) robi BE i oddaje sam `key` z `emoji`;
 * etykieta jest prezentacją, więc mieszka tu. Słownik jest **totalny** po
 * `ArchetypeKey` z kontraktu — dopisanie tam dziesiątego archetypu przewróci
 * `tsc` tutaj, zamiast objawić się pustym nagłówkiem karty.
 */
const ARCHETYPE_LABEL: Record<ArchetypeKey, string> = {
  "power-user": "Power user",
  experimenter: "Eksperymentator",
  consistent: "Konsekwentny",
  maximalist: "Maksymalista",
  specialist: "Specjalista",
  endurance: "Wytrzymałościowiec",
  "all-rounder": "Wszechstronny",
  patient: "Cierpliwy",
  explorer: "Eksplorator",
};

/**
 * Opis archetypu — z liczbami tam, gdzie miał je przed integracją. Cztery
 * z dziewięciu zdań mówią „ile": liczba rekordów, nowych ćwiczeń, procent sesji
 * ćwiczenia wiodącego i liczba różnych ćwiczeń. Wszystkie cztery są w odpowiedzi
 * (`prs`, `archetype.newExercises`, `topExercise.pctOfSessions`,
 * `archetype.distinctExercises` — dwa ostatnie pola siedzą w widoku archetypu
 * właśnie po to), więc żadne zdanie nie zbiegło do wersji ogólnej i FE nie liczy
 * dla nich niczego sam.
 */
function archetypeDescription(summary: WrappedSummaryView): string {
  const { archetype, prs, topExercise } = summary;
  switch (archetype.key) {
    case "power-user":
      return `Pobiłeś ${prs.length} rekordy w jednym miesiącu. To miesiąc dla książek.`;
    case "experimenter":
      return `Wypróbowałeś ${archetype.newExercises} nowe ćwiczenia. Komfort to nie Twoje.`;
    case "consistent":
      return "Trenowałeś co tydzień. Bez gadania, bez przerw.";
    case "maximalist":
      return "Większość serii na maksa. Trener pewnie się o Ciebie martwi.";
    case "specialist":
      return `Jedno ćwiczenie — ${topExercise?.pctOfSessions ?? 0}% Twoich sesji. Bezkompromisowy fokus.`;
    case "endurance":
      return "Twój żywioł to czas. Wytrzymujesz tam, gdzie inni odpadają.";
    case "all-rounder":
      return `${archetype.distinctExercises} różnych ćwiczeń, dobrze rozłożone. Trener marzy o takich.`;
    case "patient":
      return "Tydzień po tygodniu, krok po kroku. Tak buduje się formę.";
    case "explorer":
      return "Każdy trening to inwestycja. Trzymaj rytm.";
  }
}

/**
 * Archetyp gotowy dla karty: `key` i `emoji` z kontraktu, etykieta i opis stąd.
 * Czysta — bierze CAŁE podsumowanie, bo opis czerpie liczby także spoza bloku
 * archetypu (rekordy, ćwiczenie wiodące).
 */
export function describeArchetype(summary: WrappedSummaryView): Archetype {
  return {
    key: summary.archetype.key,
    emoji: summary.archetype.emoji,
    label: ARCHETYPE_LABEL[summary.archetype.key],
    description: archetypeDescription(summary),
  };
}
