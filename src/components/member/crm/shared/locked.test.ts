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

describe("Active members saves on Save", () => {
  it("a switch changes the draft; Save writes only what changed; Cancel drops it", async () => {
    const { activeVM } = await import("./locked");
    let draft: Record<string, boolean> | null = null;
    const calls: [string, boolean][] = [], told: string[] = [];
    const build = () => activeVM([{ name: "Team A", color: "#000", people: [{ id: "a", name: "Ann" }, { id: "b", name: "Bob" }] }], new Set(["b"]), () => "RS",
      draft, d => { draft = d; }, async (id, on) => { calls.push([id, on]); return true; }, m => told.push(m));
    expect(build().dirty).toBe(false);
    build().groups[0].people[0].toggle();
    const v = build();
    expect(v.groups[0].people[0].active).toBe(false);
    expect(v.groups[0].count).toBe("0 of 2 active");
    expect(v.dirty).toBe(true);
    expect(calls).toEqual([]);
    v.save();
    await new Promise(r => setTimeout(r, 0));
    expect(calls).toEqual([["a", true]]);
    expect(draft).toBeNull();
    expect(told).toEqual(["Saved · Active members"]);
    build().groups[0].people[1].toggle(); build().cancel();
    expect(draft).toBeNull();
  });
});
