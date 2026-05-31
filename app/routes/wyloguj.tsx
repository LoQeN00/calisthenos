import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { db } from "~/lib/db/client";
import { clearSessionCookie, destroySession, parseSessionId } from "~/lib/auth";

async function performLogout(args: LoaderFunctionArgs | ActionFunctionArgs) {
  const sid = parseSessionId(args.request.headers.get("cookie"));
  if (sid) await destroySession(db, sid);
  return redirect("/login", {
    headers: { "Set-Cookie": clearSessionCookie() },
  });
}

export const loader = performLogout;
export const action = performLogout;
