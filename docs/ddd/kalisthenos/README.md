# kalisthenos — analiza strategiczna DDD (wyniki)

Konkretne wyniki analizy strategicznej DDD dla kalisthenos, prowadzonej wg
generycznej metodyki z [`../strategic-ddd-flow.md`](../strategic-ddd-flow.md)
(kroki 1–7). Analiza jest **brownfield** — rekonstruujemy model strategiczny z
istniejącego kodu i spec-ów, żeby dać fundament pod pełnoprawną reimplementację.

**Ten plik jest żywym indeksem i tablicą statusu.** Każda rozmowa (faza)
zaczyna od jego przeczytania. Zasady, runbook faz i protokół handoff:
[`00-plan-analizy-strategicznej.md`](00-plan-analizy-strategicznej.md).

## Jak czytać / kontynuować

**Najprościej:** w nowej rozmowie **@-wspomnij [`next-session-prompt.md`](next-session-prompt.md)**
(albo wklej jego treść). Ten plik zawsze opisuje najbliższą fazę do zrobienia i
mówi Claude, co przeczytać. Claude aktualizuje go automatycznie pod koniec każdej
fazy — nie musisz nic komponować.

Ręcznie (albo dla orientacji):
1. Przeczytaj ten plik (gdzie jesteśmy — tablica niżej).
2. Przeczytaj [`glosariusz.md`](glosariusz.md).
3. Otwórz [`00-plan-analizy-strategicznej.md`](00-plan-analizy-strategicznej.md)
   → sekcja §9, runbook fazy, którą wykonujesz (w tym „Zależy od" i „Wejście").
4. Przeczytaj artefakty faz, od których zależy bieżąca faza. Dopiero potem kod.

## Tablica statusu

Legenda: ⬜ do zrobienia · 🟡 draft (nie zwalidowany) · ✅ zwalidowany

| Faza | Krok DDD | Artefakt | Status | Data |
|---|---|---|---|---|
| F0 | — | [`00-plan-analizy-strategicznej.md`](00-plan-analizy-strategicznej.md) | ✅ | 2026-07-05 |
| F1 | 1 Understand | [`01-understand-model-biznesowy.md`](01-understand-model-biznesowy.md) | ✅ | 2026-07-05 |
| F2 | 2 Discover | [`02-discover-mapa-zdarzen.md`](02-discover-mapa-zdarzen.md) | ✅ | 2026-07-06 |
| F3 | 3 Decompose | [`03-decompose-poddomeny.md`](03-decompose-poddomeny.md) | ✅ | 2026-07-06 |
| F4 | 4 Strategize | [`04-strategize-core-domain-chart.md`](04-strategize-core-domain-chart.md) | ✅ | 2026-07-06 |
| F5 | 5 Connect | [`05-connect-context-map.md`](05-connect-context-map.md) | ✅ | 2026-07-06 |
| F6 | 6 Organise | [`06-organise-wlasnosc-modulow.md`](06-organise-wlasnosc-modulow.md) | ✅ | 2026-07-07 |
| F7 | 7 Define | [`07-define/`](07-define/README.md) (kanwa per kontekst) | 🟡 | — |
| F8 | — | `08-synteza-model-strategiczny.md` | ⬜ | — |

> Liczba rozmów F7 = liczba bounded contextów, ustalona w F5: **13**
> (core-first: advancement → retention → catalog-skill/struktura #5 → supporting → generic/missing).

## Pliki w tym katalogu

| Plik / katalog | Rola |
|---|---|
| `00-plan-analizy-strategicznej.md` | Instrukcja obsługi całego wysiłku: cel, zakres, decyzje, zasady, runbook faz, protokół handoff |
| `README.md` | Ten indeks + tablica statusu |
| `next-session-prompt.md` | **Pałeczka sztafetowa** — gotowy prompt na następną fazę; @-wspomnij go w nowej rozmowie. Claude aktualizuje go na końcu każdej fazy |
| `glosariusz.md` | Żywy ubiquitous language — aktualizowany w każdej fazie |
| `SZABLON-artefaktu.md` | Szablon pojedynczego artefaktu fazy |
| `07-define/` | Bounded Context Canvas — jeden plik na kontekst (+ własny indeks) |
| `01…08-*.md` | Artefakty poszczególnych faz (powstają w miarę postępu) |

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
