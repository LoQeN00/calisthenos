import { describe, expect, it } from "vitest";
import { AmbassadorInviteSchema } from "./ambassador-types";

describe("AmbassadorInviteSchema", () => {
  it("akceptuje poprawne zaproszenie", () => {
    const r = AmbassadorInviteSchema.safeParse({
      displayName: "Jan Trener",
      email: "jan@example.com",
      regionId: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(true);
  });
  it("wymaga imienia", () => {
    const r = AmbassadorInviteSchema.safeParse({
      displayName: "  ",
      email: "j@e.pl",
      regionId: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("ambasadorzy.validation.nameRequired");
  });
  it("wymaga poprawnego e-maila", () => {
    const r = AmbassadorInviteSchema.safeParse({
      displayName: "Jan",
      email: "znak",
      regionId: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("ambasadorzy.validation.emailInvalid");
  });
  it("wymaga regionu (uuid)", () => {
    const r = AmbassadorInviteSchema.safeParse({
      displayName: "Jan",
      email: "j@e.pl",
      regionId: "",
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues[0]?.message).toBe("ambasadorzy.validation.regionRequired");
  });
});
