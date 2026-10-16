import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Mine's Profile looks like the Revenue app's Profile (2026-10-16, the owner, with the two side by side: "我要mine profile
// 跟着 profile"; tools/crm-design/profile-like-app.cjs). Its sizes have followed the app's since 2026-10-14 (type-scale.test.ts);
// this keeps the rest in step — read from the app's own stylesheet, so a change to the app's Profile fails here until the
// CRM's is regenerated to match.

// Vitest runs from the repository root.
const root = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const APP = root("src/components/member/app/profile/profile.module.css");
const GLOBALS = root("src/app/globals.css");
const PROFILE = root("src/components/member/crm/sales/SalesProfile.tsx");
// The main page only — its sub-pages (Notifications, Quick replies …) and sheets come after it and keep the CRM's own look.
const MINE = PROFILE.slice(PROFILE.indexOf("{!!(v.profMain) && (<>"), PROFILE.indexOf("{!!(v.teamOpen) && (<>"));
const CRM_CSS = root("src/components/member/crm/crm.module.css");

/** A declaration of one of the app Profile's classes, from its own rule (`.h2 { … }`, not `.work > .h2 { … }`). */
function app(cls: string, prop: string): string {
  const block = new RegExp(`(?:^|\\n)\\.${cls} \\{([^}]*)\\}`).exec(APP)?.[1] ?? "";
  return new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(block)?.[1]?.trim() ?? "";
}
/** The inline style of the element that holds `text` in Mine's Profile (its opening tag, nearest before the text). */
function mine(text: string): string {
  const at = MINE.indexOf(`>${text}</`);
  expect(at, `Mine's Profile shows ${text}`).toBeGreaterThan(0);
  const open = MINE.lastIndexOf("<", MINE.lastIndexOf("style=", at));
  return MINE.slice(open, at);
}
const prop = (style: string, name: string) => new RegExp(`${name}: "([^"]+)"`).exec(style)?.[1];
const DISPLAY = "var(--font-display-rv)";
const squash = (s: string) => s.replace(/\s+/g, "");

describe("Mine's Profile looks like the Revenue app's Profile", () => {
  it("reads the app's values and Mine's main page (the scan itself works)", () => {
    expect(MINE.length).toBeGreaterThan(2000);
    expect(app("avatar", "width")).toBe("56px");
    expect(app("name", "font-family")).toBe(DISPLAY);
    expect(app("h2", "font-weight")).toBe("650");
  });

  it("draws the avatar, the name and Your workspace in the app's display face", () => {
    for (const [text, cls] of [["{v.meIniX}", "avatar"], ["{v.meNameX}", "name"], ["Your workspace", "h2"]] as const) {
      expect(app(cls, "font-family")).toBe(DISPLAY);
      expect(prop(mine(text), "fontFamily"), text).toBe(DISPLAY);
    }
  });

  it("gives the avatar the app's size and every text the app's weight", () => {
    expect(prop(mine("{v.meIniX}"), "width")).toBe(app("avatar", "width"));
    expect(prop(mine("{v.meIniX}"), "height")).toBe(app("avatar", "height"));
    expect(prop(mine("{v.meIniX}"), "fontWeight")).toBe(app("avatar", "font-weight"));
    expect(prop(mine("{v.meNameX}"), "fontWeight")).toBe(app("name", "font-weight"));
    expect(prop(mine("{v.meNameX}"), "letterSpacing")).toBe(app("name", "letter-spacing"));
    expect(prop(mine("Your workspace"), "fontWeight")).toBe(app("h2", "font-weight"));
    expect(prop(mine("Your workspace"), "letterSpacing")).toBe(app("h2", "letter-spacing"));
    for (const v of ["{v.meTitleX}", "{v.meRankX}"]) expect(prop(mine(v), "fontWeight"), v).toBe(app("factValue", "font-weight"));
    for (const row of ["Notifications", "Auto-reply", "Quick replies"]) expect(prop(mine(row), "fontWeight"), row).toBe(app("workLabel", "font-weight"));
  });

  it("puts the card on the app's glow, as white and as round as the app's", () => {
    const glow = /<div data-prof-glow="1" style=\{\{([^}]*)\}\}>\s*<div style=\{\{([^}]*)\}\}>/.exec(MINE);
    expect(glow, "the glow and the card on it").not.toBeNull();
    const [, band, card] = glow!;
    // the band is the app's --rv-profile-glow at the app's height, and the card sits as far down it as the app's
    const appGlow = /--rv-profile-glow:\s*([^;]+);/.exec(GLOBALS)?.[1] ?? "";
    expect(squash(prop(band, "background") ?? "")).toContain(squash(appGlow));
    expect(prop(band, "background")).toContain(`100% ${app("glow", "height")}`);
    expect(prop(band, "padding")?.split(" ")[0]).toBe(app("cardWrap", "padding").split(" ")[0]);
    expect(prop(card, "borderRadius")).toBe(app("card", "border-radius"));
    expect(prop(card, "background")).toBe("#fff");
    expect(card).not.toContain("border:");
    expect(squash(prop(card, "boxShadow") ?? "")).toBe(squash(app("card", "box-shadow").replace("var(--rv-ink-10)", "rgba(63,43,34,.10)")));
    expect(prop(card, "padding")).toBe(app("cardBody", "padding"));
    expect(prop(card, "gap")).toBe(app("cardBody", "gap"));
    // …and the status-bar strip above it is the glow's top colour (the app's Profile sets its own to --rv-peach)
    expect(CRM_CSS).toMatch(/\.app:not\(\.panel\):has\(\[data-prof-glow\]\) \{ background: linear-gradient\(#F6B48A, #F6B48A\) top \/ 100% var\(--crm-top\) no-repeat, #FFFFFF; \}/);
    expect(/--rv-peach:\s*#F6B48A;/.test(GLOBALS)).toBe(true);
  });

  it("rules the rows edge to edge in the app's line, with the app's chevron", () => {
    const rules = [...MINE.matchAll(/<div style=\{\{ height: "1px", background: "([^"]+)"(, marginLeft: "[^"]+")? \}\}>/g)];
    expect(rules.map(r => [r[1], r[2] ?? ""])).toEqual([["#F1E7DF", ""], ["#F1E7DF", ""]]);
    expect(/--rv-rule:\s*#F1E7DF;/.test(GLOBALS)).toBe(true);
    expect(MINE).not.toContain('<path d="m9 6 6 6-6 6">');
  });
});
