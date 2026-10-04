import { describe, expect, it } from "vitest";
import { claimAmount, nightsBetween, readClaimRates, type ClaimRates } from "./claim-rules";

const rates: ClaimRates = {
  base: "Klang Valley",
  perSpot: 50,
  perPaxNight: 65,
  regions: [{ id: "kl", name: "KL", spots: 0 }, { id: "pg", name: "Penang", spots: 4 }, { id: "sb", name: "Sabah", spots: 6 }],
};

describe("claimAmount — the rate HR set, never a typed figure (2026-10-05)", () => {
  it("prices an outstation claim by the route's spots", () => {
    expect(claimAmount(rates, { type: "outstation", regionId: "pg" })).toBe(200);
    expect(claimAmount(rates, { type: "outstation", regionId: "sb" })).toBe(300);
  });

  it("pays nothing for a local fair or an unknown region", () => {
    expect(claimAmount(rates, { type: "outstation", regionId: "kl" })).toBe(0);
    expect(claimAmount(rates, { type: "outstation", regionId: "nowhere" })).toBe(0);
  });

  it("prices Airbnb per person per night (user: 每人每晚)", () => {
    expect(claimAmount(rates, { type: "airbnb", pax: 2, nights: 2 })).toBe(260);
    expect(claimAmount(rates, { type: "airbnb", pax: 3, nights: 1 })).toBe(195);
  });

  it("pays nothing until HR has set the rate, or with nobody or no night", () => {
    expect(claimAmount({ ...rates, perSpot: null }, { type: "outstation", regionId: "pg" })).toBe(0);
    expect(claimAmount({ ...rates, perPaxNight: null }, { type: "airbnb", pax: 2, nights: 2 })).toBe(0);
    expect(claimAmount(rates, { type: "airbnb", pax: 0, nights: 2 })).toBe(0);
    expect(claimAmount(rates, { type: "airbnb", pax: 2, nights: 0 })).toBe(0);
  });
});

describe("nightsBetween", () => {
  it("counts the nights of a stay", () => {
    expect(nightsBetween("2026-09-04", "2026-09-06")).toBe(2);
    expect(nightsBetween("2026-09-30", "2026-10-01")).toBe(1);
  });
  it("is null for a missing or backwards date", () => {
    expect(nightsBetween("", "2026-09-06")).toBeNull();
    expect(nightsBetween("2026-09-06", "2026-09-04")).toBeNull();
  });
});

describe("readClaimRates", () => {
  it("reads the settings the database sends, numbers as text included", () => {
    expect(readClaimRates({ base: "Klang Valley", perSpot: "50.00", perPaxNight: 65, regions: [{ id: "a", name: "Penang", spots: 4 }] }))
      .toEqual({ base: "Klang Valley", perSpot: 50, perPaxNight: 65, regions: [{ id: "a", name: "Penang", spots: 4 }] });
  });
  it("treats anything malformed as not set", () => {
    expect(readClaimRates(null)).toEqual({ base: "Klang Valley", perSpot: null, perPaxNight: null, regions: [] });
    expect(readClaimRates({ perSpot: -5, regions: [{ id: 1, name: "x", spots: 2 }, { id: "b", name: "Ipoh", spots: 1.5 }] }).regions).toEqual([]);
  });
});
