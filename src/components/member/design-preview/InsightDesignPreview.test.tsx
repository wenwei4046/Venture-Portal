import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InsightDesignPreview from "./InsightDesignPreview";
import { BrandMarginList } from "./BrandMarginList";
import { selectOrders, summarizeBrandMargins } from "./insight-model";

const previewPath = "/member/preview?design=a&view=insight";
const main = () => within(screen.getByRole("main"));
const select = (name: string, value: string) => fireEvent.change(screen.getByRole("combobox", { name }), { target: { value } });
const params = () => new URL(window.location.href).searchParams;
const openAllMarginOrders = () => {
  fireEvent.click(screen.getByRole("button", { name: /Zanotti margin/ }));
  select("Order brand", "all");
};

beforeEach(() => {
  window.history.replaceState(null, "", previewPath);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Insight mobile navigation and analysis", () => {
  it("opens each weighted brand margin with that brand selected and keeps it when returning from an order", () => {
    window.history.replaceState(null, "", "/member/preview?design=c&view=insight");
    render(<InsightDesignPreview design="c" />);
    const margin = within(screen.getByRole("region", { name: "Margin" }));
    expect(screen.queryByRole("button", { name: /Blended margin/ })).not.toBeInTheDocument();
    const akemi = margin.getByRole("button", { name: /Akemi margin/ });
    expect(akemi).toHaveTextContent("43.08%");
    expect(akemi).toHaveTextContent("Tier 2");
    const zanotti = margin.getByRole("button", { name: /Zanotti margin/ });
    expect(zanotti).toHaveTextContent("31.14%");
    expect(zanotti).toHaveTextContent("Pending");
    expect(zanotti).toHaveTextContent("1 order awaiting margin · partial margin");
    expect(zanotti).not.toHaveTextContent("Low margin");

    fireEvent.click(akemi);
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Akemi");
    expect(screen.getByRole("status")).toHaveTextContent("2 orders");
    expect(main().getByText("43.08%")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Akemi" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Zanotti" })).not.toBeInTheDocument();
    expect(params().get("brand")).toBe("Akemi");
    fireEvent.click(screen.getByRole("button", { name: /SO-2609-001/ }));
    expect(main().getByText("Akemi", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sales orders" }));
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Akemi");
    expect(screen.getByRole("status")).toHaveTextContent("2 orders");
    fireEvent.click(main().getByRole("button", { name: "Insight" }));
    fireEvent.click(screen.getByRole("button", { name: /Zanotti margin/ }));
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Zanotti");
    expect(screen.getByRole("status")).toHaveTextContent("4 orders · 1 missing margin");
    expect(main().getByText("31.14%")).toBeInTheDocument();
  });

  it("keeps the downline, period and venue when opening their brand margin", () => {
    window.history.replaceState(null, "", "/member/preview?design=c&view=insight-member&scope=team&person=marcus&period=last-week&fair=mv-mle-sep04");
    render(<InsightDesignPreview design="c" />);
    fireEvent.click(screen.getByRole("button", { name: /Zanotti margin/ }));
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Zanotti");
    expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("last-week");
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("mv-mle-sep04");
    expect(screen.getByRole("status")).toHaveTextContent("2 orders");
    expect(main().getByText("23.88%")).toBeInTheDocument();
    expect(params().get("person")).toBe("marcus");
    expect(params().get("scope")).toBe("team");
    select("Margin tier", "low");
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    expect(screen.getByRole("button", { name: /SO-2609-014/ })).toBeInTheDocument();
    fireEvent.click(main().getByRole("button", { name: "Insight" }));
    expect(screen.getByRole("heading", { level: 1, name: "Marcus Lee" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zanotti margin/ })).toHaveTextContent("23.88%");
  });

  it("uses the same two-decimal brand rows as links for Today", () => {
    render(<BrandMarginList title="This month’s margin" rows={summarizeBrandMargins(selectOrders({ personId: "jia", period: "month" }))} hrefForBrand={brand => `/member/preview?design=c&view=insight-orders&brand=${encodeURIComponent(brand)}`} />);
    expect(screen.getByRole("heading", { name: "This month’s margin" })).toBeInTheDocument();
    const akemi = screen.getByRole("link", { name: /Akemi margin/ });
    expect(akemi).toHaveAttribute("href", "/member/preview?design=c&view=insight-orders&brand=Akemi");
    expect(akemi).toHaveTextContent("43.08%");
    expect(screen.getByRole("link", { name: /Zanotti margin/ })).toHaveTextContent("Pending");
  });

  it("falls back from unknown brand URLs and removes the obsolete category parameter when filtering", () => {
    window.history.replaceState(null, "", "/member/preview?design=c&view=insight-orders&brand=NotABrand&category=Bedroom");
    render(<InsightDesignPreview design="c" />);
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("all");
    expect(screen.getByRole("option", { name: "All brands" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Order category" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("6 orders");
    select("Order brand", "Akemi");
    expect(screen.getByRole("status")).toHaveTextContent("2 orders");
    expect(params().get("category")).toBeNull();
  });

  it("keeps the C design across shared tabs and retains the monthly quick-insight order evidence", () => {
    window.history.replaceState(null, "", "/member/preview?design=c&view=insight&period=last-week&fair=mv-mle-sep04");
    const { container } = render(<InsightDesignPreview design="c" />);
    expect(container.firstElementChild).toHaveAttribute("data-arena-design", "c");
    expect(container.firstElementChild).toHaveAttribute("data-insight-design", "c");
    const navigation = within(screen.getByRole("navigation", { name: "Mobile navigation" }));
    expect(navigation.getByRole("button", { name: "Insight" })).toHaveAttribute("aria-current", "page");
    expect(navigation.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/member/preview?design=c&page=today");
    expect(navigation.getByRole("link", { name: "Arena" })).toHaveAttribute("href", "/member/preview?design=c&view=arena");
    expect(navigation.getByRole("link", { name: "Quote" })).toHaveAttribute("href", "/member/preview?design=c&page=quote");
    expect(navigation.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/member/preview?design=c&page=account");
    expect(screen.getByRole("region", { name: "Jia En sales performance" })).toHaveTextContent("26,000");

    fireEvent.click(screen.getByRole("button", { name: "Open Jia En quick insight" }));
    const report = within(screen.getByRole("dialog", { name: "Quick insight" }));
    expect(report.getByRole("region", { name: "Monthly performance comparison" })).toHaveTextContent("50,200");
    fireEvent.click(report.getByRole("button", { name: "Review low-margin order SO-2609-005" }));
    expect(screen.getByRole("heading", { level: 1, name: "SO-2609-005" })).toBeInTheDocument();
    expect(main().getByText("RM 105")).toBeInTheDocument();
    expect(main().getByText("Pending")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The impact of this order" })).toBeInTheDocument();
    expect(params().get("design")).toBe("c");
    fireEvent.click(navigation.getByRole("button", { name: "Insight" }));
    expect(screen.getByRole("heading", { level: 1, name: "Insight" })).toBeInTheDocument();
  });

  it("restores C downline sales filters and preserves them through order details", () => {
    window.history.replaceState(null, "", "/member/preview?design=c&view=insight-orders&lens=sales&scope=team&person=marcus&period=last-week&fair=mv-mle-sep04&brand=Zanotti&tier=low&quantity=2&query=SO-2609-014");
    render(<InsightDesignPreview design="c" />);
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    fireEvent.click(screen.getByRole("button", { name: /SO-2609-014/ }));
    expect(screen.getByRole("heading", { level: 1, name: "SO-2609-014" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All sales orders" }));
    expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("last-week");
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Zanotti");
    expect(screen.getByRole("combobox", { name: "Margin tier" })).toHaveValue("low");
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("mv-mle-sep04");
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("2");
    expect(screen.getByRole("textbox", { name: "Search sales orders" })).toHaveValue("SO-2609-014");
    expect(params().get("design")).toBe("c");
    expect(params().get("person")).toBe("marcus");
  });

  it("replaces the personal overview with brand-grouped orders, then opens a standalone order", () => {
    render(<InsightDesignPreview design="a" />);
    expect(screen.getByRole("heading", { level: 1, name: "Insight" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Jia En sales performance" })).toBeInTheDocument();

    openAllMarginOrders();
    expect(screen.getByRole("heading", { level: 1, name: "Sales orders" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Jia En sales performance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Performance perspective" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("6 orders · 1 missing margin");
    for (const brand of ["Akemi", "Zanotti"]) {
      expect(screen.getByRole("heading", { level: 2, name: brand })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: /SO-2609-005/ }));
    expect(screen.getByRole("heading", { level: 1, name: "SO-2609-005" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search sales orders" })).not.toBeInTheDocument();
    expect(main().getByText("RM 7,000")).toBeInTheDocument();
    expect(main().getByText("22.0%")).toBeInTheDocument();
    expect(main().getByText("Low margin")).toBeInTheDocument();
    expect(main().getByText("RM 105")).toBeInTheDocument();
    expect(main().getByText("Pending")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sales orders" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("6 orders");
    fireEvent.click(main().getByRole("button", { name: "Insight" }));
    expect(screen.getByRole("region", { name: "Jia En sales performance" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Sales orders" })).not.toBeInTheDocument();
  });

  it("takes an upline from last week's team results to the large low-margin order and its impact", () => {
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    select("Performance period", "last-week");
    const marcus = screen.getByRole("button", { name: /Marcus Lee Sales advisor/ });
    expect(marcus).toHaveTextContent("RM 40,000");
    expect(marcus).toHaveTextContent("26.6%");
    expect(marcus).toHaveTextContent("MLE Modern Home Living");
    fireEvent.click(marcus);
    expect(screen.getByRole("heading", { level: 1, name: "Marcus Lee" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Akemi margin/ })).toHaveTextContent("42.00%");
    expect(screen.getByRole("button", { name: /Zanotti margin/ })).toHaveTextContent("23.88%");
    expect(screen.getByRole("button", { name: /KPI items/ })).toHaveTextContent("9 sold");
    expect(screen.getByRole("button", { name: /this month RM 75,000/ })).toHaveTextContent("RM 61,000 this month");

    fireEvent.click(screen.getByRole("button", { name: /One order changes the picture/ }));
    expect(screen.getByRole("heading", { level: 1, name: "SO-2609-014" })).toBeInTheDocument();
    expect(main().getByText("RM 24,000")).toBeInTheDocument();
    expect(main().getByText("18.0%")).toBeInTheDocument();
    const analysis = screen.getByRole("heading", { name: "The impact of this order" }).closest("section")!;
    expect(within(analysis).getByText("60%")).toBeInTheDocument();
    expect(within(analysis).getByText("26.6%")).toBeInTheDocument();
    expect(within(analysis).getByText("39.5%")).toBeInTheDocument();
    expect(analysis).toHaveTextContent("Last week");
    expect(analysis).toHaveTextContent("Review the discount and product mix together");

    fireEvent.click(screen.getByRole("button", { name: "Sales orders" }));
    expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("last-week");
    expect(screen.getByRole("status")).toHaveTextContent("3 orders");
    expect(params().get("person")).toBe("marcus");
    expect(params().get("scope")).toBe("team");
  });

  it("explains when a low-tier order improves the blended margin instead of recommending discount review", () => {
    window.history.replaceState(null, "", "/member/preview?design=a&view=insight-order&scope=team&person=marcus&order=order-15");
    render(<InsightDesignPreview design="a" />);
    expect(screen.getByRole("heading", { level: 1, name: "SO-2609-015" })).toBeInTheDocument();
    expect(main().getByText("Low margin")).toBeInTheDocument();
    expect(main().getByText("32.0%")).toBeInTheDocument();
    const analysis = screen.getByRole("heading", { name: "The impact of this order" }).closest("section")!;
    expect(within(analysis).getByText("29.8%")).toBeInTheDocument();
    expect(within(analysis).getByText("29.2%")).toBeInTheDocument();
    expect(analysis).toHaveTextContent("September 2026 · all venues");
    expect(analysis).toHaveTextContent("above the current blended margin");
    expect(analysis).not.toHaveTextContent("Review the discount and product mix together");
  });

  it("combines brand and tier filters, explains empty results, and clears filters without leaving the list", () => {
    render(<InsightDesignPreview design="a" />);
    openAllMarginOrders();
    select("Order brand", "Zanotti");
    select("Margin tier", "low");
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    expect(screen.getByRole("button", { name: /SO-2609-005/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SO-2609-002/ })).not.toBeInTheDocument();

    select("Fair / venue", "mv-bighome-sep11");
    select("Order brand", "Akemi");
    expect(screen.getByRole("heading", { name: "No matching orders" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 orders");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Margin tier" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("all");
    expect(screen.getByRole("status")).toHaveTextContent("6 orders");

    fireEvent.change(screen.getByRole("textbox", { name: "Search sales orders" }), { target: { value: "SO-2609-006" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 order · 1 missing margin");
    expect(screen.getByRole("button", { name: /SO-2609-006/ })).toHaveTextContent("Pending calculation");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("status")).toHaveTextContent("6 orders");
  });

  it("keeps the two Mid Valley organizers and date ranges separate through fair details and rankings", () => {
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: /Performance by venue/ }));
    expect(screen.getAllByRole("heading", { name: "Mid Valley", level: 2 })).toHaveLength(2);
    const mle = screen.getByRole("button", { name: /4–6 Sep Mid Valley MLE Modern Home Living/ });
    const bigHome = screen.getByRole("button", { name: /11–13 Sep Mid Valley Big Home/ });
    expect(mle).toHaveTextContent("RM 26,000");
    expect(bigHome).toHaveTextContent("RM 24,200");
    fireEvent.click(mle);
    expect(screen.getByRole("heading", { level: 1, name: "Mid Valley" })).toBeInTheDocument();
    expect(main().getByText("MLE Modern Home Living · 4–6 Sep")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByRole("button", { name: /Marcus Lee/ })).toHaveTextContent("02");
    expect(screen.getByText("Sophia Tan").closest("li")).toHaveTextContent("02");
    expect(params().get("fair")).toBe("mv-mle-sep04");

    fireEvent.click(screen.getByRole("button", { name: "Venues" }));
    fireEvent.click(screen.getByRole("button", { name: /11–13 Sep Mid Valley Big Home/ }));
    expect(main().getByText("Big Home · 11–13 Sep")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(params().get("fair")).toBe("mv-bighome-sep11");
    expect(screen.queryByText("Sophia Tan")).not.toBeInTheDocument();
  });

  it("restores a shared filtered URL after reload, order back navigation, and a browser popstate", () => {
    const filteredUrl = "/member/preview?design=a&view=insight-orders&scope=team&person=marcus&period=last-week&fair=mv-mle-sep04&brand=Zanotti&tier=low&query=SO-2609-014";
    window.history.replaceState(null, "", filteredUrl);
    const first = render(<InsightDesignPreview design="a" />);
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    first.unmount();
    render(<InsightDesignPreview design="a" />);
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Zanotti");
    expect(screen.getByRole("combobox", { name: "Margin tier" })).toHaveValue("low");
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("mv-mle-sep04");
    expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("last-week");
    expect(screen.getByRole("textbox", { name: "Search sales orders" })).toHaveValue("SO-2609-014");
    fireEvent.click(screen.getByRole("button", { name: /SO-2609-014/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sales orders" }));
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Zanotti");
    expect(screen.getByRole("textbox", { name: "Search sales orders" })).toHaveValue("SO-2609-014");
    fireEvent.click(screen.getByRole("button", { name: /SO-2609-014/ }));

    act(() => {
      // Browser navigation supplies the prior URL before dispatching popstate.
      window.history.replaceState(null, "", filteredUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("heading", { level: 1, name: "Sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Zanotti");
    expect(screen.getByRole("combobox", { name: "Margin tier" })).toHaveValue("low");
    expect(screen.getByRole("textbox", { name: "Search sales orders" })).toHaveValue("SO-2609-014");
    expect(params().get("person")).toBe("marcus");
  });

  it("does not describe the signed-in seller as their own downline when opened from fair standings", () => {
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: /Performance by venue/ }));
    fireEvent.click(screen.getByRole("button", { name: /4–6 Sep Mid Valley MLE Modern Home Living/ }));
    fireEvent.click(screen.getByRole("button", { name: /Jia En/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Jia En" })).toBeInTheDocument();
    expect(screen.queryByText(/Your downline/)).not.toBeInTheDocument();
    expect(params().get("scope")).toBeNull();
  });

  it("rejects a detail URL whose order belongs to another fair, preventing an unrelated margin comparison", () => {
    window.history.replaceState(null, "", "/member/preview?design=a&view=insight-order&person=jia&fair=mv-mle-sep04&order=order-5");
    render(<InsightDesignPreview design="a" />);
    expect(screen.getByRole("heading", { level: 1, name: "Order unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "The impact of this order" })).not.toBeInTheDocument();
  });

  it("keeps the selected fair visible when returning from its orders to personal performance and KPI items", () => {
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: /Performance by venue/ }));
    fireEvent.click(screen.getByRole("button", { name: /11–13 Sep Mid Valley Big Home/ }));
    fireEvent.click(screen.getByRole("button", { name: /See 3 sales orders/ }));
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("mv-bighome-sep11");
    fireEvent.click(main().getByRole("button", { name: "Insight" }));

    expect(screen.getByRole("heading", { level: 1, name: "Insight" })).toBeInTheDocument();
    expect(params().get("fair")).toBe("mv-bighome-sep11");
    expect(main().getByText("Mid Valley", { exact: true })).toBeInTheDocument();
    expect(main().getByText("Big Home · 11–13 Sep", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Jia En sales performance" })).toHaveTextContent("24,200");

    fireEvent.click(screen.getByRole("button", { name: /KPI items/ }));
    expect(screen.getByRole("heading", { level: 1, name: "KPI items" })).toBeInTheDocument();
    expect(params().get("fair")).toBe("mv-bighome-sep11");
    expect(main().getByText("Mid Valley", { exact: true })).toBeInTheDocument();
    expect(main().getByText("Big Home · 11–13 Sep", { exact: true })).toBeInTheDocument();
    expect(main().getByText("7 sold", { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear fair filter" }));
    expect(params().get("fair")).toBeNull();
    expect(screen.queryByText("Big Home · 11–13 Sep", { exact: true })).not.toBeInTheDocument();
    expect(main().getByText("12 sold", { exact: true })).toBeInTheDocument();
  });

  it("shows KPI order coverage, averages across every order, and a bounded preview before the order list", () => {
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: /KPI items/ }));
    expect(screen.getByRole("heading", { level: 1, name: "KPI items" })).toBeInTheDocument();
    const coverage = screen.getByRole("region", { name: "KPI order coverage" });
    expect(coverage).toHaveTextContent("66.7%");
    expect(coverage).toHaveTextContent("4 of 6 orders with KPI");
    expect(within(coverage).getByRole("button", { name: /With KPI/ })).toHaveTextContent("4");
    expect(within(coverage).getByRole("button", { name: /Without KPI/ })).toHaveTextContent("2");
    const averages = within(screen.getByRole("region", { name: "KPI order averages" }));
    expect(averages.getByText("12", { exact: true })).toBeInTheDocument();
    expect(averages.getByText("2.0", { exact: true })).toBeInTheDocument();
    expect(averages.getByText("RM 8,367", { exact: true })).toBeInTheDocument();
    expect(averages.getByText("Averages include all 6 orders, including those without KPI.")).toBeInTheDocument();
    const recent = within(screen.getByRole("region", { name: "Recent orders with KPI" }));
    expect(recent.getAllByRole("button", { name: /SO-2609-/ })).toHaveLength(2);
    expect(recent.getByRole("button", { name: /SO-2609-005/ })).toHaveTextContent("1 KPI item");
    expect(recent.getByRole("button", { name: /SO-2609-004/ })).toHaveTextContent("6 KPI items");
    expect(screen.queryByRole("textbox", { name: "Search sales orders" })).not.toBeInTheDocument();

    fireEvent.click(recent.getByRole("button", { name: "View sales orders" }));
    expect(screen.getByRole("heading", { level: 1, name: "KPI sales orders" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "KPI order coverage" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("4 orders · with KPI");
    expect(screen.getByRole("textbox", { name: "Search sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Order brand" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Margin tier" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "KPI quantity filter" })).toBeInTheDocument();
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("Any");
    expect(screen.queryByRole("button", { name: /SO-2609-002/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SO-2609-006/ })).not.toBeInTheDocument();
  });

  it("uses plus and minus for exact KPI counts, includes zero, and resets to qualifying orders", () => {
    window.history.replaceState(null, "", `${previewPath.replace("view=insight", "view=insight-orders")}&lens=kpi`);
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /SO-2609-005/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("2");
    expect(screen.getByRole("status")).toHaveTextContent("1 order · with KPI");
    expect(screen.getByRole("button", { name: /SO-2609-003/ })).toHaveTextContent("2 KPI items");
    expect(screen.queryByRole("button", { name: /SO-2609-001/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SO-2609-004/ })).not.toBeInTheDocument();
    expect(params().get("quantity")).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: "Decrease KPI quantity" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease KPI quantity" }));
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "Decrease KPI quantity" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("2 orders · without KPI");
    expect(screen.getByRole("button", { name: /SO-2609-002/ })).toHaveTextContent("No KPI");
    expect(screen.getByRole("button", { name: /SO-2609-006/ })).toHaveTextContent("No qualifying items on this order");
    expect(screen.queryByRole("button", { name: /SO-2609-003/ })).not.toBeInTheDocument();
    expect(params().get("quantity")).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "Any quantity" }));
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("Any");
    expect(screen.getByRole("status")).toHaveTextContent("4 orders · with KPI");
    expect(screen.getByRole("button", { name: "Decrease KPI quantity" })).not.toBeDisabled();
    expect(params().get("quantity")).toBeNull();
  });

  it("opens matching coverage groups and returns to the KPI summary before personal performance", () => {
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: /KPI items/ }));
    fireEvent.click(screen.getByRole("button", { name: /Without KPI/ }));
    expect(screen.getByRole("heading", { level: 1, name: "KPI sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 orders · without KPI");
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: "KPI items" }));
    expect(screen.getByRole("region", { name: "KPI order coverage" })).toHaveTextContent("4 of 6");
    fireEvent.click(screen.getByRole("button", { name: /With KPI/ }));
    expect(screen.getByRole("status")).toHaveTextContent("4 orders · with KPI");
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("Any");
    fireEvent.click(screen.getByRole("button", { name: "KPI items" }));
    fireEvent.click(main().getByRole("button", { name: "Insight" }));
    expect(screen.getByRole("region", { name: "Jia En sales performance" })).toBeInTheDocument();
  });

  it("restores KPI quantity and combined filters after reload, detail back navigation, and browser navigation", () => {
    const filteredUrl = "/member/preview?design=a&view=insight-orders&lens=kpi&quantity=2&period=last-week&fair=mv-mle-sep04&brand=Zanotti&query=SO-2609-003";
    window.history.replaceState(null, "", filteredUrl);
    const first = render(<InsightDesignPreview design="a" />);
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    first.unmount();
    render(<InsightDesignPreview design="a" />);
    const expectFilters = () => {
      expect(screen.getByRole("heading", { level: 1, name: "KPI sales orders" })).toBeInTheDocument();
      expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("2");
      expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("last-week");
      expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("mv-mle-sep04");
      expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Zanotti");
      expect(screen.getByRole("textbox", { name: "Search sales orders" })).toHaveValue("SO-2609-003");
      expect(screen.getByRole("status")).toHaveTextContent("1 order");
    };
    expectFilters();
    fireEvent.click(screen.getByRole("button", { name: /SO-2609-003/ }));
    expect(screen.getByRole("heading", { level: 1, name: "SO-2609-003" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "KPI sales orders" }));
    expectFilters();
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    expect(screen.getByRole("heading", { name: "No matching orders" })).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, "", filteredUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expectFilters();

    select("Order brand", "Akemi");
    expect(screen.getByRole("heading", { name: "No matching orders" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("Any");
    expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("last-week");
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("all");
    expect(screen.getByRole("textbox", { name: "Search sales orders" })).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("2 orders · with KPI");
  });

  it("preserves a downline's selected fair and period through KPI analysis and exact-quantity orders", () => {
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    select("Performance period", "last-week");
    select("Fair / venue", "mv-mle-sep04");
    fireEvent.click(screen.getByRole("button", { name: /Marcus Lee Sales advisor/ }));
    fireEvent.click(screen.getByRole("button", { name: /KPI items/ }));
    expect(screen.getByRole("region", { name: "KPI order coverage" })).toHaveTextContent("3 of 3 orders with KPI");
    expect(screen.getByRole("region", { name: "KPI order averages" })).toHaveTextContent("3.0");
    expect(screen.getByRole("region", { name: "Selected fair" })).toHaveTextContent("MLE Modern Home Living · 4–6 Sep");
    fireEvent.click(screen.getByRole("button", { name: "View sales orders" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 order · with KPI");
    expect(screen.getByRole("button", { name: /SO-2609-014/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SO-2609-003/ })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("mv-mle-sep04");
    expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("last-week");
    expect(params().get("person")).toBe("marcus");
    expect(params().get("scope")).toBe("team");

    fireEvent.click(screen.getByRole("button", { name: /SO-2609-014/ }));
    expect(screen.getByRole("heading", { name: "The impact of this order" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "KPI sales orders" }));
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("button", { name: "KPI items" }));
    expect(screen.getByRole("region", { name: "KPI order coverage" })).toHaveTextContent("3 of 3 orders with KPI");
    expect(screen.getByRole("region", { name: "Selected fair" })).toHaveTextContent("MLE Modern Home Living · 4–6 Sep");
    fireEvent.click(main().getByRole("button", { name: "Insight" }));
    expect(screen.getByRole("heading", { level: 1, name: "Marcus Lee" })).toBeInTheDocument();
  });

  it("discloses incomplete margins for the IOI team fair, its summary, and Wei's ranking and personal results", () => {
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    fireEvent.click(screen.getByRole("button", { name: "By venue" }));
    const ioi = screen.getByRole("button", { name: /11–13 Sep IOI City Mall MLE Modern Home Living/ });
    expect(ioi).toHaveTextContent("1 order awaiting margin");
    fireEvent.click(ioi);

    expect(screen.getByRole("heading", { level: 1, name: "IOI City Mall" })).toBeInTheDocument();
    const wei = screen.getByRole("button", { name: /Wei Jun/ });
    expect(wei).toHaveTextContent("34.0% margin");
    expect(wei).toHaveTextContent("1 order awaiting margin");
    // The summary and the affected seller each disclose their own coverage.
    const coverage = main().getAllByText(/^1 order awaiting margin(?:;|$)/);
    expect(coverage).toHaveLength(2);
    expect(coverage.some((note) => !wei.contains(note))).toBe(true);
    fireEvent.click(wei);

    expect(screen.getByRole("heading", { level: 1, name: "Wei Jun" })).toBeInTheDocument();
    expect(params().get("fair")).toBe("ioi-mle-sep11");
    const margin = screen.getByRole("button", { name: /Zanotti margin/ });
    expect(margin).toHaveTextContent("34.00%");
    expect(margin).toHaveTextContent("1 order awaiting margin");
    expect(main().getByText("IOI City Mall", { exact: true })).toBeInTheDocument();
  });

  it("opens a combined monthly sales list from the sales overview while preserving distinct margin and KPI entry points", () => {
    window.history.replaceState(null, "", `${previewPath}&period=last-week&fair=mv-mle-sep04`);
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(within(screen.getByRole("region", { name: "Jia En sales performance" })).getByRole("button"));
    expect(screen.getByRole("heading", { level: 1, name: "Monthly targets" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Explore this month’s orders/ }));

    expect(screen.getByRole("heading", { level: 1, name: "All sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Margin tier" })).toHaveValue("all");
    expect(screen.getByRole("group", { name: "KPI quantity filter" })).toBeInTheDocument();
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("Any");
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("month");
    expect(screen.getByRole("status")).toHaveTextContent("6 orders");
    expect(screen.getByRole("button", { name: /SO-2609-002/ })).toHaveTextContent("0 items");
    expect(params().get("lens")).toBe("sales");

    fireEvent.click(screen.getByRole("button", { name: "Sales overview" }));
    expect(screen.getByRole("heading", { level: 1, name: "Monthly targets" })).toBeInTheDocument();
    fireEvent.click(main().getByRole("button", { name: "Insight" }));
    openAllMarginOrders();
    expect(screen.getByRole("heading", { level: 1, name: "Sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Margin tier" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "KPI quantity filter" })).not.toBeInTheDocument();
    fireEvent.click(main().getByRole("button", { name: "Insight" }));
    fireEvent.click(screen.getByRole("button", { name: /KPI items/ }));
    fireEvent.click(screen.getByRole("button", { name: "View sales orders" }));
    expect(screen.getByRole("heading", { level: 1, name: "KPI sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "KPI quantity filter" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Margin tier" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("4 orders · with KPI");
  });

  it("intersects brand, margin tier, exact KPI quantity, venue and search in the combined sales list", () => {
    window.history.replaceState(null, "", "/member/preview?design=a&view=insight-orders&lens=sales");
    render(<InsightDesignPreview design="a" />);
    select("Order brand", "Zanotti");
    expect(screen.getByRole("status")).toHaveTextContent("4 orders");
    select("Margin tier", "low");
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    const order = screen.getByRole("button", { name: /SO-2609-005/ });
    for (const value of ["Low margin", "RM 7,000", "22.0%", "1 item"]) {
      expect(order).toHaveTextContent(value);
    }
    expect(screen.queryByRole("button", { name: /SO-2609-002/ })).not.toBeInTheDocument();

    // Each additional filter must continue narrowing the same result set.
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    expect(screen.getByRole("status")).toHaveTextContent("0 orders");
    fireEvent.click(screen.getByRole("button", { name: "Decrease KPI quantity" }));
    select("Fair / venue", "mv-mle-sep04");
    expect(screen.getByRole("status")).toHaveTextContent("0 orders");
    select("Fair / venue", "mv-bighome-sep11");
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    fireEvent.change(screen.getByRole("textbox", { name: "Search sales orders" }), { target: { value: "Akemi" } });
    expect(screen.getByRole("heading", { name: "No matching orders" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search sales orders" }), { target: { value: "SO-2609-005" } });
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    expect(screen.getByRole("button", { name: /SO-2609-005/ })).toBeInTheDocument();
    expect(params().get("brand")).toBe("Zanotti");
    expect(params().get("tier")).toBe("low");
    expect(params().get("quantity")).toBe("1");
    expect(params().get("fair")).toBe("mv-bighome-sep11");
    expect(params().get("query")).toBe("SO-2609-005");
  });

  it("includes zero-KPI orders in combined sales and resets quantity or all filters without switching lenses", () => {
    window.history.replaceState(null, "", "/member/preview?design=a&view=insight-orders&lens=sales");
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease KPI quantity" }));
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "Decrease KPI quantity" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("2 orders");
    expect(screen.getByRole("button", { name: /SO-2609-002/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SO-2609-006/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SO-2609-005/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Any quantity" }));
    expect(screen.getByRole("status")).toHaveTextContent("6 orders");
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("Any");

    select("Order brand", "Akemi");
    select("Margin tier", "low");
    select("Fair / venue", "mv-bighome-sep11");
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search sales orders" }), { target: { value: "SO-2609-005" } });
    expect(screen.getByRole("heading", { name: "No matching orders" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("heading", { level: 1, name: "All sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Margin tier" })).toHaveValue("all");
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("all");
    expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("Any");
    expect(screen.getByRole("textbox", { name: "Search sales orders" })).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("6 orders");
    expect(params().get("lens")).toBe("sales");
    expect(params().get("quantity")).toBeNull();
  });

  it("restores every combined sales filter on reload, order back navigation and browser navigation for a downline", () => {
    const filteredUrl = "/member/preview?design=a&view=insight-orders&lens=sales&scope=team&person=marcus&period=last-week&fair=mv-mle-sep04&brand=Zanotti&tier=low&quantity=2&query=SO-2609-014";
    window.history.replaceState(null, "", filteredUrl);
    const first = render(<InsightDesignPreview design="a" />);
    expect(screen.getByRole("status")).toHaveTextContent("1 order");
    first.unmount();
    render(<InsightDesignPreview design="a" />);
    const expectFilters = () => {
      expect(screen.getByRole("heading", { level: 1, name: "All sales orders" })).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("last-week");
      expect(screen.getByRole("combobox", { name: "Order brand" })).toHaveValue("Zanotti");
      expect(screen.getByRole("combobox", { name: "Margin tier" })).toHaveValue("low");
      expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("mv-mle-sep04");
      expect(screen.getByLabelText("KPI item quantity")).toHaveTextContent("2");
      expect(screen.getByRole("textbox", { name: "Search sales orders" })).toHaveValue("SO-2609-014");
      expect(screen.getByRole("status")).toHaveTextContent("1 order");
      expect(params().get("person")).toBe("marcus");
      expect(params().get("scope")).toBe("team");
    };
    expectFilters();
    fireEvent.click(screen.getByRole("button", { name: /SO-2609-014/ }));
    expect(screen.getByRole("heading", { level: 1, name: "SO-2609-014" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The impact of this order" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All sales orders" }));
    expectFilters();
    fireEvent.click(screen.getByRole("button", { name: "Increase KPI quantity" }));
    expect(screen.getByRole("heading", { name: "No matching orders" })).toBeInTheDocument();
    act(() => {
      window.history.replaceState(null, "", filteredUrl);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expectFilters();
  });

  it("opens a monthly personal quick insight above filtered performance and follows its order across venues", () => {
    window.history.replaceState(null, "", `${previewPath}&period=last-week&fair=mv-mle-sep04`);
    render(<InsightDesignPreview design="a" />);
    expect(screen.getByRole("region", { name: "Jia En sales performance" })).toHaveTextContent("26,000");
    const trigger = screen.getByRole("button", { name: "Open Jia En quick insight" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Quick insight" });
    const report = within(dialog);
    expect(report.getByRole("region", { name: "Monthly performance comparison" })).toHaveTextContent("50,200");
    expect(report.getByText("Calculated from sample data. No AI service connected.")).toBeInTheDocument();
    expect(report.getByRole("button", { name: "Review low-margin order SO-2609-005" })).toBeInTheDocument();
    expect(params().get("fair")).toBe("mv-mle-sep04");
    expect(params().get("period")).toBe("last-week");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(report.getByRole("button", { name: "Close quick insight" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(screen.getByRole("region", { name: "Jia En sales performance" })).toHaveTextContent("26,000");

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Review low-margin order SO-2609-005" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "SO-2609-005" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The impact of this order" })).toBeInTheDocument();
    expect(params().get("period")).toBeNull();
    expect(params().get("fair")).toBeNull();
    expect(params().get("scope")).toBeNull();
    expect(main().getByRole("button", { name: /Mid Valley Big Home/ })).toBeInTheDocument();
  });

  it("opens the correct downline order from a monthly team quick insight even when another venue is selected", () => {
    window.history.replaceState(null, "", `${previewPath}&scope=team&fair=ioi-mle-sep11`);
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: /Team quick insight/ }));
    const report = within(screen.getByRole("dialog", { name: "Team quick insight" }));
    const comparison = report.getByLabelText("Team member comparisons");
    expect(comparison).not.toHaveAttribute("open");
    fireEvent.click(within(comparison).getByText("Compare team members"));
    expect(comparison).toHaveAttribute("open");
    const members = within(comparison);
    expect(members.getByRole("button", { name: "View Marcus Lee's performance" })).toBeInTheDocument();
    expect(members.getByRole("button", { name: "View Aisyah Ahmad's performance" })).toBeInTheDocument();
    expect(members.getByRole("button", { name: "View Wei Jun's performance" })).toBeInTheDocument();
    expect(members.queryByRole("button", { name: "View Jia En's performance" })).not.toBeInTheDocument();
    fireEvent.click(report.getByRole("button", { name: "Review low-margin order SO-2609-014" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "SO-2609-014" })).toBeInTheDocument();
    expect(main().getByText("RM 24,000")).toBeInTheDocument();
    expect(params().get("person")).toBe("marcus");
    expect(params().get("scope")).toBe("team");
    expect(params().get("fair")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Order unavailable" })).not.toBeInTheDocument();
  });

  it("takes a team summary to a member's whole-month performance and their low-margin order list", () => {
    window.history.replaceState(null, "", `${previewPath}&scope=team&period=last-week&fair=mv-mle-sep04`);
    render(<InsightDesignPreview design="a" />);
    fireEvent.click(screen.getByRole("button", { name: /Team quick insight/ }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Team quick insight" })).getByText("Compare team members"));
    fireEvent.click(screen.getByRole("button", { name: "View Marcus Lee's performance" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Marcus Lee" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Marcus Lee sales performance" })).toHaveTextContent("61,000");
    expect(screen.getByRole("combobox", { name: "Performance period" })).toHaveValue("month");
    expect(screen.queryByRole("region", { name: "Selected fair" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Marcus Lee quick insight" }));
    fireEvent.click(screen.getByRole("button", { name: "Review all low-margin orders" }));
    expect(screen.getByRole("heading", { level: 1, name: "Sales orders" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Margin tier" })).toHaveValue("low");
    expect(screen.getByRole("combobox", { name: "Fair / venue" })).toHaveValue("all");
    expect(screen.getByRole("status")).toHaveTextContent("2 orders");
    expect(screen.getByRole("button", { name: /SO-2609-014/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SO-2609-015/ })).toBeInTheDocument();
    expect(params().get("person")).toBe("marcus");
    expect(params().get("scope")).toBe("team");
  });
});
