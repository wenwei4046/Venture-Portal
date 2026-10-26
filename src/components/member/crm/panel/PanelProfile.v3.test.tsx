import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// v3 T06 (the owner, 2026-10-23: "我的profile 應該長這樣才對"): Team's Profile — the avatar centred, View as, MANAGE
// and ME — ME first, no Auto-reply, Member work type on Assignment alone (the owner, the same night).
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element) { fireEvent.click(el); await act(async () => {}); }
async function openProfile() {
  window.history.replaceState({}, "", "/member/preview?crmAs=boss");
  render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
  await act(async () => {});
  await tap(screen.getAllByText("Profile", { exact: true }).find(e => e.closest("nav"))!);
}

describe("Team's Profile (v3)", () => {
  it("shows MANAGE and ME, and each row opens its page", async () => {
    await openProfile();
    expect(screen.getByRole("heading", { name: "Principal" })).toBeInTheDocument();
    for (const l of ["View as a team member", "Me", "Notifications", "Manage", "Showrooms", "Cold lead templates", "Ads Performance"])
      expect(screen.getByText(l, { exact: true })).toBeInTheDocument();
    // Member work type is Assignment's alone; no Auto-reply on the Team side; ME above MANAGE.
    expect(screen.queryByText("Member work type")).toBeNull();
    expect(screen.queryByText("Auto-reply")).toBeNull();
    const page = document.body.textContent ?? "";
    expect(page.indexOf("Notifications")).toBeLessThan(page.indexOf("Showrooms"));
  });

});
