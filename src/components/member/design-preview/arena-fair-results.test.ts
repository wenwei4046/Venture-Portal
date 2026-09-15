import { describe, expect, it } from "vitest";
import { arenaExample, awardRanking, type FairEvent, type Standing } from "./arena-model";
import { summarizeFairResults } from "./arena-fair-results";

const person = (id: string, name = id) => ({ id, name });
function standing(id: string, position: number | null, sales = 100, eligible = true): Standing {
  return { id, name: id, value: sales, eligible, position, scoringPosition: position,
    scoringValue: sales, basePoints: 0, incentivePoints: 0, points: 0 };
}
function event(id: string, end: string, rows: Standing[], extra: Partial<FairEvent> = {}): FairEvent {
  return { id, label: id, venue: "Mid Valley", start: end, end, weekId: end, rows, ...extra };
}
const counters = ["first", "second", "third", "other", "unplaced", "pending", "fairCount"] as const;

describe("Fair placement history", () => {
  it("counts only each salesperson's four/five Fair appearances, not parallel company events", () => {
    for (const [month, fairs] of [[9, 4], [8, 5]]) {
      const example = arenaExample("monthly", String(month), "fair", "AKEMI");
      const summaries = summarizeFairResults(example.events, example.overall, example.info.cutoff);
      expect(example.events).toHaveLength(fairs * 5);
      expect(summaries).toHaveLength(26);
      expect(summaries.every(summary => summary.fairCount === fairs)).toBe(true);
      for (const summary of summaries) {
        expect(summary.first + summary.second + summary.third + summary.other + summary.unplaced + summary.pending).toBe(fairs);
      }
    }
    const september = arenaExample("monthly", "9", "fair", "AKEMI");
    const jia = summarizeFairResults(september.events, september.overall).find(row => row.id === "jia")!;
    expect(jia).toMatchObject({ first: 1, second: 2, third: 1, other: 0, pending: 0, unplaced: 0, fairCount: 4 });
    expect(jia.results.map(result => result.position)).toEqual([2, 2, 1, 3]);
  });

  it("adds monthly histories into quarters and years without inventing another period placement", () => {
    for (const [period, selection, months] of [
      ["quarterly", "3", [7, 8, 9]], ["annual", "2026", [1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ] as const) {
      const example = arenaExample(period, selection, "fair", "AKEMI");
      const periodRows = summarizeFairResults(example.events, example.overall, example.info.cutoff);
      const monthly = months.map(month => {
        const monthExample = arenaExample("monthly", String(month), "fair", "AKEMI");
        return summarizeFairResults(monthExample.events, monthExample.overall);
      });
      for (const row of periodRows) {
        for (const counter of counters) {
          expect(row[counter]).toBe(monthly.reduce((sum, rows) => sum + rows.find(person => person.id === row.id)![counter], 0));
        }
        expect(row).not.toHaveProperty("position");
        expect(row.results.map(result => result.start)).toEqual(row.results.map(result => result.start).sort());
      }
    }
  });

  it("keeps actual competition ties, skipped ranks and fourth-place results", () => {
    const rows = awardRanking([
      { ...person("a"), value: 100, eligible: true },
      { ...person("b"), value: 100, eligible: true },
      { ...person("c"), value: 80, eligible: true },
      { ...person("d"), value: 70, eligible: true },
    ]);
    const summaries = summarizeFairResults([event("tie", "2026-09-06", rows)], rows);
    expect(summaries.map(row => [row.id, row.first, row.second, row.third, row.other])).toEqual([
      ["a", 1, 0, 0, 0], ["b", 1, 0, 0, 0], ["c", 0, 0, 1, 0], ["d", 0, 0, 0, 1],
    ]);
    expect(summaries.flatMap(row => row.results).map(result => result.position)).toEqual([1, 1, 3, 4]);
  });

  it("distinguishes zero/ineligible appearances from missing or invalid positive results", () => {
    const rows = [standing("zero", 1, 0), standing("ineligible", 1, 100, false),
      standing("negative", 1, -100), standing("missing", null, Number.NaN),
      standing("infinite", 1, Number.POSITIVE_INFINITY), standing("no-position", null),
      standing("fraction", 1.5), standing("invalid-position", 0)];
    const summaries = summarizeFairResults([event("data", "2026-09-06", rows)], [...rows, person("absent")]);
    for (const id of ["zero", "ineligible", "negative"]) {
      expect(summaries.find(row => row.id === id)).toMatchObject({ unplaced: 1, pending: 0, fairCount: 1, first: 0 });
    }
    for (const id of ["missing", "infinite", "no-position", "fraction", "invalid-position"]) {
      expect(summaries.find(row => row.id === id)).toMatchObject({ pending: 1, unplaced: 0, fairCount: 1, first: 0 });
    }
    expect(summaries.find(row => row.id === "missing")!.results[0].sales).toBeNaN();
    expect(summaries.find(row => row.id === "absent")).toMatchObject({ fairCount: 0, results: [] });
    expect(summaries.every(row => row.results.every(result => result.position === null))).toBe(true);
  });

  it("excludes directors outside the roster and fairs that have not ended by the cutoff", () => {
    const summaries = summarizeFairResults([
      event("ended", "2026-09-06", [standing("seller", 2), standing("director", 1)]),
      event("ongoing", "2026-09-13", [standing("seller", 1)], { start: "2026-09-11" }),
    ], [person("seller")], "2026-09-06");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ id: "seller", second: 1, first: 0, fairCount: 1 });
    expect(summaries[0].results[0].position).toBe(2);
  });

  it("deduplicates repeated events and rows, merges distinct people, and flags conflicting placements", () => {
    const original = event("one", "2026-09-06", [standing("a", 2), standing("a", 2)]);
    const events = [original, { ...original, rows: [standing("a", 2), standing("b", 1)] },
      event("two", "2026-09-13", [standing("a", 1), standing("a", 3)]),
      event("three", "2026-09-20", [standing("a", 2, 100), standing("a", 2, 200)])];
    const snapshot = structuredClone(events);
    const summaries = summarizeFairResults(events, [person("a"), person("a"), person("b")]);
    expect(summaries).toHaveLength(2);
    expect(summaries.find(row => row.id === "a")).toMatchObject({ fairCount: 3, second: 1, pending: 2, first: 0, third: 0 });
    expect(summaries.find(row => row.id === "b")).toMatchObject({ fairCount: 1, first: 1 });
    expect(summaries.find(row => row.id === "a")!.results[2].sales).toBeNaN();
    expect(events).toEqual(snapshot);
  });

  it("sorts medal summaries by first/second/third count then name and keeps results chronological", () => {
    const summaries = summarizeFairResults([
      event("late", "2026-09-13", [standing("gold", 1), standing("silver", 2), standing("bronze", 3)]),
      event("early", "2026-09-06", [standing("gold", 3), standing("silver", 2)]),
    ], [person("bronze", "A"), person("silver", "Z"), person("gold", "Y"), person("z", "Zed"), person("a", "Ada")]);
    expect(summaries.map(row => row.id)).toEqual(["gold", "silver", "bronze", "a", "z"]);
    expect(summaries[0].results.map(result => result.eventId)).toEqual(["early", "late"]);
  });
});
