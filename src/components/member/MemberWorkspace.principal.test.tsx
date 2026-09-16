import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData, MemberInsight, MemberOrgMap, MemberReadContext } from "@/lib/member/types";
import MemberWorkspace from "./MemberWorkspace";

const mocks = vi.hoisted(() => ({ acknowledge: vi.fn(), submit: vi.fn(), view: vi.fn(), insight: vi.fn(), orgMap: vi.fn(), kpi: vi.fn(), arena: vi.fn(), saveWeeks: vi.fn() }));
vi.mock("@/components/layout/view-as-actions", () => ({ setViewAs: mocks.view }));
vi.mock("@/app/(member)/member/actions", () => ({ acknowledgeMemberMemo: mocks.acknowledge, submitMemberRequest: mocks.submit, fetchMemberInsight: mocks.insight, fetchMemberOrgMap: mocks.orgMap, refreshMemberData: vi.fn(), calculateMemberQuote: vi.fn() }));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({ fetchMemberKpiSummary: mocks.kpi }));
vi.mock("@/app/(member)/member/arena-actions", () => ({ fetchMemberArena: mocks.arena, saveMemberArenaBrandWeeks: mocks.saveWeeks }));

function data(): MemberData {
  const value = memberDemo();
  return { ...value, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Principal", email: "principal@example.invalid", salary: null },
    memberships: value.memberships.map(member => ({ ...member, title: "Principal", rank: "All members", rate: 0, people: member.name === "Fair" ? [
      { id: "lead", name: "Team Lead", title: "Lead", rank: "Gold", parentId: null, self: false },
      { id: "staff", name: "Sales Member", title: "Sales", rank: "Silver", parentId: "lead", self: false },
      { id: "other", name: "Other Lead", title: "Lead", rank: "Gold", parentId: null, self: false },
    ] : [] })),
    memos: [{ id: "memo", title: "Team update", body: "A memo for staff.", sender: "HR", publishedAt: "2026-09-12", effectiveAt: "2026-09-12", version: 1, requiresAck: true, readAt: null, acknowledgedAt: null, departments: ["Fair"] }],
    requests: [{ id: "request", kind: "claim", title: "Member accommodation", status: "needs_info", createdAt: "2026-09-12", detail: { subDepartmentId: "fair", amount: 100 } }],
  };
}
function insight(period = "2026-09", context: MemberReadContext = { staffId: "lead", subDepartmentId: "fair" }): MemberInsight {
  const name = context.staffId === "staff" ? "Sales Member" : "Team Lead";
  const score = { staffId: context.staffId, sales: period === "2026-08" ? 123456 : context.staffId === "staff" ? 2222 : 4000, held: 0, orders: 1, kpiQty: 8, marginRevenue: 4000, marginCost: 2000, blindOrders: 0, lastOrder: "2026-09-15" };
  return { period, live: period === "2026-09", asOf: "2026-09-16T02:00:00Z", blocks: [{ membershipId: context.subDepartmentId, schemeId: `${context.subDepartmentId}-scheme`, department: "Fair", title: "Lead", rank: "Gold", rankSort: 10,
    me: { ...score, name }, target: { rank: "Senior", personal: 10000, months: 1, group: 50000, streak: [] },
    boards: [{ departmentId: "fair", department: "Fair", own: false, rows: [{ ...score, name, title: "Lead", self: false }] }], downline: [],
    orders: [{ id: `${context.staffId}-order`, number: `${context.staffId}-SO`, brand: "Akemi", revenue: 4000, margin: 50, date: "2026-09-15", manual: false, cleared: true, kpiQty: 8, carried: false }],
  }] };
}
function orgMap(): MemberOrgMap {
  const value = data();
  return { asOf: value.refreshedAt, departments: value.memberships.map(member => ({ id: member.id, schemeId: member.schemeId, name: member.name, code: member.code, capacity: member.capacity, mine: false, directors: [] })),
    people: value.memberships.flatMap(member => member.people.map(person => ({ id: `${member.id}:${person.id}`, staffId: person.id, departmentId: member.id, schemeId: member.schemeId, name: person.name, code: null, title: person.title, parentId: person.parentId ? `${member.id}:${person.parentId}` : null, self: false, mine: false }))) };
}
function nav(label: string) { fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile navigation" })).getByRole("button", { name: label })); }
function desktop(label: string) { fireEvent.click(within(screen.getByRole("navigation", { name: "Desktop navigation" })).getByRole("button", { name: label })); }

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-09-16T02:00:00Z"));
  mocks.insight.mockImplementation(async (period, context) => ({ ok: true, data: insight(period, context) }));
  mocks.orgMap.mockResolvedValue({ ok: true, data: orgMap() });
  mocks.kpi.mockResolvedValue({ ok: true, data: { schemeId: "fair-scheme", period: "2026-09", asOf: "2026-09-16T02:00:00Z", enabled: true, items: [{ productCode: "PILLOW", label: "Pillow", quantity: 8 }], total: 8, threshold: 12, hit: false } });
  mocks.arena.mockImplementation(async (membershipId, period, window, context) => ({ ok: true, data: { membershipId, period, window, department: "Fair", selfId: "", principalView: true, viewedStaffId: context.staffId, from: "2026-09-01", through: "2026-09-16", asOf: "2026-09-16T00:00:00Z", live: true, brands: [], brandWeeks: null, people: [{ id: context.staffId, name: "Team Lead", self: false, sales: 4000, held: 0, orders: 1, kpiQty: 8, marginRevenue: 4000, marginCost: 2000, blindOrders: 0, brands: {} }] } }));
  mocks.view.mockResolvedValue(undefined);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState({}, "", "/member?page=today&department=fair");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });

describe("Principal C function parity", () => {
  it("has all five C destinations and selected-staff Today reads without impersonation", async () => {
    const value = data(); const { container } = render(<MemberWorkspace initialData={value} />);
    for (const name of ["Desktop navigation", "Mobile navigation"]) for (const label of ["Today", "Insight", "Quote", "Arena", "Profile"]) expect(within(screen.getByRole("navigation", { name })).getByRole("button", { name: label })).toBeInTheDocument();
    expect(container.querySelector('[data-revenue-design="c"]')).toBeInTheDocument();
    expect(container.querySelector('a[href*="/member/preview"]')).toBeNull();
    expect(screen.getByRole("region", { name: "Member viewing context" })).toHaveTextContent("Read-only · Signed in as Principal");
    expect(screen.getByRole("heading", { name: "Hello, Principal" })).toBeInTheDocument();
    await screen.findByRole("button", { name: /Akemi margin 50.00%/ });
    expect(mocks.insight).toHaveBeenCalledWith(undefined, { staffId: "lead", subDepartmentId: "fair" });
    expect(mocks.kpi).toHaveBeenCalledWith("fair-scheme", { staffId: "lead", subDepartmentId: "fair" });
    expect(screen.getByRole("region", { name: "KPI item summary" })).toHaveTextContent("12 items");
    expect(screen.getByText(/Team commission/)).toBeInTheDocument();
    expect(screen.queryByText("Fixed salary", { exact: true })).not.toBeInTheDocument();
    expect(value.profile.id).toBe("principal");
    expect(value.memberships.flatMap(member => member.people).every(person => !person.self)).toBe(true);
  });
  it.each(["insight", "arena"])("opens %s deep links using the explicit staff context", async page => {
    window.history.replaceState({}, "", `/member?page=${page}&department=fair&staff=staff`);
    render(<MemberWorkspace initialData={data()} />);
    await screen.findByRole("heading", { name: page === "insight" ? "Insight" : "Arena", level: 1 });
    expect(new URL(window.location.href).searchParams.get("page")).toBe(page);
    expect(screen.getByRole("combobox", { name: "Viewing member" })).toHaveValue("staff");
    if (page === "insight") expect(mocks.insight).toHaveBeenLastCalledWith(undefined, { staffId: "staff", subDepartmentId: "fair" });
    else expect(mocks.arena).toHaveBeenLastCalledWith("fair", expect.any(String), "monthly", { staffId: "staff", subDepartmentId: "fair" });
  });
  it("opens brand orders and refreshes the selected historical month", async () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Akemi margin 50.00%/ }));
    await screen.findByRole("heading", { name: "Sales orders" });
    expect(screen.getByLabelText("Brand")).toHaveValue("Akemi");
    fireEvent.click(screen.getByRole("button", { name: "View order lead-SO" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("lead-SO");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    fireEvent.change(screen.getByLabelText("Insight month"), { target: { value: "2026-08" } });
    await waitFor(() => expect(screen.getByLabelText("Insight month")).toHaveValue("2026-08"));
    expect(mocks.insight).toHaveBeenLastCalledWith("2026-08", { staffId: "lead", subDepartmentId: "fair" });
    expect(screen.getByRole("button", { name: "Open profile" })).toHaveTextContent("P");
  });
  it("never labels old-month goals as this month when Today's refresh fails", async () => {
    render(<MemberWorkspace initialData={data()} />); nav("Insight");
    await screen.findByRole("heading", { name: "Insight" });
    fireEvent.change(screen.getByLabelText("Insight month"), { target: { value: "2026-08" } });
    await waitFor(() => expect(screen.getByLabelText("Insight month")).toHaveValue("2026-08"));
    mocks.insight.mockResolvedValue({ ok: false, error: "Current month unavailable" });
    nav("Today");
    await screen.findByRole("button", { name: "Retry member progress" });
    expect(within(screen.getByRole("main")).queryByText(/123,456/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Team Lead · progress" }).closest("section")).toHaveTextContent("Current month unavailable");
  });
  it("discards a delayed old staff response when the member changes", async () => {
    window.history.replaceState({}, "", "/member?page=insight&department=fair");
    let resolveOld!: (result: { ok: boolean; data: MemberInsight }) => void;
    mocks.insight.mockImplementation((_period, context) => context.staffId === "lead" ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ ok: true, data: insight(undefined, context) }));
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Viewing member" }), { target: { value: "staff" } });
    await screen.findByRole("heading", { name: "Insight" });
    await act(async () => resolveOld({ ok: true, data: insight() }));
    expect(screen.getByText(/Sales Member · Fair/)).toBeInTheDocument();
    expect(screen.queryByText(/Team Lead · Fair/)).not.toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("staff")).toBe("staff");
  });
  it("shows the selected ranking without a fake You marker", async () => {
    render(<MemberWorkspace initialData={data()} />); nav("Insight");
    await screen.findByRole("heading", { name: "Insight" });
    fireEvent.click(within(screen.getByRole("main")).getByRole("button", { name: "Team", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: /Department ranking/ }));
    expect(screen.getByText(/Team Lead's place/)).toBeInTheDocument();
    expect(screen.getByText("Viewing", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("You", { exact: true })).not.toBeInTheDocument();
  });
  it("keeps all secondary destinations and privacy controls in mobile Profile", async () => {
    render(<MemberWorkspace initialData={data()} />);
    for (const [label, page] of [["Team income", "income"], ["Team", "team"], ["Requests", "requests"], ["Memos & notifications", "memos"], ["Insight", "insight"], ["Arena", "arena"]]) {
      nav("Profile");
      await act(async () => { fireEvent.click(within(screen.getByRole("main")).getByRole("heading", { name: label, exact: true }).closest("button")!); });
      expect(new URL(window.location.href).searchParams.get("page")).toBe(page);
    }
    nav("Profile"); fireEvent.click(screen.getByRole("button", { name: /Hide income amounts/ }));
    expect(localStorage.getItem("member-hide-amounts")).toBe("true");
    expect(screen.getByText("principal@example.invalid")).toBeInTheDocument();
  });
  it("shows all departments on Map and only the selected reporting tree in Member list", async () => {
    render(<MemberWorkspace initialData={data()} />); desktop("Team");
    const map = await screen.findByRole("application", { name: /Department map/ });
    expect(within(map).getByRole("button", { name: /Other Lead/ })).toBeInTheDocument();
    expect(mocks.orgMap).toHaveBeenCalledWith({ subDepartmentId: "fair" });
    expect(screen.getByRole("button", { name: "Centre on selected member" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Member list" }));
    expect(screen.getByRole("heading", { name: "Team Lead" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sales Member" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Other Lead" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Viewing member" }), { target: { value: "staff" } });
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Team Lead" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Sales Member" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit Waiting List|Submit Replacement/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manage team requests/ })).toBeInTheDocument();
  });
  it("keeps empty-department Insight and the authorized Map without inventing staff", async () => {
    render(<MemberWorkspace initialData={data()} />); nav("Insight");
    await screen.findByRole("heading", { name: "Insight" });
    fireEvent.change(screen.getByRole("combobox", { name: "Revenue department" }), { target: { value: "ir" } });
    expect(screen.getByRole("heading", { name: "No active members in this department" })).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("page")).toBe("insight");
    expect(screen.getByRole("combobox", { name: "Viewing member" })).toBeDisabled();
    expect(mocks.insight.mock.calls.every(call => call[1]?.subDepartmentId !== "ir")).toBe(true);
    desktop("Team"); await screen.findByRole("application", { name: /Department map/ });
    expect(mocks.orgMap).toHaveBeenLastCalledWith({ subDepartmentId: "ir" });
  });
  it("reads memos and routes request review to management without employee writes", () => {
    render(<MemberWorkspace initialData={data()} />);
    fireEvent.click(screen.getByRole("button", { name: /Team update/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("A memo for staff.");
    expect(screen.queryByRole("button", { name: "I have read and acknowledge" })).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    desktop("Requests"); fireEvent.click(screen.getByRole("button", { name: /Member accommodation/ }));
    expect(screen.queryByRole("button", { name: "Update details and resubmit" })).not.toBeInTheDocument();
    const manage = screen.getByRole("button", { name: /Review in Member Services/ }).closest("form")!;
    expect(new FormData(manage).get("role")).toBe("principal");
    expect(new FormData(manage).get("destination")).toBe("/member-admin");
    for (const action of [mocks.acknowledge, mocks.submit, mocks.saveWeeks]) expect(action).not.toHaveBeenCalled();
  });
  it("retains Principal switching and management when no scheme is configured", async () => {
    const value = data(); value.memberships = []; value.configured = false;
    render(<MemberWorkspace initialData={value} />);
    expect(screen.getByRole("heading", { name: "Revenue setup" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "View portal as role" }), { target: { value: "principal" } });
    await waitFor(() => expect(mocks.view).toHaveBeenCalledTimes(1));
    expect((mocks.view.mock.calls[0][0] as FormData).get("role")).toBe("principal");
  });
});
