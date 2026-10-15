/** The pie's slices (Contacts' and the Calendar's analysis, 2026-10-15). */
import { describe, expect, it } from "vitest";
import { pieSlices } from "./people";

describe("pieSlices", () => {
  it("shares add up and small slices keep their label out", () => {
    const s = pieSlices([{ label: "A", n: 3, color: "#1" }, { label: "B", n: 1, color: "#2" }, { label: "C", n: 0.1, color: "#3" }], 4.1);
    expect(s.map(x => x.pct)).toEqual(["73.2%", "24.4%", "2.4%"]);
    expect(s.map(x => x.showPct)).toEqual([true, true, false]);
    expect(s[0].d.startsWith("M 100 100 L")).toBe(true);
  });
  it("one value fills the circle with its label in the middle", () => {
    const [s] = pieSlices([{ label: "All", n: 5, color: "#1" }], 5);
    expect(s.pct).toBe("100.0%");
    expect([s.x, s.y]).toEqual(["100", "100"]);
    expect(s.d).toContain(" A 100 100 0 1 1 ");
  });
});
