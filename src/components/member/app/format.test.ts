import { describe, expect, it } from "vitest";
import { initials } from "./format";

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
