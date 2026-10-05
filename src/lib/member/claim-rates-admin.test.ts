import { describe, expect, it } from "vitest";
import {
  airbnbExample, claimRatesChanged, claimRatesDraft, claimRatesProblems, claimRatesToSave, readClaimRatesAdmin, validClaimRatesToSave,
} from "./claim-rates-admin";

const KL = "11111111-1111-4111-8111-111111111111";
const PENANG = "22222222-2222-4222-8222-222222222222";
const SABAH = "44444444-4444-4444-8444-444444444444";
const raw = {
  base: "Klang Valley", perSpot: 50, perPaxNight: 65, groupMaxPax: 3, groupCapPerNight: null, updatedAt: "2026-10-04T17:48:27Z", updatedBy: "HR",
  regions: [
    { id: KL, name: "KL", spots: 0, active: true, planeTicket: false },
    { id: PENANG, name: "Penang", spots: 4, active: true, planeTicket: false },
    { id: SABAH, name: "Sabah", spots: 6, active: true, planeTicket: true },
    { id: "33333333-3333-4333-8333-333333333333", name: "Old route", spots: 9, active: false, planeTicket: false },
  ],
  venues: [
    { key: "SABAH INTERNATIONAL CONVENTION CENTRE", name: "SABAH INTERNATIONAL CONVENTION CENTRE", fairs: 1, lastFair: "2026-10-04", regionId: SABAH },
    { key: "PENANG WATERFRONT CONVENTION CENTRE", name: "PENANG WATERFRONT CONVENTION CENTRE", fairs: 2, lastFair: "2026-09-27", regionId: PENANG },
    { key: "MVEC SOUTHKEY", name: "MVEC SOUTHKEY", fairs: 5, lastFair: "2026-10-04", regionId: null },
  ],
};

describe("claim rates in the back office", () => {
  it("reads what the database keeps, and opens the form on the regions in use", () => {
    const saved = readClaimRatesAdmin(raw)!;
    expect(saved).toMatchObject({ base: "Klang Valley", perSpot: 50, perPaxNight: 65, groupMaxPax: 3, groupCapPerNight: null, updatedBy: "HR" });
    const draft = claimRatesDraft(saved);
    expect(draft).toMatchObject({ base: "Klang Valley", perSpot: "50", perPaxNight: "65", groupMaxPax: "3", groupCapPerNight: "" });
    expect(draft.regions.map(g => [g.name, g.spots, g.planeTicket])).toEqual([["KL", "0", false], ["Penang", "4", false], ["Sabah", "6", true]]);
    expect(claimRatesChanged(saved, draft)).toBe(false);
    expect(readClaimRatesAdmin(null)).toBeNull();
  });

  it("saves rates to the sen, a blank rate as not set, and each region with its spots", () => {
    const draft = { ...claimRatesDraft(readClaimRatesAdmin(raw)!), perSpot: "52.50", perPaxNight: " ", groupMaxPax: " 2 ", groupCapPerNight: "220" };
    expect(claimRatesProblems(draft)).toEqual([]);
    expect(claimRatesToSave(draft)).toMatchObject({
      base: "Klang Valley", perSpot: 52.5, perPaxNight: null, groupMaxPax: 2, groupCapPerNight: 220,
      regions: [{ id: KL, name: "KL", spots: 0, planeTicket: false }, { id: PENANG, name: "Penang", spots: 4, planeTicket: false }, { id: SABAH, name: "Sabah", spots: 6, planeTicket: true }],
    });
    expect(claimRatesChanged(readClaimRatesAdmin(raw)!, draft)).toBe(true);
  });

  it("refuses what the database would: no base, a bad amount, an unnamed or doubled region, odd spots", () => {
    const draft = claimRatesDraft(readClaimRatesAdmin(raw)!);
    const region = (name: string, spots: string) => ({ key: "n", id: null, name, spots, planeTicket: false });
    expect(claimRatesProblems({ ...draft, base: " " })[0]).toMatch(/Name the base/);
    expect(claimRatesProblems({ ...draft, perSpot: "12.345" })[0]).toMatch(/rate per spot/);
    expect(claimRatesProblems({ ...draft, perPaxNight: "100001" })[0]).toMatch(/Airbnb rate/);
    expect(claimRatesProblems({ ...draft, groupCapPerNight: "two hundred" })[0]).toMatch(/small group's limit a night/);
    for (const n of ["", "0", "41", "2.5", "three"]) expect(claimRatesProblems({ ...draft, groupMaxPax: n })[0]).toMatch(/small group is a whole number of people from 1 to 40/);
    expect(claimRatesProblems({ ...draft, regions: [...draft.regions, region("penang", "3")] })).toEqual(["Two regions are called penang."]);
    expect(claimRatesProblems({ ...draft, regions: [region("", "3")] })).toEqual(["Region 1 needs a name (up to 40 letters)."]);
    expect(claimRatesProblems({ ...draft, regions: [region("Sarawak", "2.5")] })).toEqual(["Sarawak: spots must be a whole number from 0 to 100."]);
  });

  it("checks again on the server what the form sends", () => {
    const ok = claimRatesToSave(claimRatesDraft(readClaimRatesAdmin(raw)!));
    expect(validClaimRatesToSave(ok)).toBe(true);
    expect(validClaimRatesToSave({ ...ok, perSpot: -1 })).toBe(false);
    expect(validClaimRatesToSave({ ...ok, groupCapPerNight: 100_001 })).toBe(false);
    expect(validClaimRatesToSave({ ...ok, groupMaxPax: 0 })).toBe(false);
    expect(validClaimRatesToSave({ ...ok, groupMaxPax: 41 })).toBe(false);
    expect(validClaimRatesToSave({ ...ok, groupMaxPax: "3" })).toBe(false);
    expect(validClaimRatesToSave({ ...ok, regions: [{ id: null, name: "X", spots: 101, planeTicket: false }] })).toBe(false);
    expect(validClaimRatesToSave({ ...ok, regions: [{ id: null, name: "X", spots: 1 }] })).toBe(false);
    expect(validClaimRatesToSave({ ...ok, venues: [{ key: "MVEC SOUTHKEY", region: "Mars" }] })).toBe(false);
    expect(validClaimRatesToSave("nope")).toBe(false);
  });
});

// User 2026-10-06: 我可以改人数，同时也可以改那个上限 — and HR reads what two nights would pay.
describe("the Airbnb small group", () => {
  const draft = { ...claimRatesDraft(readClaimRatesAdmin(raw)!), groupCapPerNight: "220" };

  it("spells out two nights in ringgit", () => {
    expect(airbnbExample(draft)).toBe(
      "Two nights, for example: up to 3 people claim the invoice's total, up to RM 440.00 (RM 220.00 a night × 2); 4 people claim RM 520.00 (4 × RM 65.00 × 2), nothing to type.");
    expect(airbnbExample({ ...draft, groupMaxPax: "1" })).toMatch(/^Two nights, for example: up to 1 person claims the invoice's total/);
  });

  it("says so when there is no cap, and nothing while there is no rate", () => {
    expect(airbnbExample({ ...draft, groupCapPerNight: "" })).toBe(
      "Two nights, for example: 3 people claim RM 390.00 (3 × RM 65.00 × 2). No small-group limit is set, so every stay is paid per person.");
    expect(airbnbExample({ ...draft, groupCapPerNight: "", perPaxNight: "" })).toBeNull();
  });

  it("is saved through the server's check", () => {
    const toSave = claimRatesToSave({ ...draft, groupMaxPax: "4" });
    expect(toSave).toMatchObject({ groupMaxPax: 4, groupCapPerNight: 220 });
    expect(validClaimRatesToSave(toSave)).toBe(true);
  });
});

// User 2026-10-06: every venue the ERP's fairs name gets a region here; an outstation claim's region is its venue's.
describe("the venues' regions", () => {
  it("opens each venue on the region it is in, and saves it by the region's name", () => {
    const draft = claimRatesDraft(readClaimRatesAdmin(raw)!);
    expect(draft.venues).toEqual({ "SABAH INTERNATIONAL CONVENTION CENTRE": SABAH, "PENANG WATERFRONT CONVENTION CENTRE": PENANG, "MVEC SOUTHKEY": "" });
    expect(claimRatesToSave(draft).venues).toEqual([
      { key: "SABAH INTERNATIONAL CONVENTION CENTRE", region: "Sabah" },
      { key: "PENANG WATERFRONT CONVENTION CENTRE", region: "Penang" },
      { key: "MVEC SOUTHKEY", region: null },
    ]);
  });

  it("can put a venue in a region added in the same save", () => {
    const base = claimRatesDraft(readClaimRatesAdmin(raw)!);
    const draft = { ...base, regions: [...base.regions, { key: "new-1", id: null, name: " Johor ", spots: "3", planeTicket: false }],
      venues: { ...base.venues, "MVEC SOUTHKEY": "new-1" } };
    expect(claimRatesToSave(draft).venues[2]).toEqual({ key: "MVEC SOUTHKEY", region: "Johor" });
    expect(validClaimRatesToSave(claimRatesToSave(draft))).toBe(true);
    expect(claimRatesChanged(readClaimRatesAdmin(raw)!, draft)).toBe(true);
  });

  it("leaves a venue in no region when its region is removed", () => {
    const base = claimRatesDraft(readClaimRatesAdmin(raw)!);
    const draft = { ...base, regions: base.regions.filter(g => g.name !== "Penang") };
    expect(claimRatesToSave(draft).venues[1]).toEqual({ key: "PENANG WATERFRONT CONVENTION CENTRE", region: null });
  });
});
