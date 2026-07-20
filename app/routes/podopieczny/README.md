# app/routes/podopieczny/ — widoki podopiecznego (`/podopieczny/*`)

Trasy panelu podopiecznego (rola `trainee`). Pod layoutem `_layout.tsx` (poza
`wrapped.$ym.tsx` i `aktywuj.tsx`, które renderują się pełnoekranowo bez
sidenavu — `aktywuj.tsx` MUSI być poza layoutem, bo to tam gate w `_layout.tsx`
odsyła nieopłaconych podopiecznych; wewnątrz children powstałaby pętla
redirectów). Mobile-first, instalowalne jako PWA. Mapowanie URL w
[`../../routes.ts`](../../routes.ts).

| Plik | URL | Eksporty | Co robi (loader / action) |
|---|---|---|---|
| `_layout.tsx` | `/podopieczny` (layout) | loader, default | Wymaga roli podopiecznego; liczy logi/zdjęcia/sesje do nawigacji; badge „Konsultacje" = liczba terminów do potwierdzenia (`countPendingForTrainee`); badge „Płatności" = 1 gdy status `past_due`/`unpaid` lub `none` z ustawioną ceną. Gate zawieszenia: gdy trener podopiecznego jest zarchiwizowany (`archived_at IS NOT NULL`), przekierowuje na `/podopieczny/wstrzymane` (przed gate'em płatności). Topbar + sidenav + `<Outlet/>`. |
| `_index.tsx` | `/podopieczny` | loader, default | Pulpit: hero (streak/journey/total/SUT), „ten tydzień", heatmapa aktywności, effort balance RPE, lista Wrapped + aktywny plan, 5 ostatnich logów. |
| `sesje._index.tsx` | `/podopieczny/sesje` | loader, default | Lista sesji z aktywnego planu (pełne drzewo bloków/ćwiczeń). |
| `sesje.$sessionId.tsx` | `/podopieczny/sesje/:sessionId` | loader, default | Szczegóły sesji + demo ćwiczeń (podpisane URL-e). |
| `loguj.$sessionId.tsx` | `/podopieczny/loguj/:sessionId` | loader, action, default | **Logowanie treningu**: per-seria reps/trudność/notatka + opcjonalne wideo (`multipart`); zapis przez `saveWorkoutLog`, wykrywanie nowych PR-ów. |
| `historia._index.tsx` | `/podopieczny/historia` | loader, default | Lista przeszłych treningów z szukajka + sort + filtr wideo (URL params, `<ListControls>`, paginacja 20). |
| `historia.$logId.tsx` | `/podopieczny/historia/:logId` | loader, default | Szczegóły wpisu treningowego + podpisane wideo. |
| `statystyki.tsx` | `/podopieczny/statystyki` (301) | loader | Shim przekierowujący na `/podopieczny`. |
| `rozwoj._index.tsx` | `/podopieczny/rozwoj` | loader, default | **Strona główna Rozwoju**: drzewo umiejętności (`SkillTreeView`) + lista „Pozostałe ćwiczenia" (progresja ćwiczeń nienależących do żadnej umiejętności) z sort + filtr tagów przez URL params (`<ListControls>`), sparkline + status + PR per wiersz, tryb porównania (wybór ≥2 → `/rozwoj/porownanie`). Drzewo i mapa obejmują **efektywny katalog trenera** (własne ∪ markowe organizacji trenera) — org wyliczana z trenera przez `resolveCatalogOrgId`. |
| `rozwoj.umiejetnosc.$skillId.tsx` | `/podopieczny/rozwoj/umiejetnosc/:skillId` | loader, default | Szczegół węzła umiejętności (read-only): drabina wariantów (`VariationLadder`) + wykres/KPI bieżącego wariantu (`ExerciseProgressionPanel`). Brak akcji — podopieczny nie może mutować. |
| `rozwoj.cwiczenie.$exerciseId.tsx` | `/podopieczny/rozwoj/cwiczenie/:exerciseId` | loader, default | Szczegóły progresji jednego ćwiczenia: przełącznik zakresu `?zakres=`, KPI + wykresy (`ExerciseProgressionPanel`); 404 gdy ćwiczenie bez logów. |
| `rozwoj.porownanie.tsx` | `/podopieczny/rozwoj/porownanie` | loader, default | Porównanie kilku ćwiczeń na osi „% zmiany od startu okresu" (`?ex=id1,id2`, `?zakres=`): `ComparisonChart` + legenda; komunikat gdy `<2` wybranych. |
| `sylwetka.tsx` | `/podopieczny/sylwetka` | loader, action, default | Galeria zdjęć sylwetki z sort (URL params, `<ListControls>`) + paginacja (60); akcje `add` (upload) / `delete`. |
| `wrapped.$ym.tsx` | `/podopieczny/wrapped/:ym` | loader, default | Pełnoekranowe miesięczne podsumowanie (styl Spotify Wrapped); 404 gdy brak danych; zapamiętuje obejrzenie w localStorage. |
| `aktywuj.tsx` | `/podopieczny/aktywuj` | loader, action, default | **Ekran aktywacji subskrypcji** (poza layoutem, brak sidenavu — cel gate'a z `_layout.tsx`). Loader liczy dostęp (`paymentRequired`+`hasAppAccess`); gdy dostęp już jest → redirect `/podopieczny`. Pełnoekranowa karta brandowa (`auth-shell`/`auth-card`): kwota subskrypcji + framing trenera, baner `?canceled=1`, przycisk „Opłać i aktywuj” (akcja `subscribe` → Stripe Checkout, tenant-scope do własnej pary) i link „Wyloguj”. |
| `wstrzymane.tsx` | `/podopieczny/wstrzymane` | loader, default | **Ekran konta wstrzymanego** (poza layoutem, brak sidenavu). Wyświetlany gdy trener podopiecznego jest dezaktywowany przez prezesa marki (`archived_at IS NOT NULL`) — gate w `_layout.tsx` przekierowuje tutaj przed gate'em płatności. Pełnoekranowa karta informacyjna z linkiem „Wyloguj”. |
| `konsultacje._index.tsx` | `/podopieczny/konsultacje` | loader, action, default | **Kalendarz (hybryda)**: przypięty „najbliższy termin" z szybkimi akcjami → współdzielona siatka miesiąca (`<MonthCalendar>`) → agenda „Nadchodzące"/„Minione" (`<ConsultationRow>`). Tap w dzień → karty terminów tego dnia z akcjami (`<TraineeOccurrenceActions>`), z resetem „wszystkie terminy". Statusy przez `consultation-status`. Nawigacja miesięcy `?m=YYYY-MM`. Akcja `respond` (`respondToOccurrence`); `decline` → `syncCancelOne` (usuwa zdarzenie Google w kontekście trenera, best-effort). `request_change`/`confirm` nie ruszają Google. |
| `konsultacje.$konsultacjaId.tsx` | `/podopieczny/konsultacje/:konsultacjaId` | loader, action, default | Szczegóły terminu (read-only) + akcje gdy `planned`/`confirmed` (Potwierdzam / Poproś o zmianę / Odrzuć); status, termin, link, podsumowanie + punkty. Akcja `respond`; `decline` → `syncCancelOne` (usuwa zdarzenie Google w kontekście trenera, best-effort). `request_change`/`confirm` nie ruszają Google. |
| `platnosci.tsx` | `/podopieczny/platnosci` | loader, action, default | **Płatności podopiecznego**: status i kwota subskrypcji (`getSubscriptionForPair`), bannery `?ok=1`/`?canceled=1`, akcje `subscribe` (→ Stripe Checkout) i `portal` (→ Billing Portal). Subskrybuj tylko gdy trener ustawił cenę (`stripePriceId`). Historia płatności (`listPaymentsForTrainee`). Tryb onboardingowy `?onboarding=1` — powitalny baner z przyciskiem „Zrobię to później" (rejestracja z zaproszenia nie kieruje już tutaj; gate w `_layout.tsx` odsyła nieopłaconych do `/podopieczny/aktywuj`). Blok jawności i framing trenera widoczny przed subskrypcją. Akcje `pause`/`resume` (Wstrzymaj/Wznów subskrypcję). Baner `past_due` „zaktualizuj metodę płatności" z linkiem do Customer Portal. |
| `progresja._index.tsx` | `/podopieczny/progresja` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj`. |
| `progresja.$exerciseId.tsx` | `/podopieczny/progresja/:exerciseId` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj/cwiczenie/:exerciseId`. |
| `progresja.porownanie.tsx` | `/podopieczny/progresja/porownanie` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj/porownanie`. |
| `umiejetnosci.tsx` | `/podopieczny/umiejetnosci` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj`. |
| `umiejetnosci.$skillId.tsx` | `/podopieczny/umiejetnosci/:skillId` (301) | loader | Shim przekierowujący na `/podopieczny/rozwoj/umiejetnosc/:skillId`. |

Główne moduły wołane stąd: `lib/auth` (`requireUser`), `lib/workouts`,
`lib/wrapped`, `lib/stats`, `lib/body-photos`, `lib/files`, `lib/file-uploads`,
`lib/format`, `lib/consultations`, `lib/consultation-status`, `lib/skill-progression`,
`lib/skill-tree`, `lib/catalog` (`resolveCatalogOrgId`), `lib/progression`, `lib/progression-math`, `lib/money`,
`lib/payments`, `lib/stripe/subscriptions`, `lib/stripe/status`,
`components/pagination`, `components/file-dropzone`, `components/photo-*`,
`components/exercise-progression-panel`, `components/progression-list`,
`components/skill-tree`, `components/month-calendar`, `components/consultation-row`,
`components/consultation-status-badge`, `components/consultation-alert`,
`components/trainee-occurrence-actions`.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
