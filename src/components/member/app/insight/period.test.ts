import { describe, expect, it } from "vitest";
import { addMonths, isLiveMonth, periodOf, periodOptions, workingMonth } from "./period";

const open = { paysFrom: "2026-09", closed: [] as string[] };

describe("which months are live", () => {
  it("keeps a paying month live until it is closed for the member", () => {
    expect(isLiveMonth("2026-10", "2026-10", open)).toBe(true);
    expect(isLiveMonth("2026-09", "2026-10", open)).toBe(true);
    expect(isLiveMonth("2026-09", "2026-10", { ...open, closed: ["2026-09"] })).toBe(false);
  });
  it("never calls a month settled by hand live", () => {
    expect(isLiveMonth("2026-08", "2026-10", open)).toBe(false);
    expect(isLiveMonth("2026-09", "2026-10", { paysFrom: null, closed: [] })).toBe(false);
  });
});

describe("the month the app opens on", () => {
  it("is September on 4 October while September is being closed and holds bills", () => {
    expect(workingMonth("2026-10", open, ["2026-09", "2026-10"])).toBe("2026-09");
  });
  it("moves on once the member is closed for it", () => {
    expect(workingMonth("2026-10", { ...open, closed: ["2026-09"] }, ["2026-09", "2026-10"])).toBe("2026-10");
  });
  it("is this month for somebody with nothing last month", () => {
    expect(workingMonth("2026-10", open, ["2026-10"])).toBe("2026-10");
  });
});

describe("the date sheet", () => {
  it("lists this year's months with every open one Live", () => {
    const options = periodOptions("monthly", "2026-10", open);
    expect(options).toHaveLength(10);
    expect(options.map(o => o.sub).slice(-3)).toEqual(["2026", "Live", "Live"]);
    expect(options[8].period.label).toBe("Sep 2026");
  });
  it("lists the quarters so far and two years", () => {
    expect(periodOptions("quarterly", "2026-10", open).map(o => [o.period.short, o.sub])).toEqual([["Q1", "2026"], ["Q2", "2026"], ["Q3", "2026"], ["Q4", "Live"]]);
    expect(periodOptions("annual", "2026-10", open).map(o => [o.period.short, o.sub])).toEqual([["2025", ""], ["2026", "Live"]]);
  });
  it("never reads past the current month", () => {
    expect(periodOf("quarterly", "2026-10", "2026-10")).toMatchObject({ from: "2026-10", through: "2026-10", label: "Q4 2026" });
    expect(periodOf("annual", "2026-09", "2026-10")).toMatchObject({ from: "2026-01", through: "2026-10" });
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});
