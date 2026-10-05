import { describe, expect, it } from "vitest";
import { airbnbNightly, claimAmount, fairRegion, nightsBetween, readClaimRates, type ClaimRates } from "./claim-rules";

const rates: ClaimRates = {
  base: "Klang Valley",
  perSpot: 50,
  perPaxNight: 65,
  perThreePaxNight: null,
  regions: [
    { id: "kl", name: "KL", spots: 0, planeTicket: false },
    { id: "pg", name: "Penang", spots: 4, planeTicket: false },
    { id: "sb", name: "Sabah", spots: 6, planeTicket: false },
  ],
  fairs: {},
};

describe("claimAmount — the rate HR set, never a typed figure (2026-10-05)", () => {
  it("prices an outstation claim by the route's spots", () => {
    expect(claimAmount(rates, { type: "outstation", regionId: "pg" })).toBe(200);
    expect(claimAmount(rates, { type: "outstation", regionId: "sb" })).toBe(300);
  });

  it("pays nothing for a local fair or an unknown region", () => {
    expect(claimAmount(rates, { type: "outstation", regionId: "kl" })).toBe(0);
    expect(claimAmount(rates, { type: "outstation", regionId: "nowhere" })).toBe(0);
    expect(claimAmount(rates, { type: "outstation", regionId: null })).toBe(0);
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

// User 2026-10-06: Sabah and Sarawak are flown to — the ticket's price, with its invoice, no cap.
describe("a plane ticket", () => {
  const flying: ClaimRates = { ...rates, regions: rates.regions.map(r => (r.id === "sb" ? { ...r, planeTicket: true } : r)) };

  it("is the price typed from its invoice, not the region's spots", () => {
    expect(claimAmount(flying, { type: "outstation", regionId: "sb", ticket: 456.7 })).toBe(456.7);
    expect(claimAmount(flying, { type: "outstation", regionId: "sb", ticket: 1234.567 })).toBe(1234.57);
  });

  it("is nothing until a price is typed", () => {
    expect(claimAmount(flying, { type: "outstation", regionId: "sb" })).toBe(0);
    expect(claimAmount(flying, { type: "outstation", regionId: "sb", ticket: 0 })).toBe(0);
  });

  it("leaves the other regions on their spots", () => {
    expect(claimAmount(flying, { type: "outstation", regionId: "pg", ticket: 999 })).toBe(200);
  });
});

// User 2026-10-06: by head count only; exactly three share the rate HR set (e.g. RM 220 a night);
// more than three go back to RM 65 each.
describe("Airbnb for three", () => {
  const three: ClaimRates = { ...rates, perThreePaxNight: 220 };

  it("pays three people HR's three-person rate a night, whoever they are", () => {
    expect(airbnbNightly(three, 3)).toBe(220);
    expect(claimAmount(three, { type: "airbnb", pax: 3, nights: 2 })).toBe(440);
  });

  it("pays everybody else per person", () => {
    expect(claimAmount(three, { type: "airbnb", pax: 1, nights: 2 })).toBe(130);
    expect(claimAmount(three, { type: "airbnb", pax: 2, nights: 2 })).toBe(260);
    expect(claimAmount(three, { type: "airbnb", pax: 4, nights: 2 })).toBe(520);
  });

  it("pays three per person while HR has not set the three-person rate", () => {
    expect(airbnbNightly(rates, 3)).toBe(195);
    expect(claimAmount({ ...rates, perThreePaxNight: 0 }, { type: "airbnb", pax: 3, nights: 2 })).toBe(390);
  });
});

describe("fairRegion — the region is the one HR set for the fair's venue", () => {
  const withFairs: ClaimRates = { ...rates, fairs: { f1: { venue: "PENANG WATERFRONT CONVENTION CENTRE", regionId: "pg" }, f2: { venue: "MVEC SOUTHKEY", regionId: null } } };

  it("finds the venue's region", () => {
    expect(fairRegion(withFairs, "f1")).toEqual({ venue: "PENANG WATERFRONT CONVENTION CENTRE", region: rates.regions[1] });
  });

  it("says when HR has not set one, and knows nothing of an unknown fair", () => {
    expect(fairRegion(withFairs, "f2")).toEqual({ venue: "MVEC SOUTHKEY", region: null });
    expect(fairRegion(withFairs, "f9")).toEqual({ venue: null, region: null });
    expect(fairRegion(withFairs, null)).toEqual({ venue: null, region: null });
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
    expect(readClaimRates({
      base: "Klang Valley", perSpot: "50.00", perPaxNight: 65, perThreePaxNight: "220.00",
      regions: [{ id: "a", name: "Penang", spots: 4 }, { id: "b", name: "Sabah", spots: 6, planeTicket: true }],
      fairs: [{ fairId: "f1", venue: "PENANG WATERFRONT CONVENTION CENTRE", regionId: "a" }, { fairId: "f2", venue: "MVEC SOUTHKEY", regionId: null }],
    })).toEqual({
      base: "Klang Valley", perSpot: 50, perPaxNight: 65, perThreePaxNight: 220,
      regions: [{ id: "a", name: "Penang", spots: 4, planeTicket: false }, { id: "b", name: "Sabah", spots: 6, planeTicket: true }],
      fairs: { f1: { venue: "PENANG WATERFRONT CONVENTION CENTRE", regionId: "a" }, f2: { venue: "MVEC SOUTHKEY", regionId: null } },
    });
  });
  it("treats anything malformed as not set", () => {
    expect(readClaimRates(null)).toEqual({ base: "Klang Valley", perSpot: null, perPaxNight: null, perThreePaxNight: null, regions: [], fairs: {} });
    expect(readClaimRates({ perSpot: -5, regions: [{ id: 1, name: "x", spots: 2 }, { id: "b", name: "Ipoh", spots: 1.5 }] }).regions).toEqual([]);
    expect(readClaimRates({ fairs: [{ fairId: 3, venue: "x" }, { venue: "no id" }] }).fairs).toEqual({});
  });
});
