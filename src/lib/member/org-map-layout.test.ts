import { describe, expect, it } from "vitest";
import { NODE_HEIGHT, NODE_WIDTH } from "../org-layout";
import { FRAME_GAP, placeMap } from "./org-map-layout";
import type { MemberOrgDepartment, MemberOrgMap, MemberOrgPerson } from "./types";

const person = (
  id: string,
  departmentId: string,
  parentId: string | null,
  over: Partial<MemberOrgPerson> = {},
): MemberOrgPerson => ({
  id,
  staffId: id.split(":")[1] ?? id,
  departmentId,
  schemeId: `${departmentId}-scheme`,
  name: id.toUpperCase(),
  code: null,
  title: "Revenue Specialist",
  parentId,
  self: false,
  mine: true,
  ...over,
});
const department = (
  id: string,
  directors: { id: string; name: string }[] = [],
): MemberOrgDepartment => ({
  id,
  schemeId: `${id}-scheme`,
  name: id.toUpperCase(),
  code: id.toUpperCase(),
  capacity: null,
  mine: true,
  directors,
});
const map = (over: Partial<MemberOrgMap>): MemberOrgMap => ({
  asOf: "2026-09-12T00:00:00Z",
  departments: [],
  people: [],
  ...over,
});

describe("placeMap", () => {
  it("places a card for every person and never loses one", () => {
    const placed = placeMap(
      map({
        departments: [department("fair")],
        people: [
          person("f:a", "fair", null),
          person("f:b", "fair", "f:a"),
          person("f:c", "fair", "f:b"),
        ],
      }),
    );
    expect(placed.cards.map((c) => c.key).sort()).toEqual(["f:a", "f:b", "f:c"]);
    expect(placed.cards.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))).toBe(true);
  });

  it("stacks departments one below the next without overlapping", () => {
    const placed = placeMap(
      map({
        departments: [department("fair"), department("ir")],
        people: [person("f:a", "fair", null), person("i:a", "ir", null)],
      }),
    );
    const [fair, ir] = placed.frames;
    expect(ir.y).toBe(fair.y + fair.height + FRAME_GAP);
    expect(ir.y).toBeGreaterThan(fair.y + fair.height);
  });

  it("gives every frame the same width, so the map reads as one column", () => {
    const placed = placeMap(
      map({
        departments: [department("fair"), department("ir")],
        people: [
          person("f:a", "fair", null),
          person("f:b", "fair", null),
          person("f:c", "fair", null),
          person("i:a", "ir", null),
        ],
      }),
    );
    expect(new Set(placed.frames.map((f) => f.width)).size).toBe(1);
    expect(placed.width).toBe(placed.frames[0].width);
  });

  it("hangs the top of a tree under the first head and draws the second head's line dashed", () => {
    const placed = placeMap(
      map({
        departments: [
          department("fair", [
            { id: "peter", name: "Peter" },
            { id: "kris", name: "Kris" },
          ]),
        ],
        people: [person("f:a", "fair", null), person("f:b", "fair", "f:a")],
      }),
    );
    expect(placed.cards.filter((c) => c.director).map((c) => c.director?.name)).toEqual([
      "Peter",
      "Kris",
    ]);
    // Two lines reach the root — one per head — and both are derived.
    const toRoot = placed.lines.filter((l) => l.key.startsWith("f:a"));
    expect(toRoot).toHaveLength(2);
    expect(toRoot.every((l) => l.derived)).toBe(true);
    // A written reporting line is not derived.
    expect(placed.lines.find((l) => l.key === "f:b-line")?.derived).toBe(false);
  });

  it("draws each line from the bottom of the parent to the top of the child", () => {
    const placed = placeMap(
      map({
        departments: [department("fair")],
        people: [person("f:a", "fair", null), person("f:b", "fair", "f:a")],
      }),
    );
    const parent = placed.cards.find((c) => c.key === "f:a")!;
    const child = placed.cards.find((c) => c.key === "f:b")!;
    const line = placed.lines.find((l) => l.key === "f:b-line")!;
    expect(line.from).toEqual({ x: parent.x + NODE_WIDTH / 2, y: parent.y + NODE_HEIGHT });
    expect(line.to).toEqual({ x: child.x + NODE_WIDTH / 2, y: child.y });
  });

  it("places somebody whose upline is in another department rather than dropping them", () => {
    const placed = placeMap(
      map({
        departments: [department("fair"), department("ir")],
        people: [person("f:a", "fair", null), person("i:a", "ir", "f:a")],
      }),
    );
    expect(placed.cards.map((c) => c.key).sort()).toEqual(["f:a", "i:a"]);
    // No line is drawn across the department edge: there is no parent to draw to.
    expect(placed.lines).toHaveLength(0);
  });

  it("leaves a department with nobody in it as an empty frame", () => {
    const placed = placeMap(map({ departments: [department("fair")], people: [] }));
    expect(placed.cards).toHaveLength(0);
    expect(placed.frames).toHaveLength(1);
    expect(placed.frames[0].count).toBe(0);
    expect(placed.frames[0].height).toBeGreaterThan(NODE_HEIGHT);
  });

  it("is empty, and not negative, for a map with nothing in it", () => {
    const placed = placeMap(map({}));
    expect(placed).toMatchObject({ cards: [], frames: [], lines: [], width: 0, height: 0 });
  });

  it("keeps a person's two memberships as two separate cards", () => {
    const placed = placeMap(
      map({
        departments: [department("fair"), department("ir")],
        people: [
          person("fair-scheme:jia", "fair", null, { staffId: "jia" }),
          person("ir-scheme:jia", "ir", null, { staffId: "jia" }),
        ],
      }),
    );
    expect(placed.cards).toHaveLength(2);
    expect(placed.cards.every((c) => c.person?.staffId === "jia")).toBe(true);
    expect(placed.cards[0].departmentId).not.toBe(placed.cards[1].departmentId);
  });
});
