// Sesja i tożsamość użytkownika przeniosły się do `app/lib/api/` (spec
// rozbicia FE/BE, krok 1 Etapu 2): `requireUser`/`optionalUser` czytają
// `context` wypełniony przez `apiMiddleware`, a nie bazę. Ten moduł zostaje
// wyłącznie jako fasada nad hasłami, ciastkiem sesji i zaproszeniami — te
// znikają w krokach 2 i 6 Etapu 2.

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
  createInviteWithOnboarding,
  consumeInvite,
  findInviteByToken,
  hashToken,
  type CreateInviteInput,
  type ConsumeInviteInput,
  type ConsumeInviteResult,
} from "./invite";
export { findUserByEmail, findDisplayName } from "./users";
