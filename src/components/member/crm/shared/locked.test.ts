import { describe, expect, it } from "vitest";
import { sharedOut } from "./locked";

describe("a locked member's share", () => {
  it("goes to the others in proportion", () => {
    expect(sharedOut({ a: 20, b: 20, c: 20, d: 20, e: 20 }, ["a", "b", "c", "d"], true)).toEqual({ a: 25, b: 25, c: 25, d: 25 });
    expect(sharedOut({ a: 50, b: 30, c: 20 }, ["a", "b"], true)).toEqual({ a: 63, b: 37 });
  });
  it("leaves a team with nobody locked, or already at 100, as it is", () => {
    expect(sharedOut({ a: 50, b: 50 }, ["a", "b"], false)).toBeNull();
    expect(sharedOut({ a: 60, b: 40, c: 0 }, ["a", "b"], true)).toBeNull();
    expect(sharedOut({}, ["a"], true)).toBeNull();
  });
});
