import { describe, expect, it } from "vitest";
import {
  MAX_ONBOARDING_COMMENT,
  MAX_ONBOARDING_EXERCISES,
  MAX_ONBOARDING_NOTE,
  MAX_ONBOARDING_VALUE,
  OnboardingAnswersSchema,
  OnboardingTemplateSchema,
  answerLabel,
  toAnswersInput,
} from "./onboarding-form-types";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

/** N-ty poprawny, różny UUID — testy limitów muszą odbijać się od limitu, nie od formatu. */
function uuidAt(i: number): string {
  return `${String(i + 1).padStart(8, "0")}-1111-4111-8111-111111111111`;
}

describe("answerLabel", () => {
  it("odmienia powtórzenia po polsku", () => {
    expect(answerLabel("REPS", 1)).toBe("1 powtórzenie");
    expect(answerLabel("REPS", 3)).toBe("3 powtórzenia");
    expect(answerLabel("REPS", 12)).toBe("12 powtórzeń");
    expect(answerLabel("REPS", 0)).toBe("0 powtórzeń");
  });

  it("sekundy podaje skrótem", () => {
    expect(answerLabel("SEC", 35)).toBe("35 s");
  });
});

describe("OnboardingTemplateSchema", () => {
  it("przyjmuje poprawny zestaw i zwija pustą notatkę do null", () => {
    const parsed = OnboardingTemplateSchema.safeParse({
      exerciseIds: [UUID_A, UUID_B],
      note: "   ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.exerciseIds).toEqual([UUID_A, UUID_B]);
      expect(parsed.data.note).toBeNull();
    }
  });

  it("odrzuca pusty wybór", () => {
    const parsed = OnboardingTemplateSchema.safeParse({ exerciseIds: [], note: "" });
    expect(parsed.success).toBe(false);
  });

  it("odrzuca wybór ponad limit", () => {
    // Poprawne, różne UUID-y — inaczej test przechodziłby z powodu błędnego
    // formatu zamiast z powodu przekroczonego limitu.
    const ids = Array.from({ length: MAX_ONBOARDING_EXERCISES + 1 }, (_, i) => uuidAt(i));
    const parsed = OnboardingTemplateSchema.safeParse({ exerciseIds: ids, note: "" });
    expect(parsed.success).toBe(false);
  });

  it("przyjmuje wybór DOKŁADNIE na limicie", () => {
    // Granica, nie przekroczenie: bez tego przypadku błąd off-by-one w `.max()`
    // (obcięcie limitu o jeden) przeszedłby na zielono.
    const ids = Array.from({ length: MAX_ONBOARDING_EXERCISES }, (_, i) => uuidAt(i));
    const parsed = OnboardingTemplateSchema.safeParse({ exerciseIds: ids, note: "" });
    expect(parsed.success).toBe(true);
  });

  it("przyjmuje notatkę DOKŁADNIE na limicie długości", () => {
    const parsed = OnboardingTemplateSchema.safeParse({
      exerciseIds: [UUID_A],
      note: "x".repeat(MAX_ONBOARDING_NOTE),
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toHaveLength(MAX_ONBOARDING_NOTE);
  });

  it("odrzuca duplikat ćwiczenia", () => {
    const parsed = OnboardingTemplateSchema.safeParse({
      exerciseIds: [UUID_A, UUID_A],
      note: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("odrzuca notatkę dłuższą niż 1000 znaków", () => {
    const parsed = OnboardingTemplateSchema.safeParse({
      exerciseIds: [UUID_A],
      note: "x".repeat(1001),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("toAnswersInput", () => {
  it("skleja równoległe pola w listę odpowiedzi", () => {
    const input = toAnswersInput({
      itemIds: [UUID_A, UUID_B],
      values: ["12", "0"],
      comments: ["z gumą", ""],
      traineeNote: " byłem po treningu ",
    });
    expect(input).toEqual({
      answers: [
        { itemId: UUID_A, value: 12, comment: "z gumą" },
        { itemId: UUID_B, value: 0, comment: "" },
      ],
      traineeNote: " byłem po treningu ",
    });
  });

  it("zamienia puste pole wyniku na NaN, żeby Zod je odrzucił", () => {
    const input = toAnswersInput({
      itemIds: [UUID_A],
      values: ["   "],
      comments: [""],
      traineeNote: "",
    });
    expect(Number.isNaN(input.answers[0]!.value)).toBe(true);
  });
});

describe("OnboardingAnswersSchema", () => {
  const ok = {
    answers: [{ itemId: UUID_A, value: 12, comment: "" }],
    traineeNote: "",
  };

  it("przyjmuje poprawne odpowiedzi i zwija puste teksty do null", () => {
    const parsed = OnboardingAnswersSchema.safeParse(ok);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.answers[0]!.comment).toBeNull();
      expect(parsed.data.traineeNote).toBeNull();
    }
  });

  it("przyjmuje zero jako prawidłowy wynik", () => {
    const parsed = OnboardingAnswersSchema.safeParse({
      ...ok,
      answers: [{ itemId: UUID_A, value: 0, comment: "" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("odrzuca wynik ujemny, ułamkowy, za duży i nie-liczbę", () => {
    for (const value of [-1, 12.5, 10001, Number.NaN]) {
      const parsed = OnboardingAnswersSchema.safeParse({
        ...ok,
        answers: [{ itemId: UUID_A, value, comment: "" }],
      });
      expect(parsed.success, `value=${value}`).toBe(false);
    }
  });

  it("odrzuca komentarz dłuższy niż 200 znaków", () => {
    const parsed = OnboardingAnswersSchema.safeParse({
      ...ok,
      answers: [{ itemId: UUID_A, value: 1, comment: "x".repeat(201) }],
    });
    expect(parsed.success).toBe(false);
  });

  it("przyjmuje wynik DOKŁADNIE na limicie", () => {
    const parsed = OnboardingAnswersSchema.safeParse({
      ...ok,
      answers: [{ itemId: UUID_A, value: MAX_ONBOARDING_VALUE, comment: "" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("przyjmuje komentarz DOKŁADNIE na limicie długości", () => {
    const comment = "x".repeat(MAX_ONBOARDING_COMMENT);
    const parsed = OnboardingAnswersSchema.safeParse({
      ...ok,
      answers: [{ itemId: UUID_A, value: 1, comment }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.answers[0]!.comment).toBe(comment);
  });

  it("przyjmuje notatkę DOKŁADNIE na limicie długości", () => {
    const parsed = OnboardingAnswersSchema.safeParse({
      ...ok,
      traineeNote: "x".repeat(MAX_ONBOARDING_NOTE),
    });
    expect(parsed.success).toBe(true);
  });

  it("odrzuca pustą listę odpowiedzi", () => {
    const parsed = OnboardingAnswersSchema.safeParse({ answers: [], traineeNote: "" });
    expect(parsed.success).toBe(false);
  });

  it("przyjmuje komplet odpowiedzi DOKŁADNIE na limicie pozycji", () => {
    const answers = Array.from({ length: MAX_ONBOARDING_EXERCISES }, (_, i) => ({
      itemId: uuidAt(i),
      value: 1,
      comment: "",
    }));
    const parsed = OnboardingAnswersSchema.safeParse({ answers, traineeNote: "" });
    expect(parsed.success).toBe(true);
  });

  it("odrzuca listę odpowiedzi dłuższą niż limit pozycji", () => {
    const answers = Array.from({ length: MAX_ONBOARDING_EXERCISES + 1 }, (_, i) => ({
      itemId: uuidAt(i),
      value: 1,
      comment: "",
    }));
    const parsed = OnboardingAnswersSchema.safeParse({ answers, traineeNote: "" });
    expect(parsed.success).toBe(false);
  });

  it("odrzuca listę odpowiedzi rozdmuchaną duplikatami", () => {
    // Realny kształt ataku: jeden `itemId` powtórzony tysiące razy. Zbiór by go
    // zwinął, więc limit MUSI patrzeć na długość tablicy.
    const answers = Array.from({ length: 5000 }, () => ({
      itemId: UUID_A,
      value: 1,
      comment: "",
    }));
    const parsed = OnboardingAnswersSchema.safeParse({ answers, traineeNote: "" });
    expect(parsed.success).toBe(false);
  });
});
