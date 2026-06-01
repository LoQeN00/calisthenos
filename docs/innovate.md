# kalisthenos — kierunki rozwoju (innovate backlog)

> Backlog kierunków produktowych z sesji innowacyjnej (2026-06-01), ugruntowanej
> researchem (kalistenika: podstawy, progresja, co analizują trenerzy, ich bóle,
> krajobraz narzędzi). To **lista do wyboru**, nie plan na już — każdy większy
> kierunek idzie własnym cyklem `spec → plan → implementacja` (skille `/feature`).
> Aktualizuj statusy w miarę realizacji.

## Decyzja strategiczna (kontekst)

Budujemy **wyróżnik dla wielu trenerów kalisteniki**. Luka rynkowa:
- generyczne platformy coachingowe (TrueCoach, Trainerize, Everfit) mają relację
  trener↔podopieczny, ale model danych **wagowy** („ćwiczenie + ciężar × powt.");
- apki kalisteniczne (The Movement Athlete, Caliverse, Simple Calisthenics) mają
  **model progresji przez dźwignię** (warianty/drabiny), ale są **self-serve, bez
  trenera w pętli**.

Nikt nie jest jednym i drugim naraz. W kalistenice **obciążeniem jest *który
wariant* się wykonuje** — to oś, wokół której budujemy.

Legenda statusów: ✅ zrobione · 🚧 w toku · ⬜ do zrobienia.

---

## A. Model progresji / drzewka umiejętności — ✅ (wdrożone, z ogonem roadmapy)

Fundament wyróżnika. Umiejętność = uporządkowana drabina wariantów (każdy wariant =
istniejące ćwiczenie); pozycja podopiecznego śledzona przez ręczne awanse trenera;
sygnałowa sugestia „rozważ awans" z istniejących statystyk.

**Zrobione (pierwszy spec):**
- Model: `skills` / `skill_variations` / `skill_advancements`; aktualny poziom =
  najnowsze zdarzenie; historia awansów.
- Autoring umiejętności (trener), mapa trenera z awansem/cofnięciem + sugestią,
  read-only mapa podopiecznego.
- Cross-linki Progresja ↔ Umiejętności (żeby nie myliły się jako duplikat).
- Spec: [`docs/superpowers/specs/2026-06-01-umiejetnosci-progresja-wariantow-design.md`](superpowers/specs/2026-06-01-umiejetnosci-progresja-wariantow-design.md)
- Plan: [`docs/superpowers/plans/2026-06-01-umiejetnosci-progresja-wariantow.md`](superpowers/plans/2026-06-01-umiejetnosci-progresja-wariantow.md)
- ✅ **Widok „Rozwój"** — per-podopieczny widok „Progresja" i „Umiejętności" scalone w jedną powierzchnię „Rozwój": drzewo umiejętności + lista pozostałych ćwiczeń + szczegół węzła (drabina + wykres) + porównanie. Stare URL-e to 301 shimmy. ([spec](superpowers/specs/2026-06-01-rozwoj-polaczenie-progresja-umiejetnosci-design.md), [plan](superpowers/plans/2026-06-01-rozwoj-polaczenie-progresja-umiejetnosci.md))

**Ogon roadmapy A (świadomie odłożone):**
- ⬜ **Konfigurowalne bramki awansu** — trener definiuje próg per wariant
  („3×8 czysto", „5×20 s hold", RPE ≤ 8); sugestia odpala po jego spełnieniu.
  (Research: reguły awansu są jawne i policzalne.)
- ⬜ **Auto-podmiana ćwiczenia w aktywnym planie przy awansie** — dziś rozprzęgnięte
  (deep-link do edytora); docelowo jedno kliknięcie tworzy nową wersję planu.
- ✅ **Drzewo prerekwizytów (DAG)** — np. muscle-up wymaga 10 podciągnięć + dipów +
  false grip; „odblokowywanie" gałęzi umiejętności. ([spec](superpowers/specs/2026-06-01-drzewo-umiejetnosci-design.md), [plan](superpowers/plans/2026-06-01-drzewo-umiejetnosci.md))
- ⬜ **Mastery 0–100% per umiejętność** (model TMA) obok/zamiast poziomów dyskretnych.
- ⬜ **Wspólna biblioteka umiejętności** (fork drabin między trenerami) — łączy się z
  „Public exercise library" ze spec V1 §16.
- ⬜ **Nudge „blisko awansu" dla podopiecznego** (po walidacji, że motywuje, nie myli).

---

## B. Warstwa gotowości i bezpieczeństwa — ⬜ (nie wybrane, wysoka wartość)

**Czego dziś nie ma w ogóle.** Trener nie widzi przeciążenia/kontuzji zanim się
stanie; ścięgna (łokcie, nadgarstki) to #1 problem kalisteniki, a kontuzje to głównie
tendinopatie z przeciążenia — „zarządzaj obciążeniem", nie „odpocznij".

**Co mogłoby robić:**
- Krótki **check-in gotowości** podopiecznego (sen, ból mięśniowy, **ból stawu**,
  motywacja, energia) — „traffic light".
- Flagi dla trenera: **skok tygodniowej objętości > ~10%** (ścięgna adaptują się
  wolniej niż mięśnie), sugestia **deloadu co 4–6 tyg.**, **nierównowaga push/pull**,
  zgłoszony ból stawu, ból utrzymujący się > 24–48 h.
- Opcjonalnie **masa ciała** — w kalistenice wprost zmienia trudność dźwigni
  (cięższy = trudniejsze skille), więc wyjaśnia np. „stojący" front lever.

**Bazuje na:** nowe tabele check-in/bodyweight + reguły nad istniejącą objętością
(`stats.ts` już liczy objętość, „red zone" % wysiłku, interwały).
**Szac. rozmiar:** średni (schemat + check-in UI + reguły/flagi). Mocny argument
„bezpieczeństwo/retencja".

---

## C. Przegląd techniki (form review) — ⬜ (wybrane do pogłębienia)

**Ból trenera:** dziś ogląda wideo w WhatsApp/IG, adnotuje w osobnym narzędziu, nic
nie wiąże klipu z konkretną serią. Online-coaching kalisteniki to de facto async
video-coaching.

**Co mogłoby robić (bazuje na tym, że wideo już jest przypięte do serii):**
- **Kolejka „do przeglądu"** dla trenera (ile nowych klipów czeka).
- **Komentarz/feedback trenera do serii/klipu** (ewentualnie z timestampem).
- **Punkty kontrolne formy per ćwiczenie/umiejętność** — checklista zdefiniowana
  przez trenera (np. front lever: łopatki w depresji, biodra na linii, proste ręce),
  odhaczana ✓/✗ + nota → **strukturalna jakość formy**.
- **Spięcie z A:** awans wymaga nie tylko liczb, ale i OK na punktach formy z
  ostatniego klipu („forma jest bramką", nie sugestią).

**Bazuje na:** `workoutSetLogs.videoFileId` (już jest), nowe tabele
komentarzy/punktów formy. **Szac. rozmiar:** średni. Działa też samodzielnie (bez A).

---

## D. Pętla komunikacji / coaching asynchroniczny — ⬜ (wybrane do pogłębienia)

**Ból trenera:** ręcznie kompiluje postępy i pisze feedback co tydzień; check-iny
i podsumowania to najczęściej proszony „AI add-on" u konkurencji (często płatny).

**Co mogłoby robić:**
- **Komentarz trenera pod logiem treningu** (lekki wątek async per sesja; podopieczny
  może odpisać).
- **Auto-szkic** tygodniowego/miesięcznego podsumowania (na bazie istniejącego
  „Wrapped" + `stats.ts` + historii awansów z A) → trener edytuje → ląduje w module
  **Konsultacji** (który już istnieje z punktami akcji).
- **„Digest"** co podopieczny zrobił od ostatniej konsultacji.

**Bazuje na:** `wrapped.ts`, `stats.ts`, `consultations.ts`, `skill_advancements`.
**Szac. rozmiar:** komentarz pod logiem — mały; auto-szkic — mały/średni jako
template'owy (bez LLM), większy jako LLM-assisted (wtedy patrz skill `claude-api`,
prompt caching). Najsilniejszy efekt, gdy A i C już są (zasilają treść szkicu).

---

## E. Programowanie wspomagane — ⬜ (nie wybrane)

**Ból trenera:** buduje plany od zera, kopiuje między podopiecznymi.

**Co mogłoby robić:**
- **Pole tempo/TUT** w ćwiczeniu/pozycji planu (kluczowa dźwignia obciążenia w
  kalistenice, której dziś brak — jest tylko reps + trudność).
- **Szablony planów** i reuse między podopiecznymi.
- Prosta **periodyzacja / DUP** (dni: siła / hipertrofia / skill) — model najczęściej
  wskazywany jako pasujący do kalisteniki.
- Auto-podpowiedź progresji wprost w edytorze planu (spina się z A).

**Bazuje na:** edytor planu (`plans.ts`, `plany.$planId.tsx`), schemat `plan_items`.
**Szac. rozmiar:** tempo/TUT — mały (pole + log); szablony — średni; periodyzacja —
średni/duży.

---

## Sugerowana kolejność (jeśli chcesz „loop")

A jest kręgosłupem (zrobione). Naturalna kontynuacja: **C** (czyni awanse z A
wiarygodnymi — forma jako bramka, a sam w sobie zabija ból WhatsApp/IG) → **D**
(wynosi A+C do tygodniowego rytmu trenera, zasilając Konsultacje) → **B**
(bezpieczeństwo/retencja) → **E** (programowanie). Każdy osobnym `/feature`.

---

## Źródła researchu (skrót)

Autoregulacja/RPE-RIR, drabiny umiejętności (front lever, planche, human flag,
muscle-up, HSPU, pistol), progi awansu, deload/periodyzacja, kontuzje przeciążeniowe:
- calisthenicsassociation.org (autoregulation, muscle-up, pistol, golfer's/tennis elbow)
- gmb.io/planche, bodyweighttrainingarena.com (planche), calisthenicsnerd.com / bergmovement.com (front lever)
- themovementathlete.com (assessment/mastery, overtraining), gornation.com (front lever technique)
- r/bodyweightfitness Recommended Routine (progresja/forma)
Krajobraz narzędzi i bóle coachów:
- trainerize.com/blog, assistantcoach.fit (realne ceny/ukryte koszty), coachrx.app, mypthub.net (auto check-iny)
- hevycoach.com (kalistenika: metryki/wideo/chat), truecoach.co/blog (tracking)
- gymscore.ai / cueform.ai (AI form analysis — pokrycie kalisteniki cienkie), coachnow.com / onform.com (adnotacja wideo)
