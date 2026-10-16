import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Both Profiles look like the Revenue app's Profile — Mine's (2026-10-16, the owner, with the two side by side: "我要mine
// profile 跟着 profile") and the Team side's, the Control panel's (the same day: "can change"; tools/crm-design/
// profile-like-app.cjs). Their sizes have followed the app's since 2026-10-14 (type-scale.test.ts); this keeps the rest in
// step — read from the app's own stylesheet, so a change to the app's Profile fails here until the CRM's is regenerated.

// Vitest runs from the repository root.
const root = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const APP = root("src/components/member/app/profile/profile.module.css");
const GLOBALS = root("src/app/globals.css");
const CRM_CSS = root("src/components/member/crm/crm.module.css");
/** The main page only — its sub-pages (Notifications, Quick replies …) and sheets come after it and keep the CRM's own look. */
function mainPage(file: string, start: string, end: string): string {
  const src = root(file), at = src.indexOf(start);
  return src.slice(at, src.indexOf(end, at));
}
const SIDES = [
  {
    side: "Mine",
    page: mainPage("src/components/member/crm/sales/SalesProfile.tsx", "{!!(v.profMain) && (<>", "{!!(v.teamOpen) && (<>"),
    ini: "{v.meIniX}", name: "{v.meNameX}", facts: ["{v.meTitleX}", "{v.meRankX}"],
    banner: "View my team", rows: ["Notifications", "Auto-reply", "Quick replies"],
  },
  {
    side: "Team",
    page: mainPage("src/components/member/crm/panel/PanelApp.tsx", "{!!(v.pf.onProfile) && (<>", "</main>"),
    ini: "{v.pf.meIni}", name: "{v.pf.meName}", facts: ["{v.pf.meTitle}", "{v.pf.meAccess}"],
    banner: "View as a team member", rows: ["Notifications", "Member work type", "Showrooms", "Cold lead templates", "Ads Performance"],
  },
] as const;

/** A declaration of one of the app Profile's classes, from its own rule (`.h2 { … }`, not `.work > .h2 { … }`). */
function app(cls: string, prop: string): string {
  const block = new RegExp(`(?:^|\\n)\\.${cls} \\{([^}]*)\\}`).exec(APP)?.[1] ?? "";
  return new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`).exec(block)?.[1]?.trim() ?? "";
}
/** The opening tag of the element that holds `text` on one side's Profile (the nearest before the text). */
function tagOf(page: string, text: string): string {
  const at = page.indexOf(`>${text}</`);
  expect(at, `the Profile shows ${text}`).toBeGreaterThan(0);
  const open = page.lastIndexOf("<", page.lastIndexOf("style=", at));
  return page.slice(open, at);
}
/** The opening tag of the element `back` tags before the one that holds `text` (its parent, a sibling before it …). */
function tagBefore(page: string, text: string, back: number): string {
  let at = page.lastIndexOf("<", page.lastIndexOf("style=", page.indexOf(`>${text}</`)));
  for (let i = 0; i < back; i++) at = page.lastIndexOf("<", page.lastIndexOf("style=", at - 1));
  return page.slice(at, page.indexOf(">", page.indexOf("}}", at)) + 1);
}
const prop = (style: string, name: string) => new RegExp(`${name}: "([^"]+)"`).exec(style)?.[1];
const DISPLAY = "var(--font-display-rv)";
const squash = (s: string) => s.replace(/\s+/g, "");

for (const { side, page, ini, name, facts, banner, rows } of SIDES) describe(`${side}'s Profile looks like the Revenue app's Profile`, () => {
  const at = (text: string) => tagOf(page, text);

  it("reads the app's values and the side's main page (the scan itself works)", () => {
    expect(page.length).toBeGreaterThan(2000);
    expect(app("avatar", "width")).toBe("56px");
    expect(app("name", "font-family")).toBe(DISPLAY);
    expect(app("h2", "font-weight")).toBe("650");
  });

  it("draws the avatar, the name and Your workspace in the app's display face", () => {
    for (const [text, cls] of [[ini, "avatar"], [name, "name"], ["Your workspace", "h2"]] as const) {
      expect(app(cls, "font-family")).toBe(DISPLAY);
      expect(prop(at(text), "fontFamily"), text).toBe(DISPLAY);
    }
  });

  it("gives the avatar the app's size and every text the app's weight", () => {
    expect(prop(at(ini), "width")).toBe(app("avatar", "width"));
    expect(prop(at(ini), "height")).toBe(app("avatar", "height"));
    expect(prop(at(ini), "fontWeight")).toBe(app("avatar", "font-weight"));
    expect(prop(at(name), "fontWeight")).toBe(app("name", "font-weight"));
    expect(prop(at(name), "letterSpacing")).toBe(app("name", "letter-spacing"));
    expect(prop(at("Your workspace"), "fontWeight")).toBe(app("h2", "font-weight"));
    expect(prop(at("Your workspace"), "letterSpacing")).toBe(app("h2", "letter-spacing"));
    for (const v of facts) expect(prop(at(v), "fontWeight"), v).toBe(app("factValue", "font-weight"));
    for (const row of rows) expect(prop(at(row), "fontWeight"), row).toBe(app("workLabel", "font-weight"));
  });

  it("puts the card on the app's glow, as white and as round as the app's", () => {
    const glow = /<div data-prof-glow="1" style=\{\{([^}]*)\}\}>\s*<div style=\{\{([^}]*)\}\}>/.exec(page);
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
  });

  it("draws the dark banner as the app's View as entry", () => {
    const box = tagBefore(page, banner, 3), tile = tagBefore(page, banner, 2);
    expect(box).toContain("onClick=");
    expect(prop(box, "padding")).toBe(app("vaEntryBtn", "padding"));
    expect(prop(box, "borderRadius")).toBe(app("vaEntryBtn", "border-radius"));
    expect(prop(box, "gap")).toBe(app("vaEntryBtn", "gap"));
    expect(prop(tile, "width")).toBe(app("vaEntryIcon", "width"));
    expect(prop(tile, "borderRadius")).toBe(app("vaEntryIcon", "border-radius"));
    expect(prop(at(banner), "fontWeight")).toBe(app("vaEntryTitle", "font-weight"));
  });

  it("rules the rows edge to edge in the app's line, never under the last, with the app's chevron", () => {
    expect(/--rv-rule:\s*#F1E7DF;/.test(GLOBALS)).toBe(true);
    // every line between two rows is --rv-rule, full width (a 1px rule of its own, or the row's own top edge)
    const lines = [...page.matchAll(/<div style=\{\{ height: "1px", background: "([^"]+)"(, marginLeft: "[^"]+")? \}\}>|borderTop: "1px solid ([^"]+)"/g)];
    expect(lines.length).toBe(rows.length - 1);
    for (const l of lines) expect([l[1] ?? l[3], l[2] ?? ""]).toEqual(["#F1E7DF", ""]);
    expect(page).not.toMatch(/borderBottom: "1px solid #EBDDD2"/);
    // the first row has no line over it (a row standing alone — a leader's Team side — has none), the last none under it
    const row = (label: string) => tagBefore(page, label, 3);
    expect(row(rows[0])).toContain("onClick=");
    expect(row(rows[0])).not.toMatch(/border(Top|Bottom):/);
    expect(row(rows[rows.length - 1])).not.toMatch(/borderBottom:/);
    expect(page).not.toContain('<path d="m9 6 6 6-6 6">');
  });
});

describe("the Profiles' page under the glow", () => {
  it("turns the status-bar strip the glow's top colour and the page white, on both sides", () => {
    const rule = ".app:has([data-prof-glow]) { background: linear-gradient(#F6B48A, #F6B48A) top / 100% var(--crm-top) no-repeat, #FFFFFF; }";
    expect(CRM_CSS).toContain(rule);
    expect(/--rv-peach:\s*#F6B48A;/.test(GLOBALS)).toBe(true);
    // as heavy as .app.panel's cream and after it, so it wins on the Team side too
    expect(CRM_CSS.indexOf(rule)).toBeGreaterThan(CRM_CSS.indexOf(".app.panel {"));
    expect(CRM_CSS).not.toContain(":not(.panel):has([data-prof-glow])");
  });
});
