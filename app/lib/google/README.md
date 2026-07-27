# app/lib/google/ — integracja Google

Moduły obsługujące integrację z Google (OAuth, Calendar). Faza 2 harmonogramu konsultacji.

## Pliki

| Plik | Rola / kluczowe eksporty |
|---|---|
| `crypto.ts` | Szyfrowanie tokenów OAuth at-rest: `encryptToken`, `decryptToken` (AES-256-GCM, format `ivB64.tagB64.cipherB64`). Klucz z `GOOGLE_TOKEN_ENC_KEY` (base64, 32 bajty). |
| `oauth.ts` | OAuth 2.0 flow: `signState`/`verifyState` (HMAC-SHA256, anty-CSRF + TTL), `newNonce`, `oauthClient`, `consentUrl`, `exchangeCode`. Stałe `GOOGLE_CALENDAR_SCOPE`, `GOOGLE_SCOPES`. |
| `connections.ts` | Repo tabeli `google_calendar_connections`: `getConnectionStatus` (bezpieczny do loadera, bez sekretów), `upsertConnection` (insert or update z zaszyfrowanymi tokenami), `deleteConnection` (zwraca refresh token do revoke), `getAuthedClient` (OAuth2Client z auto-refresh + persystencja best-effort). Tenant-scope: `trainerId`. |
| `calendar.ts` | Klient Google Calendar v3: czyste mappery `consultationToPatch` (termin + treść) i `consultationToEvent` (to samo + uczestnik i prośba o Meet) — oba liczą start/end jednym helperem, żeby `insert` i `patch` nie rozjechały się w czasie. **Strefa:** `dateTime` wysyłamy jako czas ścienny RFC3339 **bez** `Z`, a strefę podajemy osobno w `timeZone` = `APP_TIME_ZONE` (`lib/format.ts`). Wysyłanie `…Z` znaczyłoby „18:30 UTC" i Google pokazywałby termin przesunięty o offset. `insertEvent` (zdarzenie + Meet, `conferenceDataVersion: 1`, `sendUpdates: "all"`), `patchEvent` (reschedule/edycja/naprawa — zwraca `false` przy 404/410, czyli „zdarzenia już nie ma", żeby wołający mógł je odtworzyć; opcja `timesOnly` wysyła sam termin, bez nadpisywania tytułu/opisu ustawionych po stronie Google), `deleteEvent` (idempotentne wobec 404/410). |
| `sync.ts` | Warstwa orkiestracji Google Calendar — best-effort, nigdy nie rzuca do wywołującego. `syncUpsertOne` (create albo patch jednego terminu po mutacji DB), `syncCancelOne` (delete zdarzenia po cancel + czyszczenie `googleEventId`), `syncCancelAllForPair` (kasuje wszystkie zdarzenia pary — przy usuwaniu podopiecznego; nie czyści `googleEventId`, bo wiersze i tak znikają w kaskadzie), `syncCancelStaleSchedule` (kasuje zdarzenia nadchodzących odwołanych terminów po dezaktywacji/zmianie harmonogramu + czyści `googleEventId`, bo wiersze zostają), `syncBackfillPair` (nadchodzące terminy pary: wstawia brakujące zdarzenia ORAZ `patch`-uje już istniejące w trybie `timesOnly` — dzięki temu zdarzenia wysłane przed poprawką stref wracają na właściwą godzinę, a opisy dopisane w Google zostają; oba zbiory czytane przed zapisami, by świeżo wstawiony termin nie dostał od razu dubla; zdarzenie skasowane ręcznie w Google jest odtwarzane zamiast zostawiać martwe `google_event_id`; zwraca `BackfillResult` z flagą `connected`, która odróżnia „nie ma czego synchronizować" od „integracja nie działa"), `isGoogleSyncActive` (sprawdzenie dla UI). Błędy logowane przez `logSyncError` (tylko kod, nigdy `err.message`/Bearer token). |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
