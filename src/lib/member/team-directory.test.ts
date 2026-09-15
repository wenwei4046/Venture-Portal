import { describe, expect, it } from "vitest";
import { selectOwnTeam } from "./team-directory";

interface Person {
  id: string;
  parentId: string | null;
  self?: boolean;
  schemeId?: string;
  departmentId?: string;
  staffId?: string;
  mine?: boolean;
}

const ids = (people: readonly Person[]) => selectOwnTeam(people).map((person) => person.id);

describe("member directory own-team scope", () => {
  it("includes self and all descendants, but excludes ancestors, siblings and cousins even when mine", () => {
    const people: Person[] = [
      { id: "grandchild", parentId: "child", mine: true },
      { id: "manager", parentId: null, mine: true },
      { id: "self", parentId: "manager", self: true, mine: true },
      { id: "sibling", parentId: "manager", mine: true },
      { id: "cousin", parentId: "sibling", mine: true },
      { id: "child", parentId: "self", mine: false },
      { id: "outsider", parentId: null, mine: true },
    ];
    expect(ids(people)).toEqual(["grandchild", "self", "child"]);
  });

  it("uses distinct membership IDs rather than joining the same staff across schemes", () => {
    const people: Person[] = [
      { id: "fair:self", parentId: null, self: true, staffId: "me", schemeId: "fair", departmentId: "revenue-fair" },
      { id: "fair:child", parentId: "fair:self", staffId: "seller", schemeId: "fair", departmentId: "revenue-fair" },
      { id: "ir:child", parentId: "ir:leader", staffId: "seller", schemeId: "ir", departmentId: "revenue-ir", mine: true },
      { id: "ir:grandchild", parentId: "ir:child", schemeId: "ir", departmentId: "revenue-ir" },
      { id: "bad-scheme", parentId: "fair:self", schemeId: "ir", departmentId: "revenue-fair" },
      { id: "bad-department", parentId: "fair:self", schemeId: "fair", departmentId: "revenue-ir" },
    ];
    expect(ids(people)).toEqual(["fair:self", "fair:child"]);
  });

  it("includes separate self memberships and their own branches in multiple departments", () => {
    const people: Person[] = [
      { id: "fair:self", parentId: "fair:boss", self: true, staffId: "me", schemeId: "fair", departmentId: "fair" },
      { id: "ir:self", parentId: "ir:boss", self: true, staffId: "me", schemeId: "ir", departmentId: "ir" },
      { id: "fair:child", parentId: "fair:self", schemeId: "fair", departmentId: "fair" },
      { id: "ir:child", parentId: "ir:self", schemeId: "ir", departmentId: "ir" },
      { id: "other:child", parentId: "ir:boss", schemeId: "ir", departmentId: "ir", mine: true },
    ];
    expect(ids(people)).toEqual(["fair:self", "ir:self", "fair:child", "ir:child"]);
  });

  it("does not bridge a known membership scope through nodes with missing scope metadata", () => {
    const people: Person[] = [
      { id: "self", parentId: null, self: true, schemeId: "fair", departmentId: "fair-dept" },
      { id: "child", parentId: "self" },
      { id: "valid-grandchild", parentId: "child", schemeId: "fair", departmentId: "fair-dept" },
      { id: "foreign-scheme", parentId: "child", schemeId: "ir" },
      { id: "foreign-department", parentId: "child", departmentId: "ir-dept" },
    ];
    expect(ids(people)).toEqual(["self", "child", "valid-grandchild"]);
  });

  it("fails closed on cycles while retaining an independent legitimate branch", () => {
    const people: Person[] = [
      { id: "cycle-self", parentId: "cycle-child", self: true },
      { id: "cycle-child", parentId: "cycle-self" },
      { id: "below-cycle", parentId: "cycle-child" },
      { id: "single-cycle", parentId: "single-cycle", self: true },
      { id: "self", parentId: null, self: true },
      { id: "child", parentId: "self" },
    ];
    expect(ids(people)).toEqual(["self", "child"]);
  });

  it("quarantines duplicate IDs and their ambiguous branches", () => {
    const people: Person[] = [
      { id: "duplicate-self", parentId: null, self: true, schemeId: "fair" },
      { id: "duplicate-self", parentId: null, self: true, schemeId: "ir" },
      { id: "ambiguous-root-child", parentId: "duplicate-self" },
      { id: "self", parentId: null, self: true },
      { id: "duplicate-child", parentId: "self" },
      { id: "duplicate-child", parentId: "outsider" },
      { id: "ambiguous-grandchild", parentId: "duplicate-child" },
      { id: "valid-child", parentId: "self" },
    ];
    expect(ids(people)).toEqual(["self", "valid-child"]);
  });

  it("returns empty without self and never invents paths through missing ancestors", () => {
    expect(ids([])).toEqual([]);
    expect(ids([{ id: "mine", parentId: null, mine: true }])).toEqual([]);
    expect(ids([
      { id: "self", parentId: "outside-view", self: true },
      { id: "child", parentId: "self" },
      { id: "orphan", parentId: "missing-middle", mine: true },
    ])).toEqual(["self", "child"]);
  });

  it("preserves input order and original objects without mutating a readonly tree", () => {
    const child = Object.freeze({ id: "child", parentId: "self", name: "Child" });
    const self = Object.freeze({ id: "self", parentId: null, self: true, name: "Self" });
    const people = Object.freeze([child, self]);
    const selected = selectOwnTeam(people);
    expect(selected).toEqual([child, self]);
    expect(selected[0]).toBe(child);
    expect(selected[1]).toBe(self);
    expect(selected).not.toBe(people);
  });
});
