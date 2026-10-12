import { describe, expect, it } from "vitest";
import { dayList, initials, weekdayShort } from "./format";

describe("initials — as the prototype writes them", () => {
  it("takes the first word's letter and the last's", () => {
    expect(initials("Jia Hui Tan")).toBe("JT");
    expect(initials("ETHAN LIM")).toBe("EL");
    expect(initials("  chea   huan ")).toBe("CH");
  });

  it("gives one word its first two letters, and an empty name none", () => {
    expect(initials("Principal")).toBe("PR");
    expect(initials("")).toBe("");
  });
});

describe("a food claim's days (2026-10-13)", () => {
  it("lists them by month, in order", () => {
    expect(dayList(["2026-10-11", "2026-10-09", "2026-10-10"])).toBe("9, 10, 11 Oct");
    expect(dayList(["2026-11-01", "2026-10-30", "2026-10-31"])).toBe("30, 31 Oct, 1 Nov");
    expect(dayList(["2026-10-09"])).toBe("9 Oct");
    expect(dayList([])).toBe("");
  });

  it("names a day's weekday", () => {
    expect(["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"].map(weekdayShort)).toEqual(["Fri", "Sat", "Sun", "Mon"]);
  });
});
