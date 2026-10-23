import { describe, expect, it } from "vitest";
import { personName } from "./crm-data";

// The owner, 2026-10-23: every person's name in the CRM with each word's first letter capital and the rest small.
describe("personName", () => {
  it("Title Cases names written in capitals or mixed", () => {
    expect(personName("Harm Hao Hong HECTOR")).toBe("Harm Hao Hong Hector");
    expect(personName("ANTHONY")).toBe("Anthony");
    expect(personName("LIM YAU WEI")).toBe("Lim Yau Wei");
    expect(personName("  wei shun ")).toBe("Wei Shun");
  });
  it("starts a word after a hyphen or an apostrophe, and leaves Chinese as it is", () => {
    expect(personName("NUR-AISYAH O'NEIL")).toBe("Nur-Aisyah O'Neil");
    expect(personName("陈伟 TAN")).toBe("陈伟 Tan");
  });
});
