import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// The phone's Ads to teams has the Revenue Director as a row, as the desktop's (the owner, 2026-10-16: "ads to team 的 app
// 还没做成最新功能" … "新增了 revenue director 也加入可以获得广告名单"; mig 20261016010000). On the demo's data (Peter is its
// Revenue Director), as /member/preview draws the Control panel for the Principal.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}

describe("Ads to teams on the phone", () => {
  it("lists the Revenue Director beside the teams", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getAllByText("Assignment", { exact: true }).find(e => e.closest("nav")) ?? null);
    await tap(screen.getByText("Ads to teams", { exact: true }));
    await tap(screen.getByText("Akemi Mattress · October Fair", { exact: true }));
    const byTeam = screen.queryAllByText(/^By team/)[0]; if (byTeam) await tap(byTeam);
    expect(screen.getAllByText(/Revenue Director/).length).toBeGreaterThan(0);
  });
});
