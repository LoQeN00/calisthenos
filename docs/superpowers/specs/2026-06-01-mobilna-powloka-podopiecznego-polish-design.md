# Spec — polish mobilnej powłoki podopiecznego (PWA)

**Data:** 2026-06-01
**Typ:** FEATURE (restrukturyzacja nawigacji + bottom sheet) + bundled fixes
**Zakres powierzchni:** `/podopieczny/*` — wyłącznie warstwa wizualna/layout.
**Design-system:** `design-system/README.md`, `app/styles/tokens.css` (bez zmiany języka designu).

---

## Cel i kontekst

Powłoka podopiecznego jest mobile-first i instalowalna jako PWA, ale dolny pasek
nawigacji renderuje **8 pozycji** (`Mój plan, Sesje, Historia, Statystyki,
Progresja, Umiejętności, Sylwetka, Konsultacje`). Na telefonie ~360px daje to
~45px na zakładkę z ikoną 22px i etykietą 10.5px — ciasno, etykiety się gniotą.
Natywny wzorzec to maks. 5 slotów. Dodatkowo pulpit podopiecznego nie zwija się
poprawnie na mobile (inline `gridTemplateColumns: "1fr 1fr"` nadpisuje media
query), a w kilku miejscach występują emoji łamiące udokumentowaną zasadę „zero
emoji".

Ambicja: **wierność systemowi + lekkie podniesienie jakości** (mikro-interakcje,
hierarchia, responsywność) — bez zmiany charakteru wizualnego.

## Decyzje (ustalone w brainstormie)

- **Główne 4 zakładki:** `Mój plan · Sesje · Historia · Progresja`.
- **„Więcej" (overflow):** `Statystyki · Umiejętności · Sylwetka · Konsultacje`.
- **Wzorzec „Więcej":** dolny arkusz (bottom sheet), nie osobna strona.

## Architektura

### Layout `app/routes/podopieczny/_layout.tsx`
Renderuje **dwie nawigacje**, przełączane breakpointem (czysty podział zamiast
kruchego ukrywania pojedynczych itemów):

- **Desktop (>880px):** istniejący pionowy `.sidenav` ze **wszystkimi 8**
  pozycjami — bez zmian funkcjonalnych.
- **Mobile (≤880px):** `.sidenav` ukryty (`display:none`); zamiast niego stały
  dolny pasek `MobileTabbar` z **5 slotami**.

`NAV_ITEMS` rozdzielone na `PRIMARY_ITEMS` (4) i `MORE_ITEMS` (4). Desktopowy
sidenav iteruje po pełnej liście (kolejność jak dziś); `MobileTabbar` dostaje obie
listy + `tails`.

### Komponent `app/components/mobile-tabbar.tsx` (nowy)
`MobileTabbar({ primary, more, tails })`:
- renderuje 4 `NavLink` (primary) + przycisk „Więcej" (`Icons.More`),
- stan otwarcia arkusza w `useState`,
- zakładka „Więcej" **aktywna** (akcent), gdy bieżąca ścieżka pasuje do którejś
  trasy z `more` (porównanie po `useLocation().pathname` z uwzględnieniem
  prefiksu, analogicznie do `end={false}` w NavLink),
- **kropka-badge** na ikonie „Więcej", gdy suma liczników pozycji w `more` > 0
  (dziś: otwarte konsultacje),
- tap-target każdej zakładki ≥44px.

Bottom sheet (w tym samym pliku, komponent wewnętrzny `MoreSheet`):
- tło `rgba(14,17,22,.45)` + `backdrop-filter: blur(4px)` (spójne z modalem),
- panel wjeżdża od dołu (`@keyframes slideup`, ~0.18s), respektuje
  `env(safe-area-inset-bottom)`,
- zamknięcie: tap w tło, `Escape`, wybór pozycji,
- pozycje: ikona + etykieta + mono-tail badge (ten sam język co sidenav),
- focus wraca na przycisk „Więcej" po zamknięciu; `role="dialog"` +
  `aria-modal`, blokada scrolla tła na czas otwarcia.
- Bez JS: arkusz się nie otworzy (PWA zakłada JS); pozostałe 4 zakładki działają
  jako zwykłe linki. Degradacja akceptowalna.

## Zmiany w pulpicie `app/routes/podopieczny/_index.tsx`
- Sekcje „Sesje w planie" / „Twoja historia”: `<div className="grid"
  style={{gridTemplateColumns:"1fr 1fr"}}>` → `className="grid grid-2"` (bez
  inline). Razem z dodaniem `.grid-2` do media query → zwija się do 1 kolumny na
  mobile.
- Nagłówek pulpitu (inline `row between`) → wzorzec `.pagehead` (stackuje się na
  mobile; CTA „Zarejestruj sesję" pod tytułem, nie obok).
- Pasek statystyk (`flex-wrap`) zostaje; `vdiv` ukryte na mobile (≤880px), by nie
  zostawały wiszące pionowe kreski po zawinięciu.
- Usunięcie emoji `✨` z eyebrow „Świeży wrapped" (czysty mono-eyebrow).

## Sweep emoji (warstwa podopiecznego)
- `historia.$logId.tsx`: toasty PR `🏆 …` → bez emoji (sama treść).
- `statystyki.tsx`: końcowe `✓` w zdaniu → usunięte.
- Strzałki `→`, `▲/▼`, `·`, `≤/≥` to funkcjonalne znaki (nie emoji) — zostają.

## Zmiany CSS `app/styles/tokens.css`
- Nowy blok `.mobile-tabbar` (mobile-only, `position:fixed; bottom:0`, 5×`flex:1`,
  ikony 22px, aktywny wskaźnik akcentu jak obecny `.nav-tabs-bottom`).
- `.more-sheet`, `.more-sheet-panel`, `.more-sheet-item` + `@keyframes slideup`.
- `.sidenav` ukryty na mobile (≤880px) w kontekście layoutu podopiecznego.
- `.grid-2` dopisane do reguły zwijania w `@media (max-width: 880px)`.
- `.main` bottom-padding pod paskiem przez `:has(.mobile-tabbar)`
  (`calc(80px + env(safe-area-inset-bottom))`).
- Usunięcie nieużywanego po zmianie wariantu `.sidenav.nav-tabs-bottom`
  (zastąpiony przez `.mobile-tabbar`; trener go nie używał).

### Skutek uboczny `.grid-2` (zweryfikować w review)
Zwinięcie `.grid-2` na mobile dotyczy też `loguj.$sessionId.tsx:308`
(Data/Notatka) i `sylwetka.tsx:226` (pola uploadu) — w obu przypadkach stackowanie
do jednej kolumny jest pożądane na telefonie.

## Testy / bramki / out-of-scope
- **UI-only** — brak logiki testowalnej bez DB → bez nowych unit-testów (zgodnie
  z dev-flow dla zmian UI).
- Bramki: `npm run typecheck`, `npm run lint`, `npm run build`, `/code-review`.
- **Bez** `/security-review` (brak zmian auth / `trainer_id` / podpisanych URL /
  uploadu), bez migracji, bez testów integracyjnych.
- Dokumentacja: dopisać `mobile-tabbar.tsx` do `app/components/README.md`;
  zaktualizować `app/styles/README.md` jeśli opisuje klasy powłoki.
- **Zakres zamknięty:** powłoka mobilna podopiecznego + pulpit + sweep 3 emoji.
  Pozostałe trasy (`sesje`, `progresja`, `umiejetnosci`, `sylwetka`,
  `konsultacje`, `wrapped`) — bez zmian w tej iteracji.

## Ryzyka
- Podwójna nawigacja = duplikacja markupu nav (akceptowalne; ukryta strona
  `display:none`, poza drzewem a11y).
- `:has()` ma dobre wsparcie w nowoczesnych przeglądarkach; PWA zakłada
  ewergreen — fallback: bottom-padding można też przypiąć klasą layoutu, gdyby
  trzeba.
