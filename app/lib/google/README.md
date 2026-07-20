# app/lib/google/ — integracja Google

Moduły obsługujące integrację z Google (OAuth, Calendar). Faza 2 harmonogramu konsultacji.

## Pliki

| Plik | Rola / kluczowe eksporty |
|---|---|
| `crypto.ts` | Szyfrowanie tokenów OAuth at-rest: `encryptToken`, `decryptToken` (AES-256-GCM, format `ivB64.tagB64.cipherB64`). Klucz z `GOOGLE_TOKEN_ENC_KEY` (base64, 32 bajty). |
| `oauth.ts` | OAuth 2.0 flow: `signState`/`verifyState` (HMAC-SHA256, anty-CSRF + TTL), `newNonce`, `oauthClient`, `consentUrl`, `exchangeCode`. Stałe `GOOGLE_CALENDAR_SCOPE`, `GOOGLE_SCOPES`. |
| `connections.ts` | Repo tabeli `google_calendar_connections`: `getConnectionStatus` (bezpieczny do loadera, bez sekretów), `upsertConnection` (insert or update z zaszyfrowanymi tokenami), `deleteConnection` (zwraca refresh token do revoke), `getAuthedClient` (OAuth2Client z auto-refresh + persystencja best-effort). Tenant-scope: `trainerId`. |
| `calendar.ts` | Klient Google Calendar v3: czysty mapper `consultationToEvent` (konsultacja → `Schema$Event` z Meet; połączone konto trenera oznaczane jako organizator/gospodarz = `attendee` z `organizer: true`, by host Meet był jednoznaczny — pomijane, gdy e-mail nieznany), `insertEvent` (tworzy zdarzenie + Meet link, `conferenceDataVersion: 1`, `sendUpdates: "all"`), `patchEvent` (reschedule/edycja; nie zmienia listy uczestników), `deleteEvent` (idempotentne wobec 404/410). |
| `sync.ts` | Warstwa orkiestracji Google Calendar — best-effort, nigdy nie rzuca do wywołującego. `syncUpsertOne` (create albo patch jednego terminu po mutacji DB), `syncCancelOne` (delete zdarzenia po cancel + czyszczenie `googleEventId`), `syncCancelAllForPair` (kasuje wszystkie zdarzenia pary — przy usuwaniu podopiecznego; nie czyści `googleEventId`, bo wiersze i tak znikają w kaskadzie), `syncCancelStaleSchedule` (kasuje zdarzenia nadchodzących odwołanych terminów po dezaktywacji/zmianie harmonogramu + czyści `googleEventId`, bo wiersze zostają), `syncBackfillPair` (backfill niezsynchronizowanych nadchodzących terminów pary), `isGoogleSyncActive` (sprawdzenie dla UI). Błędy logowane przez `logSyncError` (tylko kod, nigdy `err.message`/Bearer token). |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
