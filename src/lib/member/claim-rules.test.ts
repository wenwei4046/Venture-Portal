import { describe, expect, it } from "vitest";
import { airbnbGroup, claimAmount, fairRegion, nightsBetween, readClaimRates, type ClaimRates } from "./claim-rules";

const rates: ClaimRates = {
  base: "Klang Valley",
  perSpot: 50,
  perPaxNight: 65,
  groupMaxPax: 3,
  groupCapPerNight: null,
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

// User 2026-10-06: by head count only. Up to HR's small group (3, RM 220 a night) the invoice's
// total is paid up to cap × nights — "2， claim 220*2=440"; more people go back to RM 65 each.
describe("Airbnb: a small group claims its invoice, up to HR's cap a night", () => {
  const capped: ClaimRates = { ...rates, groupCapPerNight: 220 };

  it("pays one, two or three people their invoice, up to RM 220 × 2 nights", () => {
    for (const pax of [1, 2, 3]) {
      expect(claimAmount(capped, { type: "airbnb", pax, nights: 2, invoice: 500 })).toBe(440);
      expect(claimAmount(capped, { type: "airbnb", pax, nights: 2, invoice: 380.5 })).toBe(380.5);
    }
  });

  it("pays four people per person, whatever the invoice says", () => {
    expect(airbnbGroup(capped, 4)).toBe(false);
    expect(claimAmount(capped, { type: "airbnb", pax: 4, nights: 2, invoice: 999 })).toBe(520);
    expect(claimAmount(capped, { type: "airbnb", pax: 4, nights: 2 })).toBe(520);
  });

  it("follows the head count HR sets", () => {
    const two: ClaimRates = { ...capped, groupMaxPax: 2 };
    expect(claimAmount(two, { type: "airbnb", pax: 2, nights: 2, invoice: 500 })).toBe(440);
    expect(claimAmount(two, { type: "airbnb", pax: 3, nights: 2, invoice: 500 })).toBe(390);
  });

  it("pays a small group nothing until its invoice total is typed", () => {
    expect(claimAmount(capped, { type: "airbnb", pax: 2, nights: 2 })).toBe(0);
    expect(claimAmount(capped, { type: "airbnb", pax: 2, nights: 2, invoice: 0 })).toBe(0);
  });

  it("pays everybody per person while HR has set no cap", () => {
    expect(airbnbGroup(rates, 3)).toBe(false);
    expect(claimAmount(rates, { type: "airbnb", pax: 3, nights: 2, invoice: 500 })).toBe(390);
    expect(claimAmount({ ...rates, groupCapPerNight: 0 }, { type: "airbnb", pax: 3, nights: 2, invoice: 500 })).toBe(390);
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
      base: "Klang Valley", perSpot: "50.00", perPaxNight: 65, groupMaxPax: 2, groupCapPerNight: "220.00",
      regions: [{ id: "a", name: "Penang", spots: 4 }, { id: "b", name: "Sabah", spots: 6, planeTicket: true }],
      fairs: [{ fairId: "f1", venue: "PENANG WATERFRONT CONVENTION CENTRE", regionId: "a" }, { fairId: "f2", venue: "MVEC SOUTHKEY", regionId: null }],
    })).toEqual({
      base: "Klang Valley", perSpot: 50, perPaxNight: 65, groupMaxPax: 2, groupCapPerNight: 220,
      regions: [{ id: "a", name: "Penang", spots: 4, planeTicket: false }, { id: "b", name: "Sabah", spots: 6, planeTicket: true }],
      fairs: { f1: { venue: "PENANG WATERFRONT CONVENTION CENTRE", regionId: "a" }, f2: { venue: "MVEC SOUTHKEY", regionId: null } },
    });
  });
  it("treats anything malformed as not set", () => {
    expect(readClaimRates(null)).toEqual({ base: "Klang Valley", perSpot: null, perPaxNight: null, groupMaxPax: 3, groupCapPerNight: null, regions: [], fairs: {} });
    expect(readClaimRates({ groupMaxPax: 0 }).groupMaxPax).toBe(3);
    expect(readClaimRates({ groupMaxPax: 2.5 }).groupMaxPax).toBe(3);
    expect(readClaimRates({ perSpot: -5, regions: [{ id: 1, name: "x", spots: 2 }, { id: "b", name: "Ipoh", spots: 1.5 }] }).regions).toEqual([]);
    expect(readClaimRates({ fairs: [{ fairId: 3, venue: "x" }, { venue: "no id" }] }).fairs).toEqual({});
  });
});
