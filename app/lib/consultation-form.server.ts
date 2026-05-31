/**
 * Buduje surowy obiekt formularza konsultacji z FormData, gotowy do walidacji
 * przez ConsultationFormSchema. Punkty przychodzą jako równoległe pola
 * `itemBody[]` i `itemStatus[]` (ten sam ordinal = ten sam indeks).
 */
export function parseConsultationFormData(fd: FormData) {
  const bodies = fd.getAll("itemBody").map((v) => String(v));
  const statuses = fd.getAll("itemStatus").map((v) => String(v));
  const items = bodies
    .map((body, i) => ({ body, status: statuses[i] === "resolved" ? "resolved" : "open" }))
    .filter((it) => it.body.trim().length > 0);

  const periodFrom = String(fd.get("periodFrom") ?? "").trim() || null;
  const periodTo = String(fd.get("periodTo") ?? "").trim() || null;

  return {
    heldOn: String(fd.get("heldOn") ?? ""),
    periodFrom,
    periodTo,
    title: String(fd.get("title") ?? ""),
    summary: String(fd.get("summary") ?? ""),
    items,
  };
}
