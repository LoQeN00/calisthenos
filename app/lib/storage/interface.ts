import type { Readable } from "node:stream";

export interface FileWriteResult {
  bytes: number;
}

export interface FileReadResult {
  /** Node Readable. Convert to a Web ReadableStream via `Readable.toWeb()` for `Response`. */
  stream: Readable;
  /** Number of bytes in this read. For a non-ranged read this is the file size. */
  bytes: number;
  /** Total file size (always the full size of the underlying file, even for ranged reads). */
  totalBytes: number;
}

export interface ReadRange {
  /** Inclusive start byte. */
  start: number;
  /** Inclusive end byte. If omitted, read to EOF. */
  end?: number;
}

/**
 * Storage backend for user-uploaded files. `path` is always a forward-slash relative
 * path under the storage root (e.g. `exercises/<uuid>.mp4`).
 *
 * V1: LocalVolumeStorage. V2+: a swap-in R2/S3 implementation reuses this interface.
 */
export interface FileStorage {
  write(path: string, source: AsyncIterable<Uint8Array> | Uint8Array): Promise<FileWriteResult>;
  read(path: string, range?: ReadRange): Promise<FileReadResult>;
  delete(path: string): Promise<void>;
  /** Returns size in bytes, or null if the file doesn't exist. */
  size(path: string): Promise<number | null>;
}
