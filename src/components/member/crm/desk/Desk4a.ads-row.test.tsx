/**
 * The owner, 2026-11-27: "crm 的 ads performance 不是能够点击后看到所有的 leads 名单吗？" — a click on an ad's row opens
 * its leads; the ↗ and the right-click menu still do only their own thing.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeskAdsTable4a } from "./Desk4a";

const cell = (v: string) => ({ v, cv: "", d: "", dc: "", db: "" });
function draw(open = vi.fn(), hide = vi.fn()) {
  render(<DeskAdsTable4a v={{
    ap4: {
      cols: [{ id: "leads", label: "Leads", arrow: "", num: true, sort: () => {} }],
      rows: [{ name: "Skyline", headline: "", ch: "whatsapp", cells: [cell("2")], url: "/member/crm-ad/1", hide, open }],
      total: { label: "All 1 ads", cells: [cell("2")] }, cmp: false,
    },
    apNameArrow: "↕", apSortName: () => {}, openMetrics: () => {},
  }} />);
  return { open, hide };
}

describe("an ad's row on Ads Performance", () => {
  it("opens the ad's leads on a click, and from the keyboard", () => {
    const { open } = draw();
    const row = screen.getByRole("button", { name: /Skyline/ });
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("the ↗ opens the ad, not the list", () => {
    const { open } = draw();
    fireEvent.click(screen.getByRole("link", { name: "View ad" }));
    expect(open).not.toHaveBeenCalled();
  });

  it("the right-click menu hides the ad, not the list", () => {
    const { open, hide } = draw();
    fireEvent.contextMenu(screen.getByText("Skyline"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Hide from Ads Performance/ }));
    expect(hide).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });
});
