# Uwierzytelnianie na tokenach BE — `login`, `wyloguj`, `zaproszenie`

**Data:** 2026-09-01
**Status:** projekt zaakceptowany w brainstormie; czeka na plan wykonania
**Nadrzędny:** [`2026-08-29-integracja-fe-be-design.md`](2026-08-29-integracja-fe-be-design.md) — Etap 2, krok 2
**Poprzednik:** [`2026-08-31-warstwa-klienta-api-fe-design.md`](2026-08-31-warstwa-klienta-api-fe-design.md) — Etap 2, krok 1

---

## 1. Driver i zakres

Krok 1 zbudował warstwę, która **czyta** tożsamość: `apiMiddleware` odczytuje ciastko
`__Host-kth_api`, woła `GET /v1/me` i wkłada `{ api, user }` do kontekstu, a 51 tras bierze to
przez `requireUser`. Nikt tego ciastka nie **wystawia** — `login.tsx` nadal zakłada starą sesję
bazodanową w tabeli `sessions`. Skutek jest taki, że po udanym logowaniu `/` odsyła z powrotem
na `/login`: gałąź `be-integration` nie uwierzytelnia dziś nikogo od początku do końca.

Ten krok domyka pętlę. Trzy trasy przechodzą na kontrakt, powstaje strona zapisująca warstwy
klienta, a stara maszyneria sesji znika z drzewa.

### Poza zakresem

- **Uruchomienie przeciw żywemu BE.** Kryterium ukończenia jest to samo, co w kroku 1: kod plus
  testy przeciw podstawionemu transportowi, bramki zielone. Postawienie backendu lokalnie
  i przejście ścieżki logowania to osobne zadanie.
- **Pozostałe 23 moduły `app/lib`** — krok 3. `auth/invite.ts` (trener **wystawia** zaproszenie)
  i `auth/users.ts` zostają, bo wołają je trasy, których ten krok nie dotyka.
- **Pliki, płatności, usunięcie bazy** — kroki 4–6. Tabela `sessions` zostaje w schemacie; znika
  wyłącznie kod, który z niej korzystał.
- **`rate-limit.ts` jako moduł** — zostaje dla `upload.wideo.tsx` do kroku 4. Znikają z niego
  tylko dwa wpisy: `RATE_LIMITS.login` i `.invite`.

## 2. Stan wyjściowy — zmierzony, nie założony

| Fakt | Wartość | Skąd |
|---|---|---|
| `login.tsx` | 129 linii; limit prób, walidacja Zod, stały czas przez dummy-hash, `createSession`, ciastko | lektura |
| `zaproszenie.$token.tsx` | 172 linie; limit, `findInviteByToken`, `hashPassword`, `consumeInvite`, `createSession`, `setMonthlyAmount` | jw. |
| `wyloguj.tsx` | 14 linii; `destroySession` + wyczyszczenie ciastka | jw. |
| Endpointy kontraktu | `authControllerLogin`, `authControllerLogout`, `authControllerLogoutAll`, `invitesControllerPreview`, `invitesControllerAccept` | `node -e` po pakiecie |
| `LoginResponseDto` | `{ accessToken, expiresIn, refreshToken, profile: MeDto }` | `types.gen.d.ts:24` |
| **Limit logowania w BE** | **jest**: `@nestjs/throttler`, klucz to **znormalizowany e-mail z ciała**, nie IP | `apps/api/src/app/throttling.module.ts` |
| Limit logowania w FE dziś | 10 prób / 15 min, klucz to IP | `rate-limit.ts:92` |
| **Stały czas logowania w BE** | **jest**: `PasswordHasher.verify` liczy pełny hasz także dla nieistniejącego konta | `libs/iam/src/lib/auth.service.ts:58` |
| Przyjęcie zaproszenia w BE | jedna transakcja: `FOR UPDATE` na zaproszeniu, założenie konta, poświadczenia, **stempel formularza startowego**, zużycie, zdarzenie `TraineeJoined` | `libs/onboarding/src/lib/invites.service.ts:258` |
| `MeDto.roles` | `Array<'trainer' \| 'trainee'>` | `types.gen.d.ts:21` |
| `AcceptedProfileResponse.roles` | **`Array<string>`** — szersze niż to samo pole w `MeDto` | `types.gen.d.ts:857` |

Trzy rzeczy z tej tabeli zmieniają projekt wobec tego, co zakładał spec nadrzędny.

**Dwie własności bezpieczeństwa, które FE dziś implementuje u siebie, są już po drugiej stronie.**
Limit prób logowania i stały czas odpowiedzi dla nieistniejącego konta nie są w BE dodatkiem —
są zaprojektowane, opisane i przetestowane, a limit jest **lepiej kluczowany** niż w FE: po koncie,
które ktoś atakuje, a nie po adresie IP, który podopieczni dzielą przez NAT, a jeden użytkownik
zmienia przełączając wifi na LTE. Przeniesienie ich nie jest utratą, tylko usunięciem gorszej kopii.

**Kontrakt oddaje profil razem z tokenami.** `POST /v1/auth/login` niesie `profile: MeDto`, więc
logowanie nie potrzebuje osobnego `GET /v1/me`, żeby wiedzieć, dokąd przekierować.

**Kontrakt jest niespójny co do ról między dwiema odpowiedziami.** `MeDto.roles` jest wąskie,
`AcceptedProfileResponse.roles` to gołe `Array<string>`. To rozstrzyga D4.

## 3. Decyzje

| # | Decyzja | Uzasadnienie |
|---|---|---|
| D1 | **Strona zapisująca dostaje własny moduł `app/lib/api/auth-session.ts`** | krok 1 ustanowił wzorzec „trasa → moduł → kontrakt" i krok 7 ma go uczynić bramką („trasa nie woła klienta wprost"). Wołanie SDK z trzech tras byłoby pisaniem długu, o którym już wiemy, że go spłacimy. Dołożenie tego do `session.ts` odrzucone: tamten plik jest czysty — ciastko i czas, zero sieci — i cała warstwa traktuje go jako niezawodny |
| D2 | **Limit prób i stały czas znikają z FE bez zamiennika** | obie własności są w BE, sprawdzone w kodzie, a limit jest tam kluczowany po e-mailu zamiast po IP. Zostawienie kopii w FE znaczyłoby tę samą ochronę w dwóch miejscach, z dwoma różnymi kluczami i dwoma licznikami, które nie wiedzą o sobie nawzajem |
| D3 | **`ApiError` dostaje `retryAfter`, czytane z nagłówka w interceptorze błędu** | BE ustawia `Retry-After`, ale `ApiError` niesie dziś tylko status, kod, komunikat i `details`, więc liczba minut przepadałaby po drodze. Bez niej użytkownik zablokowany na 15 minut dostaje „spróbuj za chwilę", próbuje od razu i dostaje to samo. Interceptor ma `response` w ręku — to dwie linie, a krok 4 (limity wysyłki plików) będzie potrzebował tego samego |
| D4 | **Po przyjęciu zaproszenia przekierowujemy na `/`, nie wprost do sekcji** | `AcceptedProfileResponse.roles` jest typowane jako `Array<string>`, więc wyprowadzenie z niego sekcji wymagałoby albo zawężenia filtrem — czyli cichego wyrzucania nieznanej roli, przed czym krok 1 świadomie się bronił — albo zaufania szerokiemu typowi. `/` już umie tę decyzję podjąć (`_index.tsx`: `optionalUser` + `hasRole`) na podstawie **wąskiego** `MeDto` z następnego żądania. Logowanie decyduje wprost, bo tam typ jest wąski i round-trip byłby zbędny |
| D5 | **`wyloguj` czyści ciastko także wtedy, gdy BE odmówi** | wylogowanie, które nie wylogowuje, bo backend akurat nie odpowiada, jest gorsze niż osierocona sesja po tamtej stronie. Wywołanie `POST /v1/auth/logout` jest best-effort; czyszczenie ciastka nie jest |
| D6 | **Znika `setMonthlyAmount` z przyjęcia zaproszenia** | BE robi to u siebie, zdarzeniem `TraineeJoined` niosącym `monthlyAmountGrosze`. Zostawienie wywołania w FE znaczyłoby dwa źródła tej samej kwoty. Cena jest realna i zapisana: FE-owa księga płatności przestaje ją dostawać przy nowym podopiecznym i pozostaje rozjechana do kroku 5 |

## 4. Kształt

```
app/lib/api/
  auth-session.ts   startSession / acceptInvite / endSession        (nowe)
  client.ts         + `retryAfter` w interceptorze błędu            (zmiana)
  errors.ts         + `ApiError.retryAfter`                         (zmiana)
  session.ts, middleware.ts, auth.ts, context.ts, refresh.ts        (bez zmian)
```

```ts
// wystawienie sesji — jedno wywołanie, bo kontrakt oddaje profil razem z tokenami
export async function startSession(
  api: Api,
  dane: { email: string; password: string },
): Promise<{ session: ApiSession; user: AuthUser }>;

// przyjęcie zaproszenia — oddaje samą sesję; o sekcji rozstrzyga `/` (D4)
export async function acceptInvite(
  api: Api,
  token: string,
  dane: { email: string; displayName: string; password: string },
): Promise<ApiSession>;

// best-effort po stronie BE, obowiązkowe po stronie ciastka (D5)
export async function endSession(api: Api, session: ApiSession): Promise<void>;
```

Moduł zachowuje własny typ błędu tam, gdzie trasa dziś pokazuje komunikat w formularzu — ta sama
reguła co `CategoryError` w `categories.ts`. `AuthError` niesie `userMessage`, a mapowanie jest
**wąskie**: `401` na jeden generyczny komunikat, `429` na komunikat z minutami, `409` przy
zaproszeniu na „adres zajęty". Każdy inny status leci `ApiError`-em do granicy błędu — awaria BE
ma zostać awarią, a nie zamienić się w „niepoprawne dane logowania", które kazałoby użytkownikowi
sprawdzać hasło w odpowiedzi na cudzą usterkę.

## 5. Trzy trasy

**`login.tsx`.** Loader: `optionalUser(context)` zamiast odczytu starej sesji — zalogowany idzie
do swojej sekcji. Akcja: walidacja Zod zostaje (kształt formularza to sprawa FE), znika
`enforceRateLimit`, znika dummy-hash, znika `findUserByEmail`. Po sukcesie `buildSessionCookie`
i przekierowanie wg `roles` z `MeDto`. Jeden generyczny komunikat na `401` — trasa nie odróżnia
„nie ma konta" od „złe hasło", bo BE ich nie odróżnia.

**`zaproszenie.$token.tsx`.** Loader: `invitesControllerPreview` zamiast `findInviteByToken`;
`404` nadal jeden dla nieistniejącego, zużytego i wygasłego zaproszenia — BE rozstrzyga tak samo
i z tego samego powodu (osobny kod byłby wyrocznią). Akcja: `invitesControllerAccept`, po czym
ciastko i przekierowanie na `/`. **Adres e-mail przestaje być doklejany przez FE z wiersza
zaproszenia** — kontrakt bierze go z ciała, a BE sprawdza go wobec zaproszenia przy odnowieniu
(ADR-0032: sam token nie wystarcza, posiadacz musi znać adres).

**`wyloguj.tsx`.** `endSession` z tokenem odświeżającym z ciastka, potem wyczyszczenie ciastka
i przekierowanie. Nie `logout-all` — dzisiejsze `destroySession` gasi jedną sesję i tak zostaje.

## 6. Co znika

| Plik / wywołanie | Dlaczego |
|---|---|
| `app/lib/auth/session.ts` | cały cykl życia starej sesji; nikt go już nie woła |
| `app/lib/auth/password.ts` | hasła weryfikuje BE |
| `app/lib/auth/cookie.ts` | **razem z nim znika kolizja**: `clearSessionCookie` istnieje dziś dwa razy, pod tą samą nazwą, kasując dwa różne ciastka. Po tym kroku zostaje jedna |
| `maybePruneExpiredSessions(db)` w `root.tsx` | sprzątaczka tabeli, z której nic nie korzysta — dziś odpala się przy **każdym** żądaniu |
| `RATE_LIMITS.login`, `RATE_LIMITS.invite` | D2. Sam moduł zostaje dla `upload.wideo.tsx` |

Reguła przekrojowa: po tym kroku **żaden kod w FE nie czyta ani nie zapisuje ciastka
`__Host-kth_session`**. To jest sprawdzalne grepem i tym się ten krok domyka.

## 7. Testy

1. **`auth-session.ts` jednostkowo, przeciw podstawionemu transportowi.** Udane logowanie oddaje
   sesję z `accessExpiresAt` policzonym z `expiresIn` oraz użytkownika z wąskimi rolami.
2. **`401` daje jeden komunikat** niezależnie od tego, czy konto istnieje — dwa różne kształty
   odpowiedzi BE, jedno wyjście.
3. **`429` niesie minuty.** Nagłówek `Retry-After` z BE dolatuje do `ApiError.retryAfter`, a stamtąd
   do komunikatu. Osobny test na sam interceptor w `client.test.ts`.
4. **Awaria BE nie jest błędem poświadczeń.** `500` z logowania leci `ApiError`-em, nie `AuthError`-em
   — ta sama reguła wąskiego `catch`, którą `categories.ts` już ma i którą pilnuje test.
5. **Przyjęcie zaproszenia wystawia sesję** i przekierowuje na `/`, nie do sekcji (D4).
6. **`wyloguj` czyści ciastko, gdy BE odmawia** (D5) — mutacja usuwająca czyszczenie musi ten test
   wywrócić.
7. **Bramka szwu:** grep po `app/` nie znajduje odczytu ani zapisu `__Host-kth_session`.
8. **Bramki FE:** `npm run typecheck`, `npm run lint`, `npx vitest run app`, `npm run build`.

## 8. Ryzyka

| Ryzyko | Waga | Odpowiedź |
|---|---|---|
| FE-owa księga płatności przestaje dostawać kwotę z zaproszenia (D6) | średnia | świadomy dług do kroku 5; gałąź i tak nie jest uruchamialna, więc nie psuje niczego działającego |
| Usunięcie limitu z FE przy niedziałającym limicie w BE | niska | limit w BE sprawdzony w kodzie i pokryty testami (`throttling.module.spec.ts`, `throttling.e2e.spec.ts`), a klucz po e-mailu jest ściślejszy niż dotychczasowy po IP |
| `AcceptedProfileResponse.roles` jako `Array<string>` przecieka do `AuthUser` | niska | D4 usuwa potrzebę interpretowania tego pola w ogóle; gdyby kiedyś było potrzebne, zawężenie ma być **głośne**, nie filtrem |
| Ten krok kasuje kod, którego coś jeszcze używa | niska | `typecheck` łapie to natychmiast, a bramka po `__Host-kth_session` domyka to od drugiej strony |

## 9. Co przechodzi dalej

Po tym kroku `be-integration` **daje się zalogować** — pierwszy raz od rozpoczęcia Etapu 2. To
odblokowuje uwagę z przeglądu kroku 1, której żadna bramka nie zastąpi: uruchomienie gałęzi jako
aplikacji i przejście ścieżki logowanie → panel przeciw prawdziwemu BE.

Krokowi 3 (23 moduły `app/lib`) ten krok nie zostawia nic nowego poza jednym precedensem: moduł
warstwy klienta może mieć **własny typ błędu**, gdy trasa pokazuje komunikat w formularzu zamiast
granicy błędu. `categories.ts` pokazał to na `409`; `auth-session.ts` powtarza na `401` i `429`.
