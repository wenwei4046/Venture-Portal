import { describe, expect, it } from "vitest";
import { arenaFairEvents, arenaFairRecords, type ArenaFairEvent, type ArenaHistorySnapshot } from "./arena-history";

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
