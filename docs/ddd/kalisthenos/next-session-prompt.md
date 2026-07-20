<!--
PAŁECZKA SZTAFETOWA między rozmowami.
Aktualizowany przez Claude na końcu KAŻDEJ fazy (część definicji „done").
W nowej rozmowie właściciel @-wspomina TEN plik (lub klei jego treść) — i to
wystarczy, by kontynuować. Poniższa sekcja zawsze opisuje NASTĘPNĄ fazę do zrobienia.
F7 jest CIĘŻKA i WIELOROZMOWOWA: jedna rozmowa = jeden kontekst. Ten plik pokazuje
KONTEKST do zrobienia teraz i po jego walidacji jest przepisywany na NASTĘPNY kontekst.

Postęp F7: ✅ #1 `advancement` (2026-07-08). ✅ #2 `retention` (2026-07-08). ✅ #3 `catalog-skill` (2026-07-10). ▶ TERAZ #4 `brand-platform`. Dalej: #5 programming → #6 workout-logging → #7 analytics → #8 consultations → #9 body-photos → generiki (#10 identity, #11 billing-gating, #12 files) → #13 delivery → F8.
-->

# ▶ Następna sesja: **F7 — Define · kontekst #4 `brand-platform`** · FAZA CIĘŻKA

Wykonaj fazę **F7 (Define)** dla **czwartego** bounded contextu — **`brand-platform`**
(Platforma marki, poddomeny **#2 Tenancy + #3 Ambasadorzy**). F7 to **Bounded Context Canvas
per kontekst**: **jedna rozmowa = jeden kontekst**, kolejność **core-first** (advancement ✅ →
retention ✅ → catalog-skill ✅ → brand-platform → …; pełna lista i kolejność: `07-define/README.md`).
To faza **CIĘŻKA** — uruchom pełny silnik jakości (fan-out wypełniający kanwę z kodu → adwersaryjna
weryfikacja per twierdzenie względem tras i repozytoriów → checkpoint właściciela).

`brand-platform` jest **wyjątkowy** z trzech powodów:
- **Core-aspiracyjny** (F4 §2): różnicowanie z **DECYZJI właściciela**, nie z dzisiejszej złożoności/monetyzacji —
  prowizja platformy = 0 (`application_fee_percent=0`, pass-through), billing EUR niepodpięty, FR pusty, marka to
  singleton przy 1 organizacji. Kanwa szczególnie pilnuje granicy **stan-JEST ⟂ `PROPOZYCJA:`** (jak `retention`).
- **⛓ Jedyny węzeł ŚCISŁEJ WSPÓŁPRACY w całej mapie** (F6 §2): **Shared Kernel `users`/`invites` z `identity`** —
  para modułów nierozdzielna bez refaktoru. Kanwa MUSI opisać ten szew: co w `users`/`invites` należy do tożsamości
  (kto zalogowany) vs do governance marki (Prezes zarządza ambasadorami).
- **Punkt kolaboracji aktora z `catalog-skill` (H6):** Prezes spina governance marki (`brand-platform`) z autoringiem
  globalnego katalogu, ALE `brand-catalog.ts` **∈ `catalog-skill`**, nie brand-platform — to **nie** cross-write.
  brand-platform wystawia **org jako kotwicę tenancy** (`organization_id → organizations` RESTRICT), a catalog-skill
  autoruje pod nią (potwierdzone w `07-define/catalog-skill.md`, ZWALIDOWANY).

## Zrób po kolei

1. Przeczytaj `docs/ddd/kalisthenos/README.md` (tablica statusu — F1–F6 ✅, F7 🟡: #1 `advancement` ✅, #2 `retention` ✅,
   #3 `catalog-skill` ✅).
2. Przeczytaj `docs/ddd/kalisthenos/glosariusz.md` (kanon; zwłaszcza: **Marka / brand** (singleton, kod `brand`,
   tabela `organizations`), **Region** (kraj PL/FR + waluta), **Prezes marki** (kod `brand_admin`/`brand_owner`/
   `president`, `app/routes/marka`), **Trener + „Ambasador" = relacja** (to samo słowo, znaczenie per kontekst),
   **Dezaktywacja/wstrzymanie** (`archived_at` — Shared Kernel 3 poddomen, hot-spot F3), **MRR ambasadora**,
   **Zaproszenie / target_role** (Prezes NIE jest zapraszalny — tylko seed), oraz bloki „Uzupełnienie — sesja F7 ·
   advancement/retention/catalog-skill").
3. Przeczytaj `07-define/README.md` (indeks + kolejność), **`SZABLON-artefaktu.md`** oraz **zwalidowane sąsiady**,
   zwłaszcza **`07-define/catalog-skill.md`** (sekcja Zależności: **`brand-platform` = U/kotwica tenancy** — globalne
   wiersze katalogu kotwiczą org przez `organization_id → organizations` RESTRICT; **H6** autoring markowy jako punkt
   kolaboracji aktora, `brand-catalog.ts` ∈ catalog-skill, NIE cross-write). Sąsiad `identity` (#1) NIE ma jeszcze
   kanwy (generic, później) — ale ⛓ SK z nim opisz TU z kodu.
4. **Wejście per kontekst** — przeczytaj płaty F5/F4/F6 dotyczące `brand-platform`:
   - **F5** `05-connect-context-map.md`: nazwa kanoniczna `brand-platform` (Tenancy #2 + Ambasadorzy #3); **H3**
     (relacja coachingowa rozmyta — self-FK `users.trainer_id` w `identity` + projekcja ekonomiczna
     `coaching_subscriptions` w `billing-gating` + kręgosłup zdenormalizowany `trainer_id`/`trainee_id`); **H8**
     (izolacja tenantów = Published Language, `trainer_id`, 404-nie-403, egzekwowana per-kontekst).
   - **F4** `04-strategize-core-domain-chart.md` §2: **core-aspiracyjne** = niskie różnicowanie DZIŚ, budowane wzorcami
     core zawczasu (platforma marki #2+#3 + maszyneria forka katalogu #4). Firmowe dla *inwestycji*, `PROPOZYCJA:` dla
     *dzisiejszego moatu* (monetyzacja marki = 0, billing EUR niepodpięty, FR pusty).
   - **F6** `06-organise-wlasnosc-modulow.md` §2: **węzeł ⛓ ścisłej współpracy `identity`↔`brand-platform`** (SK
     `users`/`invites`) — jedyny w kalisthenos; §3 punkt kolaboracji aktora (autoring markowy z catalog-skill, H6);
     tryb zależności per krawędź.
5. **Kod (F7 CIĘŻKA — czytaj dokładnie, z dowodami `file:line`):**
   - `app/lib/ambassadors.ts` — repozytorium ambasadorów (trenerzy org) dla Prezesa: lista z metrykami (MRR par),
     profil, zaproszenie (→ `auth/invite.ts`), **dezaktywacja/reaktywacja + best-effort pauza/wznowienie subskrypcji**
     (komenda do `billing-gating`); org-scoped.
   - `app/lib/ambassador-types.ts` — `AmbassadorInviteSchema` (Zod, walidacja zaproszenia ambasadora).
   - `app/lib/auth/invite.ts` — zaproszenia linkiem (`invite_target_role ∈ {trainee, trainer}`) — **Shared Kernel z
     `identity`**: ten sam moduł tworzy trenera/ambasadora i podopiecznego. Zaznacz szew SK.
   - `app/lib/auth/index.ts` — role (`requireUser({role:"brand_admin"})`, `defaultPathForRole` — guard roli
     przekierowuje zamiast 403), sesje. `app/lib/authz.ts` — tenant-scope.
   - `schema.ts` — `organizations` (marka/tenant), `regions` (kraj + waluta + locale), `users` (`userRole`,
     self-FK `trainer_id`, `organizationId`, `region_id`, `archivedAt` — **Shared Kernel**), `invites`
     (`invite_target_role`). Potwierdź: `archived_at` rządzi 3 poddomenami (rotacja sesji=Tożsamość, dezaktywacja
     ambasadora=brand-platform, gating=billing-gating).
   - Trasy: `app/routes/marka/*` — powłoka Prezesa + **zarządzanie ambasadorami** (lista, profil, zaproszenie,
     dezaktywacja/reaktywacja) + autorstwo katalogu marki (to ostatnie **∈ catalog-skill**, NIE tu — potwierdź
     granicę). „Regiony"/„Ustawienia" = **„wkrótce"** (stub — missing surface, zaznacz).
   - **Dowody granic:** (a) ⛓ SK — `users`/`invites` współdzielone przez `identity` i `brand-platform` (grep
     importerów `auth/invite.ts`, `schema.users`); (b) H6 — autoring markowy pisze WŁASNE tabele katalogu
     (`brand-catalog.ts` ∈ catalog-skill), brand-platform tylko kotwiczy org (potwierdź, że brand-platform NIE pisze
     `exercises`/`skills`); (c) dezaktywacja ambasadora → **best-effort** pauza subskrypcji (komenda cross-context do
     billing-gating — potwierdź best-effort, że błąd Stripe nie wywraca dezaktywacji).

## Technika + silnik jakości

- **Bounded Context Canvas** (wypełniana Z KODU, walidowana przez właściciela). Pola: **Strategic Classification**
  (core-aspiracyjny — różnicowanie z decyzji, nie z monetyzacji; ⛓ SK z identity; Tenancy #2 + Ambasadorzy #3),
  **Ubiquitous Language** (Marka/organizations, Region, Prezes marki, Trener/Ambasador=relacja, Zaproszenie/
  target_role, Dezaktywacja/archived_at, MRR), **Odpowiedzialności** (governance org/regionów, cykl życia ambasadora:
  zaproszenie/dezaktywacja/reaktywacja, wgląd MRR; **NIE** autoring katalogu — to catalog-skill, **NIE** billing —
  to billing-gating, tylko komenda pause/resume), **Komunikaty IN** (komendy Prezesa z tras `marka/*`),
  **Komunikaty OUT** (komenda best-effort pauzy do `billing-gating`; czyta `coaching_subscriptions` dla MRR;
  ⛓ współdzieli `users`/`invites` z identity; kotwiczy org dla catalog-skill), **Zależności + tryb** (⛓ ścisła
  współpraca z identity; punkt kolaboracji aktora z catalog-skill H6; komenderuje billing-gating; Conformist do
  kręgosłupa tenancy), **Reguły/decyzje** (Prezes niezapraszalny/seed; dezaktywacja miękka `archived_at`; pauza
  best-effort; MRR = suma `amount_minor` aktywnych; prowizja=0), **Założenia** (1 marka = singleton; org wyprowadzana
  z `trainer_id`), **Otwarte pytania** (monetyzacja=0 → `PROPOZYCJA:` prowizji; Regiony/Ustawienia „wkrótce";
  niepełne odwrócenie dezaktywacji — dług F2; szew SK identity↔brand-platform).
- **Silnik jakości (CIĘŻKA):** fan-out agent(ów) wypełnia kanwę z kodu z dowodami → **adwersaryjna weryfikacja**
  każdej odpowiedzialności i każdego komunikatu IN/OUT względem realnych tras/repozytoriów (czy dezaktywacja NAPRAWDĘ
  pauzuje subskrypcję best-effort? czy brand-platform pisze katalog czy tylko kotwiczy org? gdzie DOKŁADNIE biegnie
  szew SK `users`/`invites` z identity? czy Prezes jest niezapraszalny poza seedem?) → przeżywa tylko to, co
  ugruntowane w kodzie → checkpoint właściciela. (Wzorzec sprawdzony na `advancement`/`retention`/`catalog-skill`:
  fan-out fill → sceptyk per twierdzenie; twierdzenia o *braku* przez grep; 0 REFUTED, doprecyzowania jako PARTIAL.
  **Uwaga operacyjna:** weryfikacja jest tokeno-ciężka — jeśli limit sesji przerwie krytyków/część weryfikacji,
  wznów workflow z cache lub zweryfikuj twierdzenia graniczne ręcznie z kodu; NIE domyślaj werdyktu na REFUTED.)
- **MCP `context7`** po best practices Bounded Context Canvas / DDD taktycznego (Shared Kernel, Customer/Supplier,
  Conformist), jeśli pomocne.

## Definicja „done" tej rozmowy (dopilnuj wszystkich)

- [ ] `07-define/brand-platform.md` zapisany wg `SZABLON-artefaktu.md` + struktury Bounded Context Canvas
      (status DRAFT); każdy komunikat/odpowiedzialność z dowodem `file:line`; stan-JEST oddzielony od `PROPOZYCJA:`.
- [ ] Przedstawiony właścicielowi i **zwalidowany** → status `ZWALIDOWANY` (checkpoint — NIE waliduj sam).
- [ ] `glosariusz.md` uzupełniony (blok „Uzupełnienie — sesja F7 · kontekst `brand-platform`" — jeśli kanwa uściśli
      termin, np. szew SK, granica governance vs autoring, best-effort pauza).
- [ ] `07-define/README.md`: `brand-platform` → ✅ + data. Główny `README.md`: F7 zostaje 🟡 (w toku).
- [ ] **Ten plik (`next-session-prompt.md`) przepisany na F7 · kontekst #5 `programming`** (supporting: plany
      wersjonowane #7; Customer do catalog-skill — `plan_items.exercise_id → exercises` RESTRICT; forward-only publish
      draft→active). Po ostatnim kontekście (#13 delivery) → przepisz na **F8 (Synteza)**.

## Zasada nadrzędna

Wypełniaj kanwę **tym, co JEST** (rekonstrukcja z kodu + intencja właściciela dla aspiracyjnego różnicowania).
`brand-platform` jest **core-aspiracyjny** — rdzeniowość jest zakładem strategicznym, nie dzisiejszą złożonością/
monetyzacją; więc jak w `retention` **rygorystycznie oddzielaj stan-JEST od `PROPOZYCJA:`**. Propozycje „jak powinno
być" (prowizja platformy >0; realny moat marki; rozcięcie szwu SK `users`/`invites`; Regiony jako jednostka
zarządcza; pełne odwrócenie dezaktywacji ambasadora) oznaczaj `PROPOZYCJA:`. Nie zamrażaj bez walidacji.

## Kryterium przejścia

`brand-platform` ma **kompletną Bounded Context Canvas** — klasyfikacja strategiczna (core-aspiracyjny), ubiquitous
language (Marka/Region/Prezes/Ambasador/Zaproszenie/archived_at/MRR), odpowiedzialności (governance + cykl życia
ambasadora, BEZ autoringu katalogu i BEZ billingu), komunikaty IN/OUT z dowodami (⛓ SK z identity; best-effort pauza
do billing-gating; kotwica org dla catalog-skill), zależności + tryby (⛓ ścisła współpraca; H6 punkt kolaboracji
aktora; komenderuje billing-gating) — zwalidowaną przez właściciela. Wtedy pałeczka idzie na kontekst #5
(`programming`).

---
*Cała mapa faz i decyzje: `00-plan-analizy-strategicznej.md`. Kolejność kontekstów F7:
`07-define/README.md`. Ten plik zawsze pokazuje tylko NAJBLIŻSZY kontekst do zrobienia.*
