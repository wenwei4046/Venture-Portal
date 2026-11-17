import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// Insight › Overview on the phone (the owner, 2026-11-17: "我想在 insight 加 Overview，主要是整合 ads performance + team
// performance"; both screens): the first side of Insight's switch and where Insight opens, with its own brand switch.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
async function tap(el: Element) { fireEvent.click(el); await act(async () => {}); }

describe("Insight › Overview on the phone", () => {
  it("opens first: ads and teams on one page, the brand switch over them", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector("[data-ov-sum]")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Ads" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Teams" })).toBeInTheDocument();
    const brand = screen.getByRole("group", { name: "Brand" });
    expect([...brand.querySelectorAll("button")].map(b => b.textContent)).toEqual(["All", "The Conts", "Dream Crafter"]);
    // Team performance is a side of its own, and Overview comes back.
    await tap(screen.getByRole("button", { name: "Team performance" }));
    expect(document.querySelector("[data-ov-sum]")).toBeNull();
    expect(document.querySelector("[data-ov-hero]")).not.toBeNull();
    await tap(screen.getByRole("button", { name: "Overview" }));
    expect(document.querySelector("[data-ov-sum]")).not.toBeNull();
  });
});
