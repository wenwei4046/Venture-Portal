import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IRQ_CSS_QUOTE, IRQ_CSS_SETTINGS, IRQ_CSS_SETTINGS_MOBILE } from "./irq-css";

// IR Quote (2026-11-05): the templates are generated from the prototype (tools/ir-quote/dc-to-tsx.mjs). What the
// generator promises: no hex colour in a template (each is a token in the screens' stylesheets), every token a
// template uses is declared, every hover / focus class has its rule, and every animation its keyframes.
const DIR = resolve(process.cwd(), "src/components/member/app/irq/tpl");
const tpls = readdirSync(DIR).filter(f => f.endsWith(".tsx")).map(f => [f, readFileSync(join(DIR, f), "utf8")] as const);
const ALL = IRQ_CSS_QUOTE + IRQ_CSS_SETTINGS + IRQ_CSS_SETTINGS_MOBILE;

describe("the generated IR Quote templates", () => {
  it("are the three prototypes", () => {
    expect(tpls.map(([f]) => f).sort()).toEqual(["QuoteTpl.tsx", "SettingsMobileTpl.tsx", "SettingsTpl.tsx"]); // the Drive (WorkspaceTpl) went 2026-11-09
  });

  it("carry no hex colour of their own", () => {
    for (const [f, src] of tpls) expect(src.match(/#[0-9A-Fa-f]{6}\b/g) ?? [], f).toEqual([]);
  });

  it("use only colour tokens the stylesheets declare", () => {
    const used = new Set(tpls.flatMap(([, s]) => s.match(/--irq-c-[0-9a-f]{6}/g) ?? []));
    for (const t of used) expect(ALL.includes(`${t}: #`), t).toBe(true);
  });

  it("have a rule for every hover / focus class", () => {
    const used = new Set(tpls.flatMap(([, s]) => s.match(/irq-p[0-9a-z]+/g) ?? []));
    expect(used.size).toBeGreaterThan(0);
    for (const c of used) expect(ALL.includes(`.${c}:`), c).toBe(true);
  });

  it("have keyframes for every animation the prototype names", () => {
    for (const name of ["rvSheetUp", "rvPanelIn", "rvFade"]) expect(ALL.includes(`@keyframes ${name}`), name).toBe(true);
  });

  // globals.css's 16px floor stops at the shadow root, so each screen's sheet carries its own: under 16px, a tap on
  // the search box zooms an iPhone's page and leaves it zoomed (2026-11-06).
  it("keep a phone's form controls at 16px, so iOS does not zoom on focus", () => {
    for (const css of [IRQ_CSS_QUOTE, IRQ_CSS_SETTINGS, IRQ_CSS_SETTINGS_MOBILE]) {
      expect(css).toContain("@media (max-width: 767px) { input:not([type='checkbox']):not([type='radio']):not([type='range']), select, textarea { font-size: 16px !important; } }");
    }
  });

  // 2026-11-09: an iPhone drew a date field's value at the top of its box; touch screens centre it, after the older date rule.
  it("centre a date field's value on a touch screen", () => {
    const at = IRQ_CSS_QUOTE.indexOf("@media (pointer: coarse) { input[type='date'] { -webkit-appearance: none; appearance: none; display: flex; align-items: center; }");
    expect(at).toBeGreaterThan(IRQ_CSS_QUOTE.indexOf("display: block; text-align: left; }"));
  });

  // 2026-11-09: "可以让我直接在预览中调整宽度，输入数字看不懂" — a column's width dragged at its head in the A4 sample.
  it("let a column's width be dragged at its head in Quote settings' A4 sample", () => {
    const settings = tpls.find(([f]) => f === "SettingsTpl.tsx")![1];
    expect(settings).toContain('title={"Drag to change the width"}');
    expect(settings).toMatch(/onPointerDown=\{L_th[^}]*\?\.\["grab"\]\}/);
  });

  it("put Classic | Build in beside a room type's title in Quote settings", () => {
    const settings = tpls.find(([f]) => f === "SettingsTpl.tsx")![1];
    expect(settings).toContain('v["ed"]?.["vers"]');
  });

  // 2026-11-09 Sections: a third Customize tab overlapped on a phone ("overlap") — 3+ tabs stack each label over its sum.
  it("let three or more Customize tabs fit a phone", () => {
    const quote = tpls.find(([f]) => f === "QuoteTpl.tsx")![1];
    expect(quote).toMatch(/min-width:0;display:flex;flex-direction:\$\{dcS\(L_zt[^)]*\?\.\["dir"\]\)\}/);
  });

  it("show the item being replaced in the Change item sheet's header", () => {
    const quote = tpls.find(([f]) => f === "QuoteTpl.tsx")![1];
    expect(quote).toContain('v["sheet"]?.["img"]');
    expect(quote).toContain('v["sheet"]?.["zoom"]');
  });

  // The user, 2026-11-11: "增加 save button" (Customize) and "默认 sqft（像 budget 一样呈现，但靠右）" (step 1's Unit size).
  it("put Save draft beside Drafts, and sqft inside Unit size's right end", () => {
    const quote = tpls.find(([f]) => f === "QuoteTpl.tsx")![1];
    expect(quote).toContain('v["saveHead"]');
    expect(quote.indexOf('v["saveHead"]')).toBeLessThan(quote.indexOf('v["toggleDrafts"]'));
    expect(quote).toContain('"isSqft"]');
    expect(quote).toMatch(/"sqftD"\][\s\S]{0,400}\{"sqft"\}/);
  });

  // The user, 2026-11-11, Change item open on a coffee table: "我要的是选了家私后 要储存我要的家私".
  it("give each Change item / Add item option a Use button under its price", () => {
    const quote = tpls.find(([f]) => f === "QuoteTpl.tsx")![1];
    expect(quote).toMatch(/"canUse"\][\s\S]{0,300}"use"\][\s\S]{0,600}"useLabel"\]/);
  });

  it("read the app's own faces, never a font the page did not load", () => {
    for (const [f, src] of tpls) expect(/font-family:[^;"]*\b(Manrope|Space Grotesk)\b/.test(src.replace(/var\(--font-[a-z-]+\)/g, "")), f).toBe(false);
  });
});
