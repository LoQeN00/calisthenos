import { redirect, type LoaderFunctionArgs } from "react-router";
import { hasRole, optionalUser } from "~/lib/api/auth";

/**
 * Root index — always redirects.
 * - Logged in as trainer → /trener
 * - Logged in as trainee → /podopieczny
 * - Anonymous → /login
 */
export function loader({ context }: LoaderFunctionArgs) {
  const { user } = optionalUser(context);
  if (!user) throw redirect("/login");
  // Rola jest LISTĄ (ADR-0013) — przynależność, nie równość. Trener wygrywa,
  // gdy ktoś ma obie: to jego panel jest nadrzędny.
  throw redirect(hasRole(user, "trainer") ? "/trener" : "/podopieczny");
}

export default function Index() {
  // Loader always throws a redirect; this component never renders.
  return null;
}
