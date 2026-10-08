import { describe, expect, it } from "vitest";
import type { MemberBand } from "@/lib/member/types";
import { brandLadder, rowFor } from "./ladder";

// comm_margin_bands as the Fair scheme holds them on 2026-10-04.
const band = (brand: string, key: string, kind: MemberBand["kind"], threshold: number, multiplier = 1, amount = 0): MemberBand =>
  ({ brand, key, kind, threshold, multiplier, amount });
const AKEMI: MemberBand[] = [
  band("AKEMI", "Below margin Tier 3", "penalty", 24, 0),
  band("AKEMI", "Below margin Tier 2", "penalty", 25, 0.25),
  band("AKEMI", "Below margin Tier 1", "penalty", 27, 0.5),
  band("AKEMI", "Low margin", "reference", 30),
  band("AKEMI", "Standard margin", "reference", 33),
  band("AKEMI", "Incentive Tier 1", "incentive", 36, 1, 1000),
  band("AKEMI", "Incentive Tier 2", "incentive", 43, 1, 1500),
];
const DUNLOP: MemberBand[] = [
  band("DUNLOP", "Below margin Tier 3", "penalty", 24, 0),
  band("DUNLOP", "Below margin Tier 2", "penalty", 25, 0.25),
  band("DUNLOP", "Below margin Tier 1", "penalty", 27, 0.5),
  band("DUNLOP", "Standard Margin", "reference", 30),
  band("DUNLOP", "Incentive Tier 1", "incentive", 33, 1, 1000),
  band("DUNLOP", "Incentive Tier 2", "incentive", 36, 1, 1500),
];

describe("brandLadder", () => {
  it("draws Akemi's seven rows the prototype drew, from the bands", () => {
    const l = brandLadder(AKEMI);
    expect(l.rows.map(r => [r.label, r.range, r.effect])).toEqual([
      ["Incentive Tier 2", "43% +", "Highest margin incentive"],
      ["Incentive Tier 1", "36 – 43%", "Margin incentive"],
      ["Standard margin", "33 – 36%", "Normal commission"],
      ["Low margin", "27 – 33%", "Normal commission · watch closely"],
      ["Below margin Tier 1", "25 – 27%", "Commission × 0.5"],
      ["Below margin Tier 2", "24 – 25%", "Commission × 0.25"],
      ["Below margin Tier 3", "24% or lower", "No commission"],
    ]);
    expect(l.rows.map(r => r.tone)).toEqual(["good", "good", "neutral", "warn", "bad", "bad", "bad"]);
    // the prototype's bar: 20–24, 24–27, 27–33, 33–36, 36–43, 43–48
    expect(l.zones.map(z => z.flex)).toEqual([4, 3, 6, 3, 7, 5]);
    expect(l.markers.map(m => m.label)).toEqual(["T1 36%", "T2 43%"]);
  });

  it("gives Dunlopillo its own thresholds and its one reference row", () => {
    const l = brandLadder(DUNLOP);
    expect(l.rows.map(r => [r.label, r.range])).toEqual([
      ["Incentive Tier 2", "36% +"],
      ["Incentive Tier 1", "33 – 36%"],
      ["Standard Margin", "27 – 33%"],
      ["Below margin Tier 1", "25 – 27%"],
      ["Below margin Tier 2", "24 – 25%"],
      ["Below margin Tier 3", "24% or lower"],
    ]);
    expect(l.rows[2].effect).toBe("Normal commission · watch closely");
    expect(l.zones.map(z => z.flex)).toEqual([4, 3, 6, 3, 12]);
    expect(l.markers.map(m => m.label)).toEqual(["T1 33%", "T2 36%"]);
  });
});

describe("rowFor — the run's band rule", () => {
  const akemi = brandLadder(AKEMI);
  const dunlop = brandLadder(DUNLOP);
  it.each([
    [44.1, "Incentive Tier 2"], [43, "Incentive Tier 2"], [38.2, "Incentive Tier 1"], [34, "Standard margin"],
    [31, "Low margin"], [28, "Low margin"], [27, "Below margin Tier 1"], [24.5, "Below margin Tier 2"], [24, "Below margin Tier 3"], [-5, "Below margin Tier 3"],
  ])("Akemi %s%% reads as %s", (m, label) => expect(rowFor(m, akemi)?.label).toBe(label));
  it("reads the same margin differently on another brand's ladder", () => {
    expect(rowFor(34, dunlop)?.label).toBe("Incentive Tier 1");
    expect(rowFor(30.5, dunlop)?.label).toBe("Standard Margin");
    expect(rowFor(28, dunlop)?.label).toBe("Standard Margin");
  });
  it("has no row without a margin or without a ladder", () => {
    expect(rowFor(null, akemi)).toBeNull();
    expect(rowFor(40, brandLadder([]))).toBeNull();
  });
});
