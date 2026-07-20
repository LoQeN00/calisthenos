# F2 — Discover — mapa zdarzeń kalisthenos

> **Status:** ZWALIDOWANY · **Data:** 2026-07-06
> **Krok DDD:** 2 Discover · **Zależy od:** F1

EventStorming Big Picture **zrekonstruowany z kodu** (brownfield) — modeluje stan,
który JEST, nie docelowy. Każde zdarzenie ma dowód (tabela.kolumna w `schema.ts` +
funkcja utrwalająca). Zwalidowany przez właściciela (sesja 2026-07-06): oś, pivotal
events i kandydackie granice potwierdzone; hot-spoty rozstrzygnięte interaktywnie.

## Wejście (co przeczytano)

- **Silnik jakości (pełny fan-out, §7 planu):** 23 agenty — po jednym czytającym
  na 10 podsystemów (mapa §8) → **adwersaryjna weryfikacja** każdego zdarzenia
  względem `schema.ts`+kodu → synteza osi → krytyk kompletności → rekonsyliacja.
  Wynik weryfikacji: **0 zdarzeń obalonych**, ~11 przeklasyfikowanych z osi na
  read-modele/komendy (m.in. cała analityka, część logowania i płatności),
  ~16 zdarzeń **pominiętych przez czytających odzyskanych** przez weryfikatorów
  (najwięcej w drzewie umiejętności). Krytyk: `gaps-found` (3 brakujące, 3
  misklasyfikacje, 2 pominięte szwy) — wszystkie wchłonięte w rekonsyliacji.
- **Podsystemy (schemat + repo + spec-y):** tożsamość (`users/sessions/invites`,
  `app/lib/auth/*`, `authz.ts`), marka (`organizations/regions`, `organizations.ts`,
  `ambassadors.ts`, `app/routes/marka/*`), biblioteka ćwiczeń (`exercises/
  exercise_categories`, `catalog.ts`, `catalog-math.ts`, `brand-catalog.ts`,
  `exercises.ts`, `categories.ts`), umiejętności+drzewo (`skills/skill_variations/
  skill_advancements/skill_prerequisites`, `skills.ts`, `skill-tree(-math).ts`,
  `skill-progression(-math).ts`), plany (`plans/plan_sessions/plan_blocks/
  plan_items`, `plans.ts`), logowanie (`workout_logs/workout_exercise_logs/
  workout_set_logs`, `workouts.ts`), sylwetka (`body_photos/files`, `body-photos.ts`,
  `file-uploads.ts`, `files.ts`), statystyki/Wrapped (`stats.ts`, `wrapped.ts`,
  `progression(-math).ts`), konsultacje (`consultation_schedules/consultations/
  consultation_action_items/google_calendar_connections`, `consultations.ts`,
  `consultation-schedules.ts`, `consultation-status.ts`, `app/lib/google/*`),
  płatności (`stripe_connections/coaching_subscriptions/subscription_payments/
  processed_webhook_events`, `app/lib/stripe/*`, `payments.ts`, `money.ts`).
  Ścieżki potwierdzone `Glob`/`Grep`.
- **Niezależne kotwice właściciela osi (weryfikacja rekonstrukcji):** `plans.ts`
  (`publishPlan` — draft→active + archiwizacja poprzedniego), `consultation-status.ts`
  (status = read-model; `cancelled` skleja intencje), `stripe/webhook.ts`
  (lustro statusu, `paused` liczone z `pause_collection`, dedup po `event.id`),
  `skill-progression.ts` (awans append-only, `advanced_by`=trener, regres = to
  samo zdarzenie).
- **Artefakty:** F1 (`01-understand-model-biznesowy.md`), `glosariusz.md` (kanon +
  hot-spoty), plan `00-*.md` (§4 zasady, §7 silnik jakości, §8 mapa, §9 runbook F2).

## Ustalenia

Czytaj: **Aktor — «Komenda» → Zdarzenie (czas przeszły)**, z dowodem/notatką w
nawiasie. **Pogrubione** = pivotal (obraca proces lub przechodzi przez granicę
kontekstu). `PROPOZYCJA:` = aspiracja obecna w modelu, ale DZIŚ niezbudowana.
Read-modele (statystyki, Progresja, Wrapped, cockpit, gating) NIE są zdarzeniami —
wymienione osobno w szwach. **Słownictwo kanoniczne** (F1 Aneks A + rewizja
2026-07-06: „markowe" → **„globalne"**).

### Oś zdarzeń end-to-end

#### 1. Bootstrap marki (seed) — Operator
Jednorazowy tenancy-bootstrap wykonywany przez człowieka poza produktem
(`scripts/seed.ts`), idempotentny. **Uwaga (decyzja 2026-07-06):** krok „promocja
biblioteki założyciela do marki" **NIE istnieje w modelu** — prezes autoruje
globalną bibliotekę wprost. `promoteTrainerCatalogToBrand` (`catalog.ts:309`) jest
w kodzie, ale oznaczony **do usunięcia** i celowo pominięty na osi.
- Operator — «Zaseeduj trenera-założyciela» → Trener-założyciel zaseedowany
  (`seed.ts:44-51` INSERT `users` role='trainer'; konto realne, ale bez kroku promocji).
- Operator — «Zaseeduj markę» → **Marka utworzona** (`organizations.ts:14-18`
  `ensureOrganization`; SINGLETON — istniejącą zwraca i ignoruje `name`; multi-brand = aspiracja).
- Operator — «Zaseeduj region» → Region utworzony (`organizations.ts:22-37`
  `ensureRegion`, idempotentne po org+country; PL realny, FR zaseedowany-ale-PUSTY,
  `eur` nierealizowane bo billing hardkoduje `pln` — `PROPOZYCJA:` jako jednostka operacyjna).
- Operator — «Zaseeduj prezesa marki» → **Prezes marki utworzony**
  (`organizations.ts:59-87` `ensureBrandAdmin`, role='brand_admin'; niezapraszalny —
  `invites_target_check` dopuszcza tylko trainee|trainer).
- Operator — «Przypisz użytkownika do marki/regionu» → Użytkownik przypisany do marki
  i regionu (`organizations.ts:39-49` `assignUserToOrgRegion`; backfill nieprzypisanych;
  trenerzy→PL, podopieczni→region NULL, dziedziczą z trenera).

#### 2. Onboarding trenera-ambasadora — Prezes marki → Trener
- Prezes marki — «Zaproś ambasadora» → **Zaproszenie ambasadora utworzone**
  (`ambassadors.ts:162-185` → `invite.ts:43-59` `createInvite` target_role='trainer',
  org+region+invited_by, expires_at=+14d; ta sama tabela `invites` co dla podopiecznego —
  zaproszenie POLIMORFICZNE; link `/zaproszenie/{token}` dostarczany poza systemem).
- Trener (Ambasador) — «Przyjmij zaproszenie» → **Trener-ambasador dołączył**
  (`invite.ts:117-142` gałąź targetRole='trainer' INSERT `users` role='trainer',
  org+region z invite; SELECT…FOR UPDATE; powołuje nowy `trainer_id` = nową granicę
  izolacji danych; w tej samej tx: konsumpcja + auto-login → /trener).
- Trener (Ambasador) — «(krok tx: oznacz zaproszenie jako zużyte)» → Zaproszenie
  skonsumowane (`invite.ts:144-153` UPDATE `consumed_at`/`consumed_by_user` WHERE
  consumed_at IS NULL; synchroniczny krok komendy, nie osobna reakcja; race → rollback konta).

#### 3. Onboarding podopiecznego — Trener → Podopieczny
- Trener (Ambasador) — «Utwórz zaproszenie» → **Zaproszenie utworzone**
  (`invite.ts:33-59` target_role='trainee', trainer_id + `monthly_amount_grosze`;
  token surowy zwracany, w DB tylko sha256; kwota = tylko wartość POCZĄTKOWA
  przekazywana do Płatności — seam).
- Podopieczny (trainee) — «Przyjmij zaproszenie» → **Konto podopiecznego utworzone**
  (`invite.ts:117-141` gałąź else INSERT `users` role='trainee', trainer_id z invite;
  `users_role_check` wymaga trainer_id NOT NULL; org/region NIE ustawiane —
  przynależność do marki WYLICZANA z trenera; email autorytatywny z invite).
- Podopieczny (trainee) — «Przyjmij zaproszenie zastępujące» → Konto reaktywowane
  (zastąpione) (`invite.ts:110-116` UPDATE password_hash + archived_at=NULL WHERE
  id=replaces_user_id; kind='replaced'; NIE tworzy wiersza; miesza reset hasła +
  zdjęcie miękkiej blokady; **brak weryfikacji zgodności emaila — dług bezpieczeństwa**).
- Podopieczny (trainee) — «(krok tx: oznacz zaproszenie jako zużyte)» → Zaproszenie
  skonsumowane (`invite.ts:144-153`; w tej samej tx co utworzenie/reaktywacja;
  auto-login → /podopieczny; best-effort `setMonthlyAmount` — seam do Płatności).

#### 4. Uwierzytelnianie i sesje — wszyscy zalogowani
- Użytkownik (dowolna rola) — «Zaloguj» → Sesja utworzona (`session.ts:23-33`
  INSERT `sessions`, id 32B, expires_at=+30d; cookie `__Host-kth_session`; druga
  ścieżka = auto-login po konsumpcji zaproszenia; ścieżka stałoczasowa chroni przed
  enumeracją emaili).
- System / Polityka — «Odśwież sesję przy bliskim wygaśnięciu» → Sesja zrotowana
  (`session.ts:94-120` `refreshIfNearExpiry` <7 dni, DELETE+INSERT FOR UPDATE;
  no-op gdy user.archived_at — warstwa miękkiej blokady).
- Użytkownik (dowolna rola) — «Wyloguj» → Sesja zniszczona (`session.ts:48-50`
  DELETE `sessions`; GET i POST).
- System / Polityka — «Usuń przeterminowane sesje» → Wygasłe sesje usunięte
  (`session.ts:60-66` `pruneExpiredSessions`, `maybePrune` max raz/godz z loadera,
  fire-and-forget; fakt higieny/idempotencji, nie domenowy).
- **Brak:** self-service «zmień hasło» / «zapomniałem hasła» — jedyna ścieżka
  ustawienia hasła to konsumpcja zaproszenia. **Luka do domknięcia** (decyzja 2026-07-06).

#### 5. Autoring biblioteki globalnej (efektywna biblioteka: globalne) — Prezes marki
Globalna, ogólnodostępna biblioteka ćwiczeń i umiejętności zarządzana przez prezesa
marki (w kodzie: `trainer_id NULL` + `organization_id`), read-only dla trenera,
żywe łącze do wszystkich niesforkowanych odbiorców. Trener używa pozycji globalnych
WPROST (patrz proces 6/7); fork tylko do modyfikacji.
- Prezes marki — «Utwórz globalne ćwiczenie» → **Globalne ćwiczenie utworzone**
  (`brand-catalog.ts:83` `createBrandExercise`; `exercises_owner_check`; tags=[]
  wymuszone — globalne NIE mają kategorii, asymetria wobec własnych).
- Prezes marki — «Zapisz globalne ćwiczenie» → Globalne ćwiczenie zmienione
  (`brand-catalog.ts:106`; zmiana widoczna u wszystkich niesforkowanych trenerów; forki jej NIE dostają).
- Prezes marki — «Zarchiwizuj globalne ćwiczenie» → Globalne ćwiczenie zarchiwizowane
  (`brand-catalog.ts:132` archived_at=now; blokada gdy wariant aktywnej globalnej umiejętności).
- Prezes marki — «Przywróć globalne ćwiczenie» → Globalne ćwiczenie przywrócone (`brand-catalog.ts:150`).
- Prezes marki — «Wgraj wideo demo» → Demo globalnego ćwiczenia wgrane (`uploadFile`
  kind='exercise_demo'; instancja współdzielonego „Plik zapisany"; demo widoczne w org — `fileIsBrandDemoInOrg`).
- Prezes marki — «Utwórz globalną umiejętność» → Globalna umiejętność utworzona (`brand-catalog.ts:261-276`).
- Prezes marki — «Zapisz globalną umiejętność» → Globalna umiejętność zaktualizowana (`brand-catalog.ts:278-296`).
- Prezes marki — «Zarchiwizuj globalną umiejętność» → Globalna umiejętność zarchiwizowana
  (`brand-catalog.ts:298-333` archived_at=now + HARD delete globalnych krawędzi
  `skill_prerequisites`; **BRAK `restoreBrandSkill`** — asymetria vs restore ćwiczenia, dług).
- Prezes marki — «Dodaj wariant» → Globalny wariant dodany do drabiny (`brand-catalog.ts:393+` ordinal MAX+1).
- Prezes marki — «Usuń wariant» → Globalny wariant usunięty (`brand-catalog.ts:468+`
  delete + repack ordinali; RESTRICT z `skill_advancements`).
- Prezes marki — «Przesuń wariant» → Globalna drabina przesortowana (`brand-catalog.ts:695+` dwufazowy update).
- Prezes marki — «Dodaj prerekwizyt (X wymaga Y)» → Globalny prerekwizyt dodany
  (`brand-catalog.ts:565+`; acykliczność w repo, UNIQUE `edge_uniq`).
- Prezes marki — «Usuń prerekwizyt» → Globalny prerekwizyt usunięty (`brand-catalog.ts:597+`).

#### 6. Autoring biblioteki i drzewa trenera (efektywna biblioteka: własne ∪ fork) — Trener
- Trener — «Dodaj kategorię» → Kategoria ćwiczeń dodana (`categories.ts:34`, UNIQUE
  trainer+name; taksonomia TYLKO po stronie trenera — rwie się symetria globalne↔własne).
- Trener — «Usuń kategorię» → Kategoria ćwiczeń usunięta (`categories.ts:58`;
  `exercises.tags[]` NIE czyszczone — osierocony tag filtrowany przy odczycie).
- Trener — «Utwórz ćwiczenie» → Własne ćwiczenie utworzone (`biblioteka.nowe.tsx:77`
  trainer_id=user, org NULL, tags=kategorie).
- Trener — «Zapisz ćwiczenie» → Własne ćwiczenie zmienione (`biblioteka.$exerciseId.tsx:193`;
  własność trainer_id inaczej 404; globalny cel odrzucony).
- Trener — «Zarchiwizuj ćwiczenie» → Własne ćwiczenie zarchiwizowane
  (`biblioteka.$exerciseId.tsx:131` archived_at=now; nigdy hard-delete — FK restrict).
- Trener — «Przywróć ćwiczenie» → Własne ćwiczenie przywrócone (`biblioteka.$exerciseId.tsx:138`).
- Trener — «Wgraj / podmień wideo demo» → Demo własnego ćwiczenia wgrane (`uploadFile`
  kind='exercise_demo'; fork współdzieli demoFileId z globalnym oryginałem — hot-spot).
- Trener — «Dostosuj globalne ćwiczenie» → **Globalne ćwiczenie sforkowane („Dostosuj")**
  (`catalog.ts:133` `forkExercise` origin_id=oryginał, trainer_id=user, org NULL;
  UNIQUE `exercises_trainer_origin_uniq`; copy-on-write przecina granicę własności
  global→trener; oryginał znika z efektywnej biblioteki; łącze do globalnego zerwane;
  idempotentny; **OPCJONALNY — tylko do modyfikacji, nie warunek użycia**).
- Trener — «Utwórz umiejętność» → Umiejętność utworzona (`skills.ts:120-138`
  trainer_id, org NULL; partial UNIQUE `skills_trainer_name_uniq`).
- Trener — «Zapisz umiejętność» → Umiejętność zaktualizowana (`skills.ts:140-158`).
- Trener — «Zarchiwizuj umiejętność» → **Umiejętność zarchiwizowana** (`skills.ts:160-182`
  archived_at=now MIĘKKO + HARD delete `skill_prerequisites`; awanse zostają).
- Trener — «Dodaj wariant» → Wariant dodany do drabiny (`skills.ts:218-289` ordinal
  MAX+1; reguła „ćwiczenie ≤1 umiejętności w widoku" w repo).
- Trener — «Usuń wariant» → Wariant usunięty (`skills.ts:292-347` delete + dwufazowy
  repack; RESTRICT z `skill_advancements`).
- Trener — «Przesuń wariant» → Drabina wariantów przesortowana (`skills.ts:354-396`).
- Trener — «Dodaj prerekwizyt (X wymaga Y)» → Prerekwizyt dodany (krawędź drzewa)
  (`skills.ts:495-519`; `wouldCreateCycle` w REPO nie DB; CHECK `no_self_loop`; race SELECT↔INSERT — hot-spot).
- Trener — «Usuń prerekwizyt» → Prerekwizyt usunięty (`skills.ts:522-537`).
- Trener — «Dostosuj globalną umiejętność» → **Globalna umiejętność sforkowana („Dostosuj")**
  (`catalog.ts:207-295` `forkSkill`: klon skill origin_id + warianty + krawędzie;
  UNIQUE `skills_trainer_origin_uniq`; OPCJONALNY).

#### 7. Rozwój i awans podopiecznego (oś jakościowa) — Trener
Awans działa na **efektywnej bibliotece (globalne ∪ własne)**; wiersz awansu jest
per-para (trainer+trainee), wskazuje współdzieloną globalną albo własną umiejętność.
**Decyzja 2026-07-06:** dzisiejsze 404 przy awansie na globalnej umiejętności
(`getSkillMapForTrainee` filtruje `skills.trainer_id`, `skill-progression.ts:55`) =
**bug do naprawy**, nie intencja.
- Trener — «Ustaw poziom startowy» → Poziom startowy ustawiony (`skill-progression.ts:214-278`
  `setStartingLevel`→`insertAdvancement` from_variation_id=NULL, advanced_by=trainerId;
  pierwszy wpis event-store awansów pary).
- Trener — «Zapisz awans (wyższy wariant)» → **Awans zarejestrowany**
  (`skill-progression.ts:281-328` `recordAdvancement` to.ordinal>from.ordinal,
  advanced_on, advanced_by=trainerId, note; jedyna oś JAKOŚCIOWA, ZAWSZE ręczna decyzja trenera).
- Trener — «Zapisz awans (niższy wariant)» → Cofnięcie zarejestrowane (**to samo
  repo/tabela** `recordAdvancement` to.ordinal<from.ordinal; **osobna intencja
  domenowa** — decyzja 2026-07-06: modelujemy jako odrębne zdarzenie mimo wspólnego
  `skill_advancements`; brak walidacji kierunku w kodzie; bieżący poziom WYLICZANY
  `currentLevelFromEvents`, nie utrwalony).
- `PROPOZYCJA:` kolumna `advanced_by` (FK) sugeruje przyszłe `on_behalf_of`.

#### 8. Cykl życia planu — Trener (+ polityka)
- Trener — «Utwórz plan» → Pusty draft planu utworzony (`plans.ts:155-171` status='draft',
  version=max+1; ≤1 draft — partial UNIQUE `plans_trainee_draft_uniq`; numeracja przez max() zostawia dziury).
- Trener — «Edytuj aktywny plan» → Draft planu utworzony z aktywnego (`plans.ts:174-251`
  `createDraftFromActive` based_on_version=source.version, deep-clone sessions/blocks/items).
- Trener — «Zapisz draft» → Draft planu zapisany (`plans.ts:266-357` `saveDraftPlan`
  UPDATE name + wipe-and-rewrite plan_sessions→blocks→items; tenant-scope na exerciseId).
- Trener — «Opublikuj plan» → **Plan opublikowany** (`plans.ts:364-389` draft→active,
  published_at=now, FOR UPDATE; `plans_trainee_active_uniq`; JEDYNY punkt przekazania
  wartości przez granicę do podopiecznego — widzi WYŁĄCZNIE active).
- System / Polityka — «Zarchiwizuj poprzedni aktywny» → **Poprzedni aktywny plan
  zarchiwizowany** (`plans.ts:379-382` UPDATE status='archived' WHERE status='active',
  atomowo w tej samej tx co publikacja; polityka gwarantująca ≤1 active).
- Trener — «Usuń plan (z treningami)» → Plan zarchiwizowany (`plans.ts:448-449`
  logCount>0 → status='archived'; miękka archiwizacja gdy istnieją `workout_logs.plan_id` FK restrict).
- Trener — «Usuń plan (bez treningów)» → Plan usunięty (`plans.ts:418-434` logCount==0
  → DELETE + CASCADE; jedna komenda „Usuń" → trzy różne wyniki).
- **Brak** jawnego „cofnij publikację" — **zamierzone** (cykl forward-only; zmiana =
  publikacja v(n+1); decyzja 2026-07-06).

#### 9. Pętla treningowa (logowanie) — Podopieczny
- Podopieczny (trainee) — «Zapisz trening» → **Trening zapisany** (`workouts.ts:753-767`
  `saveWorkoutLog` INSERT `workout_logs` w tx; FK plan_id/plan_session_id onDelete:restrict;
  korzeń NIEZMIENNEGO agregatu wykonania; session_name = SNAPSHOT; all_done = flaga;
  trainer_id zdenormalizowany; brak edycji/kasowania — `PROPOZYCJA:` okno 24h+lock).
- Podopieczny (trainee) — «Zaloguj serię» → Seria zalogowana (`workouts.ts:782-790`
  INSERT `workout_set_logs`: reps, difficulty, video_file_id, ordinal; CHECK difficulty
  NULL OR 1..10; ordinal = ORYGINALNA planowana pozycja — luka = pominięta seria
  WYLICZANA; difficulty=null gdy tracks_rpe=false).
- Podopieczny (trainee) — «Prześlij wideo serii» → Wideo serii przesłane (`uploadFile`
  kind='set_video'; `video_file_id` onDelete:set null; pobranie tylko podpisanym URL HMAC).

#### 10. Sylwetka (body photos) — Podopieczny (+ Trener read-only)
- Podopieczny (trainee) — «Wgraj zdjęcie sylwetki» → **Zdjęcie sylwetki zarejestrowane**
  (`body-photos.ts:100-110` `addBodyPhoto` view/taken_on/note/file_id/trainee_id/trainer_id;
  files kind='body_photo', magic-bytes, storage.write; owner-scoped intencyjnie;
  taken_on ręczne → napędza before/after).
- Podopieczny (trainee) — «Usuń zdjęcie sylwetki» → Zdjęcie sylwetki usunięte
  (`body-photos.ts:135-143` tx: delete body_photos → deleteFileRow; file_id ON DELETE
  RESTRICT wymusza kolejność; TWARDE skasowanie; tylko podopieczny).
- System / Polityka — «Skasuj blob po commit transakcji» → Blob zdjęcia skasowany z dysku
  (`file-uploads.ts:245-247` `deleteFileBlob` post-commit, try/catch swallow; błąd I/O
  połknięty → blob może zostać osierocony, brak reconciliacji).

#### 11. Konsultacje 1:1 i harmonogram — Trener ↔ Podopieczny
- Trener — «Zapisz harmonogram» → **Harmonogram ustawiony** (`consultation-schedules.ts:122-173`
  `upsertSchedule` active=true, cadence/kotwica/godzina/link; `one_active_uniq` ≤1 aktywny/parę).
- System / Polityka — «(przy PODMIANIE: anuluj przyszłe planned starej serii)» → Terminy
  starej serii pominięte (`consultation-schedules.ts:136-151` w tej samej tx: status→'cancelled'
  dla planned ≥from + stary schedule active=false; intencja POMINIĘTA; pierwsze ustawienie nie anuluje niczego).
- System / Polityka — «Wygeneruj terminy» → Termin zaplanowany (`consultation-schedules.ts:76-108`
  `ensureOccurrences` status='planned', HORIZON 70 dni, onConflictDoNothing; **wołane też
  LENIWIE z loadera — read-causes-write, brak schedulera — hot-spot**).
- Podopieczny (trainee) — «Potwierdź termin» → **Konsultacja potwierdzona**
  (`consultations.ts:374-405` action='confirm' → 'confirmed', guard `canTraineeAct`).
- Podopieczny (trainee) — «Odrzuć termin» → Termin odrzucony przez podopiecznego
  (`consultations.ts:395-396` → status='cancelled'; intencja ODRZUCONA — nierozróżnialna w DB od ODWOŁANEJ/POMINIĘTEJ).
- Podopieczny (trainee) — «Poproś o zmianę terminu» → Prośba o zmianę terminu zgłoszona
  (`consultations.ts:397,400-403` → 'change_requested' + traineeNote).
- Trener — «Przełóż termin» → Termin przełożony przez trenera (`consultations.ts:321-353`
  nowy scheduledAt, status→'planned'; odpowiedź na prośbę o zmianę).
- Trener — «Odwołaj termin» → Termin odwołany przez trenera (`consultations.ts:356-371`
  → status='cancelled'; intencja ODWOŁANA — nierozróżnialna w DB).
- Trener — «Udokumentuj konsultację» → **Konsultacja udokumentowana** (`consultations.ts:263-301`
  status='documented', summary, periodFrom/To + WYMIANA action items delete+insert;
  domyka cykl, tworzy punkty „do poprawy"; „do udokumentowania" = stan WYLICZANY, nie status).
- Trener — «Przełącz status punktu» → Punkt „do poprawy" rozwiązany/otwarty (`consultations.ts:408-431`).
- Trener — «Zapisz termin (poza serią)» → Konsultacja ad-hoc utworzona (`consultations.ts:232-260`
  scheduleId=null; 'planned' albo od razu 'documented').
- Trener — «Wyłącz harmonogram» → Harmonogram wyłączony (`consultation-schedules.ts:180-209`
  active=false; przyszłe planned→'cancelled'; anulowane = POMINIĘTE).
- Trener — «Usuń konsultację» → Konsultacja usunięta (`consultations.ts:434-448` DELETE +
  kaskada action items; **TWARDE kasowanie — niespójność vs „nie kasujemy", do naprawy**;
  konsultacje NIE mają archived_at).

#### 12. Synchronizacja Google Calendar/Meet (ACL, wychodząca, best-effort)
Warstwa antykorupcyjna, sync jednokierunkowy POST-commit, połyka błędy (`logSyncError`).
- Trener — «Połącz Google» → **Kalendarz Google połączony** (`connections.ts:34-61`
  `upsertConnection` accessTokenEnc/refreshTokenEnc AES-GCM, scope; anty-CSRF podpisany
  state+nonce; 1 wiersz/trener; odblokowuje cały sync).
- Google (Calendar/Meet) — «(reakcja: utwórz zdarzenie z Meet)» → Zdarzenie Google
  utworzone i link Meet zapisany (`calendar.ts:51-69` `insertEvent` conferenceData →
  `setGoogleEventId` `consultations.ts:542-563`; utrwala google_event_id + meeting_url).
- Google (Calendar/Meet) — «(reakcja: zaktualizuj zdarzenie)» → Zdarzenie Google
  zaktualizowane (`calendar.ts:72-94` `patchEvent`; efekt WYŁĄCZNIE w Google, zero zmiany wiersza — best-effort).
- Google (Calendar/Meet) — «(reakcja: usuń zdarzenie)» → Zdarzenie Google usunięte
  (`calendar.ts:97-109` `deleteEvent` idempotentne 404/410 → setGoogleEventId(null)).
- Google (Calendar/Meet) — «(reakcja: skasuj zdarzenia pary przy usunięciu podopiecznego)»
  → Wszystkie zdarzenia Google pary skasowane (`sync.ts:113-131` `syncCancelAllForPair`).
- System / Polityka — «(auto: odśwież access token)» → Token Google odświeżony
  (`connections.ts:114-135` `persistRefreshed` na client.on('tokens'); infra OAuth).
- Trener — «Rozłącz Google» → Kalendarz Google rozłączony (`connections.ts:64-75`
  `deleteConnection` + revokeToken best-effort; potem sync* = no-op).

#### 13. Płatności i subskrypcja (Stripe Connect, destination charges)
External Stripe; onboarding Connect (właściciel: trener) vs subskrypcja (właściciel: para);
lustro statusu materializowane webhookami z idempotencją.
- Trener — «Połącz Stripe (rozpocznij onboarding)» → Konto Stripe Express trenera utworzone
  (`connections.ts:51-85` `ensureExpressAccount` PK trainer_id; chargesEnabled/payoutsEnabled/detailsSubmitted=false).
- Stripe — «(webhook account.updated → zaktualizuj lustro konta)» → **Status konta Stripe
  trenera zaktualizowany** (`connections.ts:111-123` `applyAccountUpdate`; `webhook.ts:150-158`;
  chargesEnabled bramkuje Checkout ORAZ aktywuje gating dostępu).
- Trener — «Zapisz kwotę miesięczną» → **Kwota miesięczna (amount_minor) ustalona**
  (`subscriptions.ts:40-107` `setMonthlyAmount` prices.create + upsert
  `coaching_subscriptions.amount_grosze` + stripe_price_id; niemutowalny Price z currency
  'pln' HARDKOD — `PROPOZYCJA:` EUR/wielowaluta; nazwa `amount_grosze` wycofana na rzecz amount_minor).
- Trener — «Zapisz kwotę (subskrypcja czynna)» → Cena aktywnej subskrypcji podmieniona
  (`subscriptions.ts:94-106` gdy status∈{active,past_due}: subscriptions.update
  proration_behavior:'none'; nowa cena od następnego odnowienia; brak ścieżki prezesa/portalu do zmiany kwoty).
- Podopieczny (trainee) — «Subskrybuj (rozpocznij Checkout)» → Klient (customer)
  podopiecznego utworzony (`subscriptions.ts:110-132` `ensureCustomer` idempotencyKey
  per para → stripe_customer_id; customer na koncie PLATFORMY).
- Stripe — «(webhook checkout.session.completed → powiąż subskrypcję z parą)» → **Wynik
  Checkout powiązany z parą** (`subscriptions.ts:293-310` `linkCheckoutResult`
  stripe_subscription_id + customer_id z metadata; `webhook.ts:135-149`; warunek kolejnych aktualizacji statusu).
- Stripe — «(przed przetworzeniem KAŻDEGO webhooka: zarejestruj event.id)» → Zdarzenie
  webhooka Stripe przyjęte (dedup) (`webhooks.stripe.tsx:35-39` INSERT
  `processed_webhook_events` (event_id PK) onConflictDoNothing; inserted.length===0 → 200 i
  pomiń; twarda bariera idempotencji; przy błędzie applyChange marker COFANY by Stripe ponowił).
- Stripe — «(webhook customer.subscription.* → zaktualizuj lustro statusu)» → **Status
  subskrypcji zaktualizowany (lustro statusu)** (`subscriptions.ts:250-290`
  `applySubscriptionUpdate` status/current_period_end/cancel_at_period_end; `webhook.ts:115-134`;
  umbrella materializująca aktywację/past_due/wygaśnięcie/cancel_at_period_end; paused
  WYLICZANE z pause_collection; idempotencja po event.id).
- Stripe — «(Customer Portal: zaplanuj anulowanie na koniec okresu)» → Anulowanie na koniec
  okresu zaplanowane (`coaching_subscriptions.cancel_at_period_end` false→true `schema.ts:770`,
  ustawiane WYŁĄCZNIE przez `applySubscriptionUpdate:268`; osiągalne przez Stripe Customer
  Portal `createPortalSession:173-189`; **TRZECIA odrębna intencja anulowania** — podopieczny
  zachowuje dostęp DO current_period_end).
- System / Polityka — «(pochodna: status→active po opłaceniu 1. faktury)» → **Subskrypcja
  aktywowana** (`status.ts:19-28`; `access.ts:4-8` ACCESS_STATUSES; odblokowuje dostęp;
  materializowana TYM SAMYM zapisem `subscriptions.ts:266` co umbrella — specjalizacja
  intencyjna, dowód pokrywa się 1:1, NIE dwa różne UPDATE).
- Stripe — «(webhook invoice.paid / invoice.payment_failed → zapisz fakturę)» → Faktura
  subskrypcji (amount_minor) zarejestrowana (`payments.ts:19-34` `recordInvoice` upsert po
  `invoice_uniq`; `webhook.ts:93-114`; invoice.paid = realny destination charge do trenera;
  cicho pomijana gdy brak pary w metadata).
- Trener lub Podopieczny — «Wstrzymaj subskrypcję» → Subskrypcja wstrzymana (pauza)
  (`subscriptions.ts:211-229` pause_collection='void' + lokalny status='paused'; zachowuje dostęp).
- Trener lub Podopieczny — «Wznów subskrypcję» → Subskrypcja wznowiona (`subscriptions.ts:232-247`).
- Trener — «Zakończ subskrypcję» → **Subskrypcja anulowana (ręcznie)** (`subscriptions.ts:192-208`
  subscriptions.cancel NATYCHMIAST + defensywny lokalny status='canceled'; intencja ANULOWANA;
  odbiera dostęp; podwójny setter lokalny+webhook = możliwy wyścig lustra).
- System / Polityka — «(polityka Stripe: nieopłacone faktury → past_due → unpaid/canceled)» →
  **Subskrypcja wygasła (po dunningu)** (`status.ts:19-33` past_due/unpaid/incomplete_expired→canceled;
  `webhook.ts:115-134`; ODRĘBNA intencja od anulowania ręcznego, ale ZLANA do enum `canceled` bez reason/intent — hot-spot).
- Trener — «(kaskada usunięcia podopiecznego)» → Konto płatności podopiecznego posprzątane
  (`subscriptions.ts:320-350` `cleanupSubscriptionForTrainee` subscriptions.cancel + customers.del
  best-effort; RODO — usunięcie PII u procesora).

**Trzy odrębne intencje zakończenia subskrypcji (decyzja 2026-07-06):** ANULOWANA
(ręcznie, natychmiast) · ZAPLANOWANA-NA-KONIEC-OKRESU (`cancel_at_period_end`, dobrowolna,
odroczona, dostęp do końca okresu) · WYGASŁA (po dunningu). Dziś wszystkie zlane do enum `canceled`.

#### 14. Cykl życia konta / dezaktywacja — Prezes marki, Trener
- Prezes marki — «Dezaktywuj ambasadora» → **Ambasador zdezaktywowany** (`ambassadors.ts:204-215`
  users.archived_at=now, guard trainerInOrg→404; miękka blokada; kaskaduje na dostęp
  WSZYSTKICH podopiecznych trenera — gate WYLICZANY z archived_at + pauza subskrypcji par).
- System / Polityka — «Wstrzymaj subskrypcje par ambasadora» → Subskrypcja ambasadora
  wstrzymana (`ambassadors.ts:216-231` pętla po status='active' → pauseSubscription; per-PARA;
  best-effort; pomijane gdy Stripe niezkonfigurowany → lustro może się rozjechać).
- Prezes marki — «Reaktywuj ambasadora» → Ambasador reaktywowany (`ambassadors.ts:235-243`
  users.archived_at=NULL; ODRĘBNA ścieżka niż „Konto reaktywowane (zastąpione)").
- System / Polityka — «Wznów spauzowane subskrypcje par ambasadora» → Subskrypcja ambasadora
  wznowiona (`ambassadors.ts:244-259` pętla po status='paused'; **NIE wznawia
  anulowanych/wygasłych w trakcie — niepełne odwrócenie dezaktywacji, dług do naprawy**).
- Trener — «Usuń podopiecznego» → Podopieczny usunięty (`podopieczni.$traineeId.tsx:195`
  intent 'delete-trainee', `trainees.ts:21`; twarde DELETE users + kaskada FK — kaskadowo
  kasuje treningi podopiecznego; poprzedzone best-effort sprzątaniem Stripe (RODO) + Google;
  **niespójność vs „nie kasujemy" — do naprawy**).

### PROPOZYCJE przekrojowe (część modelu, DZIŚ niezbudowane — NIE na realnej osi)
Prowizja platformy >0 (`application_fee_percent=0`, `subscriptions.ts:160`); realne
obciążanie w EUR (`currency:'pln'` hardkod); region FR jako zarządzalna jednostka
(zaseedowany-ale-pusty); `on_behalf_of` awansu i subskrypcji; okno edycji logu 24h + lock;
zdenormalizowane liczniki sesji (liczone on-the-fly); udostępnialny Wrapped/odznaki;
serwerowa analityka zaangażowania (Wrapped „obejrzany" tylko w localStorage).

### Aktorzy
- **Operator / Właściciel** — człowiek prowadzący git/docker/migracje/deploy/seed; wykonuje
  bootstrap marki (założyciel, marka, regiony, prezes); poza produktem, brak komend w UI.
- **Prezes marki (kod brand_admin)** — właściciel marki nad trenerami; autoruje **globalną
  bibliotekę** (read-only dla trenera) i zarządza ambasadorami; przy 1 marce = właściciel
  produktu; niezapraszalny (tylko seed).
- **Trener (Ambasador)** — autor wartości (własna biblioteka, plany, drabiny, awanse) i
  odbiorca pieniędzy (Stripe Connect); FAKTYCZNA granica izolacji danych = `trainer_id`;
  „Ambasador" = jego RELACJA wobec marki, nie osobny byt/rola w DB.
- **Podopieczny (trainee)** — płatnik (subskrypcja) i JEDYNY autor danych treningowych;
  dziedziczy markę/region trenera (wyliczane z trainer_id); potwierdza/odrzuca/prosi o
  zmianę konsultacji; może pauzować/wznawiać/anulować (Portal) subskrypcję.
- **System / Polityka** — reguły czasowe i reaktywne (fioletowe): rotacja/higiena sesji,
  materializacja terminów, archiwizacja poprzedniego planu przy publikacji, pomijanie starej
  serii przy podmianie harmonogramu, kaskady pauzy/wznowienia subskrypcji ambasadora,
  aktywacja/wygaśnięcie po dunningu, kasowanie osieroconego bloba, odświeżanie tokenów OAuth.
- **Stripe** (external) — merchant-of-record charge na platformie z transfer_data.destination
  na konto trenera; źródło prawdy statusu subskrypcji/konta/faktur, materializowane u nas
  webhookami z idempotencją; posiada też własną powierzchnię zapisu — Customer Portal.
- **Google (Calendar/Meet)** (external) — jednokierunkowy, wychodzący, best-effort sync
  zdarzeń + link Meet; warstwa antykorupcyjna, tokeny AES-GCM.

### Pivotal events (16)
Trener-ambasador dołączył · Konto podopiecznego utworzone · Globalne ćwiczenie/umiejętność
sforkowane („Dostosuj") · Plan opublikowany · Poprzedni aktywny plan zarchiwizowany · Trening
zapisany · Awans zarejestrowany · Harmonogram ustawiony · Konsultacja udokumentowana ·
Kalendarz Google połączony · Status konta Stripe trenera zaktualizowany · Wynik Checkout
powiązany z parą · Status subskrypcji zaktualizowany (lustro statusu) · Subskrypcja
aktywowana · Subskrypcja anulowana/wygasła · Ambasador zdezaktywowany.

### Kandydackie granice kontekstów (szwy)
1. **Tożsamość i dostęp (Identity & Access)** — `invites` POLIMORFICZNA (target_role
   trainee|trainer) niesie ładunek DWÓCH kontekstów o różnych właścicielach (prezes→trener
   org+region vs trener→podopieczny trainer_id+kwota). Przesunięcie: „zaproszenie" = dwa
   procesy; „sesja"(auth) ≠ „Sesja"(plan_session) ≠ „trening".
2. **Marka i ambasadorzy (Brand & Ambassadors)** — właściciel=Prezes, rytm rzadki, org-scoped;
   kaskaduje do Płatności i Dostępu. Przesunięcie: „Ambasador"=RELACJA vs „Trener"=byt
   (DB users.role='trainer'); „Multi-tenant"=aspiracja (ensureOrganization singleton);
   Region jako jednostka zarządzalna="wkrótce".
3. **Biblioteka globalna (Global Catalog)** — autoring prezesa (trainer_id NULL + org),
   read-only dla trenera, ŻYWE łącze do wielu odbiorców; osobny `brand-catalog.ts`, trasy
   `/marka/*`. Przesunięcie: globalne (read-only) vs własne; „katalog" WYCOFANE w słowniku,
   żyje w kodzie; globalne NIE mają kategorii.
4. **Katalog i drzewo trenera (Trainer Catalog & Skill Structure)** — własny autoring
   trainer_id-scoped; fork copy-on-write (origin_id) = OPCJONALNY szew global→trener.
   Przesunięcie: „Dostosuj"=fork; acykliczność DAG i unikat „ćwiczenie ≤1 umiejętności"
   egzekwowane w REPO nie w DB.
5. **Rozwój i awans podopiecznego (Trainee Progression — jakościowa)** — skill_advancements
   per-para, event-sourced append-only, ZAWSZE decyzja trenera; stan węzła WYLICZANY per
   trainee w porządku topologicznym, nie utrwalony. Graf raz definiowany (Katalog), raz
   interpretowany (per podopieczny) — zmienia się właściciel i rytm. Przesunięcie: Awans
   (JAKOŚCIOWA, ręczny) i Cofnięcie vs Progresja (ILOŚCIOWA, analityka).
6. **Plany / Programowanie (Programming)** — wersjonowane per trainee (≤1 draft, ≤1 active);
   publikacja=handoff wartości; forward-only (brak unpublish). FK ON DELETE RESTRICT z
   Treningów ODWRACA kasowanie. Przesunięcie: „Sesja"=plan_session (dzień-szablon) vs
   „sesja/trening"=workout_log (wykonanie).
7. **Trening / Logowanie (Workout Logging)** — Podopieczny JEDYNY autor; niezmienny agregat;
   snapshot session_name + FK restrict odcinają historię od mutowalnego planu. Przesunięcie:
   plan_session vs workout_log oba „sesją"; pominięta seria=brak wiersza (luka ordinali);
   all_done miesza „pominięte" z „puste".
8. **Analityka / Retencja (Reporting: Statystyki, Progresja, Wrapped)** — brak własnych zdarzeń
   (ZERO zapisu do DB). W CAŁOŚCI DOWNSTREAM/Conformist; czyta workout_*/skill_*/body_photos/plans.
   Wrapped=polityka czasowa (isPastMonth) → read-model; „obejrzany" tylko localStorage.
   Przesunięcie: „PR/Rekord" nietrwały, liczony on-the-fly w ≥4 miejscach z rozbieżnymi definicjami.
9. **Pliki / Storage i podpisane URL (Files & Signed URLs)** — generyk współdzielony przez
   TRZY konteksty (kind exercise_demo|set_video|body_photo); jeden wiersz `files`, magic-bytes,
   HMAC 24h. Kandydat na generyczny kontekst wspierający. Przesunięcie: dostęp TENANT-scoped
   (ownsTrainerScope) mimo intencji OWNER-scoped.
10. **Sylwetka (Body Photos)** — owner-scoped: podopieczny jedyny autor/edytor, trener
    obserwator; podwójne właścicielstwo (trainer_id+trainee_id): granica autorstwa ≠ granica
    izolacji tenanta; twarde kasowanie. Przesunięcie: „prywatność OWNER-SCOPED" rwie się z
    realnym dostępem TENANT-scoped.
11. **Konsultacje i harmonogram (Consultations & Scheduling)** — Harmonogram (reguła rekurencji)
    vs konsultacja (instancja) — inny cykl życia; zmiana reguły masowo anuluje/regeneruje
    instancje. Przesunięcie: `cancelled` skleja TRZY intencje (ODWOŁANA/ODRZUCONA/POMINIĘTA);
    „do udokumentowania"=stan WYLICZANY; „termin"=zaproszenie do potwierdzenia (podopieczny)
    vs slot do udokumentowania (trener).
12. **Integracja Google Calendar/Meet (ACL, external)** — warstwa antykorupcyjna; sync
    JEDNOKIERUNKOWY, wychodzący, best-effort, POŁYKA błędy; brak retry/kolejki i importu.
    Najsilniejszy kandydat na granicę zewnętrzną. Przesunięcie: mapper consultationToEvent (OHS);
    'Etc/UTC' hardkod; efekt „Zdarzenie zaktualizowane" TYLKO w Google.
13. **Płatności / Subskrypcje (Billing — Stripe Connect)** — External Stripe; onboarding Connect
    (właściciel: trener) vs subskrypcja (właściciel: para) — różne cykle; lustro statusu
    materializowane webhookami z idempotencją po event.id. **DWIE ROZŁĄCZNE POWIERZCHNIE ZAPISU:**
    nasze komendy (pause/resume/cancel) vs hostowany Stripe Customer Portal (cancel_at_period_end,
    zmiana karty, faktury) — skutki wracają WYŁĄCZNIE webhookiem. Przesunięcie: amount_grosze
    (WYCOFANE) vs amount_minor; trzy intencje anulowania zlane do `canceled`; paused wyliczane;
    currency 'pln' hardkod, application_fee_percent=0 (PROPOZYCJE).
14. **Dostęp / Gating (Access Control)** — brak własnych zdarzeń; warstwa WYLICZANA przy każdym
    żądaniu z status subskrypcji (Płatności) + archived_at trenera (Marka); BRAK utrwalenia —
    „wstrzymany podopieczny" nie ma flagi; wołana JAWNIE poza layoutem → ryzyko pominięcia.
    **Decyzja 2026-07-06: materializować stan dostępu** (zdarzeniowo). Przesunięcie:
    „dostęp"=f(status∈ACCESS_STATUSES, chargesEnabled, cena, archived_at); „wpuszcza wszystkich"
    gdy płatność niemożliwa (paymentRequired=false — intencja).
15. **Notyfikacje / Dostarczanie (Delivery) — KANDYDAT NA KONTEKST WSPIERAJĄCY (missing capability)**
    — brak zdarzeń, brak kodu. Komunikacja krzyżująca granice nie ma domu: token zaproszenia
    „dostarczany poza systemem", linki Meet w Google, dunning/e-maile faktur w Stripe. **Decyzja
    2026-07-06: traktować jako brakującą zdolność — kandydat na osobny kontekst w F5**, do
    zbudowania w reimplementacji.

## Hot-spoty / otwarte pytania

### Rozstrzygnięcia właściciela (sesja 2026-07-06)
1. **„markowe" → „globalne"** (rewizja kanonu F1 #4): globalna, ogólnodostępna biblioteka
   ćwiczeń/umiejętności zarządzana przez prezesa marki; efektywna = globalne ∪ własne.
2. **Promocja biblioteki założyciela** nie istnieje w modelu — usunięta z osi (`promoteTrainerCatalogToBrand` = do usunięcia).
3. **Awans vs regres** → dwa osobne zdarzenia domenowe („Awans zarejestrowany" + „Cofnięcie zarejestrowane"), wspólna tabela.
4. **`cancel_at_period_end`** → trzecia odrębna intencja anulowania (anulowana / na-koniec-okresu / wygasła).
5. **Notyfikacje/Dostarczanie** → kandydat na kontekst wspierający (do F5).
6. **Twarde kasowanie konsultacji i podopiecznego** → niespójność do naprawy (ujednolicić na miękkie / `archived_at`).
7. **„Cofnij publikację" planu** → zamierzone (cykl forward-only).
8. **Gating dostępu** → materializować stan dostępu zdarzeniowo (nie liczyć co żądanie).
9. **`replacesUserId` bez weryfikacji e-maila** → dług bezpieczeństwa.
10. **Globalne: używać wprost, fork opcjonalny** → operacje zapisu (awans, plan_items)
    rozwiązują się względem efektywnej biblioteki (globalne ∪ własne); dzisiejsze 404 na
    awansie na globalnej umiejętności = **bug do naprawy**; fork = opcjonalny copy-on-write
    (świadomie odcina od ulepszeń globalnych).
11. **Self-service hasła** → luka: dodać zmianę hasła + reset „zapomniałem".
12. **Zmiana trenera podopiecznego** → scenariusz realny wymagający migracji historii;
    denormalizacja `trainer_id` (workout_logs/body_photos/skill_advancements) = otwarty problem.
13. **Reaktywacja ambasadora** → dług: powinna spójnie odwracać dezaktywację (dziś wznawia tylko `paused`).

### Odnotowane jako już rozstrzygnięte (F1/glosariusz)
`grosze`→`amount_minor` (#9) · „katalog" wycofane (#4) · anulowana/wygasła subskrypcji (#12) ·
`cancelled` konsultacji = 3 intencje (#12) · prezes niezapraszalny (F1 dec. #2) · billing
`pln`/FR pusty/prowizja=0 (`PROPOZYCJA`, F1) · zdjęcia owner-scoped = cel (#14, do egzekwowania) ·
gating fail-open gdy płatność niemożliwa = intencja (F1).

### Obserwowany dług techniczny (bez decyzji per-item — do faz architektury)
Wipe-and-rewrite planu gubi tożsamość wierszy (`saveDraftPlan`) · osierocone bloby (okno crash +
swallow I/O) · fork współdzieli plik demo z globalnym oryginałem · „Rekord/PR" liczony 3–4× z
rozbieżnymi definicjami · brak `restoreBrandSkill` (asymetria) · acykliczność DAG i „ćwiczenie
≤1 umiejętności" w repo nie w DB (race SELECT↔INSERT) · bieżący poziom drabiny nieutrwalony
(event sourcing bez migawki, tie-break createdAt ms) · skip serii vs pusta seria nierozróżnialne
(all_done) · sync Google bez retry/kolejki i bez importu · `ensureOccurrences` read-causes-write
z loadera · podwójny setter statusu subskrypcji (lokalny + webhook) · faktura bez pary w metadata
cicho pomijana · retencja Wrapped niemierzalna serwerowo · brak edycji/kasowania logu treningu
(`PROPOZYCJA:` okno 24h+lock).

## Zmiany w glosariuszu

- **Rewizja kanonu:** „markowe ćwiczenie/umiejętność" → **„globalne ćwiczenie/umiejętność"**;
  „Biblioteka markowa" → „biblioteka globalna" (ogólnodostępna, zarządzana przez prezesa marki);
  zaktualizowano definicje „Biblioteka ćwiczeń", „Biblioteka umiejętności", „Efektywna biblioteka",
  „Markowy vs własny wiersz" → „Globalny vs własny wiersz", „Fork/Dostosuj", „Umiejętność", „Wariant".
- **Nowe terminy (6):** „Zdarzenie webhooka Stripe przyjęte (dedup)"; „Anulowanie na koniec okresu
  (cancel_at_period_end)"; „Customer Portal (druga powierzchnia zapisu billingu)"; „Terminy starej
  serii pominięte"; „Specjalizacja intencyjna (intent-specialization)"; „Notyfikacje/Dostarczanie (Delivery)".
- **Cofnięcie (regres na drabinie)** dopisane jako osobne zdarzenie obok „Awans".
- **Hot-spoty językowe:** dopisano status „markowe→globalne" (rozstrzygnięty 2026-07-06).

## Stan i następny krok (handoff)

- **Ustalono:** spójna oś **101 zdarzeń w 14 procesach**, **16 pivotal events**, **15 kandydackich
  granic kontekstów** (w tym 3 nietypowe: Analityka/Retencja i Dostęp/Gating = read-time/wyliczane;
  Notyfikacje = missing capability). Rdzeń wyróżnika (kalisteniczny model progresji: drabiny +
  DAG + ręczny Awans) potwierdzony w kodzie. Silne szwy językowe: „sesja" (auth/plan/trening),
  globalne↔własne (fork), harmonogram↔konsultacja, trzy intencje anulowania subskrypcji, dwie
  powierzchnie zapisu billingu (nasze komendy vs Customer Portal).
- **Otwarte (do faz dalszych):** materializacja stanu dostępu, ujednolicenie kasowania (miękkie),
  fix awansu na globalnej bibliotece, migracja historii przy zmianie trenera, self-service hasła,
  pełne odwrócenie dezaktywacji ambasadora, dług bezpieczeństwa `replacesUserId` — wszystkie
  wchodzą do F5/F7 i architektury, nie do F3.
- **Co czyta następna faza (F3 Decompose):** oś zdarzeń i procesy (grupowanie wg kohezji),
  kandydackie granice (wstępne szwy poddomen), glosariusz (zaktualizowany kanon globalne).
  Test F3: opisać poddomenę jednym zdaniem bez „i".
