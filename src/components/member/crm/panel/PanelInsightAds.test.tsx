import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// v3 T01: Team Insight's Team performance | Ads performance switch. The Ads side is the Ads Performance page drawn under
// Insight's head (the avatar, "Hello, …", the house), with Insight still lit in the bottom bar; back to Team performance.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("Team Insight's Ads performance side", () => {
  it("switches to the ads page under Insight's head, and back", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Hello, Principal" })).toBeInTheDocument();
    expect(screen.getByText("Team performance", { selector: "h2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ads performance" }));
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Hello, Principal" })).toBeInTheDocument();
    expect(screen.queryByText("Team performance", { selector: "h2" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ads performance" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("heading", { name: "Ads Performance" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Team performance" }));
    await act(async () => {});
    expect(screen.getByText("Team performance", { selector: "h2" })).toBeInTheDocument();
  });
});
