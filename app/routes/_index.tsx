import { redirect, type LoaderFunctionArgs } from "react-router";
import { getOptionalUser, defaultPathForRole } from "~/lib/auth";
import { db } from "~/lib/db/client";

/**
 * Root index — always redirects.
 * - Logged in as trainer → /trener
 * - Logged in as trainee → /podopieczny
 * - Anonymous → /login
 */
export async function loader(args: LoaderFunctionArgs) {
  const user = await getOptionalUser(args.request, db);
  if (!user) throw redirect("/login");
  throw redirect(defaultPathForRole(user.role));
}

export default function Index() {
  // Loader always throws a redirect; this component never renders.
  return null;
}
