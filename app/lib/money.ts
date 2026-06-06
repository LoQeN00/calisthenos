import { z } from "zod";

const PLN = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
});

/** Formatuje kwotę w groszach na polski zapis waluty, np. 12345 → "123,45 zł". */
export function fmtMoney(grosze: number, _currency: "pln" = "pln"): string {
  // Intl wstawia twardą spację (U+00A0) lub wąską niełamliwą (U+202F) —
  // normalizujemy do zwykłej spacji dla stabilnych asercji testowych.
  return PLN.format(grosze / 100).replace(/[  ]/g, " ");
}

/** "200,50" | "200.50" | "200" → grosze (20050). Null gdy nie-liczba. */
export function parsePlnToGrosze(input: string): number | null {
  const norm = input.trim().replace(",", ".");
  if (norm === "" || !/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(Number(norm) * 100);
}

// Minimum 2 zł (200 gr), maksimum 100 000 zł — sanity przeciw literówkom.
export const MonthlyAmountSchema = z
  .number()
  .int("Kwota musi być liczbą całkowitą groszy.")
  .min(200, "Minimalna kwota to 2 zł.")
  .max(10_000_000, "Maksymalna kwota to 100 000 zł.");
