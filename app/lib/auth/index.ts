import { redirect } from "react-router";
import type { Db } from "../db/client";
import { parseSessionId } from "./cookie";
import { readSession } from "./session";

export type Role = "trainer" | "trainee";
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  trainerId: string | null;
}

export async function getOptionalUser(request: Request, db: Db): Promise<AuthUser | null> {
  const sid = parseSessionId(request.headers.get("cookie"));
  if (!sid) return null;
  const session = await readSession(db, sid);
  if (!session) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    trainerId: u.trainerId,
  };
}

export interface RequireOptions {
  role?: Role;
}

export async function requireUser(
  request: Request,
  db: Db,
  opts: RequireOptions = {},
): Promise<AuthUser> {
  const user = await getOptionalUser(request, db);
  if (!user) {
    throw redirect("/login");
  }
  if (opts.role && opts.role !== user.role) {
    throw redirect(user.role === "trainer" ? "/trener" : "/podopieczny");
  }
  return user;
}

// Re-export the full auth surface so callers can do `import { ... } from "~/lib/auth"`
// without picking deep paths. Keep the surface tight; only re-export what consumers
// outside the auth module legitimately use.
export {
  buildSetCookie,
  clearSessionCookie,
  parseSessionId,
} from "./cookie";
export {
  createSession,
  destroySession,
  readSession,
  refreshIfNearExpiry,
  type CreateSessionInput,
} from "./session";
export {
  hashPassword,
  verifyPassword,
  ARGON2_OPTS,
  getDummyPasswordHash,
} from "./password";
export {
  createInvite,
  consumeInvite,
  hashToken,
  type CreateInviteInput,
  type ConsumeInviteInput,
  type ConsumeInviteResult,
} from "./invite";
