import { describe, expect, it } from "vitest";
import { resources } from "~/i18n/resources";
import { NAMESPACES, SUPPORTED_LANGS } from "~/i18n/config";

function keysDeep(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keysDeep(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("parzystość kluczy locale", () => {
  for (const ns of NAMESPACES) {
    it(`ns "${ns}": fr ma dokładnie te same klucze co pl`, () => {
      const plKeys = keysDeep(resources.pl[ns]).sort();
      const frKeys = keysDeep(resources.fr[ns]).sort();
      expect(frKeys).toEqual(plKeys);
    });
  }
  it("każdy wspierany język ma każdy namespace", () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const ns of NAMESPACES) {
        expect(resources[lang][ns]).toBeDefined();
      }
    }
  });
});
