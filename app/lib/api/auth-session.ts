import { authControllerLogin } from "@kalisthenos/api-client";
import type { Api } from "./client";
import type { AuthUser } from "./context";
import { ApiError } from "./errors";
import { type ApiSession, sessionFromTokens } from "./session";

const NIEPOPRAWNE_DANE = "Niepoprawne dane logowania.";

/**
 * Błąd, który trasa pokazuje **w formularzu**, a nie na granicy błędu.
 *
 * Ten sam wzorzec co `CategoryError` w `categories.ts`: moduł zachowuje własny
 * typ dla tych statusów, dla których trasa ma komunikat, a każdy inny puszcza
 * dalej jako `ApiError`. Granica jest tu ostra, bo po jednej jej stronie stoi
 * „popraw to, co wpisałeś", a po drugiej „to nie twoja wina" — i pomylenie ich
 * każe użytkownikowi sprawdzać hasło w odpowiedzi na awarię serwera.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Wspólne dla logowania i przyjęcia zaproszenia — oba mają ten sam limit w BE. */
function limitPrzekroczony(retryAfter: number | undefined): AuthError {
  if (retryAfter === undefined) {
    return new AuthError("rate limited", "Za dużo prób. Spróbuj ponownie za chwilę.");
  }
  const minuty = Math.max(1, Math.ceil(retryAfter / 60));
  return new AuthError("rate limited", `Za dużo prób. Spróbuj ponownie za ${minuty} min.`);
}

/**
 * Wystawia sesję. **Jedno wywołanie, nie dwa**: kontrakt oddaje `profile` razem
 * z tokenami, więc `GET /v1/me` byłoby tu zbędnym nawrotem po dane, które już
 * przyszły. `MeDto.roles` jest przy tym wąskie (`'trainer' | 'trainee'`), więc
 * `AuthUser` powstaje bez zawężania i bez zgadywania.
 *
 * `now` jest wstrzykiwane wyłącznie dla testów — `sessionFromTokens` przelicza
 * `expiresIn` na moment, a bez ustalonego zegara asercja na `accessExpiresAt`
 * byłaby wyścigiem z zegarem maszyny. Trasy wołają dwuargumentowo.
 */
export async function startSession(
  api: Api,
  credentials: { email: string; password: string },
  now: () => Date = () => new Date(),
): Promise<{ session: ApiSession; user: AuthUser }> {
  try {
    const { data } = await authControllerLogin({
      client: api,
      body: credentials,
      throwOnError: true,
    });

    return {
      session: sessionFromTokens(data, now()),
      user: {
        id: data.profile.partyId,
        email: data.profile.email,
        displayName: data.profile.displayName,
        roles: data.profile.roles,
        trainerId: data.profile.coach?.partyId ?? null,
        trainerName: data.profile.coach?.displayName ?? null,
      },
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      // Komunikat WŁASNY, nie z BE: jedno zdanie dla nieistniejącego konta
      // i dla złego hasła. Przepuszczenie treści z tamtej strony groziłoby
      // tym, że kiedyś zacznie się różnić i stanie się wyrocznią, po której
      // da się sprawdzać, czy dany adres ma u nas konto.
      throw new AuthError("invalid credentials", NIEPOPRAWNE_DANE);
    }
    if (e instanceof ApiError && e.status === 429) throw limitPrzekroczony(e.retryAfter);
    throw e;
  }
}
