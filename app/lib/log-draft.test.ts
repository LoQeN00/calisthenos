import { describe, expect, it } from "vitest";
import { type SetDraft, draftHasContent, parseDraft, serializeDraft } from "./log-draft";

const empty2x2: SetDraft[][] = [
  [
    { reps: "", difficulty: "", skipped: false },
    { reps: "", difficulty: "", skipped: false },
  ],
  [
    { reps: "", difficulty: "", skipped: false },
    { reps: "", difficulty: "", skipped: false },
  ],
];

describe("serializeDraft / parseDraft", () => {
  it("robi round-trip, gdy ćwiczenia i liczby serii pasują", () => {
    const sets: SetDraft[][] = [
      [
        { reps: "10", difficulty: "7", skipped: false },
        { reps: "", difficulty: "", skipped: true },
      ],
      [{ reps: "30", difficulty: "", skipped: false }],
    ];
    const parsed = parseDraft(serializeDraft(["ex-a", "ex-b"], sets), {
      exerciseIds: ["ex-a", "ex-b"],
      setCounts: [2, 1],
    });
    expect(parsed).toEqual(sets);
  });

  it("zwraca null dla braku danych", () => {
    expect(parseDraft(null, { exerciseIds: ["a", "b"], setCounts: [2, 2] })).toBeNull();
    expect(parseDraft("", { exerciseIds: ["a", "b"], setCounts: [2, 2] })).toBeNull();
  });

  it("odrzuca niepoprawny JSON", () => {
    expect(parseDraft("{nie-json", { exerciseIds: ["a", "b"], setCounts: [2, 2] })).toBeNull();
  });

  it("odrzuca szkic o innych ćwiczeniach mimo zgodnych liczb serii (zamiana kolejności)", () => {
    // Ten sam kształt [2,2], ale ćwiczenia zamienione miejscami — dane trafiłyby
    // do złego ćwiczenia, więc szkic musi zostać odrzucony.
    const raw = serializeDraft(["ex-a", "ex-b"], empty2x2);
    expect(parseDraft(raw, { exerciseIds: ["ex-b", "ex-a"], setCounts: [2, 2] })).toBeNull();
  });

  it("odrzuca szkic o innej liczbie ćwiczeń (plan zmieniony przez trenera)", () => {
    const raw = serializeDraft(["ex-a", "ex-b"], empty2x2);
    expect(parseDraft(raw, { exerciseIds: ["ex-a"], setCounts: [2] })).toBeNull();
    expect(
      parseDraft(raw, { exerciseIds: ["ex-a", "ex-b", "ex-c"], setCounts: [2, 2, 2] }),
    ).toBeNull();
  });

  it("odrzuca szkic o innej liczbie serii w ćwiczeniu", () => {
    const raw = serializeDraft(["ex-a", "ex-b"], empty2x2);
    expect(parseDraft(raw, { exerciseIds: ["ex-a", "ex-b"], setCounts: [2, 3] })).toBeNull();
  });

  it("odrzuca szkic o błędnych typach pól", () => {
    const bad = JSON.stringify({
      v: 2,
      exerciseIds: ["ex-a"],
      sets: [[{ reps: 10, difficulty: "7", skipped: false }]],
    });
    expect(parseDraft(bad, { exerciseIds: ["ex-a"], setCounts: [1] })).toBeNull();
  });

  it("odrzuca szkic o nieznanej wersji", () => {
    const bad = JSON.stringify({ v: 1, exerciseIds: ["ex-a", "ex-b"], sets: empty2x2 });
    expect(parseDraft(bad, { exerciseIds: ["ex-a", "ex-b"], setCounts: [2, 2] })).toBeNull();
  });
});

describe("draftHasContent", () => {
  it("false, gdy wszystkie serie puste i niepominięte", () => {
    expect(draftHasContent(empty2x2)).toBe(false);
  });

  it("true, gdy jakakolwiek seria ma reps, trudność lub jest pominięta", () => {
    expect(draftHasContent([[{ reps: "8", difficulty: "", skipped: false }]])).toBe(true);
    expect(draftHasContent([[{ reps: "", difficulty: "5", skipped: false }]])).toBe(true);
    expect(draftHasContent([[{ reps: "", difficulty: "", skipped: true }]])).toBe(true);
  });
});
