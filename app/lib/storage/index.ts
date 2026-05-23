import { getEnv } from "~/lib/env";
import type { FileStorage } from "./interface";
import { LocalVolumeStorage } from "./local-volume";

let cached: FileStorage | null = null;

export function getStorage(): FileStorage {
  if (!cached) cached = new LocalVolumeStorage(getEnv().DATA_DIR);
  return cached;
}

export type { FileStorage, FileWriteResult, FileReadResult, ReadRange } from "./interface";
