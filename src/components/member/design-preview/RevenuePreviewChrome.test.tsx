import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RevenuePreviewNav } from "./RevenuePreviewChrome";

afterEach(cleanup);

describe("Revenue preview tab continuity", () => {
  it.each(["a", "c"] as const)("keeps design %s through all five tabs and uses the new Insight entry", design => {
    render(<RevenuePreviewNav design={design} active="insight" />);
    const nav = within(screen.getByRole("navigation", { name: "Mobile navigation" }));
    for (const [name, destination] of [["Today", "page=today"], ["Insight", "view=insight"], ["Quote", "page=quote"], ["Arena", "view=arena"], ["Profile", "page=account"]]) {
      expect(nav.getByRole("link", { name })).toHaveAttribute("href", `/member/preview?design=${design}&${destination}`);
    }
    expect(nav.getByRole("link", { name: "Insight" })).toHaveAttribute("aria-current", "page");
    expect(nav.queryByRole("link", { name: "Income" })).not.toBeInTheDocument();
  });

  it("uses local navigation handlers without reloading an in-progress workspace", () => {
    const onQuote = vi.fn();
    render(<RevenuePreviewNav design="c" active="today" onSelect={{ quote: onQuote }} />);
    fireEvent.click(screen.getByRole("button", { name: "Quote" }));
    expect(onQuote).toHaveBeenCalledOnce();
  });
});
