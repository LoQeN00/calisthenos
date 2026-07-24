import { describe, expect, it } from "vitest";
import { findUnusableVideoIds } from "./workouts";

/**
 * Po rozdzieleniu uploadu od zapisu sesji `videoFileId` przychodzi OD KLIENTA, a nie
 * z `uploadFile` w tym samym żądaniu. Ta funkcja jest czystą częścią decyzji „które
 * z podanych identyfikatorów wolno podpiąć" — zapytanie do bazy zwraca zbiór id
 * spełniających warunki (rodzaj, tenant, właściciel, brak wcześniejszego podpięcia),
 * a tutaj rozstrzygamy resztę.
 */
describe("findUnusableVideoIds", () => {
  it("przepuszcza komplet, gdy każde żądane id wróciło z bazy", () => {
    expect(findUnusableVideoIds(["a", "b"], [{ id: "a" }, { id: "b" }])).toEqual([]);
  });

  it("zgłasza id, którego baza nie zwróciła (cudze, złego rodzaju albo już sprzątnięte)", () => {
    expect(findUnusableVideoIds(["a", "b"], [{ id: "a" }])).toEqual(["b"]);
  });

  it("zgłasza duplikat, mimo że baza zwróciła to id jako poprawne", () => {
    // Jeden upload podpięty do dwóch serii: zapytanie zwróci go RAZ i wyglądałby na OK,
    // a powstałyby dwa wiersze wskazujące ten sam plik.
    expect(findUnusableVideoIds(["a", "a"], [{ id: "a" }])).toEqual(["a"]);
  });

  it("przy duplikacie zgłasza tylko powtórzenia, nie pierwsze wystąpienie", () => {
    expect(findUnusableVideoIds(["a", "b", "a", "a"], [{ id: "a" }, { id: "b" }])).toEqual([
      "a",
      "a",
    ]);
  });

  it("pusta lista żądań jest poprawna", () => {
    expect(findUnusableVideoIds([], [])).toEqual([]);
  });

  it("nadmiarowe wiersze z bazy niczego nie psują", () => {
    expect(findUnusableVideoIds(["a"], [{ id: "a" }, { id: "z" }])).toEqual([]);
  });
});
