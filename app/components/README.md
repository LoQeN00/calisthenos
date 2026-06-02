# app/components/ — współdzielone komponenty UI

Komponenty React reużywane przez trasy trenera i podopiecznego. Bez logiki
domenowej — czysta prezentacja + drobne interakcje (modale, providery kontekstu).

| Plik | Eksporty | Rola |
|---|---|---|
| `icons.tsx` | `Icons` (40+ ikon: `Dashboard`, `Users`, `Library`, `Play`, `Check`, `Trash`, `Calendar`, `Body`, `Trend`…), `makeIcon` | Centralny zestaw ikon SVG line-style (`currentColor`, rozmiar przez `font-size`). |
| `modal.tsx` | `Modal({ open, onClose, title, wide?, children })` | Dialog na natywnym `<dialog>`; blokada scrolla, ESC, backdrop. |
| `confirm-provider.tsx` | `ConfirmProvider`, `useConfirm()`, `useAlert()`, `ConfirmSubmitButton` | Potwierdzenia/alerty przez kontekst; przycisk pytający przed submitem formularza. |
| `toast-provider.tsx` | `ToastProvider`, `useToast()`, `ToastTone` | To'sty (success/error/info), auto-dismiss ~3s. |
| `user-menu.tsx` | `UserMenu({ displayName })` | Chip użytkownika z menu: przełącznik motywu (cookie 1 rok) + wylogowanie (`Form` POST). |
| `pagination.tsx` | `Pagination({ page, totalPages, total?, … })`, `parsePage(searchParams)` | Paginacja z prev/next i numerami; zachowuje query params. |
| `file-dropzone.tsx` | `FileDropzone({ name, label, kind: "video"\|"image", … })`, typ `FileKind` | Upload drag&drop z podglądem i walidacją MIME/rozmiaru. |
| `copy-button.tsx` | `CopyButton({ value, variant?, label?, … })` | Kopiowanie do schowka z feedbackiem (Clipboard API + fallback). |
| `exercise-fields.tsx` | `CategoryPicker({ categories, selected })` | Multi-select kategorii ćwiczeń (pigułki/checkboxy). |
| `photo-card.tsx` | `PhotoCard({ id, url, takenOn, view, note, onOpen })`, `BODY_VIEW_LABELS` | Kafelek zdjęcia sylwetki 3:4 otwierający lightbox. |
| `photo-lightbox.tsx` | `PhotoLightbox({ photos, currentId, onClose, onNavigate, deleteAction? })`, `LightboxPhoto` | Pełnoekranowy podgląd zdjęć: nawigacja strzałkami, pobieranie, opcjonalne usuwanie. |
| `body-photo-compare.tsx` | `SideBySideSection({ pairs, onOpenPhoto })`, `ResolvedPair` | Porównanie "przed/po" zdjęć sylwetki wg widoku (front/side/back). |
| `video-modal.tsx` | `VideoButton({ src, title, label?, size? })`, `VideoModal({ src, title, onClose })` | Przycisk + modal odtwarzania wideo. |
| `stat-widgets.tsx` | `Heatmap`, `Sparkline`, `SegmentedBar`, `SegmentedBarLegend`, `BarSegment` | Wykresy do dashboardów statystyk (heatmapa GitHub-style, sparkline, pasek segmentowy). |
| `progression-charts.tsx` | `ProgressionLineChart`, `VolumeBars`, `ComparisonChart`, `ComparisonChartLegend`, `ProgressionStatusBadge`, `StatusSummaryBar`, `sparkStrokeForStatus` | Wykresy feature'u „Progresja" zbudowane na **visx** (SVG, responsywne, tree-shakeable): liniowy rekord-w-czasie (kropki kolorowane wg RPE/statusu, legendy, osie), słupki objętości. `ProgressionLineChart` z legendą RPE w wykresie (pojedynczy punkt rysuje jako kropkę; „za mało danych" tylko przy 0 punktach); `ComparisonChart` z osią % i prowadnicą na dolnym poziomie. Tooltipy działające na hover i dotyk. `StatusSummaryBar` nad listą (pasek podsumowania statusów); `sparkStrokeForStatus` mapuje trend do koloru. Czysta prezentacja — bez fetchowania. |
| `consultation-form.tsx` | `ConsultationForm({ defaultValue?, defaultScheduledAt? })`, `ConsultationFormDefaultValue`, `ConsultationFormItem` | Formularz dokumentowania konsultacji (termin+czas trwania, link, okres, tytuł, podsumowanie, dynamiczna lista punktów „do poprawy"). Nie renderuje `<Form>` — owija go trasa-rodzic. |
| `schedule-form.tsx` | `ScheduleForm({ defaultValue?, defaultStartsOn })`, `ScheduleFormDefaultValue`, `Cadence` | Formularz reguły harmonogramu cyklicznego (częstotliwość radio-pills, dzień tygodnia/miesiąca, godzina, czas trwania, start, stały link). Kontrolowany (cadence przełącza pole kotwicy). Nie renderuje `<Form>` — owija go trasa-rodzic. |
| `month-calendar.tsx` | `MonthCalendar({ year, month0, todayDay, days, selected, onSelect, prevHref, nextHref })`, `DaySummary` | **Jedna siatka miesiąca dla obu ról** (kalendarz trenera i podopiecznego wyglądają identycznie). Tydzień od poniedziałku, „dziś" jako żeton, kropka/licznik dnia kolorowane tonem statusu. Prezentacja — stan `selected` trzyma rodzic. |
| `consultation-status-badge.tsx` | `StatusBadge({ label, tone })` | Badge statusu terminu na sygnaturowym `.badge` (mono, kropka wiodąca); kolory z tonu `consultation-status`. Wspólny dla wszystkich widoków konsultacji. |
| `consultation-row.tsx` | `ConsultationRow({ to, lead, title, sub?, label, tone })` | Wiersz agendy terminu (link `list-row`): mono data/godzina + tytuł + `StatusBadge` + chevron. Wspólny dla list trenera i podopiecznego. |
| `consultation-alert.tsx` | `ConsultationAlert({ data })` | Jednolity komunikat zwrotny akcji (błąd/sukces) na klasach `.alert`. Zastępuje powielane inline `<p>/<output>` w trasach konsultacji. |
| `trainee-occurrence-actions.tsx` | `TraineeOccurrenceActions({ consultationId, compact? })` | Akcje podopiecznego na terminie: Potwierdzam / Poproś o zmianę (textarea) / Odrzuć. POST → `respondToOccurrence`. Wspólny dla karty „najbliższy", kart dnia i szczegółów. |
| `skill-tree.tsx` | `SkillTreeView({ tree, hrefForNode, showStates })`, `VariationLadder({ variations })` | `SkillTreeView`: drzewo umiejętności w stylu „skill tree": warstwy (layer = wiersz) w CSS-grid + krawędzie prerekwizytów jako SVG-beziery w warstwie pod kartami (znormalizowany `viewBox`, środki węzłów liczone z `layer`/`orderInLayer`/liczności — bez pomiaru DOM, SSR-safe). `showStates=true` koloruje węzły i krawędzie wg stanu (per-podopieczny: `mastered`/`in_progress`/`available`/`locked` → tokeny), `false` to szkielet autora. Każda karta to `Link` do `hrefForNode(skillId)`. Pusty stan + legenda. `VariationLadder`: growy, pionowy tor wariantów per umiejętność (drill-in) — kroki sortowane po `ordinal` na pionowej ścieżce z łącznikiem, stany done (`--ok` + ptaszek) / current (`--accent` + „Tu jesteś") / locked (przygaszone), etykiety mono, ten sam język wizualny co drzewo. Czysta prezentacja, read-only — bez fetchowania, bez `Link`. |
| `trainee-stats.tsx` | `HeroStatsCard`, `ThisWeekCard`, `ActivityHeatmapCard`, `EffortBalanceCard`, `WrappedListRow` | Prezentacyjne karty statystyk pulpitu podopiecznego (hero, ten tydzień, heatmapa, effort balance RPE, lista Wrapped). Bez fetchowania. |
| `trainee-health.tsx` | `HealthTilesCard`, `PlateauCard`, `PlanUsageCard`, `CoverageCard`, `TagDistributionCard`, `ActivityHeatmapCard` | Prezentacyjne karty cockpitu zdrowia klienta (widok trenera): health tiles, plateau, plan usage, coverage video/zdjęcia, rozkład tagów, heatmapa. Bez fetchowania. |
| `list-controls.tsx` | `ListControls({ spec, state, searchPlaceholder? })` | Współdzielony pasek kontrolek listy: szukajka (opcjonalna) + dropdown sortu + chipy filtrów. URL-driven (server-side); debounce 300 ms na zmianę; działa bez JS (`<noscript>`). Przyjmuje `ListControlsSpec` + `ListControlsState` z `~/lib/list-params`. |
| `exercise-progression-panel.tsx` | `ExerciseProgressionPanel` | Panel szczegółów progresji ćwiczenia: KPI (PR all-time, zmiana, sesje, RPE), przełącznik „Okres" (`?zakres=`) + wykres rekordu (`ProgressionLineChart`) + objętość (`VolumeBars`). Rola-agnostyczny — dane przekazywane przez propsy. |
| `progression-list.tsx` | `ProgressionList` | Lista progresji ćwiczeń z trybem porównania (wybór ≥2 → redirect na `/porownanie`): sparkline + status + PR per wiersz; rola-agnostyczna — bez fetchowania. |

Konwencje wizualne (kolory, typografia, ikonografia): [`../../design-system/README.md`](../../design-system/README.md).

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
