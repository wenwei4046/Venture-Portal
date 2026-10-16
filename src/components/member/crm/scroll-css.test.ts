import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A list that scrolls one way keeps only THAT way to itself (2026-10-16, the owner: "Android 的 Team inbox 是不能左右滑動"):
// `overscroll-behavior: contain` on both axes, given to every up-and-down list, kept Android's Chrome from handing a
// sideways swipe begun on a Team inbox column to the board around it.
const css = readFileSync(resolve(__dirname, "crm.module.css"), "utf8");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1], body: m[2] }));

describe("each scroller contains its own direction only", () => {
  it("an up-and-down list contains only y, a sideways one only x", () => {
    const y = rules.filter(r => /overflow-y: ?auto/.test(r.sel));
    const x = rules.filter(r => /overflow-x: ?auto/.test(r.sel));
    expect(y.length).toBeGreaterThan(0);
    expect(x.length).toBeGreaterThan(0);
    for (const r of y) { expect(r.body).toMatch(/overscroll-behavior-y: contain/); expect(r.body).not.toMatch(/overscroll-behavior: contain/); }
    for (const r of x) { expect(r.body).toMatch(/overscroll-behavior-x: contain/); expect(r.body).not.toMatch(/overscroll-behavior: contain/); }
  });
});
