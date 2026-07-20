import { describe, expect, it } from "vitest";
import type { AuthUser } from "./auth";
import { canReadCatalogRow, canWriteBrandCatalogRow, ownsBrandScope } from "./authz";

const trainer = {
  id: "tr1",
  role: "trainer",
  trainerId: null,
  organizationId: "org1",
  regionId: "r1",
  email: "a@a",
  displayName: "A",
} as AuthUser;

describe("canReadCatalogRow", () => {
  it("trener czyta markowy wiersz swojej organizacji", () => {
    expect(canReadCatalogRow(trainer, { trainerId: null, organizationId: "org1" })).toBe(true);
  });
  it("trener nie czyta markowego wiersza innej organizacji", () => {
    expect(canReadCatalogRow(trainer, { trainerId: null, organizationId: "orgX" })).toBe(false);
  });
  it("markowy wiersz bez org → false", () => {
    expect(canReadCatalogRow(trainer, { trainerId: null, organizationId: null })).toBe(false);
  });
  it("własny wiersz trenera nadal czytelny", () => {
    expect(canReadCatalogRow(trainer, { trainerId: "tr1", organizationId: null })).toBe(true);
  });
  it("wiersz innego trenera niewidoczny", () => {
    expect(canReadCatalogRow(trainer, { trainerId: "tr2", organizationId: null })).toBe(false);
  });
});

function user(p: Partial<AuthUser>): AuthUser {
  return {
    id: "u1",
    email: "e@e.pl",
    displayName: "U",
    role: "trainer",
    trainerId: null,
    organizationId: null,
    regionId: null,
    ...p,
  };
}

describe("ownsBrandScope", () => {
  it("true dla brand_admin z pasującą organizacją", () => {
    expect(ownsBrandScope(user({ role: "brand_admin", organizationId: "org1" }), "org1")).toBe(
      true,
    );
  });
  it("false dla brand_admin z inną organizacją", () => {
    expect(ownsBrandScope(user({ role: "brand_admin", organizationId: "org1" }), "org2")).toBe(
      false,
    );
  });
  it("false dla brand_admin bez organizacji", () => {
    expect(ownsBrandScope(user({ role: "brand_admin", organizationId: null }), "org1")).toBe(false);
  });
  it("false dla trenera nawet z tą organizacją", () => {
    expect(ownsBrandScope(user({ role: "trainer", organizationId: "org1" }), "org1")).toBe(false);
  });
  it("false dla podopiecznego nawet z tą organizacją", () => {
    expect(ownsBrandScope(user({ role: "trainee", organizationId: "org1" }), "org1")).toBe(false);
  });
});

describe("canWriteBrandCatalogRow", () => {
  it("true gdy brand_admin pisze markowy wiersz swojej org", () => {
    expect(
      canWriteBrandCatalogRow(user({ role: "brand_admin", organizationId: "org1" }), {
        trainerId: null,
        organizationId: "org1",
      }),
    ).toBe(true);
  });
  it("false gdy wiersz markowy innej org", () => {
    expect(
      canWriteBrandCatalogRow(user({ role: "brand_admin", organizationId: "org1" }), {
        trainerId: null,
        organizationId: "org2",
      }),
    ).toBe(false);
  });
  it("false gdy wiersz trenerski", () => {
    expect(
      canWriteBrandCatalogRow(user({ role: "brand_admin", organizationId: "org1" }), {
        trainerId: "t1",
        organizationId: null,
      }),
    ).toBe(false);
  });
  it("false gdy nie-prezes", () => {
    expect(
      canWriteBrandCatalogRow(user({ role: "trainer", organizationId: "org1" }), {
        trainerId: null,
        organizationId: "org1",
      }),
    ).toBe(false);
  });
  it("false gdy wiersz ma obu właścicieli (defensywnie, choć CHECK w DB tego broni)", () => {
    expect(
      canWriteBrandCatalogRow(user({ role: "brand_admin", organizationId: "org1" }), {
        trainerId: "t1",
        organizationId: "org1",
      }),
    ).toBe(false);
  });
});
