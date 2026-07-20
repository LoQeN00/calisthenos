import { describe, expect, it } from "vitest";
import { defaultPathForRole } from "./roles";

describe("defaultPathForRole", () => {
  it("trener → /trener", () => {
    expect(defaultPathForRole("trainer")).toBe("/trener");
  });
  it("podopieczny → /podopieczny", () => {
    expect(defaultPathForRole("trainee")).toBe("/podopieczny");
  });
  it("brand_admin → /marka", () => {
    expect(defaultPathForRole("brand_admin")).toBe("/marka");
  });
});
