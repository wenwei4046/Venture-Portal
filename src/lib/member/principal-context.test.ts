import { describe, expect, it } from "vitest";
import { selectViewedBranch } from "./principal-context";

type Person = { id: string; parentId: string | null; departmentId?: string; schemeId?: string; self: boolean };
const person = (id: string, parentId: string | null, overrides: Partial<Person> = {}): Person => ({
  id, parentId, departmentId: "fair", schemeId: "fair-current", self: false, ...overrides,
});
const ids = (people: Person[], root: string) => selectViewedBranch(people, root).map(row => row.id);

describe("Principal viewed reporting branch", () => {
  it("includes the selected member and all descendants, excluding their parent, peers and peer branches", () => {
    const people = [person("parent", null), person("root", "parent"), person("child", "root"),
      person("grandchild", "child"), person("peer", "parent"), person("peer-child", "peer")];
    expect(ids(people, "root")).toEqual(["root", "child", "grandchild"]);
    expect(ids(people, "missing")).toEqual([]);
  });

  it("does not follow a link across a department or scheme even when it points at the selected root", () => {
    const people = [person("root", null), person("child", "root"),
      person("foreign-department", "root", { departmentId: "ir" }),
      person("foreign-scheme", "root", { schemeId: "fair-old" }),
      person("missing-scope", "root", { schemeId: undefined }),
      person("foreign-child", "foreign-department")];
    expect(ids(people, "root")).toEqual(["root", "child"]);
  });

  it("supports the single-department fallback roster that has no explicit scope fields", () => {
    const people = [person("root", null), person("child", "root"), person("peer", null)]
      .map(({ id, parentId, self }) => ({ id, parentId, self }));
    expect(ids(people, "root")).toEqual(["root", "child"]);
  });

  it("rejects an ambiguous root and excludes duplicated child memberships plus their descendants", () => {
    expect(ids([person("root", null), person("root", null), person("child", "root")], "root")).toEqual([]);
    const people = [person("root", null), person("child", "root"), person("child", "elsewhere"),
      person("grandchild", "child"), person("valid", "root")];
    expect(ids(people, "root")).toEqual(["root", "valid"]);
  });

  it("fails closed for a selected root inside a cycle but retains valid branches outside the loop", () => {
    expect(ids([person("root", "root")], "root")).toEqual([]);
    const people = [person("loop-a", "loop-b"), person("loop-b", "loop-a"),
      person("root", "loop-a"), person("child", "root")];
    expect(ids(people, "loop-a")).toEqual([]);
    expect(ids(people, "root")).toEqual(["root", "child"]);
  });

  it("preserves input records and their self flags without treating the viewed root as the caller", () => {
    const people = [person("root", null), person("child", "root", { self: true })];
    const original = structuredClone(people);
    const result = selectViewedBranch(people, "root");
    expect(result).toEqual(original);
    expect(people).toEqual(original);
    expect(result[0]).toBe(people[0]);
    expect(result[0].self).toBe(false);
    expect(result[1].self).toBe(true);
  });
});
