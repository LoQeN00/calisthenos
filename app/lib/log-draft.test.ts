import { describe, expect, it } from "vitest";
import { type SetDraft, draftHasContent, parseDraft, serializeDraft } from "./log-draft";

const emptySet: SetDraft = { reps: "", difficulty: "", skipped: false, videoFileId: null };

const empty2x2: SetDraft[][] = [
  [{ ...emptySet }, { ...emptySet }],
  [{ ...emptySet }, { ...emptySet }],
];

describe("szkic v3 — identyfikator nagrania", () => {
  it("przechowuje videoFileId przez serializację (nagranie przeżywa ubicie karty)", () => {
    // Przed rozdzieleniem uploadu szkic mógł nieść tylko tekst — plik trzeba było
    // wybierać od nowa. Teraz `fileId` jest zwykłym stringiem, więc przeżywa.
    const sets: SetDraft[][] = [
      [{ reps: "8", difficulty: "7", skipped: false, videoFileId: "f-1" }],
    ];
    const parsed = parseDraft(serializeDraft(["ex-1"], sets), {
      exerciseIds: ["ex-1"],
      setCounts: [1],
    });
    expect(parsed?.[0]?.[0]?.videoFileId).toBe("f-1");
  });

  it("dopuszcza null jako brak nagrania", () => {
    const sets: SetDraft[][] = [
      [{ reps: "8", difficulty: "7", skipped: false, videoFileId: null }],
    ];
    const parsed = parseDraft(serializeDraft(["ex-1"], sets), {
      exerciseIds: ["ex-1"],
      setCounts: [1],
    });
    expect(parsed?.[0]?.[0]?.videoFileId).toBeNull();
  });

  it("odrzuca szkic w starej wersji v2", () => {
    // Szkice są krótkotrwałe (per sesja przeglądarki), więc migracja v2→v3 nie jest
    // warta kodu — bezpieczniej odrzucić niż wstawić dane o niepełnym kształcie.
    const rawV2 = JSON.stringify({
      v: 2,
      exerciseIds: ["ex-1"],
      sets: [[{ reps: "8", difficulty: "7", skipped: false }]],
    });
    expect(parseDraft(rawV2, { exerciseIds: ["ex-1"], setCounts: [1] })).toBeNull();
  });

  it("odrzuca szkic v3 z videoFileId złego typu", () => {
    const raw = JSON.stringify({
      v: 3,
      exerciseIds: ["ex-1"],
      sets: [[{ reps: "8", difficulty: "7", skipped: false, videoFileId: 42 }]],
    });
    expect(parseDraft(raw, { exerciseIds: ["ex-1"], setCounts: [1] })).toBeNull();
  });
});

describe("serializeDraft / parseDraft", () => {
  it("robi round-trip, gdy ćwiczenia i liczby serii pasują", () => {
    const sets: SetDraft[][] = [
      [
        { reps: "10", difficulty: "7", skipped: false, videoFileId: "f-a" },
        { reps: "", difficulty: "", skipped: true, videoFileId: null },
      ],
      [{ reps: "30", difficulty: "", skipped: false, videoFileId: null }],
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
    // `v: 3`, żeby test faktycznie docierał do walidacji TYPÓW — przy `v: 2` odpadałby
    // już na sprawdzeniu wersji i nie badał tego, co obiecuje nazwa.
    const bad = JSON.stringify({
      v: 3,
      exerciseIds: ["ex-a"],
      sets: [[{ reps: 10, difficulty: "7", skipped: false, videoFileId: null }]],
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
    expect(draftHasContent([[{ ...emptySet, reps: "8" }]])).toBe(true);
    expect(draftHasContent([[{ ...emptySet, difficulty: "5" }]])).toBe(true);
    expect(draftHasContent([[{ ...emptySet, skipped: true }]])).toBe(true);
  });

  it("true, gdy seria ma SAMO wgrane nagranie", () => {
    // Podopieczny nagrał serię, ale nie zdążył wpisać powtórzeń. Bez tego warunku
    // nie zaproponowalibyśmy przywrócenia szkicu i odniesienie do wgranego pliku
    // by przepadło — a plik i tak już leży na serwerze.
    expect(draftHasContent([[{ ...emptySet, videoFileId: "f-1" }]])).toBe(true);
  });
});
