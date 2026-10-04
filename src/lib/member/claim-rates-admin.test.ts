import { describe, expect, it } from "vitest";
import {
  claimRatesChanged, claimRatesDraft, claimRatesProblems, claimRatesToSave, readClaimRatesAdmin, validClaimRatesToSave,
} from "./claim-rates-admin";

const raw = {
  base: "Klang Valley", perSpot: 50, perPaxNight: 65, updatedAt: "2026-10-04T17:48:27Z", updatedBy: "HR",
  regions: [
    { id: "11111111-1111-4111-8111-111111111111", name: "KL", spots: 0, active: true },
    { id: "22222222-2222-4222-8222-222222222222", name: "Penang", spots: 4, active: true },
    { id: "33333333-3333-4333-8333-333333333333", name: "Old route", spots: 9, active: false },
  ],
};

describe("claim rates in the back office", () => {
  it("reads what the database keeps, and opens the form on the regions in use", () => {
    const saved = readClaimRatesAdmin(raw)!;
    expect(saved).toMatchObject({ base: "Klang Valley", perSpot: 50, perPaxNight: 65, updatedBy: "HR" });
    const draft = claimRatesDraft(saved);
    expect(draft).toMatchObject({ base: "Klang Valley", perSpot: "50", perPaxNight: "65" });
    expect(draft.regions.map(g => [g.name, g.spots])).toEqual([["KL", "0"], ["Penang", "4"]]);
    expect(claimRatesChanged(saved, draft)).toBe(false);
    expect(readClaimRatesAdmin(null)).toBeNull();
  });

  it("saves rates to the sen, a blank rate as not set, and each region with its spots", () => {
    const draft = { ...claimRatesDraft(readClaimRatesAdmin(raw)!), perSpot: "52.50", perPaxNight: " " };
    expect(claimRatesProblems(draft)).toEqual([]);
    expect(claimRatesToSave(draft)).toEqual({
      base: "Klang Valley", perSpot: 52.5, perPaxNight: null,
      regions: [{ id: "11111111-1111-4111-8111-111111111111", name: "KL", spots: 0 }, { id: "22222222-2222-4222-8222-222222222222", name: "Penang", spots: 4 }],
    });
    expect(claimRatesChanged(readClaimRatesAdmin(raw)!, draft)).toBe(true);
  });

  it("refuses what the database would: no base, a bad amount, an unnamed or doubled region, odd spots", () => {
    const draft = claimRatesDraft(readClaimRatesAdmin(raw)!);
    expect(claimRatesProblems({ ...draft, base: " " })[0]).toMatch(/Name the base/);
    expect(claimRatesProblems({ ...draft, perSpot: "12.345" })[0]).toMatch(/rate per spot/);
    expect(claimRatesProblems({ ...draft, perPaxNight: "100001" })[0]).toMatch(/Airbnb rate/);
    expect(claimRatesProblems({ ...draft, regions: [...draft.regions, { key: "n", id: null, name: "penang", spots: "3" }] })).toEqual(["Two regions are called penang."]);
    expect(claimRatesProblems({ ...draft, regions: [{ key: "n", id: null, name: "", spots: "3" }] })).toEqual(["Region 1 needs a name (up to 40 letters)."]);
    expect(claimRatesProblems({ ...draft, regions: [{ key: "n", id: null, name: "Sabah", spots: "2.5" }] })).toEqual(["Sabah: spots must be a whole number from 0 to 100."]);
  });

  it("checks again on the server what the form sends", () => {
    const ok = claimRatesToSave(claimRatesDraft(readClaimRatesAdmin(raw)!));
    expect(validClaimRatesToSave(ok)).toBe(true);
    expect(validClaimRatesToSave({ ...ok, perSpot: -1 })).toBe(false);
    expect(validClaimRatesToSave({ ...ok, regions: [{ id: null, name: "X", spots: 101 }] })).toBe(false);
    expect(validClaimRatesToSave("nope")).toBe(false);
  });
});
