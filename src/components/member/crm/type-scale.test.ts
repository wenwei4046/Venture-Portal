import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { typePx } from "./shared/type";

// The CRM's type is the Revenue app's (2026-10-14, the owner: "把 CRM 里面的字体大小改得跟 Revenue Apps 一样"): every size
// on the phone's screens is the prototype's own px times --rv-type (.92 on a phone, 1 on a desktop — the Revenue app's
// shell.module.css, which the CRM sits in), no text pushed under 10px by it, a size drawn under 10px left as drawn. The
// generated screens get it from tools/crm-design/type-scale.cjs, the hand-written parts from shared/type.ts › typePx. The
// desktop CRM (desk/) keeps the prototype's sizes, as the Revenue app's desktop does.

// Vitest runs from the repository root.
const CRM = resolve(process.cwd(), "src/components/member/crm");
const read = (rel: string) => readFileSync(join(CRM, rel), "utf8");
const dir = (rel: string) => readdirSync(join(CRM, rel)).map(f => `${rel}/${f}`);
const scaleType = createRequire(import.meta.url)(resolve(process.cwd(), "tools/crm-design/type-scale.cjs")) as { typePx: (n: string) => string };

// The phone's screens: generated (gen-sales.cjs, gen-panel-1011.cjs) and the hand-written parts they mount.
const GENERATED = [...dir("sales").filter(f => /\/Sales[A-Z]\w*\.tsx$/.test(f) && !f.endsWith("SalesScreens.tsx")), "panel/PanelApp.tsx"];
const HAND = [...dir("shared").filter(f => f.endsWith(".tsx") && !f.includes(".test.")), "sales/SalesScreens.tsx", "panel/PanelScreens.tsx", "CrmApp.tsx"];

const literals = (rel: string) => [...read(rel).matchAll(/fontSize: "([^"]+)"/g)].map(m => ({ rel, value: m[1] }));
const SCALED = /^calc\((\d*\.?\d+)px \* var\(--rv-type, 1\)\)$/;
const FLOORED = /^max\(10px, calc\((\d*\.?\d+)px \* var\(--rv-type, 1\)\)\)$/;
const SMALL = /^(\d*\.?\d+)px$/;

describe("the CRM's type scale", () => {
  it("finds the phone's screens (the scan itself works)", () => {
    expect(GENERATED).toEqual(expect.arrayContaining(["sales/SalesInbox.tsx", "sales/SalesChat.tsx", "panel/PanelApp.tsx"]));
    expect(HAND).toEqual(expect.arrayContaining(["shared/msg-menu.tsx", "shared/pick-editor.tsx", "sales/SalesScreens.tsx"]));
    expect(GENERATED.flatMap(literals).length).toBeGreaterThan(500);
  });

  it("writes every size of a generated screen as the Revenue app does — scaled, floored at 10px, or under 10px as drawn", () => {
    const wrong = GENERATED.flatMap(literals).filter(({ value }) => {
      const n = Number((SCALED.exec(value) ?? FLOORED.exec(value) ?? SMALL.exec(value))?.[1] ?? NaN);
      return Number.isNaN(n) || value !== typePx(n);
    });
    expect(wrong).toEqual([]);
  });

  it("gives the hand-written parts no px size of their own: typePx, or the photo editor's own (drawn on the picture)", () => {
    const plain = HAND.flatMap(literals).filter(({ value }) => !(SMALL.test(value) && Number(SMALL.exec(value)![1]) < 10));
    expect(plain).toEqual([]);
  });

  it("is one rule in both places, on the Revenue app's numbers", () => {
    for (const n of [9, 10, 10.5, 11, 12, 13, 14, 28]) expect(scaleType.typePx(String(n))).toBe(typePx(n));
    expect(typePx(14)).toBe("calc(14px * var(--rv-type, 1))");
    expect(typePx(10)).toBe("max(10px, calc(10px * var(--rv-type, 1)))");
    expect(typePx(9)).toBe("9px");
    // The phone's factor is the Revenue app's.
    expect(readFileSync(resolve(process.cwd(), "src/components/member/app/shell.module.css"), "utf8")).toMatch(/\.screen \{\s*--rv-type: \.92;/);
  });

  it("scales the CRM's own stylesheet too", () => {
    const sizes = [...read("crm.module.css").matchAll(/font-size:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => v !== "inherit");
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter(v => !/^calc\(\d*\.?\d+px \* var\(--rv-type, 1\)\)$/.test(v))).toEqual([]);
  });
});
