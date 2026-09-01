import { redirect, type LoaderFunctionArgs } from "react-router";
import { optionalUser, sectionFor } from "~/lib/api/auth";

/**
 * Root index — always redirects.
 * - Logged in as trainer → /trener
 * - Logged in as trainee → /podopieczny
 * - Anonymous → /login
 */
export function loader({ context }: LoaderFunctionArgs) {
  const { user } = optionalUser(context);
  if (!user) throw redirect("/login");
  // Regułę „rola → sekcja" zna wyłącznie `sectionFor` — rola jest LISTĄ
  // (ADR-0013), więc to przynależność, nie równość, a trener wygrywa przy obu.
  throw redirect(sectionFor(user));
}

export default function Index() {
  // Loader always throws a redirect; this component never renders.
  return null;
}
