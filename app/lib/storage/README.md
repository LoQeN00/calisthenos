# app/lib/storage/ — magazyn plików (FileStorage)

Abstrakcja przechowywania plików (wideo demo, wideo serii, zdjęcia sylwetki).
Celowo izolowana za interfejsem, by w przyszłości podmienić dysk na R2/S3 bez
ruszania wywołań.

| Plik | Rola / kluczowe eksporty |
|---|---|
| `interface.ts` | Kontrakt `FileStorage` (`write`, `read`, `delete`, `size`) + typy `FileWriteResult`, `FileReadResult`, `ReadRange` (obsługa HTTP Range). Zwraca strumienie Node `Readable`. |
| `local-volume.ts` | `LocalVolumeStorage implements FileStorage` — zapis/odczyt na lokalnym wolumenie (`DATA_DIR`), streaming z **poszanowaniem backpressure** (`Readable.from` + `pipeline` — źródło ciągnięte na żądanie, bez buforowania całego pliku w RAM), odczyt zakresowy, **ochrona przed path traversal** (resolve + guard `startsWith`). |
| `local-volume.test.ts` | Testy jednostkowe na prawdziwym katalogu tymczasowym: poprawność zapisu wieloczunkowego (bajt w bajt), pusty strumień, ścieżka szybka `Uint8Array`, propagacja błędu źródła, `size`, odczyt zakresowy, blokada path traversal. |
| `index.ts` | Fabryka-singleton `getStorage()` — domyślnie `LocalVolumeStorage`. |

Upload/serwowanie idą przez `lib/file-uploads.ts` i `lib/files.ts` (podpisane
URL-e); ten katalog odpowiada wyłącznie za bajty na nośniku.

---
Konwencja i zasady aktualizacji dokumentacji: [`../../../CLAUDE.md`](../../../CLAUDE.md).
