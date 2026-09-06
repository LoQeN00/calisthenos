import { z } from "zod";

// Moduł przeżył usunięcie płatności (S6), bo kwota ustaleń nie jest płatnością:
// `POST /v1/invites` przyjmuje `monthlyAmountGrosze`, a formularz zaproszenia go
// wysyła. Zniknął stąd `fmtMoney` — czytały go wyłącznie trzy skasowane ekrany
// Stripe'a, a nic w aplikacji nie wyświetla już kwoty.

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
