import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalVolumeStorage } from "./local-volume";

/**
 * Testy pracują na prawdziwym katalogu tymczasowym (bez Dockera, bez DB) — to
 * jedyny sposób, by sprawdzić realny zapis strumieniowy na dysk.
 *
 * UWAGA o backpressure: właściwość „nie buforujemy całego pliku w RAM" wynika z
 * konstrukcji (`Readable.from` ciągnie z iteratora dopiero na żądanie konsumenta,
 * a `pipeline` wstrzymuje źródło gdy `write()` zwróci false) i NIE jest tu
 * asertowana — nie da się jej zaobserwować z zewnątrz bez wstrzykiwalnego,
 * sterowalnego sinka. Poniższe testy pilnują natomiast poprawności, czyli tego,
 * co refaktor mógłby zepsuć: kolejności bajtów, liczby bajtów i obsługi błędów.
 */
describe("LocalVolumeStorage", () => {
  let root: string;
  let storage: LocalVolumeStorage;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "kalisthenos-storage-"));
    storage = new LocalVolumeStorage(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function chunked(total: number, chunkSize: number): AsyncIterable<Uint8Array> {
    return (async function* () {
      let written = 0;
      while (written < total) {
        const size = Math.min(chunkSize, total - written);
        const chunk = new Uint8Array(size);
        for (let i = 0; i < size; i++) chunk[i] = (written + i) % 256;
        written += size;
        yield chunk;
      }
    })();
  }

  it("zapisuje strumień wieloczunkowy bajt w bajt i zwraca poprawną liczbę bajtów", async () => {
    const total = 1_000_000;
    const res = await storage.write("sets/clip.mp4", chunked(total, 8 * 1024));

    expect(res.bytes).toBe(total);

    const onDisk = await readFile(path.join(root, "sets/clip.mp4"));
    expect(onDisk.byteLength).toBe(total);
    // Weryfikacja zawartości, nie tylko rozmiaru — gubienie/duplikowanie chunków
    // przy zmianie pompowania dałoby poprawny rozmiar, ale zepsutą treść.
    for (let i = 0; i < total; i += 9973) {
      expect(onDisk[i]).toBe(i % 256);
    }
  });

  it("radzi sobie ze strumieniem pustym (zero chunków)", async () => {
    const res = await storage.write("sets/empty.mp4", chunked(0, 1024));
    expect(res.bytes).toBe(0);
    const onDisk = await readFile(path.join(root, "sets/empty.mp4"));
    expect(onDisk.byteLength).toBe(0);
  });

  it("obsługuje ścieżkę szybką dla Uint8Array", async () => {
    const res = await storage.write("body/photo.jpg", new Uint8Array([1, 2, 3, 4]));
    expect(res.bytes).toBe(4);
    const onDisk = await readFile(path.join(root, "body/photo.jpg"));
    expect(Array.from(onDisk)).toEqual([1, 2, 3, 4]);
  });

  it("propaguje błąd źródła zamiast cicho urwać plik", async () => {
    async function* broken(): AsyncGenerator<Uint8Array> {
      yield new Uint8Array([1, 2, 3]);
      throw new Error("źródło padło");
    }

    await expect(storage.write("sets/broken.mp4", broken())).rejects.toThrow("źródło padło");
  });

  it("zwraca rozmiar zapisanego pliku, a null dla nieistniejącego", async () => {
    await storage.write("sets/a.mp4", new Uint8Array(10));
    expect(await storage.size("sets/a.mp4")).toBe(10);
    expect(await storage.size("sets/brak.mp4")).toBeNull();
  });

  it("czyta zakres bajtów (Range) dokładnie", async () => {
    await storage.write("sets/r.mp4", chunked(1000, 128));
    const res = await storage.read("sets/r.mp4", { start: 100, end: 199 });

    expect(res.bytes).toBe(100);
    expect(res.totalBytes).toBe(1000);

    const parts: Buffer[] = [];
    for await (const c of res.stream) parts.push(c as Buffer);
    const buf = Buffer.concat(parts);
    expect(buf.byteLength).toBe(100);
    expect(buf[0]).toBe(100 % 256);
  });

  it("blokuje wyjście poza katalog główny (path traversal)", async () => {
    await expect(storage.write("../ucieczka.mp4", new Uint8Array([1]))).rejects.toThrow(
      /path traversal/,
    );
  });
});
