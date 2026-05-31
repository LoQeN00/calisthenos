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

Konwencje wizualne (kolory, typografia, ikonografia): [`../../design-system/README.md`](../../design-system/README.md).

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
