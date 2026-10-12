import { describe, expect, it } from "vitest";
import { brandWeeksAdminRows, type BrandWeeksAdminSnapshot } from "./brand-weeks-admin";

const person = (id: string, name: string) => ({ id, name, title: "Revenue Specialist", hasLogin: false });
const row = (id: string, name: string, orders: number, sales: number, scoring: boolean, source: "erp" | "auto" = "auto") =>
  ({ id, name, sales, held: 0, orders, source, scoring });
const erp = (brand: string, venue: string, booths = 1) =>
  ({ brand, venue, organizer: "MLE", start: "2026-09-25", end: "2026-09-27", booths, fairId: "f4" });

/**
 * September 2026 as HR's grid reads it (2026-10-12): week one before the ERP
 * listed anybody — auto-located by the bills — and the last week from the
 * ERP's Sales Attending.
 */
const snapshot: BrandWeeksAdminSnapshot = {
  period: "2026-09",
  subDepartmentId: "71709f7e-9f7c-4e28-80cf-ce21be336995",
  asOf: "2026-10-12T15:00:00Z",
  erpReceivedAt: "2026-10-12T07:46:03Z",
  weeks: [
    { week: "2026-09-04", closesOn: "2026-09-13", locked: true },
    { week: "2026-09-11", closesOn: "2026-09-20", locked: true },
    { week: "2026-09-18", closesOn: "2026-09-27", locked: true },
    { week: "2026-09-25", closesOn: "2026-10-06", locked: true },
  ],
  people: [person("james", "JAMES SEOW"), person("kar", "KAR JUN"), person("lawrence", "LAWRENCE")],
  erp: {
    james: { "2026-09-25": erp("AKEMI", "PENANG WATERFRONT CONVENTION CENTRE") },
    kar: { "2026-09-25": erp("DUNLOP", "SUNWAY CARNIVAL") },
    lawrence: { "2026-09-25": erp("ZANOTTI", "PENANG WATERFRONT CONVENTION CENTRE", 2) },
  },
  unlisted: ["NG PENG CHUEN"],
  events: [
    { id: "f1|AKEMI", fairId: "f1", brand: "AKEMI", venue: "SUNWAY PYRAMID CONVENTION CENTRE", start: "2026-09-04", end: "2026-09-06",
      week: "2026-09-04", periodMonth: "2026-09", people: [row("lawrence", "LAWRENCE", 3, 12_000, true)] },
    { id: "f4|AKEMI", fairId: "f4", brand: "AKEMI", venue: "PENANG WATERFRONT CONVENTION CENTRE", start: "2026-09-25", end: "2026-09-27",
      week: "2026-09-25", periodMonth: "2026-09",
      people: [row("james", "JAMES SEOW", 5, 30_000, true, "erp"), row("kar", "KAR JUN", 2, 9_000, false, "erp"), row("lawrence", "LAWRENCE", 1, 4_000, false, "erp")] },
    { id: "f4|ZANOTTI", fairId: "f4", brand: "ZANOTTI", venue: "PENANG WATERFRONT CONVENTION CENTRE", start: "2026-09-25", end: "2026-09-27",
      week: "2026-09-25", periodMonth: "2026-09",
      people: [row("james", "JAMES SEOW", 2, 8_000, false, "erp"), row("lawrence", "LAWRENCE", 1, 5_000, true, "erp")] },
  ],
};

const rows = brandWeeksAdminRows(snapshot);
const cell = (name: string, week: string) => rows.find(r => r.person.name === name)!.cells.find(c => c.week === week)!;

describe("brandWeeksAdminRows", () => {
  it("gives every member a cell for every week of the month", () => {
    expect(rows.map(r => r.person.name)).toEqual(["JAMES SEOW", "KAR JUN", "LAWRENCE"]);
    expect(rows.every(r => r.cells.map(c => c.week).join() === "2026-09-04,2026-09-11,2026-09-18,2026-09-25")).toBe(true);
  });

  it("reads a week the ERP lists them at as the ERP's, with its booth", () => {
    const james = cell("JAMES SEOW", "2026-09-25");
    expect(james).toMatchObject({ state: "erp", brand: "AKEMI", soldElsewhere: false });
    expect(james.erp).toMatchObject({ venue: "PENANG WATERFRONT CONVENTION CENTRE", booths: 1 });
    // Every board they wrote at, most bills first; only the ERP's booth earns points.
    expect(james.booths.map(b => [b.brand, b.orders, b.scoring])).toEqual([["AKEMI", 5, true], ["ZANOTTI", 2, false]]);
  });

  it("says when the ERP lists them at a booth none of their bills is at — no place of theirs scores", () => {
    expect(cell("KAR JUN", "2026-09-25")).toMatchObject({ state: "erp", brand: "DUNLOP", soldElsewhere: true });
  });

  it("keeps the number of booths the ERP lists them at that weekend", () => {
    expect(cell("LAWRENCE", "2026-09-25").erp?.booths).toBe(2);
  });

  it("reads a week the ERP lists them nowhere as auto-located at the booth that scores", () => {
    const lawrence = cell("LAWRENCE", "2026-09-04");
    expect(lawrence).toMatchObject({ state: "auto", brand: "AKEMI", erp: null, soldElsewhere: false });
    expect(lawrence.booths).toEqual([
      { brand: "AKEMI", venue: "SUNWAY PYRAMID CONVENTION CENTRE", orders: 3, sales: 12_000, held: 0, scoring: true },
    ]);
  });

  it("has nothing to show for a week with neither", () => {
    expect(cell("JAMES SEOW", "2026-09-04")).toMatchObject({ state: "none", brand: null, erp: null, booths: [] });
  });

  it("reads a snapshot from before the ERP's Sales Attending as all auto", () => {
    const old = brandWeeksAdminRows({ ...snapshot, erp: undefined, unlisted: undefined });
    expect(old.find(r => r.person.name === "LAWRENCE")!.cells.map(c => c.state)).toEqual(["auto", "none", "none", "auto"]);
  });
});
