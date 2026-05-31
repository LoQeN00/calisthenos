import { describe, expect, it } from "vitest";
import { ConsultationFormSchema } from "~/lib/consultation-types";

const base = {
  heldOn: "2026-05-20",
  title: "Konsultacja majowa",
  summary: "Ogólnie dobrze.",
  items: [{ body: "Łokcie przy podciąganiu", status: "open" as const }],
};

describe("ConsultationFormSchema", () => {
  it("akceptuje poprawny wpis bez okresu", () => {
    const r = ConsultationFormSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("akceptuje poprawny okres od<=do", () => {
    const r = ConsultationFormSchema.safeParse({
      ...base,
      periodFrom: "2026-05-01",
      periodTo: "2026-05-20",
    });
    expect(r.success).toBe(true);
  });

  it("odrzuca pusty tytuł", () => {
    const r = ConsultationFormSchema.safeParse({ ...base, title: "   " });
    expect(r.success).toBe(false);
  });

  it("odrzuca okres z tylko jednym końcem", () => {
    const r = ConsultationFormSchema.safeParse({ ...base, periodFrom: "2026-05-01" });
    expect(r.success).toBe(false);
  });

  it("odrzuca okres z tylko końcem (periodTo bez periodFrom)", () => {
    const r = ConsultationFormSchema.safeParse({ ...base, periodTo: "2026-05-20" });
    expect(r.success).toBe(false);
  });

  it("odrzuca niepoprawny format heldOn", () => {
    const r = ConsultationFormSchema.safeParse({ ...base, heldOn: "20-05-2026" });
    expect(r.success).toBe(false);
  });

  it("odrzuca okres od>do", () => {
    const r = ConsultationFormSchema.safeParse({
      ...base,
      periodFrom: "2026-05-21",
      periodTo: "2026-05-20",
    });
    expect(r.success).toBe(false);
  });

  it("odrzuca punkt z pustą treścią", () => {
    const r = ConsultationFormSchema.safeParse({
      ...base,
      items: [{ body: "  ", status: "open" }],
    });
    expect(r.success).toBe(false);
  });

  it("domyślny status punktu to open, domyślne summary to pusty string", () => {
    const r = ConsultationFormSchema.parse({
      heldOn: "2026-05-20",
      title: "X",
      items: [{ body: "punkt" }],
    });
    expect(r.summary).toBe("");
    expect(r.items[0]!.status).toBe("open");
  });
});
