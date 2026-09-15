import type { AnchorHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData, MemberInsight } from "@/lib/member/types";
import { fetchMemberInsight } from "@/app/(member)/member/actions";
import { fetchMemberKpiSummary } from "@/app/(member)/member/kpi-summary-actions";
import MemberWorkspace from "./MemberWorkspace";

vi.mock("@/components/layout/view-as-actions", () => ({ setViewAs: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("@/app/(member)/member/actions", () => ({
  fetchMemberInsight: vi.fn(), fetchMemberOrgMap: vi.fn(), refreshMemberData: vi.fn(),
  calculateMemberQuote: vi.fn().mockResolvedValue({ ok: false, error: "No quote requested by this test" }),
  submitMemberRequest: vi.fn(), acknowledgeMemberMemo: vi.fn(),
}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({ fetchMemberKpiSummary: vi.fn() }));
vi.mock("@/app/(member)/member/arena-actions", () => ({ fetchMemberArena: vi.fn(), saveMemberArenaBrandWeeks: vi.fn() }));

function liveData(): MemberData {
  const data = memberDemo();
  return { ...data, demo: false, configured: true, profile: { ...data.profile, name: "Live signed-in seller" } };
}

function liveInsight(period = "2026-09"): MemberInsight {
  const margin = period === "2026-08" ? 31.25 : 47;
  return { period, live: period === "2026-09", asOf: "2026-09-16T02:00:00Z", blocks: [{
    membershipId: "fair", schemeId: "fair-scheme", department: "Fair", title: "Team Leader", rank: "A", rankSort: 10,
    me: { staffId: "real-self", name: "Live signed-in seller", sales: 2500, held: 0, orders: 3, kpiQty: 8,
      marginRevenue: 2500, marginCost: 1435, blindOrders: 0, lastOrder: "2026-09-15" },
    target: null, boards: [], downline: [],
    orders: [
      { id: "live-ak-1", number: "LIVE-AK-001", brand: "Akemi", revenue: 600, margin, date: "2026-09-15", manual: false, cleared: true, kpiQty: 4, carried: false },
      { id: "live-ak-2", number: "LIVE-AK-002", brand: "Akemi", revenue: 1400, margin, date: "2026-09-14", manual: true, cleared: true, kpiQty: 1, carried: false },
      { id: "live-za-1", number: "LIVE-ZA-001", brand: "Zanotti", revenue: 500, margin: 25, date: "2026-09-13", manual: false, cleared: true, kpiQty: 3, carried: false },
    ],
  }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Freeze Date only; promises, React work and waitFor retain real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-16T02:00:00Z"));
  localStorage.clear();
  window.history.replaceState({}, "", "/member?page=today&department=fair");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.mocked(fetchMemberInsight).mockImplementation(async period => ({ ok: true, data: liveInsight(period) }));
  vi.mocked(fetchMemberKpiSummary).mockResolvedValue({ ok: true, data: {
    schemeId: "fair-scheme", period: "2026-09", asOf: "2026-09-16T02:00:00Z", enabled: true,
    items: [{ productCode: "PILLOW", label: "Pillow", quantity: 5 }, { productCode: "PROTECTOR", label: "Protector", quantity: 3 }],
    total: 8, threshold: 12, hit: false,
  } });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });

function mobileNav() { return within(screen.getByRole("navigation", { name: "Mobile navigation" })); }

describe("Live C Revenue workspace integration", () => {
  it("opens the exact live brand orders from Today without going to a preview fixture route", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    const { container } = render(<MemberWorkspace initialData={liveData()} />);
    const margin = await screen.findByRole("button", { name: /Akemi margin 47.00%/ });
    expect(margin).not.toHaveTextContent("43.08%");
    expect(container.querySelector('[data-revenue-design="c"]')).toBeInTheDocument();
    expect(container.querySelector("[data-revenue-preview]")).toBeNull();
    expect(container.querySelector('a[href*="/member/preview"]')).toBeNull();
    fireEvent.click(margin);
    await screen.findByRole("heading", { name: "Sales orders", level: 1 });
    expect(screen.getByLabelText("Brand")).toHaveValue("Akemi");
    expect(screen.getAllByRole("button", { name: /View order LIVE-/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "View order LIVE-ZA-001" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Selected order summary")).toHaveTextContent("47.00%");
    expect(window.location.pathname).toBe("/member");
    expect(new URL(window.location.href).searchParams.get("brand")).toBe("Akemi");
    expect(assign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View order LIVE-AK-002" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Keyed in by hand");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Brand")).toHaveValue("Akemi");
    fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "Zanotti" } });
    expect(new URL(window.location.href).searchParams.get("brand")).toBe("Zanotti");
    expect(screen.getAllByRole("button", { name: /View order LIVE-/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Back to Insight" }));
    expect(screen.getByRole("heading", { name: "Insight", level: 1 })).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.has("screen")).toBe(false);
    expect(new URL(window.location.href).searchParams.has("brand")).toBe(false);
  });

  it("uses actual combined KPI quantities and the returned threshold, never the demo ten-item rule", async () => {
    render(<MemberWorkspace initialData={liveData()} />);
    await waitFor(() => expect(screen.getByRole("region", { name: "KPI item summary" })).toHaveTextContent("12 items"));
    const summary = within(screen.getByRole("region", { name: "KPI item summary" }));
    expect(summary.getByText("8")).toBeInTheDocument();
    expect(summary.getByText("Pillow").nextElementSibling).toHaveTextContent("5");
    expect(summary.getByText("Protector").nextElementSibling).toHaveTextContent("3");
    expect(summary.getByText("In progress")).toBeInTheDocument();
    expect(summary.queryByText("Threshold hit")).not.toBeInTheDocument();
    expect(summary.queryByText("10 items")).not.toBeInTheDocument();
    expect(fetchMemberKpiSummary).toHaveBeenCalledWith("fair-scheme");
  });

  it("keeps unavailable live KPI values pending instead of silently substituting demo quantities", async () => {
    vi.mocked(fetchMemberKpiSummary).mockResolvedValue({ ok: false, error: "Real KPI feed is unavailable" });
    render(<MemberWorkspace initialData={liveData()} />);
    await screen.findByText("Real KPI feed is unavailable");
    const summary = screen.getByRole("region", { name: "KPI item summary" });
    expect(summary).toHaveTextContent("Awaiting data");
    expect(summary).not.toHaveTextContent("Shared threshold");
    expect(summary).not.toHaveTextContent("27");
  });

  it("reloads the current month for Today after examining a closed Insight month", async () => {
    render(<MemberWorkspace initialData={liveData()} />);
    await screen.findByRole("button", { name: /Akemi margin 47.00%/ });
    fireEvent.click(mobileNav().getByRole("button", { name: "Insight" }));
    fireEvent.change(screen.getByLabelText("Insight month"), { target: { value: "2026-08" } });
    await screen.findByRole("button", { name: /Akemi margin 31.25%/ });
    fireEvent.click(screen.getByRole("button", { name: "Refresh performance" }));
    await screen.findByRole("button", { name: /Akemi margin 31.25%/ });
    expect(vi.mocked(fetchMemberInsight).mock.calls.at(-1)).toEqual(["2026-08"]);
    fireEvent.click(mobileNav().getByRole("button", { name: "Today" }));
    await screen.findByRole("button", { name: /Akemi margin 47.00%/ });
    expect(screen.queryByRole("button", { name: /Akemi margin 31.25%/ })).not.toBeInTheDocument();
    expect(vi.mocked(fetchMemberInsight).mock.calls.at(-1)).toEqual([undefined]);
  });

  it("preserves quote draft and income privacy across real navigation and page motion", async () => {
    const data = liveData();
    localStorage.setItem(`member-cart-v1-${data.profile.userId}`, JSON.stringify({
      schemeId: "fair-scheme", price: "7999", delivery: "500", lines: [{ productId: "cloud-q", quantity: 2, gift: false }],
    }));
    window.history.replaceState({}, "", "/member?page=quote&quoteView=calculator&department=fair");
    render(<MemberWorkspace initialData={data} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue("7999"));
    fireEvent.click(mobileNav().getByRole("button", { name: "Today" }));
    await screen.findByRole("button", { name: /Akemi margin 47.00%/ });
    fireEvent.click(screen.getByRole("button", { name: "Hide all income amounts" }));
    fireEvent.click(screen.getByRole("button", { name: "Income details" }));
    expect(screen.getByRole("button", { name: "Show all income amounts" })).toBeInTheDocument();
    expect(localStorage.getItem("member-hide-amounts")).toBe("true");
    fireEvent.click(mobileNav().getByRole("button", { name: "Quote" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue("7999"));
    expect(screen.getByRole("button", { name: "Your combination" })).toHaveTextContent("2 products");
    expect(screen.getByText("Additional charges").closest("summary")).toHaveTextContent(/500\.00/);
    expect(window.location.pathname).toBe("/member");
  });

  it("offers real desktop destinations and keeps disabled Quote access out of both navs", async () => {
    const data = liveData();
    window.history.replaceState({}, "", "/member?page=today&department=ir");
    render(<MemberWorkspace initialData={data} />);
    const desktop = within(screen.getByRole("navigation", { name: "Desktop navigation" }));
    expect(desktop.getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "page");
    expect(desktop.queryByRole("button", { name: "Quote" })).not.toBeInTheDocument();
    expect(mobileNav().queryByRole("button", { name: "Quote" })).not.toBeInTheDocument();
    fireEvent.click(desktop.getByRole("button", { name: "Requests" }));
    expect(new URL(window.location.href).searchParams.get("page")).toBe("requests");
    expect(desktop.getByRole("button", { name: "Requests" })).toHaveAttribute("aria-current", "page");
    expect(mobileNav().getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(window.location.pathname).toBe("/member");
    await waitFor(() => expect(fetchMemberInsight).toHaveBeenCalled());
  });
});
