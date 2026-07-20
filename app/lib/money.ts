import { z } from "zod";

/** Formatuje kwotę w jednostkach minor (grosze/centy) na zapis walutowy.
 *
 * Domyślnie PLN/pl-PL, czyli wstecznie kompatybilne z istniejącymi callerami:
 *   fmtMoney(12345)           → "123,45 zł"
 *   fmtMoney(12345, "fr-FR", "eur") → "123,45 €"
 *
 * Intl wstawia twardą spację (U+00A0) lub wąską niełamliwą (U+202F) —
 * normalizujemy do zwykłej spacji dla stabilnych asercji testowych.
 */
export function fmtMoney(minorUnits: number, locale = "pl-PL", currency = "pln"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  })
    .format(minorUnits / 100)
    .replace(/[  ]/g, " ");
}

/** "200,50" | "200.50" | "200" → minor units (20050). Null gdy nie-liczba. */
export function parseMoneyToMinor(input: string): number | null {
  const norm = input.trim().replace(",", ".");
  if (norm === "" || !/^\d+(\.\d{1,2})?$/.test(norm)) return null;
  return Math.round(Number(norm) * 100);
}

/** Alias wstecznie kompatybilny — zachowuje istniejących callerów i MonthlyAmountSchema. */
export const parsePlnToGrosze = parseMoneyToMinor;

// Minimum 2 zł (200 gr), maksimum 100 000 zł — sanity przeciw literówkom.
export const MonthlyAmountSchema = z
  .number()
  .int("Kwota musi być liczbą całkowitą groszy.")
  .min(200, "Minimalna kwota to 2 zł.")
  .max(10_000_000, "Maksymalna kwota to 100 000 zł.");
