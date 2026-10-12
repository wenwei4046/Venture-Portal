import { describe, expect, it } from "vitest";
import { arenaBoothLabel, arenaFairEvents, arenaFairRecords, type ArenaFairEvent, type ArenaHistorySnapshot } from "./arena-history";

const person = (id: string, name: string, sales: number, orders = 1) => ({ id, name, sales, held: 0, orders });
const event = (id: string, start: string, end: string, people: ArenaFairEvent["people"], venue = "SPICE ARENA"): ArenaFairEvent =>
  ({ id, venue, start, end, periodMonth: `${end.slice(0, 7)}`, people });
const history = (events: ArenaFairEvent[]): ArenaHistorySnapshot => ({
  asOf: "2026-09-20T00:00:00Z", provisional: true, events, unassignedOrders: 0, unassignedSales: 0,
  championship: { status: "pending", reason: "Not connected." },
});

describe("arenaFairEvents", () => {
  it("ranks one fair with shared places and leaves a known zero unplaced", () => {
    const [fair] = arenaFairEvents(history([event("f1", "2026-08-07", "2026-08-09", [
      person("a", "Ada", 5000), person("b", "Ben", 9000), person("c", "Cara", 5000), person("d", "Dan", 0),
    ])]), "2026-08-01", "2026-08-31");
    expect(fair.rows.map(row => [row.name, row.position])).toEqual([["Ben", 1], ["Ada", 2], ["Cara", 2], ["Dan", null]]);
    // A finish is a fact; nothing here awards a point.
    expect(fair.rows.every(row => row.points === 0 && row.basePoints === 0)).toBe(true);
    // A real zero is eligible and simply did not place; it is not pending.
    expect(fair.rows.at(-1)).toMatchObject({ eligible: true, active: false, value: 0 });
  });

  it("selects fairs by the day the fair CLOSED, not by the day a bill was keyed in", () => {
    const snapshot = history([
      event("july", "2026-07-30", "2026-08-02", [person("a", "Ada", 4000)]),
      event("august", "2026-08-28", "2026-08-31", [person("a", "Ada", 7000)]),
      event("september", "2026-09-04", "2026-09-06", [person("a", "Ada", 1000)]),
    ]);
    expect(arenaFairEvents(snapshot, "2026-08-01", "2026-08-31").map(fair => fair.id)).toEqual(["july", "august"]);
  });

  it("holds a conflicting duplicate as pending and never counts one fair twice", () => {
    const rows = person("a", "Ada", 5000);
    const [fair] = arenaFairEvents(history([
      event("f1", "2026-08-07", "2026-08-09", [rows, person("b", "Ben", 3000)]),
      event("f1", "2026-08-07", "2026-08-09", [person("a", "Ada", 9000), { ...person("b", "Ben", 3000) }]),
    ]), "2026-08-01", "2026-08-31");
    expect(arenaFairEvents(history([event("f1", "2026-08-07", "2026-08-09", [rows]), event("f1", "2026-08-07", "2026-08-09", [rows])]), "2026-08-01", "2026-08-31")).toHaveLength(1);
    const ada = fair.rows.find(row => row.name === "Ada")!;
    expect(ada).toMatchObject({ eligible: false, position: null });
    expect(Number.isNaN(ada.value)).toBe(true);
    // Ben's untouched result still places; one person's missing data is not everybody's.
    expect(fair.rows.find(row => row.name === "Ben")).toMatchObject({ position: 1 });
  });
});

// Booth by booth (2026-10-03): an exhibition is a brand's booth at a fair, and
// since 2026-10-12 a seller the ERP's Sales Attending lists nowhere that
// weekend — placed by their bills — says so.
describe("booth boards", () => {
  it("labels each board by its booth and marks an auto-located placement", () => {
    const events = arenaFairEvents(history([
      { ...event("f1|AKEMI", "2026-09-25", "2026-09-27", [
        { ...person("james", "James", 27888, 3), source: "auto" },
        { ...person("lawrence", "Lawrence", 4047), source: "erp" },
      ], "PENANG WATERFRONT CONVENTION CENTRE"), brand: "AKEMI", fairId: "f1", week: "2026-09-25" },
      { ...event("f1|ZANOTTI", "2026-09-25", "2026-09-27", [person("wei", "Wei Pin", 52006, 9)], "PENANG WATERFRONT CONVENTION CENTRE"),
        brand: "ZANOTTI", fairId: "f1", week: "2026-09-25" },
    ]), "2026-09-01", "2026-09-30");
    expect(events.map(e => [e.id, e.label, e.brand])).toEqual([
      ["f1|AKEMI", "AKEMI · PENANG WATERFRONT CONVENTION CENTRE", "AKEMI"],
      ["f1|ZANOTTI", "ZANOTTI · PENANG WATERFRONT CONVENTION CENTRE", "ZANOTTI"],
    ]);
    // Each booth is ranked on its own: Wei Pin's 52,006 does not push James off first.
    expect(events[0].rows.map(row => [row.name, row.position, row.autoLocated])).toEqual([["James", 1, true], ["Lawrence", 2, false]]);
    // No brand week at all (no source): nothing to explain.
    expect(events[1].rows.map(row => [row.name, row.position, row.autoLocated])).toEqual([["Wei Pin", 1, false]]);
  });

  // Whether the week has closed no longer matters (2026-10-12): nothing is picked, so a placement by the
  // bills is auto-located the day the fair ends, and one the ERP made never is.
  it("calls a placement by the bills auto-located, open week or closed, and the ERP's never", () => {
    const [open, closed] = arenaFairEvents(history([
      { ...event("f2|AKEMI", "2026-09-25", "2026-09-27", [{ ...person("a", "Ada", 5000), source: "auto" }]),
        brand: "AKEMI", week: "2026-09-25", closesOn: "2026-10-06", locked: false },
      { ...event("f1|AKEMI", "2026-09-04", "2026-09-06", [{ ...person("a", "Ada", 4000), source: "auto" }, { ...person("b", "Ben", 3000), source: "erp" }]),
        brand: "AKEMI", week: "2026-09-04", closesOn: "2026-09-13", locked: true },
    ]), "2026-09-01", "2026-09-30").sort((x, y) => y.start.localeCompare(x.start));
    expect(open.rows[0]).toMatchObject({ autoLocated: true });
    expect(closed.rows.map(row => [row.name, row.autoLocated])).toEqual([["Ada", true], ["Ben", false]]);
  });

  // A seller on a board off their brand week (user 2026-10-03: 30 千本身在那个
  // booth 的排行榜上可能是第三名，所以还是会显示第三名 … 只是积分只会算它的
  // brand week): ranked there like anybody, with no points for the place.
  it("ranks an off-week seller on the board like anybody, flagged as earning no points", () => {
    const [board] = arenaFairEvents(history([
      { ...event("f1|ZANOTTI", "2026-09-25", "2026-09-27", [
        person("wei", "Wei Pin", 52006, 9),
        { ...person("james", "James Seow", 30000, 1), scoring: false },
        person("anthony", "Anthony", 25606, 5),
      ]), brand: "ZANOTTI" },
    ]), "2026-09-01", "2026-09-30");
    expect(board.rows.map(row => [row.name, row.position, row.offWeek, row.value])).toEqual([
      ["Wei Pin", 1, false, 52006], ["James Seow", 2, true, 30000], ["Anthony", 3, false, 25606],
    ]);
    // Off the scoring board, a placement is that board's to explain, not this one's.
    expect(board.rows[1]).toMatchObject({ autoLocated: false });
  });

  it("never sets a record from a board that did not score", () => {
    const records = arenaFairRecords(history([
      { ...event("f1|AKEMI", "2026-09-25", "2026-09-27", [person("james", "James Seow", 27888, 3)]), brand: "AKEMI" },
      { ...event("f1|ZANOTTI", "2026-09-25", "2026-09-27", [{ ...person("james", "James Seow", 90000, 1), scoring: false }]), brand: "ZANOTTI" },
    ]));
    expect(records).toEqual([expect.objectContaining({ name: "James Seow", value: 27888, brand: "AKEMI" })]);
  });

  it("keeps a whole-fair result readable without a brand", () => {
    expect(arenaBoothLabel({ venue: "SPICE ARENA" })).toBe("SPICE ARENA");
    expect(arenaBoothLabel({ venue: "SPICE ARENA", brand: null })).toBe("SPICE ARENA");
  });

  it("names the booth a record was set at", () => {
    const [record] = arenaFairRecords(history([
      { ...event("f1|AKEMI", "2026-09-11", "2026-09-13", [person("a", "Ada", 100000)], "MID VALLEY"), brand: "AKEMI" },
    ]));
    expect(record).toMatchObject({ value: 100000, venue: "MID VALLEY", brand: "AKEMI" });
  });
});

describe("arenaFairRecords", () => {
  it("keeps the all-time best fair per person, across years and outside any window", () => {
    const records = arenaFairRecords(history([
      event("jan", "2025-01-10", "2025-01-12", [person("a", "Ada", 100000)], "MITC MELAKA"),
      event("aug", "2026-08-07", "2026-08-09", [person("a", "Ada", 40000), person("b", "Ben", 60000)]),
    ]));
    expect(records.map(row => [row.name, row.position, row.value])).toEqual([["Ada", 1, 100000], ["Ben", 2, 60000]]);
    expect(records[0]).toMatchObject({ venue: "MITC MELAKA", start: "2025-01-10", end: "2025-01-12" });
  });

  it("holds a person whose history contains an unreadable fair rather than using the readable one", () => {
    const records = arenaFairRecords(history([
      event("f1", "2026-08-07", "2026-08-09", [person("a", "Ada", 30000)]),
      event("f2", "2026-08-14", "2026-08-16", [person("a", "Ada", 5000), person("b", "Ben", 1000)]),
      event("f2", "2026-08-14", "2026-08-16", [person("a", "Ada", 8000), person("b", "Ben", 1000)]),
    ]));
    expect(records.find(row => row.name === "Ada")).toMatchObject({ position: null, value: null, pending: true });
    expect(records.find(row => row.name === "Ben")).toMatchObject({ position: 1, value: 1000 });
  });
});
