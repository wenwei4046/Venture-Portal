import { describe, expect, it } from "vitest";
import { brandWeekChanges, brandWeeksAdminRows, brandWeeksToSave, type BrandWeeksAdminSnapshot } from "./brand-weeks-admin";

const person = (id: string, name: string) => ({ id, name, title: "Revenue Specialist", hasLogin: false, savedAt: null, savedBy: null, savedBySelf: false });
const row = (id: string, name: string, orders: number, sales: number, scoring: boolean, confirmed = false) =>
  ({ id, name, sales, held: 0, orders, confirmed, scoring });

/** September 2026 as the grid reads it: week one closed, the last week still open. */
const snapshot: BrandWeeksAdminSnapshot = {
  period: "2026-09",
  subDepartmentId: "71709f7e-9f7c-4e28-80cf-ce21be336995",
  asOf: "2026-10-03T15:00:00Z",
  weeks: [
    { week: "2026-09-04", closesOn: "2026-09-13", locked: true },
    { week: "2026-09-11", closesOn: "2026-09-20", locked: true },
    { week: "2026-09-18", closesOn: "2026-09-27", locked: true },
    { week: "2026-09-25", closesOn: "2026-10-06", locked: false },
  ],
  people: [person("james", "JAMES SEOW"), person("kar", "KAR JUN"), person("lawrence", "LAWRENCE")],
  picks: { james: { "2026-09-25": "ZANOTTI" }, kar: { "2026-09-25": "DUNLOP" } },
  events: [
    { id: "f1|AKEMI", fairId: "f1", brand: "AKEMI", venue: "SUNWAY PYRAMID CONVENTION CENTRE", start: "2026-09-04", end: "2026-09-06",
      week: "2026-09-04", periodMonth: "2026-09", people: [row("lawrence", "LAWRENCE", 3, 12_000, true)] },
    { id: "f4|AKEMI", fairId: "f4", brand: "AKEMI", venue: "PENANG WATERFRONT CONVENTION CENTRE", start: "2026-09-25", end: "2026-09-27",
      week: "2026-09-25", periodMonth: "2026-09",
      people: [row("james", "JAMES SEOW", 5, 30_000, false, true), row("kar", "KAR JUN", 2, 9_000, false, true), row("lawrence", "LAWRENCE", 1, 4_000, false)] },
    { id: "f4|ZANOTTI", fairId: "f4", brand: "ZANOTTI", venue: "PENANG WATERFRONT CONVENTION CENTRE", start: "2026-09-25", end: "2026-09-27",
      week: "2026-09-25", periodMonth: "2026-09",
      people: [row("james", "JAMES SEOW", 2, 8_000, true, true), row("lawrence", "LAWRENCE", 1, 5_000, true)] },
    { id: "f4|", fairId: "f4", brand: null, venue: "PENANG WATERFRONT CONVENTION CENTRE", start: "2026-09-25", end: "2026-09-27",
      week: "2026-09-25", periodMonth: "2026-09", people: [row("kar", "KAR JUN", 1, 800, false, true)] },
  ],
};

const rows = brandWeeksAdminRows(snapshot);
const cell = (name: string, week: string) => rows.find(r => r.person.name === name)!.cells.find(c => c.week === week)!;

describe("brandWeeksAdminRows", () => {
  it("gives every member a cell for every week of the month", () => {
    expect(rows.map(r => r.person.name)).toEqual(["JAMES SEOW", "KAR JUN", "LAWRENCE"]);
    expect(rows.every(r => r.cells.map(c => c.week).join() === "2026-09-04,2026-09-11,2026-09-18,2026-09-25")).toBe(true);
  });

  it("reads a closed week nobody picked as auto-located at the booth that scores", () => {
    expect(cell("LAWRENCE", "2026-09-04")).toMatchObject({ pick: null, state: "auto", scoringBrand: "AKEMI", pickedElsewhere: false });
    expect(cell("LAWRENCE", "2026-09-04").booths).toEqual([
      { brand: "AKEMI", venue: "SUNWAY PYRAMID CONVENTION CENTRE", orders: 3, sales: 12_000, held: 0, scoring: true },
    ]);
  });

  it("reads an open week nobody picked as unconfirmed", () => {
    expect(cell("LAWRENCE", "2026-09-25")).toMatchObject({ pick: null, state: "unconfirmed", scoringBrand: "ZANOTTI" });
  });

  it("lists every booth written at, most bills first, the pick's own scoring", () => {
    const james = cell("JAMES SEOW", "2026-09-25");
    expect(james).toMatchObject({ pick: "ZANOTTI", state: "picked", scoringBrand: "ZANOTTI", pickedElsewhere: false });
    expect(james.booths.map(b => [b.brand, b.orders, b.scoring])).toEqual([["AKEMI", 5, false], ["ZANOTTI", 2, true]]);
  });

  it("says when a pick has no booth of its brand that week, so no place scores", () => {
    const kar = cell("KAR JUN", "2026-09-25");
    expect(kar).toMatchObject({ pick: "DUNLOP", state: "picked", scoringBrand: null, pickedElsewhere: true });
    expect(kar.booths.map(b => b.brand)).toEqual(["AKEMI", null]);
  });

  it("has nothing to place in a week with no bills", () => {
    expect(cell("JAMES SEOW", "2026-09-04")).toMatchObject({ pick: null, state: "none", scoringBrand: null, booths: [] });
  });
});

describe("brandWeeksToSave", () => {
  it("sends only the members whose draft moved, each with their whole month", () => {
    const drafts = {
      james: { "2026-09-25": "ZANOTTI" as const },
      kar: { "2026-09-25": "DUNLOP" as const },
      lawrence: { "2026-09-04": "ZANOTTI" as const, "2026-09-25": undefined },
    };
    expect(brandWeeksToSave("2026-09", snapshot.picks, drafts)).toEqual({ lawrence: { "2026-09-04": "ZANOTTI" } });
    expect(brandWeekChanges("2026-09", snapshot.picks, drafts)).toBe(1);
  });

  it("sends a cleared month as an empty one", () => {
    const drafts = { james: { "2026-09-25": undefined }, kar: { "2026-09-25": "AKEMI" as const } };
    expect(brandWeeksToSave("2026-09", snapshot.picks, drafts)).toEqual({ james: {}, kar: { "2026-09-25": "AKEMI" } });
    expect(brandWeekChanges("2026-09", snapshot.picks, drafts)).toBe(2);
  });
});
