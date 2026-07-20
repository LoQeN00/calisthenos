import { describe, expect, it } from "vitest";
import { pickLang } from "./pick-lang";

describe("pickLang", () => {
  it("priorytet 1: region zalogowanego usera", () => {
    expect(pickLang({ regionLocale: "fr-FR", acceptLanguage: "pl,en" })).toBe("fr");
  });
  it("priorytet 2: region zapraszającego trenera (strona zaproszenia)", () => {
    expect(pickLang({ inviteTrainerRegionLocale: "fr-FR", acceptLanguage: "pl" })).toBe("fr");
  });
  it("priorytet 3: Accept-Language dopasowany do wspieranych", () => {
    expect(pickLang({ acceptLanguage: "fr-CH,fr;q=0.9,en;q=0.8" })).toBe("fr");
  });
  it("fallback pl gdy nic nie pasuje", () => {
    expect(pickLang({ acceptLanguage: "en-US,de" })).toBe("pl");
    expect(pickLang({})).toBe("pl");
  });
  it("region ma pierwszeństwo nad Accept-Language", () => {
    expect(pickLang({ regionLocale: "pl-PL", acceptLanguage: "fr" })).toBe("pl");
  });
});
