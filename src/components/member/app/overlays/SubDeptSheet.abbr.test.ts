import { describe, expect, it } from "vitest";
import { subDeptAbbr } from "./SubDeptSheet";

// The user, 2026-11-17, Dream Crafter's chip reading "DR": "应该是DC，不是DR".
describe("a sub-department's chip", () => {
  it("takes each word's first letter when the name has two words or more", () => {
    expect(subDeptAbbr("Dream Crafter")).toBe("DC");
    expect(subDeptAbbr("dream  crafter design")).toBe("DC");
  });

  it("takes the first two letters of a one-word name, as before", () => {
    expect(subDeptAbbr("Fair")).toBe("FA");
    expect(subDeptAbbr("IR")).toBe("IR");
  });
});
