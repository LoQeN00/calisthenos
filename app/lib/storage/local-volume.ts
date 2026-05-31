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

    let bytes = 0;
    const counting = new Readable({
      async read() {},
    });
    // Pump the async iterable, counting bytes, into a node stream we pipeline to disk.
    (async () => {
      try {
        for await (const chunk of source) {
          bytes += chunk.byteLength;
          counting.push(chunk);
        }
        counting.push(null);
      } catch (err) {
        counting.destroy(err as Error);
      }
    })();
    await pipeline(counting, createWriteStream(abs));
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
