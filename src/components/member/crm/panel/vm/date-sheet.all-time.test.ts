// The owner, 2026-11-09: "把过去 30 days 删掉，变为所有时间" — the date sheet's presets.
import { describe, expect, it } from "vitest";
import { dateSheetVM } from "./common";

describe("the date sheet", () => {
  it("offers All time in place of Last 30 days, from the first lead to today", () => {
    const now = new Date(2026, 10, 9, 10);
    const ui = { period: "month", ovRange: null, cmp: null, ovSheet: { a: 0, b: 0, per: "month", ca: null, cb: null, tab: "a", only: true, cm: [2026, 10], step: 0 } };
    let got: unknown = null;
    const ctx = { ui, now, patch: () => {}, set: (f: (u: typeof ui) => typeof ui) => { got = f(ui).ovSheet; },
      data: { customers: [{ createdAt: "2026-09-20T03:00:00Z" }, { createdAt: "2026-10-02T03:00:00Z" }] } } as never;
    const v = dateSheetVM(ctx);
    const labels = v.ovrPresets.map(p => p.label);
    expect(labels).toEqual(["Today", "This week", "This month", "Last 7 days", "All time", "Last month"]);
    v.ovrPresets.find(p => p.label === "All time")!.pick();
    expect(new Date((got as { a: number }).a).toDateString()).toBe(new Date(2026, 8, 20).toDateString());
  });
});
