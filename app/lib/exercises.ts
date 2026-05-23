/** Normalize a raw comma-separated tag string into a deduplicated, length-capped array. */
export function normalizeTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase();
    if (tag.length === 0 || tag.length > 32) continue;
    seen.add(tag);
    if (seen.size >= 20) break;
  }
  return Array.from(seen);
}
