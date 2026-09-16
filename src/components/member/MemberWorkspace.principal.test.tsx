import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData } from "@/lib/member/types";
import MemberWorkspace from "./MemberWorkspace";

const mocks = vi.hoisted(() => ({ acknowledge: vi.fn(), submit: vi.fn(), view: vi.fn(),
  insight: vi.fn(), orgMap: vi.fn(), kpi: vi.fn(), arena: vi.fn(), saveWeeks: vi.fn() }));
vi.mock("@/components/layout/view-as-actions", () => ({ setViewAs: mocks.view }));
vi.mock("@/app/(member)/member/actions", () => ({
  acknowledgeMemberMemo: mocks.acknowledge, submitMemberRequest: mocks.submit,
  fetchMemberInsight: mocks.insight, fetchMemberOrgMap: mocks.orgMap,
  refreshMemberData: vi.fn(), calculateMemberQuote: vi.fn(),
}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({ fetchMemberKpiSummary: mocks.kpi }));
vi.mock("@/app/(member)/member/arena-actions", () => ({ fetchMemberArena: mocks.arena, saveMemberArenaBrandWeeks: mocks.saveWeeks }));

function data(): MemberData {
  const value = memberDemo();
  return { ...value, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Principal", email: "principal@example.invalid", salary: null },
    memberships: value.memberships.map(member => ({ ...member, title: "Principal", rank: "All members", rate: 0, people: member.name === "Fair" ? [
      { id: "lead", name: "Team Lead", title: "Lead", rank: "Gold", parentId: null, self: false },
      { id: "staff", name: "Sales Member", title: "Sales", rank: "Silver", parentId: "lead", self: false },
    ] : [] })),
    memos: [{ id: "memo", title: "Team update", body: "A memo for staff.", sender: "HR", publishedAt: "2026-09-12", effectiveAt: "2026-09-12", version: 1, requiresAck: true, readAt: null, acknowledgedAt: null, departments: ["Fair"] }],
    requests: [{ id: "request", kind: "claim", title: "Member accommodation", status: "needs_info", createdAt: "2026-09-12", detail: { subDepartmentId: "fair", amount: 100 } }],
  };
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  for (const fetch of [mocks.insight, mocks.orgMap, mocks.kpi, mocks.arena]) fetch.mockResolvedValue({ ok: false, error: "Member data is not available in Principal view" });
  mocks.view.mockResolvedValue(undefined);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState({}, "", "/member?page=today&department=fair");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("Principal Revenue workspace", () => {
  it.each(["insight", "arena"])("returns unsupported Principal %s links to Today without invoking member services", async page => {
    window.history.replaceState({}, "", `/member?page=${page}&department=fair`);
    render(<MemberWorkspace initialData={data()} />);
    await screen.findByRole("heading", { name: "Revenue overview", level: 1 });
    expect(new URL(window.location.href).searchParams.get("page")).toBe("today");
    expect(within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "page");
    for (const fetch of [mocks.insight, mocks.orgMap, mocks.kpi, mocks.arena]) expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the live C header and both role-appropriate navigation bars without member-only fetches", () => {
    const { container } = render(<MemberWorkspace initialData={data()} />);
    expect(container.querySelector('[data-revenue-design="c"]')).toBeInTheDocument();
    expect(container.querySelector("[data-revenue-preview]")).toBeNull();
    expect(container.querySelector('a[href*="/member/preview"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Revenue home" }).closest("header")).toHaveAttribute("data-arena-chrome");
    expect(screen.getByRole("button", { name: "Open profile" })).toHaveTextContent("P");
    for (const name of ["Desktop navigation", "Mobile navigation"]) {
      const nav = within(screen.getByRole("navigation", { name }));
      for (const label of ["Today", "Income", "Quote", "Team", "Profile"]) expect(nav.getByRole("button", { name: label })).toBeInTheDocument();
      expect(nav.getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "page");
      expect(nav.queryByRole("button", { name: "Insight" })).not.toBeInTheDocument();
      expect(nav.queryByRole("button", { name: "Arena" })).not.toBeInTheDocument();
    }
    for (const fetch of [mocks.insight, mocks.orgMap, mocks.kpi, mocks.arena]) expect(fetch).not.toHaveBeenCalled();
  });

  it("navigates the Principal mobile destinations and shared header without opening member self-service", async () => {
    render(<MemberWorkspace initialData={data()} />);
    for (const [label, page, heading] of [
      ["Income", "income", "Team income"], ["Quote", "quote", "Build your offer"],
      ["Team", "team", "Team hierarchy"], ["Profile", "account", "Principal account"],
      ["Today", "today", "Revenue overview"],
    ]) {
      fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("button", { name: label }));
      await screen.findByRole("heading", { name: heading, level: 1 });
      expect(new URL(window.location.href).searchParams.get("page")).toBe(page);
      for (const name of ["Desktop navigation", "Mobile navigation"]) {
        expect(within(screen.getByRole("navigation", { name })).getByRole("button", { name: label })).toHaveAttribute("aria-current", "page");
      }
      expect(screen.getByRole("combobox", { name: "Revenue department" })).toHaveValue("fair");
    }
    fireEvent.click(screen.getByRole("button", { name: "Open profile" }));
    expect(screen.getByRole("heading", { name: "Principal account", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit personal details|Submit Claim|Request resignation|Save brand weeks/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revenue home" }));
    expect(screen.getByRole("heading", { name: "Revenue overview", level: 1 })).toBeInTheDocument();
    for (const action of [mocks.insight, mocks.orgMap, mocks.kpi, mocks.arena, mocks.saveWeeks, mocks.acknowledge, mocks.submit]) expect(action).not.toHaveBeenCalled();
  });

  it("preserves the Principal role switcher as a working form in the C toolbar", async () => {
    render(<MemberWorkspace initialData={data()} />);
    const switcher = within(screen.getByRole("group", { name: "Workspace view and department" })).getByRole("combobox", { name: "View portal as role" });
    fireEvent.change(switcher, { target: { value: "principal" } });
    await waitFor(() => expect(mocks.view).toHaveBeenCalledTimes(1));
    const submitted = mocks.view.mock.calls[0][0] as FormData;
    expect(submitted.get("role")).toBe("principal");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("opens a real team overview without an employee profile or fabricated salary", () => {
    render(<MemberWorkspace initialData={data()} />);
    expect(screen.getByRole("heading", { name: "Revenue overview" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "View portal as role" })).toHaveValue("revenue_member");
    expect(screen.getByRole("option", { name: "Principal" })).toBeInTheDocument();
    expect(screen.queryByText("No member profile linked")).not.toBeInTheDocument();
    expect(screen.queryByText("Fixed salary", { exact: true })).not.toBeInTheDocument();
  });

  it("opens Fair quotation and changes to the empty IR workspace", async () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(screen.getByRole("button", { name: "Build an offer →" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Build your offer" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox", { name: "Revenue department" }), { target: { value: "ir" } });
    expect(screen.getByRole("heading", { name: "Revenue overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "IR workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quote" })).not.toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("department")).toBe("ir");
    expect(screen.getByRole("combobox", { name: "View portal as role" })).toHaveValue("revenue_member");
    for (const name of ["Desktop navigation", "Mobile navigation"]) {
      const nav = within(screen.getByRole("navigation", { name }));
      expect(nav.getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "page");
      expect(nav.getByRole("button", { name: "Income" })).toBeInTheDocument();
      expect(nav.getByRole("button", { name: "Team" })).toBeInTheDocument();
    }
    fireEvent.change(screen.getByRole("combobox", { name: "Revenue department" }), { target: { value: "fair" } });
    expect(within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("button", { name: "Quote" })).toBeInTheDocument();
  });

  it("renders the full hierarchy with no self member and supports search", () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole("button", { name: "Team" }));
    expect(screen.getByRole("heading", { name: "Team Lead" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales Member" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search members by name" }), { target: { value: "Sales Member" } });
    expect(screen.queryByRole("heading", { name: "Team Lead" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales Member" })).toBeInTheDocument();
  });

  it("reads staff memos without acknowledging or submitting as a member", () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(screen.getByRole("button", { name: /Team update/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("A memo for staff.");
    expect(screen.queryByRole("button", { name: "I have read and acknowledge" })).not.toBeInTheDocument();
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("routes staff request management through Principal services, never a resubmission", () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole("button", { name: "Requests" }));
    expect(screen.queryByRole("button", { name: "Submit Claim" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Member accommodation/ }));
    expect(screen.queryByRole("button", { name: "Update details and resubmit" })).not.toBeInTheDocument();
    const manage = screen.getByRole("button", { name: /Review in Member Services/ }).closest("form")!;
    expect(new FormData(manage).get("role")).toBe("principal");
    expect(new FormData(manage).get("destination")).toBe("/member-admin");
  });

  it("keeps the Principal switcher available when Revenue has no active scheme", () => {
    const value = data(); value.memberships = []; value.configured = false;
    render(<MemberWorkspace initialData={value} />);
    expect(screen.getByRole("heading", { name: "Revenue setup" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "View portal as role" })).toBeInTheDocument();
    expect(screen.queryByText("No member profile linked")).not.toBeInTheDocument();
  });
});
