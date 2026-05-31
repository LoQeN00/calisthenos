# public/ — assety statyczne

Pliki serwowane bez przetwarzania spod roota URL (np. `/icon.svg`,
`/manifest.webmanifest`, `/fonts/...`).

## Pliki w tym katalogu

| Plik | Rola |
|---|---|
| `icon.svg` | Ikona aplikacji / PWA (znak "K"). Do produkcji warto dodać PNG 192×192 i 512×512 (Apple touch icon). |
| `manifest.webmanifest` | Manifest PWA (nazwa, ikony, `display: standalone`, theme color). |

## Podkatalogi

| Katalog | Zawartość |
|---|---|
| [`fonts/`](fonts/README.md) | Self-hostowane woff2 ładowane przez `@font-face` z `app/styles/tokens.css`. |

---
Konwencja i zasady aktualizacji dokumentacji: [`../CLAUDE.md`](../CLAUDE.md).
