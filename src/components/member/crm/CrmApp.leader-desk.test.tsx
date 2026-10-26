import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "./CrmApp";
import type { DeskApp } from "./desk/vm/ctx";

// A team leader's desktop (the owner, 2026-10-26: "team leader 的desktop 版本，畫面跟principal, Revenue director一樣，只是權限上有
// 差別"): the same desktop frame, opened on the Team side, with none of CRM · Manage's pages. On the demo's people:
// boss = the Principal (CRM · Manage), lkv = Kelvin Lee, a team leader with a line below him, a1 = a salesperson.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

const deskApp: DeskApp = {
  greeting: "Good morning", subName: "IR", dateLine: "Sat 24 Oct 2026", bellUnread: false, notifCount: 0,
  go: () => {}, openNotifications: () => {}, openBell: () => {}, openSubDept: () => {}, signOut: () => {}, hidden: [], crmUnread: 0, products: null, modules: null,
} as unknown as DeskApp;

async function open(viewer: string) {
  window.history.replaceState({}, "", `/member/preview?crmAs=${viewer}`);
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} desk deskApp={deskApp} />);
  await act(async () => {});
}
const nav = (label: string) => screen.queryAllByText(label, { exact: true }).length > 0;

describe("the desktop for a team leader", () => {
  it("opens the desktop frame on the Team side, without the Manage pages", async () => {
    await open("lkv");
    for (const p of ["Insight", "Inbox", "Contacts", "Calendar"]) expect(nav(p)).toBe(true);
    for (const p of ["Assignment", "Ads Performance", "Showrooms", "Customer form", "Channels", "Audit log", "Reports"]) expect(nav(p)).toBe(false);
  });
  it("the Principal keeps every page", async () => {
    await open("boss");
    for (const p of ["Insight", "Inbox", "Assignment", "Showrooms", "Channels", "Reports"]) expect(nav(p)).toBe(true);
  });
  it("a salesperson with nobody below keeps the phone's screens", async () => {
    await open("a1");
    expect(nav("Assignment")).toBe(false);
    expect(nav("Showrooms")).toBe(false);
  });
});
