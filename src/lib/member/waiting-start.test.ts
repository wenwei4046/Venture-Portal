import { describe, expect, it } from "vitest";
import { ANY_TIME, ANY_TIME_LABEL, isAnyTime, isDay, isJoiningDate, joiningLabel } from "./waiting-start";

// 2026-10-14, the user: some applicants are ready any time — "just wait us to let them join".
describe("a waiting list's joining date: a day, or any time", () => {
  it("is the word anytime — never one Postgres reads as a date", () => {
    expect(ANY_TIME).toBe("anytime");
    expect(["today", "now", "tomorrow", "infinity", "epoch"]).not.toContain(ANY_TIME);
    expect([isAnyTime("anytime"), isAnyTime("Anytime"), isAnyTime(""), isAnyTime(null), isAnyTime(undefined)]).toEqual([true, false, false, false, false]);
  });

  it("answers the question with a day the calendar has, or any time", () => {
    expect([isDay("2026-11-02"), isDay("2026-02-30"), isDay("2/11/2026"), isDay("")]).toEqual([true, false, false, false]);
    expect([isJoiningDate("anytime"), isJoiningDate("2026-11-02"), isJoiningDate("2026-02-30"), isJoiningDate("whenever"), isJoiningDate("")])
      .toEqual([true, true, false, false, false]);
  });

  it("reads as Any time ready, or the day as each place writes it", () => {
    const day = (d: string) => `day ${d}`;
    expect(joiningLabel("anytime", day)).toBe(ANY_TIME_LABEL);
    expect(ANY_TIME_LABEL).toBe("Any time ready");
    expect(joiningLabel("2026-11-02", day)).toBe("day 2026-11-02");
    expect(joiningLabel(null, day)).toBe("day ");
  });
});
