import { beforeEach, describe, expect, it } from "vitest";
import type { ApiTokens } from "./session";
import { refreshOnce, resetRefreshState, rozmiarOknaLaski } from "./refresh";

const TERAZ = new Date("2026-08-31T10:00:00Z");

function tokeny(n: number): ApiTokens {
  return { accessToken: `A${n}`, refreshToken: `R${n}`, expiresIn: 900 };
}

/** Wymiana, która liczy wywołania i rozwiązuje się dopiero na żądanie. */
function wolnaWymiana() {
  let odblokuj!: () => void;
  const gotowa = new Promise<void>((res) => {
    odblokuj = res;
  });
  let wywolan = 0;
  return {
    get wywolan() {
      return wywolan;
    },
    odblokuj,
    async wymien(): Promise<ApiTokens> {
      wywolan += 1;
      await gotowa;
      return tokeny(2);
    },
  };
}

beforeEach(() => resetRefreshState());

describe("refreshOnce — jedność odświeżania", () => {
  it("dwa równoległe wywołania tym samym tokenem trafiają do BE raz", async () => {
    // BE przy ponownym użyciu tokenu nie odmawia przegranemu — GASI CAŁY
    // ŁAŃCUCH SESJI (`SessionService.rotate`, przypadek `reused`). Drugie
    // wywołanie nie jest więc marnotrawstwem, tylko wylogowaniem ze wszystkiego.
    const w = wolnaWymiana();

    const a = refreshOnce("R1", { wymien: w.wymien, now: () => TERAZ });
    const b = refreshOnce("R1", { wymien: w.wymien, now: () => TERAZ });
    w.odblokuj();

    const [sa, sb] = await Promise.all([a, b]);

    expect(w.wywolan).toBe(1);
    expect(sa).toEqual(sb);
    expect(sa.refreshToken).toBe("R2");
  });

  it("wywołanie po zakończeniu rotacji, w oknie łaski, nie dotyka BE", async () => {
    // Żądanie wysłane przez przeglądarkę ZANIM dotarło nowe ciastko: prefetch,
    // fetcher, druga karta. Mapa w locie jest już pusta, bo obietnica się
    // rozwiązała — bez okna łaski to jest zgaszenie łańcucha.
    let wywolan = 0;
    const deps = {
      wymien: async () => {
        wywolan += 1;
        return tokeny(2);
      },
      now: () => TERAZ,
    };

    const pierwsza = await refreshOnce("R1", deps);
    const druga = await refreshOnce("R1", deps);

    expect(wywolan).toBe(1);
    expect(druga).toEqual(pierwsza);
  });

  it("po wygaśnięciu okna łaski idzie do BE ponownie", async () => {
    let wywolan = 0;
    let zegar = TERAZ;
    const deps = {
      wymien: async () => {
        wywolan += 1;
        return tokeny(wywolan + 1);
      },
      now: () => zegar,
    };

    await refreshOnce("R1", deps);
    zegar = new Date(TERAZ.getTime() + 61_000);
    await refreshOnce("R1", deps);

    expect(wywolan).toBe(2);
  });

  it("porażka nie zostaje w pamięci — kolejna próba znów pyta BE", async () => {
    // Zapamiętana porażka zamieniłaby jednorazowy błąd sieci w minutę
    // niedostępności aplikacji dla zalogowanego użytkownika.
    let wywolan = 0;
    const deps = {
      wymien: async () => {
        wywolan += 1;
        throw new Error("sieć");
      },
      now: () => TERAZ,
    };

    await expect(refreshOnce("R1", deps)).rejects.toThrow();
    await expect(refreshOnce("R1", deps)).rejects.toThrow();

    expect(wywolan).toBe(2);
  });

  it("różne tokeny nie dzielą wpisu", async () => {
    let wywolan = 0;
    const deps = {
      wymien: async () => {
        wywolan += 1;
        return tokeny(wywolan + 1);
      },
      now: () => TERAZ,
    };

    await refreshOnce("R1", deps);
    await refreshOnce("INNY", deps);

    expect(wywolan).toBe(2);
  });

  it("pamięć nie rośnie w nieskończoność", async () => {
    // Klucze pochodzą z ciastek, czyli z zewnątrz. Bez limitu wystarczy
    // strumień żądań z losowymi ciastkami, żeby wyczerpać pamięć procesu.
    const deps = { wymien: async () => tokeny(2), now: () => TERAZ };

    for (let i = 0; i < 1200; i += 1) await refreshOnce(`R-${i}`, deps);

    expect(rozmiarOknaLaski()).toBeLessThanOrEqual(1000);
  });
});
