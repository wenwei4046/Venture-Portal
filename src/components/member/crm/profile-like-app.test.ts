import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Both Profiles followed the Revenue app's Profile from 2026-10-16; since 2026-10-23 they are the v3 prototype's (T06 / M12,
// the owner: "我的profile 應該長這樣才對" · "要") — shared/phone4a.tsx › Phone4aProfile. What stays: the status-bar strip.

const root = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const GLOBALS = root("src/app/globals.css");
const CRM_CSS = root("src/components/member/crm/crm.module.css");

describe("the Profiles' page under the glow", () => {
  it("turns the status-bar strip the glow's top colour and the page white, on both sides", () => {
    const rule = ".app:has([data-prof-glow]) { background: linear-gradient(var(--crm-peach), var(--crm-peach)) top / 100% var(--crm-top) no-repeat, var(--crm-page); }";
    expect(CRM_CSS).toContain(rule);
    expect(/--crm-peach:\s*#F4A877;/.test(GLOBALS)).toBe(true);
    // as heavy as .app.panel's cream and after it, so it wins on the Team side too
    expect(CRM_CSS.indexOf(rule)).toBeGreaterThan(CRM_CSS.indexOf(".app.panel {"));
    expect(CRM_CSS).not.toContain(":not(.panel):has([data-prof-glow])");
  });
});
