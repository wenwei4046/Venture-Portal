import { describe, expect, it } from "vitest";
import { allocatedWeeks, isValidBrandWeeks, type MonthlyBrandWeeks } from "./arena-brand-weeks";

describe("self-reported monthly brand weeks", () => {
  const valid: MonthlyBrandWeeks = { weeks: 4, counts: { AKEMI: 1, ERGOTEX: 0, ZANOTTI: 3, DUNLOP: 0 } };

  it("accepts a complete manual four- or five-week allocation, including zero brand counts", () => {
    expect(isValidBrandWeeks(valid)).toBe(true);
    expect(allocatedWeeks(valid)).toBe(4);
    const five: MonthlyBrandWeeks = { weeks: 5, counts: { ...valid.counts, AKEMI: 2 } };
    expect(isValidBrandWeeks(five)).toBe(true);
    expect(allocatedWeeks(five)).toBe(5);
  });

  it("rejects incomplete, fractional, negative or overbooked weeks and unknown brands", () => {
    for (const value of [
      null, [], {}, { ...valid, weeks: 3 }, { ...valid, weeks: "4" },
      { ...valid, counts: { ...valid.counts, AKEMI: 0 } },
      { ...valid, counts: { ...valid.counts, AKEMI: 2 } },
      { ...valid, counts: { ...valid.counts, AKEMI: .5, ZANOTTI: 3.5 } },
      { ...valid, counts: { ...valid.counts, AKEMI: -1, ZANOTTI: 5 } },
      { ...valid, counts: { ...valid.counts, AKEMI: Number.NaN } },
      { ...valid, counts: { ...valid.counts, AKEMI: Number.POSITIVE_INFINITY } },
      { ...valid, counts: { ...valid.counts, AKEMI: "1" } },
      { ...valid, counts: { AKEMI: 1, ZANOTTI: 3 } },
      { ...valid, counts: { ...valid.counts, OTHER: 0 } },
    ]) expect(isValidBrandWeeks(value)).toBe(false);
  });
});
