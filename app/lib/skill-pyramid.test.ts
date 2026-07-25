import { describe, expect, it } from "vitest";
import {
  DEFAULT_METRICS,
  VIEW_W,
  buildPyramid,
  layoutPyramid,
  type PyramidMetrics,
  type PyramidNodeInput,
} from "./skill-pyramid";
import type { Edge } from "./skill-tree-math";

const M: PyramidMetrics = {
  rowH: 100,
  bandHeaderH: 20,
  bandGap: 10,
  insetStep: 60,
  maxInsetFrac: 0.28,
};

function n(id: string, tier: PyramidNodeInput["tier"], name = id): PyramidNodeInput {
  return { id, name, tier };
}

describe("buildPyramid — pasy", () => {
  it("węzeł bez krawędzi trafia do pasa swojego tieru, podrząd 0", () => {
    const bands = buildPyramid([n("a", "advanced")], []);
    expect(bands).toHaveLength(1);
    expect(bands[0]!.tier).toBe("advanced");
    expect(bands[0]!.rows).toEqual([["a"]]);
  });

  it("pomija puste pasy i zwraca je rosnąco od basic", () => {
    const bands = buildPyramid([n("x", "expert"), n("y", "basic")], []);
    expect(bands.map((b) => b.tier)).toEqual(["basic", "expert"]);
  });

  it("każdy niepusty tier dostaje własny pas", () => {
    const bands = buildPyramid(
      [n("a", "basic"), n("b", "intermediate"), n("c", "advanced"), n("d", "expert")],
      [],
    );
    expect(bands.map((b) => b.tier)).toEqual(["basic", "intermediate", "advanced", "expert"]);
  });
});

describe("buildPyramid — podrzędy", () => {
  it("krawędź wewnątrz pasa tworzy podrząd (prereq niżej)", () => {
    const nodes = [n("dip", "intermediate", "Dip"), n("pull", "intermediate", "Pull-up")];
    const edges: Edge[] = [{ from: "dip", requires: "pull" }];
    const bands = buildPyramid(nodes, edges);
    expect(bands[0]!.rows).toEqual([["pull"], ["dip"]]);
  });

  it("łańcuch trzech w jednym pasie daje trzy podrzędy", () => {
    const nodes = [n("c", "basic"), n("b", "basic"), n("a", "basic")];
    const edges: Edge[] = [
      { from: "b", requires: "a" },
      { from: "c", requires: "b" },
    ];
    const bands = buildPyramid(nodes, edges);
    expect(bands[0]!.rows).toEqual([["a"], ["b"], ["c"]]);
  });

  it("krawędź międzypasowa NIE tworzy podrzędu", () => {
    const nodes = [n("front", "advanced"), n("pull", "basic")];
    const edges: Edge[] = [{ from: "front", requires: "pull" }];
    const bands = buildPyramid(nodes, edges);
    expect(bands.find((b) => b.tier === "basic")!.rows).toEqual([["pull"]]);
    expect(bands.find((b) => b.tier === "advanced")!.rows).toEqual([["front"]]);
  });

  it("krawędź odwrócona (prereq z wyższego tieru) nie wybucha i nie tworzy podrzędu", () => {
    const nodes = [n("push", "basic"), n("planche", "expert")];
    const edges: Edge[] = [{ from: "push", requires: "planche" }];
    const bands = buildPyramid(nodes, edges);
    expect(bands.find((b) => b.tier === "basic")!.rows).toEqual([["push"]]);
    expect(bands.find((b) => b.tier === "expert")!.rows).toEqual([["planche"]]);
  });

  it("węzeł z dwoma prerekami w pasie bierze max głębokości", () => {
    const nodes = [n("a", "basic"), n("b", "basic"), n("d", "basic")];
    const edges: Edge[] = [
      { from: "b", requires: "a" },
      { from: "d", requires: "a" },
      { from: "d", requires: "b" },
    ];
    const bands = buildPyramid(nodes, edges);
    expect(bands[0]!.rows[2]).toEqual(["d"]);
  });

  it("cykl wewnątrz pasa nie zapętla i nie zostawia pustego podrzędu", () => {
    const nodes = [n("a", "basic"), n("b", "basic")];
    const edges: Edge[] = [
      { from: "a", requires: "b" },
      { from: "b", requires: "a" },
    ];
    const bands = buildPyramid(nodes, edges);
    expect(bands[0]!.rows.flat().sort()).toEqual(["a", "b"]);
    expect(bands[0]!.rows.every((r) => r.length > 0)).toBe(true);
  });

  it("krawędź do węzła spoza wejścia jest ignorowana", () => {
    const bands = buildPyramid([n("a", "basic")], [{ from: "a", requires: "nieistnieje" }]);
    expect(bands[0]!.rows).toEqual([["a"]]);
  });
});

describe("buildPyramid — kolejność", () => {
  it("sortuje rząd po nazwie z locale pl", () => {
    const nodes = [
      n("1", "basic", "Łokieć"),
      n("2", "basic", "Antagonista"),
      n("3", "basic", "Zwis"),
    ];
    expect(buildPyramid(nodes, [])[0]!.rows[0]).toEqual(["2", "1", "3"]);
  });

  it("jest deterministyczny — permutacja wejścia daje ten sam wynik", () => {
    const a = n("a", "basic", "Alfa");
    const b = n("b", "basic", "Beta");
    expect(buildPyramid([a, b], [])).toEqual(buildPyramid([b, a], []));
  });
});

describe("layoutPyramid — wymiary", () => {
  it("pusta piramida ma zerową wysokość", () => {
    const l = layoutPyramid([], M);
    expect(l.totalH).toBe(0);
    expect(l.centers.size).toBe(0);
  });

  it("totalH = suma (nagłówek + rzędy) wszystkich pasów + odstępy między nimi", () => {
    const bands = buildPyramid([n("a", "basic"), n("b", "expert")], []);
    const l = layoutPyramid(bands, M);
    // dwa pasy po (20 + 1*100) + jeden odstęp 10
    expect(l.totalH).toBe(20 + 100 + 10 + 20 + 100);
  });

  it("pasy nie nachodzą na siebie i idą od góry w dół", () => {
    const bands = buildPyramid([n("a", "basic"), n("b", "intermediate"), n("c", "expert")], []);
    const l = layoutPyramid(bands, M);
    for (let i = 1; i < l.bands.length; i++) {
      expect(l.bands[i]!.y).toBeGreaterThanOrEqual(l.bands[i - 1]!.y + l.bands[i - 1]!.h);
    }
  });

  it("pasy zwracane są od najwyższego tieru (góra planszy) do najniższego", () => {
    const bands = buildPyramid([n("a", "basic"), n("b", "expert")], []);
    const l = layoutPyramid(bands, M);
    expect(l.bands.map((b) => b.tier)).toEqual(["expert", "basic"]);
  });

  it("płaska piramida: boardCols równa się liczbie węzłów w rzędzie", () => {
    // Jeden pas → zerowe zawężenie → plansza dokładnie tak szeroka jak rząd.
    const bands = buildPyramid([n("a", "basic"), n("b", "basic"), n("c", "basic")], []);
    expect(layoutPyramid(bands, M).boardCols).toBeCloseTo(3, 6);
  });

  it("boardCols nigdy nie jest mniejsze niż najszerszy rząd", () => {
    const bands = buildPyramid(
      [n("a", "basic"), n("b", "basic"), n("c", "basic"), n("d", "expert")],
      [],
    );
    expect(layoutPyramid(bands, M).boardCols).toBeGreaterThanOrEqual(3);
  });
});

describe("layoutPyramid — zawężenie (sylwetka piramidy)", () => {
  it("wyższy pas jest węższy, gdy pasy mają tyle samo węzłów", () => {
    const bands = buildPyramid([n("a", "basic"), n("b", "intermediate")], []);
    const l = layoutPyramid(bands, M);
    const top = l.bands.find((b) => b.tier === "intermediate")!;
    const bottom = l.bands.find((b) => b.tier === "basic")!;
    expect(top.x1 - top.x0).toBeLessThan(bottom.x1 - bottom.x0);
  });

  it("najniższy pas zajmuje pełną szerokość", () => {
    const bands = buildPyramid([n("a", "basic")], []);
    const l = layoutPyramid(bands, M);
    expect(l.bands[0]!.x0).toBe(0);
    expect(l.bands[0]!.x1).toBe(VIEW_W);
  });

  it("zatłoczony górny pas poszerza planszę zamiast ściskać karty", () => {
    // Dół: 1 węzeł. Góra: 4 węzły w zawężonym pasie. Zawężenie ZOSTAJE
    // (sylwetka piramidy jest nienaruszalna), a koszt bierze na siebie
    // szerokość planszy — karta nigdy nie chudnie.
    const bands = buildPyramid(
      [n("d", "basic"), n("a", "expert"), n("b", "expert"), n("c", "expert")],
      [],
    );
    const l = layoutPyramid(bands, M);
    const top = l.bands.find((b) => b.tier === "expert")!;
    expect(top.x1 - top.x0).toBeLessThan(VIEW_W); // zawężenie nie zniknęło
    expect(l.boardCols).toBeGreaterThan(3); // plansza szersza niż 3 karty
  });

  it("zawężenie nie przekracza twardego limitu maxInsetFrac", () => {
    // Duży insetStep przy czterech pasach zwęziłby szczyt do paska —
    // limit musi to zatrzymać.
    const wide: PyramidMetrics = { ...M, insetStep: 400 };
    const bands = buildPyramid(
      [n("a", "basic"), n("b", "intermediate"), n("c", "advanced"), n("d", "expert")],
      [],
    );
    const top = layoutPyramid(bands, wide).bands.find((b) => b.tier === "expert")!;
    // 1000 - 2*280 = 440. Literał celowo, nie wzór — inaczej test powiela
    // implementację i nie złapie błędu współczynnika.
    expect(top.x1 - top.x0).toBeCloseTo(440, 6);
  });

  it("pas nigdy nie ma ujemnej ani zerowej szerokości", () => {
    const bands = buildPyramid(
      [n("a", "basic"), n("b", "intermediate"), n("c", "advanced"), n("d", "expert")],
      [],
    );
    for (const b of layoutPyramid(bands, M).bands) {
      expect(b.x1).toBeGreaterThan(b.x0);
    }
  });

  it("pusty środkowy tier nie tworzy dziury w zawężeniu", () => {
    // basic + expert, bez intermediate/advanced → expert jest DRUGIM renderowanym
    // pasem, więc dostaje jedno insetStep, a nie trzy.
    const bands = buildPyramid([n("a", "basic"), n("b", "expert")], []);
    const top = layoutPyramid(bands, M).bands.find((b) => b.tier === "expert")!;
    expect(top.x0).toBeCloseTo(M.insetStep, 6);
  });
});

describe("layoutPyramid — środki węzłów", () => {
  it("każdy węzeł dostaje środek", () => {
    const nodes = [n("a", "basic"), n("b", "intermediate"), n("c", "expert")];
    const l = layoutPyramid(buildPyramid(nodes, []), M);
    for (const node of nodes) expect(l.centers.get(node.id)).toBeDefined();
  });

  it("pojedynczy węzeł w rzędzie siedzi w środku swojego pasa", () => {
    const l = layoutPyramid(buildPyramid([n("a", "basic")], []), M);
    expect(l.centers.get("a")!.x).toBe(VIEW_W / 2);
  });

  it("węzły w rzędzie mają rosnące x i są symetryczne względem środka pasa", () => {
    const l = layoutPyramid(buildPyramid([n("a", "basic", "A"), n("b", "basic", "B")], []), M);
    const xa = l.centers.get("a")!.x;
    const xb = l.centers.get("b")!.x;
    expect(xa).toBeLessThan(xb);
    expect(xa + xb).toBeCloseTo(VIEW_W, 6);
  });

  it("podrząd 0 leży NIŻEJ (większe y) niż podrząd 1 w tym samym pasie", () => {
    const nodes = [n("dip", "basic", "Dip"), n("pull", "basic", "Pull-up")];
    const edges: Edge[] = [{ from: "dip", requires: "pull" }];
    const l = layoutPyramid(buildPyramid(nodes, edges), M);
    expect(l.centers.get("pull")!.y).toBeGreaterThan(l.centers.get("dip")!.y);
  });

  it("węzeł z wyższego tieru leży wyżej (mniejsze y) niż z niższego", () => {
    const l = layoutPyramid(buildPyramid([n("a", "basic"), n("z", "expert")], []), M);
    expect(l.centers.get("z")!.y).toBeLessThan(l.centers.get("a")!.y);
  });

  it("wszystkie środki mieszczą się w planszy", () => {
    const nodes = [n("a", "basic"), n("b", "intermediate"), n("c", "expert")];
    const l = layoutPyramid(buildPyramid(nodes, []), M);
    for (const c of l.centers.values()) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(VIEW_W);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(l.totalH);
    }
  });
});

describe("DEFAULT_METRICS", () => {
  it("ma dodatnie wymiary", () => {
    expect(DEFAULT_METRICS.rowH).toBeGreaterThan(0);
    expect(DEFAULT_METRICS.bandHeaderH).toBeGreaterThan(0);
    expect(DEFAULT_METRICS.insetStep).toBeGreaterThan(0);
  });
  it("maxInsetFrac trzyma pas z dala od zera szerokości", () => {
    // Przy 0.5 pas zwinąłby się do linii; poniżej 0.5 zawsze coś zostaje.
    expect(DEFAULT_METRICS.maxInsetFrac).toBeGreaterThan(0);
    expect(DEFAULT_METRICS.maxInsetFrac).toBeLessThan(0.5);
  });
});
