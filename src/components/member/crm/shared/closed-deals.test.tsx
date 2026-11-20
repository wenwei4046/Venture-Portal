import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Phone4aDeals, type DealsVM } from "./closed-deals";

describe("Profile › Closed deals page", () => {
  it("draws the total, each month and each deal with its files; a tap opens the chat and a file", () => {
    const openChat = vi.fn(), openQuote = vi.fn();
    const v: DealsVM = {
      back: () => {}, periods: [{ label: "All", on: true, pick: () => {} }], total: "RM 42,000", count: "2", avg: "RM 21,000", empty: "",
      months: [{ key: "2026-11", label: "November 2026", total: "RM 12,000", n: 1, rows: [{ key: "a", name: "Siti Hajar", ini: "SH", when: "Won 18 Nov", where: "Kuala Lumpur Showroom", amount: "RM 12,000",
        files: [{ label: "Quotation", file: { path: "a/q.pdf", name: "Q.pdf" }, open: openQuote }], open: openChat }] }],
    };
    render(<Phone4aDeals v={v} />);
    expect(screen.getByText("RM 42,000")).toBeTruthy();
    expect(screen.getByText("November 2026")).toBeTruthy();
    fireEvent.click(screen.getByText("Siti Hajar"));
    expect(openChat).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Quotation"));
    expect(openQuote).toHaveBeenCalled();
  });
});
