import { describe, expect, it } from "vitest";
import { ALL, feeMonths, feeTier, marketingFee } from "./adsperf";

describe("the Revenue Team's marketing fee", () => {
  it("is the owner's three samples", () => {
    expect(marketingFee(10_000)).toBe(2_500); // the minimum
    expect(marketingFee(20_000)).toBe(5_000); // 25%
    expect(marketingFee(50_000)).toBe(11_500); // 7,500 (25% of 30k) + 4,000 (20% of 20k)
  });
  it("stacks the ladder at RM 30,000", () => {
    expect(marketingFee(30_000)).toBe(7_500);
    expect(marketingFee(30_001)).toBeCloseTo(7_500.2, 5);
  });
  it("is nothing with nothing spent, unknown when the spend is", () => {
    expect(marketingFee(0)).toBe(0);
    expect(marketingFee(null)).toBeNull();
  });
  it("names the tier a month's spend has reached, and the spend to the next", () => {
    expect(feeTier(3_151.85)).toMatchObject({ tier: { n: 1 }, toNext: 6_848.15 });
    expect(feeTier(10_000)).toMatchObject({ tier: { n: 2 }, toNext: 20_000 });
    expect(feeTier(30_000)).toMatchObject({ tier: { n: 2 }, toNext: 0 });
    expect(feeTier(50_000)).toMatchObject({ tier: { n: 3 }, toNext: null });
  });
  it("bills by the calendar month: a week shows its month, two months two bills, never a month to come", () => {
    const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime(), today = d(2026, 11, 12);
    expect(feeMonths(d(2026, 11, 9), d(2026, 11, 12), today)).toEqual([[d(2026, 11, 1), today]]);
    expect(feeMonths(d(2026, 10, 14), d(2026, 11, 12), today)).toEqual([[d(2026, 10, 1), d(2026, 10, 31)], [d(2026, 11, 1), today]]);
    expect(feeMonths(d(2025, 12, 20), d(2026, 1, 5), today)).toEqual([[d(2025, 12, 1), d(2025, 12, 31)], [d(2026, 1, 1), d(2026, 1, 31)]]);
  });
  it("is the overview's alone — never an ad's column", () => {
    const keys = ALL.map(m => m[0]);
    expect(keys).not.toContain("mktfee");
    expect(keys).not.toContain("totalcost");
  });
});
