import { createHash } from "node:crypto";
import { type ApiSession, type ApiTokens, sessionFromTokens } from "./session";

/**
 * Ile trzymamy odwzorowanie „stary token → nowa para".
 *
 * Pokrywa prefetch po najechaniu na link, fetcher wysłany tuż przed nawigacją
 * i drugą kartę rewalidującą się po powrocie do laptopa. Nie pokrywa niczego,
 * co wyglądałoby na realne użycie skradzionego tokenu z opóźnieniem.
 */
const OKNO_LASKI_MS = 60_000;

/**
 * Klucze pochodzą z ciastek, czyli z zewnątrz — bez limitu wystarczyłby
 * strumień żądań z losowymi ciastkami, żeby wyczerpać pamięć procesu.
 */
const MAX_WPISOW = 1_000;

interface WpisLaski {
  session: ApiSession;
  at: number;
}

const wLocie = new Map<string, Promise<ApiSession>>();
const oknoLaski = new Map<string, WpisLaski>();

export interface RefreshDeps {
  /** Woła `POST /v1/auth/refresh`. Wstrzykiwane, żeby test nie potrzebował sieci. */
  wymien: (refreshToken: string) => Promise<ApiTokens>;
  now: () => Date;
}

/**
 * Jedyna droga do rotacji tokenu. Woła ją middleware (ścieżka wyprzedzająca)
 * i interceptor `401` (ścieżka reaktywna) — drugiej nie ma i nie może być.
 *
 * Powód jest twardszy niż oszczędność wywołań: `SessionService.rotate` w BE
 * przy ponownym użyciu tokenu wykonuje `deleteChain`, czyli **gasi całą sesję**
 * — wygranego wyścigu razem z przegranym. Dwa odświeżenia tym samym tokenem to
 * nie marnotrawstwo, tylko wylogowanie ze wszystkich urządzeń.
 */
export async function refreshOnce(
  refreshToken: string,
  { wymien, now }: RefreshDeps,
): Promise<ApiSession> {
  const klucz = hash(refreshToken);
  const teraz = now();

  const zapamietana = odczytajLaske(klucz, teraz.getTime());
  if (zapamietana) return zapamietana;

  const biezaca = wLocie.get(klucz);
  if (biezaca) return biezaca;

  const obietnica = wymien(refreshToken)
    .then((tokens) => {
      const session = sessionFromTokens(tokens, teraz);
      zapiszLaske(klucz, session, teraz.getTime());
      return session;
    })
    .finally(() => {
      // Porażka NIE trafia do okna łaski: zapamiętana zamieniłaby jednorazowy
      // błąd sieci w minutę niedostępności aplikacji dla zalogowanego.
      wLocie.delete(klucz);
    });

  wLocie.set(klucz, obietnica);
  return obietnica;
}

function odczytajLaske(klucz: string, teraz: number): ApiSession | null {
  const wpis = oknoLaski.get(klucz);
  if (!wpis) return null;

  // Wygasanie leniwe, przy odczycie. Timer w procesie serwera trzeba potem
  // sprzątać przy zamykaniu i w testach — a nie ma tu czego pilnować na czas.
  if (teraz - wpis.at > OKNO_LASKI_MS) {
    oknoLaski.delete(klucz);
    return null;
  }

  return wpis.session;
}

function zapiszLaske(klucz: string, session: ApiSession, teraz: number): void {
  if (oknoLaski.size >= MAX_WPISOW) {
    // `Map` zachowuje kolejność wstawiania, więc pierwszy klucz jest najstarszy.
    const najstarszy = oknoLaski.keys().next();
    if (!najstarszy.done) oknoLaski.delete(najstarszy.value);
  }
  oknoLaski.set(klucz, { session, at: teraz });
}

/**
 * Klucz jest haszowany, wartość nie może być — w wartości siedzi nowa para,
 * bo trzeba ją wpisać do ciastka. Hasz kosztuje nic i sprawia, że przedstawiony
 * token nie leży w pamięci procesu jawnie.
 */
function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Wyłącznie dla testów: stan jest modułowy, więc przecieka między przypadkami. */
export function resetRefreshState(): void {
  wLocie.clear();
  oknoLaski.clear();
}

/** Wyłącznie dla testów: dowód, że limit wpisów działa. */
export function rozmiarOknaLaski(): number {
  return oknoLaski.size;
}
