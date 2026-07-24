import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadError, iterateFileChunks, maxUploadBytesFor, uploadFile } from "./file-uploads";

const { writeMock, deleteMock, fileTypeMock, loggerErrorMock } = vi.hoisted(() => ({
  writeMock: vi.fn(async (_path: string, _source: AsyncIterable<Uint8Array> | Uint8Array) => ({
    bytes: 3,
  })),
  deleteMock: vi.fn(async (_path: string) => {}),
  fileTypeMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("~/lib/storage", () => ({
  getStorage: () => ({ write: writeMock, delete: deleteMock, read: vi.fn(), size: vi.fn() }),
}));
vi.mock("~/lib/env", () => ({
  getEnv: () => ({ MAX_UPLOAD_BYTES: 250_000_000, MAX_VIDEO_UPLOAD_BYTES: 30_000_000 }),
}));
vi.mock("file-type", () => ({ fileTypeFromBuffer: fileTypeMock }));
vi.mock("~/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: loggerErrorMock },
  errorMeta: (err: unknown) => (err instanceof Error ? { name: err.name } : {}),
}));

describe("maxUploadBytesFor", () => {
  const limits = { MAX_UPLOAD_BYTES: 250_000_000, MAX_VIDEO_UPLOAD_BYTES: 30_000_000 };

  it("stosuje niższy limit wideo dla nagrań serii i demo ćwiczeń", () => {
    expect(maxUploadBytesFor("set_video", limits)).toBe(30_000_000);
    expect(maxUploadBytesFor("exercise_demo", limits)).toBe(30_000_000);
  });

  it("stosuje ogólny limit dla zdjęć sylwetki", () => {
    expect(maxUploadBytesFor("body_photo", limits)).toBe(250_000_000);
  });
});

describe("iterateFileChunks", () => {
  async function collect(file: File): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of iterateFileChunks(file)) {
      parts.push(chunk);
      total += chunk.byteLength;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.byteLength;
    }
    return out;
  }

  it("streamuje całą zawartość pliku bez zmian (kolejność bajtów zachowana)", async () => {
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const file = new File([bytes], "clip.mp4", { type: "video/mp4" });

    const streamed = await collect(file);

    expect(streamed.byteLength).toBe(bytes.byteLength);
    expect(streamed).toEqual(bytes);
  });

  it("radzi sobie z pustym plikiem (zero chunków)", async () => {
    const file = new File([], "empty.mp4", { type: "video/mp4" });
    const streamed = await collect(file);
    expect(streamed.byteLength).toBe(0);
  });
});

describe("uploadFile — bezpieczeństwo zapisu (streaming nie omija walidacji)", () => {
  beforeEach(() => {
    writeMock.mockClear();
    deleteMock.mockClear();
    fileTypeMock.mockReset();
    loggerErrorMock.mockClear();
  });

  it("NIE zapisuje na dysk, gdy magic-bytes nie zgadzają się z deklarowanym MIME", async () => {
    // Plik deklaruje video/mp4, ale zawartość nie jest rozpoznana jako wideo.
    fileTypeMock.mockResolvedValue(undefined);
    const file = new File([new Uint8Array(5000)], "fake.mp4", { type: "video/mp4" });

    await expect(
      uploadFile({} as never, {
        file,
        kind: "set_video",
        trainerId: "t1",
        uploadedBy: "u1",
      }),
    ).rejects.toBeInstanceOf(UploadError);

    // Kluczowe: żaden bajt nie trafił do storage — plik o niezgodnym typie nie powstaje.
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("odrzuca wideo przekraczające MAX_VIDEO_UPLOAD_BYTES przed jakimkolwiek zapisem", async () => {
    // Blob 40 MB > 30 MB limitu wideo; nie dotykamy nawet magic-bytes.
    const big = new File([new Uint8Array(40_000_000)], "big.mp4", { type: "video/mp4" });

    await expect(
      uploadFile({} as never, {
        file: big,
        kind: "set_video",
        trainerId: "t1",
        uploadedBy: "u1",
      }),
    ).rejects.toBeInstanceOf(UploadError);

    expect(fileTypeMock).not.toHaveBeenCalled();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("przy zgodnym typie streamuje zawartość do storage (AsyncIterable, nie pełny bufor)", async () => {
    fileTypeMock.mockResolvedValue({ mime: "video/mp4", ext: "mp4" });
    const inserted = {
      id: "f1",
      storagePath: "set-videos/f1.mp4",
      mimeType: "video/mp4",
      bytes: 3,
    };
    const db = {
      insert: () => ({ values: () => ({ returning: async () => [inserted] }) }),
    };
    const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });

    const rec = await uploadFile(db as never, {
      file,
      kind: "set_video",
      trainerId: "t1",
      uploadedBy: "u1",
    });

    expect(writeMock).toHaveBeenCalledTimes(1);
    const source = writeMock.mock.calls[0]?.[1] as AsyncIterable<Uint8Array>;
    // Streaming: przekazujemy async-iterable, a nie pełny Uint8Array w pamięci.
    expect(typeof source[Symbol.asyncIterator]).toBe("function");
    expect(rec.id).toBe("f1");
  });

  it("loguje awarię wolumenu przy braku miejsca (ENOSPC), zanim zmapuje ją na UploadError", async () => {
    // Bez tego logu zapełniony dysk objawia się wyłącznie komunikatem u użytkownika
    // — właściciel nie ma ŻADNEGO sygnału, że wolumen się skończył.
    fileTypeMock.mockResolvedValue({ mime: "video/mp4", ext: "mp4" });
    const enospc = Object.assign(new Error("no space left"), { code: "ENOSPC" });
    writeMock.mockRejectedValueOnce(enospc);
    const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });

    await expect(
      uploadFile({} as never, {
        file,
        kind: "set_video",
        trainerId: "t1",
        uploadedBy: "u1",
      }),
    ).rejects.toBeInstanceOf(UploadError);

    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    const [event, ctx] = loggerErrorMock.mock.calls[0] ?? [];
    expect(event).toBe("upload.storage_write_failed");
    expect(ctx).toMatchObject({ code: "ENOSPC", kind: "set_video" });
  });

  it("loguje awarię uprawnień wolumenu (EACCES)", async () => {
    // Rodzaj `body_photo` wymaga MIME z listy obrazów — inaczej walidacja odrzuci
    // plik PRZED zapisem i zakolejkowane odrzucenie writeMock nie zostanie zużyte.
    fileTypeMock.mockResolvedValue({ mime: "image/jpeg", ext: "jpg" });
    const eacces = Object.assign(new Error("permission denied"), { code: "EACCES" });
    writeMock.mockRejectedValueOnce(eacces);
    const file = new File([new Uint8Array([1, 2, 3])], "foto.jpg", { type: "image/jpeg" });

    await expect(
      uploadFile({} as never, {
        file,
        kind: "body_photo",
        trainerId: "t1",
        uploadedBy: "u1",
      }),
    ).rejects.toBeInstanceOf(UploadError);

    expect(loggerErrorMock).toHaveBeenCalledWith(
      "upload.storage_write_failed",
      expect.objectContaining({ code: "EACCES", kind: "body_photo" }),
    );
  });

  it("loguje też nieznane awarie zapisu (nie tylko te zmapowane na UploadError)", async () => {
    fileTypeMock.mockResolvedValue({ mime: "video/mp4", ext: "mp4" });
    writeMock.mockRejectedValueOnce(new Error("dysk się zaciął"));
    const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });

    await expect(
      uploadFile({} as never, {
        file,
        kind: "set_video",
        trainerId: "t1",
        uploadedBy: "u1",
      }),
    ).rejects.toThrow("dysk się zaciął");

    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });

  it("sprząta częściowy plik, gdy zapis strumieniowy padnie w trakcie", async () => {
    fileTypeMock.mockResolvedValue({ mime: "video/mp4", ext: "mp4" });
    writeMock.mockRejectedValueOnce(new Error("stream broke"));
    const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });

    await expect(
      uploadFile({} as never, {
        file,
        kind: "set_video",
        trainerId: "t1",
        uploadedBy: "u1",
      }),
    ).rejects.toThrow("stream broke");

    // Osierocony blob nie może zostać na dysku — cleanup queue jeszcze go nie zna.
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
