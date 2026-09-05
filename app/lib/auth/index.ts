// Sesja i tożsamość użytkownika mieszkają w `app/lib/api/` (spec rozbicia
// FE/BE, kroki 1 i 2 Etapu 2): `requireUser`/`optionalUser` czytają `context`
// wypełniony przez `apiMiddleware`, a `startSession`/`endSession`/`acceptInvite`
// wystawiają i gaszą sesję na tokenach BE. Wystawianie zaproszenia przeszło na
// kontrakt (`createInvite(api)`, `POST /v1/invites`). Ten moduł zostaje jako
// fasada nad tym jednym wywołaniem oraz nad resztą, która czeka na S6:
// przyjmowanie zaproszenia na Drizzle (bez wywołującego w `app/`) i odczyty
// użytkowników.
//
// `password.ts` nie jest tu re-eksportowany, choć plik istnieje: jedynym jego
// konsumentem został `scripts/seed.ts`, który sięga po `ARGON2_OPTS` głęboką
// ścieżką. Nic w `app/` nie ma już powodu dotykać haseł — robi to BE.

// Re-export the full auth surface so callers can do `import { ... } from "~/lib/auth"`
// without picking deep paths. Keep the surface tight; only re-export what consumers
// outside the auth module legitimately use.
export {
  createInvite,
  InviteError,
  consumeInvite,
  findInviteByToken,
  hashToken,
  type CreateInviteInput,
  type InviteCreatedResponse,
  type ConsumeInviteInput,
  type ConsumeInviteResult,
} from "./invite";
export { findUserByEmail, findDisplayName } from "./users";
