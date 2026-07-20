# app/routes/marka — widoki prezesa marki (`/marka/*`)

Obszar `brand_admin` (prezes). Layout wymaga roli `brand_admin`
(`requireUser({ role: "brand_admin" })`); inne role są odbijane przez
`defaultPathForRole`. Wszystkie operacje zapisu są zawężone do organizacji
prezesa (`organizationId` z sesji) — zasób spoza org → 404. Wiersze markowe są
dla trenerów read-only (klonowanie przez „Dostosuj" — `forkExercise`/`forkSkill`
w `catalog.ts`). Pozycja nawigacji Ambasadorzy jest aktywna (zarządzanie trenerami org). Regiony i Ustawienia są widoczne w sidenav, lecz oznaczone jako „wkrótce" (wyłączone).

| Plik | URL | Opis |
|---|---|---|
| `_layout.tsx` | `/marka` | Layout z sidenav (topbar + sidenav + Outlet), guard roli prezesa; loader liczy markowe ćwiczenia i umiejętności do badge'y nawigacji. |
| `_index.tsx` | `/marka` | Dashboard — KPI karty (ćwiczenia, umiejętności) + linki do zarządzania. |
| `biblioteka._index.tsx` | `/marka/biblioteka` | Lista markowych ćwiczeń z `ListControls` (sortowanie po nazwie, szukajka, filtr jednostki, paginacja). Używa `brand-catalog.ts`. |
| `biblioteka.nowe.tsx` | `/marka/biblioteka/nowe` | Formularz tworzenia nowego markowego ćwiczenia (nazwa, jednostka, opis, „Zbieraj RPE", upload demo). Bez kategorii — te są per-trener. |
| `biblioteka.$exerciseId.tsx` | `/marka/biblioteka/:exerciseId` | Edycja markowego ćwiczenia + upload/podmiana demo; archiwizacja i przywracanie. |
| `umiejetnosci._index.tsx` | `/marka/umiejetnosci` | Drzewo umiejętności marki (`SkillTreeView`, szkielet autora) + lista markowych umiejętności. Używa `brand-catalog.ts`. |
| `umiejetnosci.nowa.tsx` | `/marka/umiejetnosci/nowa` | Formularz tworzenia nowej markowej umiejętności. |
| `umiejetnosci.$skillId.tsx` | `/marka/umiejetnosci/:skillId` | Edycja markowej umiejętności: warianty, prerekwizyty, drzewo DAG; archiwizacja. |
| `ambasadorzy._index.tsx` | `/marka/ambasadorzy` | Lista ambasadorów organizacji z `ListControls` in-memory (sortowanie nazwy, filtr statusu, szukajka), paginacja (30/str); modal zaproszenia z polem regionu; `InviteCreatedCard` po sukcesie. Używa `ambassadors.ts` + `AmbassadorInviteSchema`. |
| `ambasadorzy.$trainerId.tsx` | `/marka/ambasadorzy/:trainerId` | Profil ambasadora: metryki (aktywni podopieczni, logi 7d/30d, MRR), historia aktywności, przyciski Dezaktywuj / Przywróć (akcje `deactivate`/`reactivate` → `ambassadors.ts`). Trener spoza org → 404. |
