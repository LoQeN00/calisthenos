import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FileReadResult, FileStorage, FileWriteResult, ReadRange } from "./interface";

export class LocalVolumeStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(rel: string): string {
    // Defend against path traversal: the resolved absolute path must be inside root.
    const abs = path.resolve(this.root, rel);
    const rootAbs = path.resolve(this.root);
    if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
      throw new Error(`path traversal attempted: ${rel}`);
    }
    return abs;
  }

  async write(
    rel: string,
    source: AsyncIterable<Uint8Array> | Uint8Array,
  ): Promise<FileWriteResult> {
    const abs = this.resolve(rel);
    await mkdir(path.dirname(abs), { recursive: true });

    if (source instanceof Uint8Array) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(abs, source);
      return { bytes: source.byteLength };
    }

    // Po wcześniejszym `return` dla Uint8Array zostaje już tylko strumień, ale
    // zawężenie typu parametru nie przechodzi do domknięcia generatora — łapiemy je
    // w `const`.
    const chunks: AsyncIterable<Uint8Array> = source;
    let bytes = 0;
    // Generator zliczający, opakowany w `Readable.from` — źródło jest ciągnięte
    // DOPIERO na żądanie konsumenta, a `pipeline` wstrzymuje je, gdy zapis na dysk
    // nie nadąża. Poprzednia wersja pompowała `counting.push(chunk)` w pętli i
    // ignorowała zwracane `false`, więc przy szybkim źródle (plik już w pamięci)
    // cały strumień lądował w wewnętrznym buforze Readable — druga pełna kopia
    // pliku w RAM. `objectMode: false` trzyma próg buforowania w bajtach.
    async function* counting(): AsyncGenerator<Uint8Array> {
      for await (const chunk of chunks) {
        bytes += chunk.byteLength;
        yield chunk;
      }
    }
    // `highWaterMark` MUSI być jawne: `Readable.from` ustawia domyślnie 1, i to
    // *przed* rozłożeniem opcji, więc sam `objectMode: false` zostawiłby próg bufora
    // na jednym bajcie — czyli obrót `_read()` → `iterator.next()` na każdy chunk.
    // 64 kB odpowiada rozmiarowi chunka z `File.stream()`: bufor trzyma ~jeden chunk
    // zapasu, backpressure zostaje ciasny, a obrotów jest tyle co chunków.
    await pipeline(
      Readable.from(counting(), { objectMode: false, highWaterMark: 64 * 1024 }),
      createWriteStream(abs),
    );
    return { bytes };
  }

  async read(rel: string, range?: ReadRange): Promise<FileReadResult> {
    const abs = this.resolve(rel);
    const s = await stat(abs);
    const totalBytes = s.size;
    const start = range?.start ?? 0;
    const end = range?.end ?? totalBytes - 1;
    if (start < 0 || start > totalBytes - 1 || end < start || end > totalBytes - 1) {
      throw new RangeError(`invalid range ${start}-${end} for size ${totalBytes}`);
    }
    const stream = createReadStream(abs, { start, end });
    return { stream, bytes: end - start + 1, totalBytes };
  }

  async delete(rel: string): Promise<void> {
    const abs = this.resolve(rel);
    await rm(abs, { force: true });
  }

  async size(rel: string): Promise<number | null> {
    try {
      const s = await stat(this.resolve(rel));
      return s.size;
    } catch (err: unknown) {
      if (typeof err === "object" && err && (err as { code?: string }).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }
}
