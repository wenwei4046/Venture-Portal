import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CrmApp from "../CrmApp";

// Showrooms shows one showroom at a time, ‹ 1 / 2 › and a round + at the title's right (the owner, 2026-10-16: "把加
// showroom（可能只需要保留 + 的符號）的功能放到右上角，同時加一個 <> 功能，切換不同 showroom，如果都在下面太長了"). On the demo's
// data (two showrooms), as /member/preview draws the Control panel for the Principal.
vi.mock("@/app/(member)/member/crm-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

async function tap(el: Element | null) {
  expect(el).not.toBeNull();
  fireEvent.click(el!);
  await act(async () => {});
}

describe("Showrooms, one at a time", () => {
  it("pages between showrooms with ‹ ›, adds with + at the top, and has no Add showroom row under them", async () => {
    window.history.replaceState({}, "", "/member/preview?crmAs=boss");
    render(<CrmApp live={false} salesperson="You" onExit={() => {}} />);
    await act(async () => {});
    await tap(screen.getAllByText("Profile", { exact: true }).find(e => e.closest("nav")) ?? null);
    await tap(screen.getByText("Showrooms", { exact: true }));
    expect(screen.getByRole("heading", { name: "Showrooms" })).toBeInTheDocument();

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText("Kuala Lumpur Showroom")).toBeInTheDocument();
    expect(screen.queryByText("Penang Showroom")).toBeNull();
    expect(screen.queryByText("Add showroom")).toBeNull();

    await tap(screen.getByLabelText("Next showroom"));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByText("Penang Showroom")).toBeInTheDocument();
    expect(screen.queryByText("Kuala Lumpur Showroom")).toBeNull();

    await tap(screen.getByLabelText("Add showroom"));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });
});
