import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

import AppError from "./AppError";

afterEach(cleanup);

// /member when it cannot load (2026-10-06): not the pre-revamp "Unable to load your
// workspace" page, but the app's frame, what went wrong and one way on.
describe("AppError — when /member cannot load", () => {
  it("says what went wrong inside the app's frame, on the URL's tab", () => {
    search = "?page=insight";
    render(<AppError onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't open the Revenue app");
    expect(screen.queryByText(/Unable to load your workspace/)).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: "Insight", hidden: true })) {
      expect(button).toHaveAttribute("aria-current", "page");
    }
  });

  it("tries again with one button — the only thing on the page that answers", () => {
    search = "";
    const onRetry = vi.fn();
    const { container } = render(<AppError onRetry={onRetry} />);
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry.closest("[inert]")).toBeNull();
    expect(container.querySelector("nav")?.closest("[inert]")).not.toBeNull();
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows the server's reference when there is one, so a screenshot finds the log", () => {
    search = "";
    const { rerender } = render(<AppError digest="3141592653" onRetry={() => {}} />);
    expect(screen.getByText("Ref 3141592653")).toBeInTheDocument();
    rerender(<AppError onRetry={() => {}} />);
    expect(screen.queryByText(/^Ref /)).not.toBeInTheDocument();
  });
});
