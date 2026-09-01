import { redirect } from "react-router";
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
  context: RouterContextProvider,
  { role }: RequireOptions = {},
): { api: Api; user: AuthUser } {
  const { api, user } = context.get(apiContext);

  if (!user) throw redirect("/login");
  if (role && !hasRole(user, role)) throw redirect(sekcjaDla(user));

  return { api, user };
}

export function optionalUser(context: RouterContextProvider): { api: Api; user: AuthUser | null } {
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
 * Dokąd odesłać kogoś, kto nie ma roli wymaganej przez trasę. Wołane WYŁĄCZNIE
 * wtedy, gdy `hasRole` zwróciło fałsz, więc przy dzisiejszych dwóch rolach
 * rozstrzyga je ta druga, którą użytkownik ma. Kolejność w wyrażeniu ma
 * znaczenie dopiero, gdyby ról przybyło.
 */
function sekcjaDla(user: AuthUser): string {
  return hasRole(user, "trainer") ? "/trener" : "/podopieczny";
}
