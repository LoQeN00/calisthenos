# public/fonts/ — webfonty (woff2)

Self-hostowane fonty serwowane spod `/fonts/...`, ładowane przez `@font-face` w
[`../../app/styles/tokens.css`](../../app/styles/tokens.css). Brak zdalnego
fetchu z Google Fonts w produkcji.

| Plik | Font | Zakres |
|---|---|---|
| `DMSans-latin.woff2` / `DMSans-latin-ext.woff2` | DM Sans | tekst (body) |
| `SpaceGrotesk-latin.woff2` / `SpaceGrotesk-latin-ext.woff2` | Space Grotesk | nagłówki/display, brand |
| `JetBrainsMono-latin.woff2` / `JetBrainsMono-latin-ext.woff2` | JetBrains Mono | liczby, jednostki, badge, eyebrow |

Każdy font w dwóch podzbiorach (`latin` + `latin-ext`) rozdzielanych przez
`unicode-range`. Role typograficzne: [`../../design-system/README.md`](../../design-system/README.md).

---
Konwencja i zasady aktualizacji dokumentacji: [`../../CLAUDE.md`](../../CLAUDE.md).
