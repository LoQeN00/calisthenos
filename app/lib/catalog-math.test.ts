import { describe, expect, it } from "vitest";
import {
  exerciseAlreadyVariationInView,
  planSkillClone,
  suppressForkedOrigins,
} from "./catalog-math";

describe("suppressForkedOrigins", () => {
  it("ukrywa markowy oryginał, gdy trener ma jego fork", () => {
    const brand = [{ id: "b1" }, { id: "b2" }];
    expect(suppressForkedOrigins(brand, new Set(["b1"])).map((r) => r.id)).toEqual(["b2"]);
  });
  it("zwraca wszystkie markowe, gdy brak forków", () => {
    const brand = [{ id: "b1" }, { id: "b2" }];
    expect(suppressForkedOrigins(brand, new Set()).map((r) => r.id)).toEqual(["b1", "b2"]);
  });
});

describe("exerciseAlreadyVariationInView", () => {
  it("wykrywa zajęte ćwiczenie", () => {
    expect(exerciseAlreadyVariationInView(new Set(["e1"]), "e1")).toBe(true);
    expect(exerciseAlreadyVariationInView(new Set(["e1"]), "e2")).toBe(false);
  });
});

describe("planSkillClone", () => {
  it("zachowuje ordinale i podmienia skillId klonowanego skilla we wszystkich końcach krawędzi", () => {
    const out = planSkillClone(
      "new",
      "orig",
      [{ exerciseId: "e1", ordinal: 1 }, { exerciseId: "e2", ordinal: 2 }],
      [
        { skillId: "orig", requiresSkillId: "p1" },
        { skillId: "p1", requiresSkillId: "orig" },
        { skillId: "a", requiresSkillId: "b" },
      ],
    );
    expect(out.variations).toEqual([
      { exerciseId: "e1", ordinal: 1 },
      { exerciseId: "e2", ordinal: 2 },
    ]);
    expect(out.prereqEdges).toEqual([
      { skillId: "new", requiresSkillId: "p1" },
      { skillId: "p1", requiresSkillId: "new" },
      { skillId: "a", requiresSkillId: "b" },
    ]);
  });
});
