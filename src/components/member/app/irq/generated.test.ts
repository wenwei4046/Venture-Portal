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
  it("are the four prototypes", () => {
    expect(tpls.map(([f]) => f).sort()).toEqual(["QuoteTpl.tsx", "SettingsMobileTpl.tsx", "SettingsTpl.tsx", "WorkspaceTpl.tsx"]);
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
    for (const name of ["rvSheetUp", "rvPanelIn", "rvFade", "wsIn", "wsFade"]) expect(ALL.includes(`@keyframes ${name}`), name).toBe(true);
  });

  it("read the app's own faces, never a font the page did not load", () => {
    for (const [f, src] of tpls) expect(/font-family:[^;"]*\b(Manrope|Space Grotesk)\b/.test(src.replace(/var\(--font-[a-z-]+\)/g, "")), f).toBe(false);
  });
});
