import { describe, expect, it } from "vitest";
import { titleName } from "./names";

// v2 › note 03: people and teams in Title Case, Chinese as written.
describe("titleName", () => {
  it("turns ALL CAPS names into Title Case", () => {
    expect(titleName("Team ANTHONY")).toBe("Team Anthony");
    expect(titleName("Harm Hao Hong HECTOR")).toBe("Harm Hao Hong Hector");
    expect(titleName("LIM YAU WEI")).toBe("Lim Yau Wei");
    expect(titleName("o'neil")).toBe("O'neil");
    expect(titleName("Vivian 钰然")).toBe("Vivian 钰然");
  });
});
