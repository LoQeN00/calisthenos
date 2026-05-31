# app/lib/storage/ — magazyn plików (FileStorage)

Abstrakcja przechowywania plików (wideo demo, wideo serii, zdjęcia sylwetki).
Celowo izolowana za interfejsem, by w przyszłości podmienić dysk na R2/S3 bez
ruszania wywołań.

| Plik | Rola / kluczowe eksporty |
|---|---|
| `interface.ts` | Kontrakt `FileStorage` (`write`, `read`, `delete`, `size`) + typy `FileWriteResult`, `FileReadResult`, `ReadRange` (obsługa HTTP Range). Zwraca strumienie Node `Readable`. |
| `local-volume.ts` | `LocalVolumeStorage implements FileStorage` — zapis/odczyt na lokalnym wolumenie (`DATA_DIR`), streaming, odczyt zakresowy, **ochrona przed path traversal** (resolve + guard `startsWith`). |
| `index.ts` | Fabryka-singleton `getStorage()` — domyślnie `LocalVolumeStorage`. |

Upload/serwowanie idą przez `lib/file-uploads.ts` i `lib/files.ts` (podpisane
URL-e); ten katalog odpowiada wyłącznie za bajty na nośniku.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
