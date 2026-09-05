# app/lib/google/ — integracja Google

Moduły łączące konto trenera z Google — **już tylko to**. Synchronizacja terminów z kalendarzem
przeszła do BE razem z obszarem konsultacji (wypycha ją outbox po każdej mutacji), więc `sync.ts`
i `calendar.ts` zniknęły bez zamiennika; ręczne uzupełnienie zaległości woła dziś
`runConsultationSync` z [`../consultations.ts`](../README.md).

**Ten katalog został na Drizzle świadomie (luka LK1).** Przepływu zgody nie da się przepiąć na
kontrakt, dopóki FE woła BE serwer-do-serwera: `POST /v1/calendar/connection/authorize` ustawia
w odpowiedzi ciastko z nonce'em na hoście BE, a publiczny callback wpuszcza zgodę tylko wtedy, gdy
skrót z tego ciastka zgadza się z podpisanym `state`. Ciastko z odpowiedzi na wywołanie
serwer-do-serwera trafia do serwera FE, nie do przeglądarki. Wybór wariantu (wspólna domena
nadrzędna, wywołanie z przeglądarki, drugi sekret w `state`) to decyzja poza planem przepięcia —
[`docs/superpowers/plans/2026-09-03-reszta-app-lib-na-kontrakcie.md`](../../../docs/superpowers/plans/2026-09-03-reszta-app-lib-na-kontrakcie.md) §7.

## Pliki

| Plik | Rola / kluczowe eksporty |
|---|---|
| `crypto.ts` | Szyfrowanie tokenów OAuth at-rest: `encryptToken`, `decryptToken` (AES-256-GCM, format `ivB64.tagB64.cipherB64`). Klucz z `GOOGLE_TOKEN_ENC_KEY` (base64, 32 bajty). |
| `oauth.ts` | OAuth 2.0 flow: `signState`/`verifyState` (HMAC-SHA256, anty-CSRF + TTL), `newNonce`, `oauthClient`, `consentUrl`, `exchangeCode`. Stałe `GOOGLE_CALENDAR_SCOPE`, `GOOGLE_SCOPES`. |
| `connections.ts` | Repo tabeli `google_calendar_connections`: `getConnectionStatus` (bezpieczny do loadera, bez sekretów), `upsertConnection` (insert or update z zaszyfrowanymi tokenami), `deleteConnection` (zwraca refresh token do revoke), `getAuthedClient` (OAuth2Client z auto-refresh + persystencja best-effort), `isGoogleSyncActive` (predykat dla UI — przeniesiony tu z usuniętego `sync.ts`, bo jest pytaniem o POŁĄCZENIE, nie o synchronizację). Tenant-scope: `trainerId`. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
