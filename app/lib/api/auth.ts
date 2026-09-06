import { redirect } from "react-router";
// `Readonly<...>`, nie goły `RouterContextProvider` — to jest typ, który
// `LoaderFunctionArgs.context` faktycznie niesie przy włączonej fladze
// `v8_middleware`. Różnica nie jest kosmetyczna: klasa ma pole `#private`,
// więc `Readonly<T>` gubi markę prywatności i jest INNYM typem. Blokuje
// wyłącznie podmianę metod `get`/`set`, nie ich wywołanie. Tak samo stoi
// `MiddlewareArgs.context` w `middleware.ts`.
import type { RouterContextProvider } from "react-router";
import type { Api } from "./client";
import { type AuthUser, type Role, apiContext } from "./context";

export interface RequireOptions {
  role?: Role;
}

/**
 * **Synchroniczne i bez sieci.** Użytkownika załadował middleware, raz na
 * żądanie. Do integracji każde z 77 wywołań tej funkcji było odczytem z bazy;
 * gdyby zostało wywołaniem HTTP, jedna nawigacja płaciłaby za nie tyle razy,
 * ile loaderów odpala — layout i liść to już dwa.
 *
 * Oddaje `api` razem z `user`, bo loader potrzebuje obu: jedno wywołanie
 * zamiast dwóch odczytów z `context` zmniejsza liczbę miejsc, w których trasa
 * może o czymś zapomnieć.
 */
export function requireUser(
  context: Readonly<RouterContextProvider>,
  { role }: RequireOptions = {},
): { api: Api; user: AuthUser } {
  const { api, user } = context.get(apiContext);

  if (!user) throw redirect("/login");
  if (role && !hasRole(user, role)) throw redirect(sectionFor(user));

  return { api, user };
}

export function optionalUser(context: Readonly<RouterContextProvider>): {
  api: Api;
  user: AuthUser | null;
} {
  const { api, user } = context.get(apiContext);
  return { api, user };
}

/**
 * Przynależność do listy, nie równość — ADR-0013 uczynił rolę faktem z okresem
 * i dopuścił `trainer` oraz `trainee` naraz.
 */
export function hasRole(user: AuthUser, role: Role): boolean {
  return user.roles.includes(role);
}

/**
 * Sekcja, do której należy użytkownik. **Jedyne miejsce, które zna tę regułę** —
 * wołają ją `requireUser` (przy odmowie), `_index.tsx` (po zalogowaniu)
 * i `login.tsx` (gdy zalogowany trafi na formularz). Trzy kopie tego wyrażenia
 * rozjechałyby się przy pierwszej zmianie ról.
 *
 * Przy dzisiejszych dwóch rolach trener wygrywa, gdy ktoś ma obie. Kolejność
 * w wyrażeniu zacznie mieć znaczenie dopiero, gdyby ról przybyło.
 */
export function sectionFor(user: AuthUser): string {
  // Pusta lista jest osiągalna: rola jest faktem z OKRESEM (ADR-0013), więc
  // między okresami nie ma żadnej. Bez tego strażnika taka osoba dostawałaby
  // `/podopieczny`, ta trasa zażądałaby roli `trainee`, której nie ma, i
  // odesłałaby w to samo miejsce — nieskończona pętla przekierowań.
  if (user.roles.length === 0) return "/login";
  return hasRole(user, "trainer") ? "/trener" : "/podopieczny";
}
