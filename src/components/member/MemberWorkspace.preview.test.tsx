import type { AnchorHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import MemberWorkspace from "./MemberWorkspace";

vi.mock("@/components/layout/view-as-actions", () => ({ setViewAs: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("@/app/(member)/member/actions", () => ({
  calculateMemberQuote: vi.fn(), submitMemberRequest: vi.fn(),
  acknowledgeMemberMemo: vi.fn(), refreshMemberData: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState({}, "", "/member/preview?design=c&page=today&department=fair");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("Revenue workspace design preview", () => {
  it("limits the searchable member list to own descendants while keeping the full department map", () => {
    window.history.replaceState({}, "", "/member/preview?design=c&page=team&department=fair");
    render(<MemberWorkspace initialData={memberDemo()} previewDesign="c" />);
    expect(screen.getByRole("button", { name: /Daniel Tan/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hakim Yusof/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Member list" }));
    for (const name of ["Marcus Lee", "Aisyah Ahmad", "Wei Jun", "Kumar Raj", "Nadia Rahman"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    }
    for (const name of ["Daniel Tan", "Sarah Lim", "Hakim Yusof", "Lily Goh"]) {
      expect(screen.queryByRole("button", { name: new RegExp(name) })).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole("button", { name: /Jia En/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Kumar Raj/ }));
    expect(within(screen.getByRole("dialog")).getByText("Marcus Lee")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search your team by name" }), { target: { value: "Daniel" } });
    expect(screen.getByRole("heading", { name: "No matching team members" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Daniel Tan/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(screen.getByRole("button", { name: /Daniel Tan/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hakim Yusof/ })).toBeInTheDocument();
  });

  it.each(["a", "c"] as const)("opens each Today margin brand in the %s Insight order list", design => {
    render(<MemberWorkspace initialData={memberDemo()} previewDesign={design} />);
    const marginSection = screen.getByRole("heading", { name: "This month's margin" }).closest("section")!;
    const margin = within(marginSection);
    const akemi = margin.getByRole("link", { name: /Akemi/ });
    const zanotti = margin.getByRole("link", { name: /Zanotti/ });
    expect(akemi).toHaveAttribute("href", `/member/preview?design=${design}&view=insight-orders&brand=Akemi`);
    expect(zanotti).toHaveAttribute("href", `/member/preview?design=${design}&view=insight-orders&brand=Zanotti`);
    expect(akemi).toHaveTextContent("43.08%");
    expect(zanotti).toHaveTextContent("31.14%");
    expect(screen.queryByRole("button", { name: /View orders and margins/ })).not.toBeInTheDocument();
  });

  it.each(["a", "c"] as const)("retains %s while opening tabs and links to the separate Insight design", design => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    render(<MemberWorkspace initialData={memberDemo()} previewDesign={design} />);
    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(screen.queryByRole("navigation", { name: "Desktop navigation" })).not.toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Insight" })).toHaveAttribute("href", `/member/preview?design=${design}&view=insight`);
    expect(within(navigation).getByRole("link", { name: "Arena" })).toHaveAttribute("href", `/member/preview?design=${design}&view=arena`);
    fireEvent.click(within(navigation).getByRole("button", { name: "Profile" }));
    expect(new URL(window.location.href).searchParams.get("design")).toBe(design);
    expect(new URL(window.location.href).searchParams.get("page")).toBe("account");
    expect(screen.getByRole("link", { name: "My honours" })).toHaveAttribute("href", `/member/preview?design=${design}&view=badges`);
    fireEvent.click(screen.getByRole("button", { name: "Open Insight" }));
    expect(assign).toHaveBeenCalledWith(`/member/preview?design=${design}&view=insight`);
    expect(screen.getByRole("button", { name: "Search workspace" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Notifications,/ })).toBeInTheDocument();
  });

  it("keeps the quote draft when page motion remounts the content", async () => {
    window.history.replaceState({}, "", "/member/preview?design=c&page=quote&quoteView=calculator&department=fair");
    const data = memberDemo();
    localStorage.setItem(`member-cart-v1-${data.profile.userId}`, JSON.stringify({
      schemeId: "fair-scheme", price: "7999", delivery: "500",
      lines: [{ productId: "cloud-q", quantity: 2, gift: false }],
    }));
    render(<MemberWorkspace initialData={data} previewDesign="c" />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue("7999"));
    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    fireEvent.click(within(navigation).getByRole("button", { name: "Today" }));
    expect(screen.queryByRole("textbox", { name: "Selling price" })).not.toBeInTheDocument();
    fireEvent.click(within(navigation).getByRole("button", { name: "Quote" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue("7999"));
    expect(screen.getByRole("button", { name: "Your combination" })).toHaveTextContent("2 products");
    expect(new URL(window.location.href).searchParams.get("design")).toBe("c");
  });

  it("uses the C design on live data with real mobile and desktop destinations", () => {
    const { container } = render(<MemberWorkspace initialData={{ ...memberDemo(), demo: false }} previewDesign="c" />);
    expect(container.querySelector("[data-revenue-preview]")).toBeNull();
    expect(container.querySelector('[data-revenue-design="c"]')).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Desktop navigation" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(navigation).getByRole("button", { name: "Insight" })).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "Arena" })).toBeInTheDocument();
    expect(container.querySelector('a[href*="/member/preview"]')).toBeNull();
  });
});

vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({ fetchMemberKpiSummary: vi.fn().mockResolvedValue({ ok: false, error: "KPI unavailable in this navigation test" }) }));
vi.mock("@/app/(member)/member/arena-actions", () => ({ fetchMemberArena: vi.fn().mockResolvedValue({ ok: false, error: "Arena unavailable in this navigation test" }), saveMemberArenaBrandWeeks: vi.fn() }));
