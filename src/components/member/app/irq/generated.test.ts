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

  it("show the item being replaced in the Change item sheet's header", () => {
    const quote = tpls.find(([f]) => f === "QuoteTpl.tsx")![1];
    expect(quote).toContain('v["sheet"]?.["img"]');
    expect(quote).toContain('v["sheet"]?.["zoom"]');
  });

  it("read the app's own faces, never a font the page did not load", () => {
    for (const [f, src] of tpls) expect(/font-family:[^;"]*\b(Manrope|Space Grotesk)\b/.test(src.replace(/var\(--font-[a-z-]+\)/g, "")), f).toBe(false);
  });
});
