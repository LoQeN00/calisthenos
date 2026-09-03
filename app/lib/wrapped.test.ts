import { describe, expect, it } from "vitest";
import { latestWrappedMonth } from "./wrapped";

// `wrapped.ts` importuje schemat i `type Db` — nic, co dotyka bazy przy imporcie,
// więc czysta funkcja testuje się bez mocków.
describe("latestWrappedMonth — najświeższy miesiąc podsumowań", () => {
  it("wybiera najpóźniejszy miesiąc po `ym`, niezależnie od kolejności w liście", () => {
    // Porządek `wrappedMonths` z kontraktu nie jest częścią kontraktu. Baner
    // „świeży wrapped" ma pokazać ostatni zamknięty miesiąc, nie pierwszy
    // element tablicy — inaczej zmiana `ORDER BY` po stronie BE cofnęłaby baner
    // o rok bez żadnego błędu.
    const miesiace = [
      { ym: "2026-06", year: 2026, month: 6, label: "czerwiec 2026", sessions: 4 },
      { ym: "2026-08", year: 2026, month: 8, label: "sierpień 2026", sessions: 9 },
      { ym: "2026-07", year: 2026, month: 7, label: "lipiec 2026", sessions: 2 },
    ];

    expect(latestWrappedMonth(miesiace)?.ym).toBe("2026-08");
  });

  it("pusta lista daje `null` — baner się nie renderuje", () => {
    expect(latestWrappedMonth([])).toBeNull();
  });

  it("granica roku: `2026-01` jest późniejszy niż `2025-12`, mimo niższego `month`", () => {
    // Porównanie leksykograficzne `YYYY-MM` jest poprawne z konstrukcji, ale to
    // jedyne miejsce, które tę własność zapisuje — naiwne porównanie samego
    // `month` przeszłoby pozostałe przypadki.
    const miesiace = [
      { ym: "2026-01", year: 2026, month: 1, label: "styczeń 2026", sessions: 3 },
      { ym: "2025-12", year: 2025, month: 12, label: "grudzień 2025", sessions: 5 },
    ];

    expect(latestWrappedMonth(miesiace)?.ym).toBe("2026-01");
  });
});
