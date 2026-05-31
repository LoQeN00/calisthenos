import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import type { LoaderFunctionArgs } from "react-router";
import { requireUser } from "~/lib/auth";
import { ownsTrainerScope } from "~/lib/authz";
import { db } from "~/lib/db/client";
import * as schema from "~/lib/db/schema";
import { verifyFileUrl } from "~/lib/files";
import { getStorage } from "~/lib/storage";

interface ParsedRange {
  start: number;
  end: number;
}

function parseRange(header: string | null, totalBytes: number): ParsedRange | null {
  if (!header) return null;
  const match = /^bytes=(\d+)-(\d+)?$/.exec(header.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] === undefined ? totalBytes - 1 : Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= totalBytes || end < start || end >= totalBytes) return null;
  return { start, end };
}

export async function loader(args: LoaderFunctionArgs) {
  const user = await requireUser(args.request, db);
  const fileId = args.params.fileId ?? "";
  const url = new URL(args.request.url);
  const exp = Number(url.searchParams.get("exp") ?? "0");
  const sig = url.searchParams.get("sig") ?? "";

  if (!verifyFileUrl(fileId, exp, sig, user.id)) {
    throw new Response("forbidden", { status: 403 });
  }

  const rows = await db.select().from(schema.files).where(eq(schema.files.id, fileId)).limit(1);
  const file = rows[0];
  // 404 (not 403) on cross-tenant access to avoid leaking existence.
  if (!file || !ownsTrainerScope(user, file.trainerId)) {
    throw new Response("not found", { status: 404 });
  }

  const storage = getStorage();
  const totalBytes = await storage.size(file.storagePath);
  if (totalBytes == null) {
    throw new Response("file gone", { status: 410 });
  }

  const range = parseRange(args.request.headers.get("range"), totalBytes);
  const readResult = await storage.read(
    file.storagePath,
    range ? { start: range.start, end: range.end } : undefined,
  );

  const headers = new Headers({
    "Content-Type": file.mimeType,
    "Content-Length": String(readResult.bytes),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });
  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalBytes}`);
  }

  const webStream = Readable.toWeb(readResult.stream) as unknown as ReadableStream<Uint8Array>;
  return new Response(webStream, {
    status: range ? 206 : 200,
    headers,
  });
}
