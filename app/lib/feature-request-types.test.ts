import type { FeatureRequestView } from "@kalisthenos/api-client";
import { describe, expect, it } from "vitest";
import {
  FEATURE_REQUEST_KINDS,
  FEATURE_REQUEST_STATUSES,
  FeatureRequestFormSchema,
  FeatureRequestResponseSchema,
  KIND_LABEL,
  STATUS_LABEL,
  canTraineeDelete,
  statusPresentation,
} from "~/lib/feature-request-types";

const validForm = {
  kind: "idea",
  title: "Ciemny motyw",
  body: "Przydałby się ciemny motyw w aplikacji.",
};

/**
 * Równość dwóch unii, sprawdzana przez `tsc`, nie w runtime: `true` przestaje
 * być przypisywalne, gdy któraś strona urośnie albo schudnie.
 *
 * Do S6 parzystość badały tu asercje `toEqual` przeciw `pgEnum` ze schematu
 * Drizzle. Schemat zniknął razem z bazą, a jego rolę źródła prawdy przejął
 * kontrakt BE — ten jednak niesie wartości WYŁĄCZNIE w typach (`types.gen.d.ts`),
 * bo generator nie robi z nich stałych. Runtime nie ma więc czego porównać,
 * i dlatego bramką jest `npm run typecheck`, nie ten przebieg.
 */
type Rowne<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

describe("parzystość z kontraktem BE", () => {
  it("typy zgłoszeń pokrywają się z unią kontraktu (pilnuje tsc)", () => {
    const zgodne: Rowne<(typeof FEATURE_REQUEST_KINDS)[number], FeatureRequestView["kind"]> = true;
    expect(zgodne).toBe(true);
  });

  it("statusy pokrywają się z unią kontraktu (pilnuje tsc)", () => {
    const zgodne: Rowne<(typeof FEATURE_REQUEST_STATUSES)[number], FeatureRequestView["status"]> =
      true;
    expect(zgodne).toBe(true);
  });

  it("każdy typ i status ma polską etykietę", () => {
    for (const k of FEATURE_REQUEST_KINDS) expect(KIND_LABEL[k].length).toBeGreaterThan(0);
    for (const s of FEATURE_REQUEST_STATUSES) expect(STATUS_LABEL[s].length).toBeGreaterThan(0);
  });
});

describe("FeatureRequestFormSchema", () => {
  it("przyjmuje poprawne zgłoszenie", () => {
    const parsed = FeatureRequestFormSchema.safeParse(validForm);
    expect(parsed.success).toBe(true);
  });

  it("domyślnym typem jest pomysł", () => {
    const parsed = FeatureRequestFormSchema.safeParse({
      title: validForm.title,
      body: validForm.body,
    });
    expect(parsed.success && parsed.data.kind).toBe("idea");
  });

  it("odrzuca nieznany typ", () => {
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, kind: "spam" }).success).toBe(false);
  });

  it("odrzuca tytuł krótszy niż 3 znaki, przyjmuje 3", () => {
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, title: "ab" }).success).toBe(false);
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, title: "abc" }).success).toBe(true);
  });

  it("odrzuca tytuł dłuższy niż 120 znaków, przyjmuje 120", () => {
    expect(
      FeatureRequestFormSchema.safeParse({ ...validForm, title: "a".repeat(120) }).success,
    ).toBe(true);
    expect(
      FeatureRequestFormSchema.safeParse({ ...validForm, title: "a".repeat(121) }).success,
    ).toBe(false);
  });

  it("przycina białe znaki i liczy długość PO przycięciu", () => {
    const parsed = FeatureRequestFormSchema.safeParse({ ...validForm, title: "  Ciemny motyw  " });
    expect(parsed.success && parsed.data.title).toBe("Ciemny motyw");
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, title: "   ab   " }).success).toBe(
      false,
    );
  });

  it("odrzuca opis krótszy niż 10 znaków, przyjmuje 10", () => {
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, body: "za krotki" }).success).toBe(
      false,
    );
    expect(FeatureRequestFormSchema.safeParse({ ...validForm, body: "0123456789" }).success).toBe(
      true,
    );
  });

  it("odrzuca opis dłuższy niż 2000 znaków, przyjmuje 2000", () => {
    expect(
      FeatureRequestFormSchema.safeParse({ ...validForm, body: "a".repeat(2000) }).success,
    ).toBe(true);
    expect(
      FeatureRequestFormSchema.safeParse({ ...validForm, body: "a".repeat(2001) }).success,
    ).toBe(false);
  });

  it("komunikaty błędów są po polsku", () => {
    const parsed = FeatureRequestFormSchema.safeParse({ ...validForm, title: "ab" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toContain("Tytuł");
  });
});

describe("FeatureRequestResponseSchema", () => {
  it("pusta odpowiedź staje się null", () => {
    const parsed = FeatureRequestResponseSchema.safeParse({ status: "done", response: "" });
    expect(parsed.success && parsed.data.response).toBeNull();
  });

  it("odpowiedź z samych spacji staje się null", () => {
    const parsed = FeatureRequestResponseSchema.safeParse({ status: "done", response: "   " });
    expect(parsed.success && parsed.data.response).toBeNull();
  });

  it("przycina odpowiedź", () => {
    const parsed = FeatureRequestResponseSchema.safeParse({
      status: "planned",
      response: "  Robimy.  ",
    });
    expect(parsed.success && parsed.data.response).toBe("Robimy.");
  });

  it("odrzuca odpowiedź dłuższą niż 2000 znaków", () => {
    expect(
      FeatureRequestResponseSchema.safeParse({ status: "done", response: "a".repeat(2001) })
        .success,
    ).toBe(false);
  });

  it("odrzuca nieznany status", () => {
    expect(
      FeatureRequestResponseSchema.safeParse({ status: "wontfix", response: "" }).success,
    ).toBe(false);
  });
});

describe("statusPresentation", () => {
  it("daje polską etykietę i ton dla każdego statusu", () => {
    expect(statusPresentation("new")).toEqual({ label: "Nowe", tone: "new" });
    expect(statusPresentation("considering")).toEqual({ label: "Rozważamy", tone: "progress" });
    expect(statusPresentation("planned")).toEqual({ label: "Zaplanowane", tone: "progress" });
    expect(statusPresentation("done")).toEqual({ label: "Zrobione", tone: "done" });
    expect(statusPresentation("rejected")).toEqual({ label: "Odrzucone", tone: "rejected" });
  });
});

describe("canTraineeDelete", () => {
  it("pozwala usunąć tylko zgłoszenie ze statusem Nowe", () => {
    expect(canTraineeDelete("new")).toBe(true);
    for (const s of FEATURE_REQUEST_STATUSES.filter((x) => x !== "new")) {
      expect(canTraineeDelete(s)).toBe(false);
    }
  });
});
