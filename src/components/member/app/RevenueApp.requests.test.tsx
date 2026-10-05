import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberOrderBook } from "@/lib/member/order-book";
import type { MemberData, MemberReadContext, MemberRequest } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// The live source's server actions are never reached: the app is handed a source of its own.
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));

class NoResize { observe() {} unobserve() {} disconnect() {} }

/** The Principal viewing ANTHONY, who leads YUNY in Fair. */
function principalData(): MemberData {
  const demo = memberDemo();
  return {
    ...demo, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Principal", email: "principal@example.invalid", salary: null },
    memberships: demo.memberships.map(m => ({ ...m, title: "Principal", rank: "All access",
      people: [
        { id: "anthony", name: "ANTHONY", title: "Team Leader", rank: "Rank A", parentId: null, self: false },
        { id: "yuny", name: "YUNY", title: "Revenue Specialist", rank: "Rank E", parentId: "anthony", self: false },
      ] })),
    memos: [], requests: [], incomes: [],
  };
}

/** Jia En, a member, who leads three people in Fair. */
function memberData(): MemberData {
  return { ...memberDemo(), demo: false, memos: [], requests: [], incomes: [] };
}

function book(from: string, through: string): MemberOrderBook {
  const value = { from, through, asOf: "2026-10-05T04:00:00Z", paysFrom: "2026-09", closedMonths: [], costDivisor: 0.7, brandWeeks: {}, orders: [] };
  return value;
}

// October's first weekend: Jia En and ANTHONY each scored at the Akemi booth of a Penang fair — their brand week.
const seller = (id: string) => ({ id, name: id, sales: 0, held: 0, orders: 2, scoring: true, confirmed: false });
const PENANG_BOOTH = {
  id: "penang-fair|AKEMI", fairId: "penang-fair", brand: "AKEMI", venue: "PENANG WATERFRONT", start: "2026-10-02", end: "2026-10-04",
  periodMonth: "2026-10", week: "2026-10-02", people: [seller("jia"), seller("anthony")],
};

function arena(membershipId: string, period: string, context?: MemberReadContext): MemberArenaSnapshot {
  return {
    principalView: !!context, viewedStaffId: context?.staffId, membershipId, department: "Fair", selfId: context ? "" : "jia",
    period, window: "monthly", from: `${period}-01`, through: `${period}-05`, asOf: "2026-10-05T04:00:00Z", live: true,
    people: [], brands: [], brandWeeks: null, weekLocks: [], tiers: [],
    history: { asOf: "2026-10-05T04:00:00Z", provisional: true, events: period === "2026-10" ? [PENANG_BOOTH] : [], unassignedOrders: 0, unassignedSales: 0,
      championship: { status: "pending", reason: "" } },
  };
}

// HR's rates, and the region HR set for that fair's venue.
const RATES = {
  base: "Klang Valley", perSpot: 50, perPaxNight: 65, groupMaxPax: 3, groupCapPerNight: null,
  regions: [{ id: "kl", name: "KL", spots: 0, planeTicket: false }, { id: "penang", name: "Penang", spots: 4, planeTicket: false }],
  fairs: { "penang-fair": { venue: "PENANG WATERFRONT", regionId: "penang" } },
};
const SENT: MemberRequest = {
  id: "r1", kind: "claim", title: "Outstation claim", status: "submitted", createdAt: "2026-10-05T04:00:00Z",
  submittedAt: "2026-10-05T04:00:00Z", requestNo: "RQ-2610-001", staffId: "jia", detail: { claimType: "outstation", amount: 200 },
};

function source(make: () => MemberData) {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: make() })),
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, saveBrandWeeks: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
    orderBook: vi.fn(async (_sub: string, from: string, until: string) => ({ ok: true as const, data: book(from, until) })),
    arena: vi.fn(async (membershipId: string, period: string, _window: string, context?: MemberReadContext) =>
      ({ ok: true as const, data: arena(membershipId, period, context) })),
    claimRates: vi.fn(async () => ({ ok: true as const, data: RATES })),
    submitRequest: vi.fn(async (form: FormData) => { void form; return { ok: true as const, data: SENT }; }),
  } satisfies RevenueSource;
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function openRequests(make: () => MemberData, search: string) {
  window.history.replaceState({}, "", `/member${search}`);
  const live = source(make);
  render(<RevenueApp initialData={make()} initialSearch={search} today="2026-10-05" source={live} />);
  expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
  await waitFor(() => expect(live.claimRates).toHaveBeenCalled());
  await waitFor(() => expect(live.arena).toHaveBeenCalled());
  await act(async () => {});
  return live;
}

const form = (name: string) => screen.getByRole("dialog", { name });

describe("Requests in View as (user 2026-10-06: the forms open, nothing is sent)", () => {
  it("each form opens on the viewed person's choices and HR's rates, and reads 'Read-only while viewing as'", async () => {
    const live = await openRequests(principalData, "?page=account&view=requests&department=fair&staff=anthony");

    fireEvent.click(screen.getByRole("button", { name: /Submit claim/ }));
    const claim = within(form("Submit claim"));
    // ANTHONY's brand week, at its fair, in the region HR set for the venue.
    expect(claim.getByRole("button", { name: /Akemi week · 2–4 Oct/ })).toHaveAttribute("aria-pressed", "true");
    expect(claim.getByText("Penang")).toBeInTheDocument();
    expect(claim.getByText("RM 200.00")).toBeInTheDocument();
    const cta = claim.getByRole("button", { name: "Read-only while viewing as" });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    fireEvent.click(claim.getByRole("button", { name: "Close" }));

    // ANTHONY's own team — the Principal's snapshot marks nobody as `self`.
    fireEvent.click(screen.getByRole("button", { name: /Submit replacement/ }));
    const replacement = within(form("Submit replacement"));
    expect(replacement.getByRole("button", { name: "YUNY" })).toBeInTheDocument();
    expect(replacement.getByRole("button", { name: "Read-only while viewing as" })).toBeDisabled();
    fireEvent.click(replacement.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: /Submit waiting list/ }));
    expect(within(form("Submit waiting list")).getByRole("button", { name: "Read-only while viewing as" })).toBeDisabled();

    expect(live.submitRequest).not.toHaveBeenCalled();
  });

  it("the Principal viewing nobody is asked whom to view first, and reads no rates", async () => {
    window.history.replaceState({}, "", "/member?page=account&view=requests&department=fair");
    const live = source(principalData);
    render(<RevenueApp initialData={principalData()} initialSearch="?page=account&view=requests&department=fair" today="2026-10-05" source={live} />);
    expect(screen.queryByRole("button", { name: /Submit claim/ })).not.toBeInTheDocument();
    await act(async () => {});
    expect(live.claimRates).not.toHaveBeenCalled();
  });
});

describe("a member's own request", () => {
  it("sends the claim, and the form answers with its request number", async () => {
    const live = await openRequests(memberData, "?page=account&view=requests&department=fair");
    fireEvent.click(screen.getByRole("button", { name: /Submit claim/ }));
    const claim = within(form("Submit claim"));
    expect(claim.getByText("Set by HR for PENANG WATERFRONT")).toBeInTheDocument();
    fireEvent.click(claim.getByRole("button", { name: "Review & submit claim" }));
    expect(await claim.findByText("Request submitted")).toBeInTheDocument();
    expect(claim.getByText("RQ-2610-001")).toBeInTheDocument();
    const sent = live.submitRequest.mock.calls[0][0];
    expect(sent.get("kind")).toBe("claim");
    expect(sent.get("claimType")).toBe("outstation");
    expect(sent.get("week")).toBe("2026-10-02");
    expect(sent.get("subDepartmentId")).toBe("fair");
    // The fair, the place and the region are the database's own: none is sent.
    expect(sent.get("region")).toBeNull();
    expect(sent.get("location")).toBeNull();
  });
});
