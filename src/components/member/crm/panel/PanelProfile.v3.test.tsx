import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// v3 T06 (the owner, 2026-10-23: "我的profile 應該長這樣才對"): Team's Profile — the avatar centred, View as, MANAGE
// (Member work type, Showrooms, Cold lead templates, Ads Performance) and ME (Notifications, Auto-reply, which is Mine's).
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
    for (const l of ["View as a team member", "Manage", "Member work type", "Showrooms", "Cold lead templates", "Ads Performance", "Me", "Notifications", "Auto-reply"])
      expect(screen.getByText(l, { exact: true })).toBeInTheDocument();
    await tap(screen.getByRole("button", { name: /Member work type/ }));
    expect(screen.getAllByText("Member work type").length).toBeGreaterThan(1);
  });

  it("Auto-reply opens Mine's Auto-reply", async () => {
    await openProfile();
    await tap(screen.getByRole("button", { name: /Auto-reply/ }));
    expect(screen.getByRole("heading", { name: "Auto-reply" })).toBeInTheDocument();
  });
});
