import { describe, expect, it } from "vitest";
import type { MemberHonours } from "@/lib/member/server";
import { honourWindow, honoursVM } from "./honours-model";

type Finish = MemberHonours["finishes"][number];
const f = (period: string, place: number, board: Finish["board"] = "Sales", title = "Total sales"): Finish => ({ period, board, title, sub: period, place });

describe("honourWindow", () => {
  it("compares a month with the one before, across the year end", () => {
    expect(honourWindow("monthly", "2026-01")).toMatchObject({ months: ["2026-01"], prev: ["2025-12"], label: "Jan 2026", prevLabel: "Dec" });
  });

  it("compares a quarter with the one before", () => {
    expect(honourWindow("quarterly", "2026-08")).toMatchObject({ months: ["2026-07", "2026-08", "2026-09"], prev: ["2026-04", "2026-05", "2026-06"], label: "Q3 2026", prevLabel: "Q2" });
    expect(honourWindow("quarterly", "2026-02")).toMatchObject({ prev: ["2025-10", "2025-11", "2025-12"], prevLabel: "Q4" });
  });

  it("gives a year all twelve months and nothing to compare with", () => {
    const w = honourWindow("annual", "2026-01");
    expect(w.months).toHaveLength(12);
    expect(w).toMatchObject({ prev: [], label: "2026", prevLabel: null });
  });
});

describe("honoursVM", () => {
  it("counts the podium and every place, and compares with a period that is over", () => {
    const vm = honoursVM({ finishes: [f("2026-09", 1), f("2026-09", 2, "Margin", "Total margin"), f("2026-09", 5), f("2026-08", 3)], final: ["2026-08", "2026-09"], empty: [] },
      "monthly", "2026-09", "2026-10", "Fair");
    expect(vm).toMatchObject({ periodLabel: "Sep 2026", eyebrow: "SEP 2026 · YOUR PODIUM", podiums: 2, finishes: 3, delta: "+1 vs Aug", notice: null });
    expect(vm.podium).toEqual({ gold: 1, silver: 1, bronze: 0 });
    expect(vm.places.map(p => [p.label, p.count, p.unit])).toEqual([["1st place", 1, "time"], ["2nd place", 1, "time"], ["5th place", 1, "time"]]);
    expect(vm.sheets[2]).toEqual({ title: "2nd place · 1 time", items: [{ title: "Total margin", sub: "2026-09", board: "Margin" }] });
  });

  it("says nothing against a period nobody sold in — Fair's first bills are June's", () => {
    const data = { finishes: [f("2026-06", 1)], final: ["2026-05", "2026-06"], empty: ["2026-05"] };
    expect(honoursVM(data, "monthly", "2026-06", "2026-10", "Fair").delta).toBeNull();
    // Q2 has June's bills, so Q3 is compared with it.
    const q = { finishes: [f("2026-06", 1), f("2026-07", 1), f("2026-08", 2)], final: ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"], empty: ["2026-04", "2026-05"] };
    expect(honoursVM(q, "quarterly", "2026-07", "2026-10", "Fair").delta).toBe("+1 vs Q2");
  });

  it("says nothing against a period still being closed", () => {
    // Q4 is settled, but September of Q3 is not.
    const data = { finishes: [f("2026-07", 1), f("2026-10", 1)], final: ["2026-07", "2026-08", "2026-10", "2026-11", "2026-12"], empty: [] };
    expect(honoursVM(data, "quarterly", "2026-10", "2027-01", "Fair").delta).toBeNull();
  });

  it("compares nothing while this period is itself still open", () => {
    // September not closed yet: "-1 vs Aug" would count medals not yet awarded.
    const data = { finishes: [f("2026-08", 1)], final: ["2026-08"], empty: [] };
    expect(honoursVM(data, "monthly", "2026-09", "2026-10", "Fair").delta).toBeNull();
  });

  it("highlights the best place, then the board that matters most, then the latest", () => {
    const vm = honoursVM({ finishes: [f("2026-07", 1), f("2026-08", 1, "Championship", "Championship"), f("2026-09", 2, "Fair", "Fair · HALL")],
      final: ["2026-07", "2026-08", "2026-09"], empty: [] }, "quarterly", "2026-07", "2026-10", "Fair");
    expect(vm.highlight).toBe("1st · Championship · 2026-08");
  });

  it("says which months are still open when there is nothing to show yet", () => {
    expect(honoursVM({ finishes: [], final: [], empty: [] }, "monthly", "2026-09", "2026-10", "Fair").notice)
      .toBe("Sep 2026 is still open. Honours are awarded once everyone in Fair is closed for the month.");
    expect(honoursVM({ finishes: [], final: ["2026-07", "2026-08"], empty: [] }, "quarterly", "2026-07", "2026-10", "Fair").notice)
      .toBe("Sep 2026 is still open. Honours are awarded once everyone in Fair is closed for the month.");
    expect(honoursVM({ finishes: [], final: ["2026-08"], empty: [] }, "monthly", "2026-08", "2026-10", "Fair").notice).toBe("No finishes in Aug 2026.");
  });

  it("calls this year's annual view to date", () => {
    const vm = honoursVM({ finishes: [f("2026-08", 1)], final: ["2026-08"], empty: [] }, "annual", "2026-01", "2026-10", "Fair");
    expect(vm).toMatchObject({ periodLabel: "2026 to date", eyebrow: "2026 SO FAR · YOUR PODIUM", delta: null });
  });
});
