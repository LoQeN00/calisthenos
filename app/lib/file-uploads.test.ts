import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  UploadError,
  iterateFileChunks,
  maxUploadBytesFor,
  uploadFile,
  uploadExerciseDemo,
  uploadSetVideo,
} from "./file-uploads";
import { createApiClient } from "~/lib/api/client";
import { ApiError } from "~/lib/api/errors";

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

  it("stosuje niższy limit wideo wyłącznie dla nagrań serii", () => {
    expect(maxUploadBytesFor("set_video", limits)).toBe(30_000_000);
  });

  it("stosuje ogólny limit dla demo ćwiczeń i zdjęć sylwetki", () => {
    // `exercise_demo` przeszło z limitu wideo na ogólny, żeby zgadzać się
    // z kontraktem: BE wiąże ten rodzaj z `maxUploadBytes` i uzasadnia to wprost
    // (demo instruktażowe trenera). Limit surowszy od kontraktu odrzucałby
    // w przeglądarce pliki, które BE przyjmuje bez zastrzeżeń.
    expect(maxUploadBytesFor("exercise_demo", limits)).toBe(250_000_000);
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

function klientPlikow(reguly: (req: Request) => Response | Promise<Response>) {
  return createApiClient({
    baseUrl: "http://be.test",
    getToken: () => "T",
    fetch: (async (req: Request) => reguly(req)) as unknown as typeof fetch,
  });
}

function wideo(bajtow: number): File {
  return new File([new Uint8Array(bajtow)], "demo.mp4", { type: "video/mp4" });
}

/**
 * Plik o ROZMIARZE ponad limit, bez alokowania tylu bajtów — limit demo to dziś
 * 250 MB (zgodnie z kontraktem), a prawdziwy bufor tej wielkości w teście
 * jednostkowym byłby kosztem bez wartości: sprawdzana gałąź patrzy wyłącznie
 * na `file.size`.
 */
function wideoORozmiarze(bajtow: number): File {
  const plik = wideo(1);
  Object.defineProperty(plik, "size", { value: bajtow });
  return plik;
}

describe("uploadExerciseDemo — wysyłka demo przez kontrakt", () => {
  it("pusty plik odrzuca bez wywołania sieci", async () => {
    let wywolan = 0;
    const api = klientPlikow(() => {
      wywolan += 1;
      return new Response(null, { status: 201 });
    });

    await expect(uploadExerciseDemo(api, wideo(0))).rejects.toBeInstanceOf(UploadError);
    expect(wywolan).toBe(0);
  });

  it("plik ponad limit odrzuca bez wywołania sieci", async () => {
    // Plik jest już w pamięci po `request.formData()`, więc sprawdzenie tutaj
    // oszczędza wysłanie kilkudziesięciu megabajtów po to, żeby usłyszeć `413`.
    let wywolan = 0;
    const api = klientPlikow(() => {
      wywolan += 1;
      return new Response(null, { status: 201 });
    });

    const blad = await uploadExerciseDemo(api, wideoORozmiarze(250_000_001)).catch(
      (e: unknown) => e,
    );

    expect(blad).toBeInstanceOf(UploadError);
    expect((blad as UploadError).userMessage).toContain("Plik za duży");
    expect(wywolan).toBe(0);
  });

  it("wysyła multipartem i potwierdza plik", async () => {
    // Druga faza (`confirm`) jest dziś po stronie BE udokumentowanym no-opem —
    // wołamy ją, bo kontrakt tak deklaruje protokół, a weryfikacja wraca do życia
    // przy wysyłce prosto do magazynu. Pliku przed zamiataczem sierot broni
    // podpięcie (`PATCH`), nie to wywołanie.
    const trafienia: string[] = [];
    let typZawartosci = "";
    const api = klientPlikow((req) => {
      const sciezka = new URL(req.url).pathname;
      trafienia.push(`${req.method} ${sciezka}`);
      if (sciezka === "/v1/files/exercise-demo") {
        typZawartosci = req.headers.get("content-type") ?? "";
        return new Response(JSON.stringify({ id: "f-1", bytes: 10, mimeType: "video/mp4" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    });

    const wynik = await uploadExerciseDemo(api, wideo(10));

    expect(wynik).toBe("f-1");
    expect(trafienia).toEqual(["POST /v1/files/exercise-demo", "POST /v1/files/f-1/confirm"]);
    expect(typZawartosci).toContain("multipart/form-data");
  });

  it("413 z kontraktu wraca jako UploadError z komunikatem BE", async () => {
    const api = klientPlikow(
      () =>
        new Response(
          JSON.stringify({ error: { code: "FILE_TOO_LARGE", message: "Plik jest za duży." } }),
          { status: 413, headers: { "content-type": "application/json" } },
        ),
    );

    const blad = await uploadExerciseDemo(api, wideo(10)).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(UploadError);
    expect((blad as UploadError).userMessage).toBe("Plik jest za duży.");
  });

  it("awaria BE NIE zamienia się w UploadError", async () => {
    // Ta sama wąskość co przy `CategoryError`: gdyby moduł łykał każdy błąd,
    // awaria serwera pokazałaby się w formularzu jako problem z plikiem —
    // komunikat kierujący użytkownika na fałszywy trop i ukrywający usterkę.
    const api = klientPlikow(
      () =>
        new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Ups." } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );

    const blad = await uploadExerciseDemo(api, wideo(10)).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(ApiError);
    expect(blad).not.toBeInstanceOf(UploadError);
  });
});

describe("uploadSetVideo — nagranie serii przez kontrakt", () => {
  it("wysyła multipartem na `/v1/files/set-video` i potwierdza plik", async () => {
    // Rodzaj pliku wynika z użytej operacji, nie z parametru (`docs/04` §8) —
    // ta sama dwufazowa ścieżka co demo, inny adres pierwszej fazy.
    const trafienia: string[] = [];
    const api = klientPlikow((req) => {
      const sciezka = new URL(req.url).pathname;
      trafienia.push(`${req.method} ${sciezka}`);
      if (sciezka === "/v1/files/set-video") {
        return new Response(JSON.stringify({ id: "f-2", bytes: 10, mimeType: "video/mp4" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(null, { status: 204 });
    });

    expect(await uploadSetVideo(api, wideo(10))).toBe("f-2");
    expect(trafienia).toEqual(["POST /v1/files/set-video", "POST /v1/files/f-2/confirm"]);
  });

  it("stosuje NIŻSZY limit wideo (30 MB) i odrzuca bez wywołania sieci", async () => {
    // Demo ćwiczenia ma limit ogólny (250 MB), nagranie serii — limit wideo.
    // Wspólna ścieżka musi wziąć limit z rodzaju, nie z jednej stałej.
    let wywolan = 0;
    const api = klientPlikow(() => {
      wywolan += 1;
      return new Response(null, { status: 201 });
    });

    const blad = await uploadSetVideo(api, wideoORozmiarze(30_000_001)).catch((e: unknown) => e);

    expect(blad).toBeInstanceOf(UploadError);
    expect((blad as UploadError).userMessage).toContain("30 MB");
    expect(wywolan).toBe(0);
  });

  it("`413` z kontraktu wraca jako UploadError z komunikatem BE, a `500` jako ApiError", async () => {
    const zaDuzy = klientPlikow(
      () =>
        new Response(
          JSON.stringify({
            error: { code: "FILE_TOO_LARGE", message: "Plik przekracza limit rozmiaru." },
          }),
          {
            status: 413,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const awaria = klientPlikow(
      () =>
        new Response(JSON.stringify({ error: { code: "INTERNAL", message: "Ups." } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
    );

    const odmowa = await uploadSetVideo(zaDuzy, wideo(10)).catch((e: unknown) => e);
    const blad = await uploadSetVideo(awaria, wideo(10)).catch((e: unknown) => e);

    expect(odmowa).toBeInstanceOf(UploadError);
    expect((odmowa as UploadError).userMessage).toBe("Plik przekracza limit rozmiaru.");
    expect(blad).toBeInstanceOf(ApiError);
  });
});
