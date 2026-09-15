import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import ArenaDesignPreview from "./ArenaDesignPreview";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("Arena performance and Championship separation", () => {
  it("replaces the venue selector with personal finish counts and a seller comparison", () => {
    window.history.replaceState({}, "", "/member/preview?design=c&view=sales&salesTab=venue");
    render(<ArenaDesignPreview design="c" initialView="sales" />);
    expect(screen.getByRole("button", { name: "Fair results" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("combobox", { name: /venue/i })).not.toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Your fair finishes" });
    expect(summary).toHaveTextContent("4 fairs");
    expect(within(summary).getAllByRole("definition").map(node => node.textContent)).toEqual(["1time", "2times", "1time"]);
    expect(within(screen.getByRole("list", { name: "Your weekly fair results" })).getAllByRole("listitem")).toHaveLength(4);
    const table = screen.getByRole("table", { name: "Fair finish counts · September 2026" });
    expect(within(table).getAllByRole("row")).toHaveLength(27);
    expect(table).not.toHaveTextContent(/pts|RM /);
    fireEvent.change(screen.getByRole("combobox", { name: "Selected period" }), { target: { value: "8" } });
    expect(screen.getByRole("region", { name: "Your fair finishes" })).toHaveTextContent("5 fairs");
    fireEvent.click(screen.getByRole("button", { name: "Quarterly" }));
    expect(screen.getByRole("region", { name: "Your fair finishes" })).toHaveTextContent("13 fairs");
    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    expect(screen.getByRole("region", { name: "Your fair finishes" })).toHaveTextContent("39 fairs");
  });

  it("keeps the historical record board at the latest demo snapshot, independent of ledger period", () => {
    window.history.replaceState({}, "", "/member/preview?design=c&view=records&period=monthly&selection=1");
    render(<ArenaDesignPreview design="c" initialView="records" />);
    expect(screen.getByRole("heading", { name: "Highest Fair Record", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Time dimension" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Selected period" })).not.toBeInTheDocument();
    expect(screen.getByText(/Demo snapshot as of 2026-09-30/)).toBeInTheDocument();
    expect(screen.getAllByText("RM 100,000").length).toBeGreaterThan(0);
    expect(screen.getByRole("list", { name: "All-time personal best" })).not.toHaveTextContent("pts");
    fireEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "Arena" }));
    fireEvent.click(screen.getByRole("button", { name: /Championship.*overall/ }));
    expect(screen.getByRole("region", { name: "Your points breakdown" })).toHaveTextContent("Highest Fair Record");
  });

  it.each(["sales", "margin"])("keeps %s by brand free of contribution points and brand-week editing", view => {
    window.history.replaceState({}, "", `/member/preview?design=c&view=${view}&${view}Tab=brand`);
    render(<ArenaDesignPreview design="c" initialView={view} />);
    const result = screen.getByRole("region", { name: "Your performance" });
    expect(within(result).getByText("Akemi")).toBeInTheDocument();
    expect(result).not.toHaveTextContent(/pts|contribution|×/i);
    expect(screen.queryByRole("button", { name: /Edit my brand weeks/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Points & incentives/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Brand" }), { target: { value: "ZANOTTI" } });
    expect(screen.getByRole("region", { name: "Your performance" })).toHaveTextContent("Zanotti");
    expect(screen.getByRole("region", { name: "Your performance" })).not.toHaveTextContent(/pts|contribution|×/i);
  });

  it("keeps the podium as the only full-ranking entry and the points summary static", () => {
    window.history.replaceState({}, "", "/member/preview?design=c&view=overall");
    render(<ArenaDesignPreview design="c" initialView="overall" />);
    expect(screen.getByRole("region", { name: "Your Championship points" })).toHaveTextContent("pts");
    expect(screen.queryByRole("button", { name: /View Championship ranking/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View full ranking/ }));
    expect(screen.getByRole("heading", { name: "Championship ranking", level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Championship" }));
    expect(screen.getByRole("region", { name: "Your points breakdown" })).toBeInTheDocument();
  });
});
