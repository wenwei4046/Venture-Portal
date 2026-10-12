import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberArenaSnapshot } from "@/lib/member/arena";
import type { MemberOrderBook } from "@/lib/member/order-book";
import type { MemberData, MemberReadContext, MemberRequest } from "@/lib/member/types";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// The live source's server actions are never reached: the app is handed a source of its own.
// RevenueApp reads its path (the Product List is a page of its own, 2026-10-08) and steps there with the router.
const nav = vi.hoisted(() => ({ router: { push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/member",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => nav.router,
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
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
    cancelRequest: none, income: none, departmentIncome: none, honours: none, 
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

// HR revamp 7b (2026-10-10): Waiting list & replacements — the queue, and Edit request → Update.
describe("a member's waiting lists and replacements", () => {
  const WAITING = (id: string, status: string, person: string, no: string): MemberRequest => ({
    id, kind: "waiting", title: `${person} · Waiting List`, status, createdAt: "2026-10-04T04:00:00Z", submittedAt: "2026-10-04T04:00:00Z",
    requestNo: no, staffId: "jia",
    detail: { newPerson: person, contact: "012-345 6789", start: "2026-11-03", signature: "Jia En", consent: true, subDepartmentId: "fair", department: "Fair" },
  });
  const withRequests = () => ({ ...memberData(), requests: [WAITING("w1", "waiting", "Siti Aisyah", "RQ-2610-004"), WAITING("w2", "submitted", "Amelia Tan", "RQ-2610-006")] });
  const QUEUE = [{ subDepartmentId: "fair", name: "Fair", rows: [
    { position: 1, name: "Daniel L.", mine: false, requestId: null },
    { position: 2, name: "Siti Aisyah", mine: true, requestId: "w1" },
  ] }];

  it("shows the list, then sends an edit as a revision of the request", async () => {
    const search = "?page=account&view=track&department=fair";
    window.history.replaceState({}, "", `/member${search}`);
    const live = { ...source(withRequests), waitingQueue: vi.fn(async () => ({ ok: true as const, data: QUEUE })) };
    render(<RevenueApp initialData={withRequests()} initialSearch={search} today="2026-10-05" source={live} />);
    expect(await screen.findByRole("heading", { name: "Waiting list & replacements" })).toBeInTheDocument();
    await waitFor(() => expect(live.waitingQueue).toHaveBeenCalledWith(undefined));
    expect(await screen.findByText("Daniel L.")).toBeInTheDocument();
    expect(screen.getByText("Accepted · #2")).toBeInTheDocument();
    expect(screen.getByText("RQ-2610-004 · Fair · 1 ahead")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Amelia Tan · Waiting List/ }));
    const sheet = within(screen.getByRole("dialog", { name: "Amelia Tan · Waiting List" }));
    fireEvent.click(sheet.getByRole("button", { name: "Edit request" }));
    fireEvent.change(sheet.getByLabelText("Phone number"), { target: { value: "011-222 3333" } });
    fireEvent.click(sheet.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(live.submitRequest).toHaveBeenCalledTimes(1));
    const sent = live.submitRequest.mock.calls[0][0];
    expect(Object.fromEntries(sent.entries())).toMatchObject({
      kind: "waiting", requestId: "w2", subDepartmentId: "fair", targetDepartmentId: "fair",
      newPerson: "Amelia Tan", contact: "011-222 3333", start: "2026-11-03", signature: "Jia En", consent: "true",
    });
    await waitFor(() => expect(live.refresh).toHaveBeenCalled());
  });

  it("a Principal viewing a member reads their list, and cannot edit", async () => {
    const search = "?page=account&view=track&department=fair&staff=anthony";
    const viewedRequests = () => ({ ...principalData(), requests: [{ ...WAITING("w2", "submitted", "Amelia Tan", "RQ-2610-006"), staffId: "anthony" }] });
    window.history.replaceState({}, "", `/member${search}`);
    const live = { ...source(viewedRequests), waitingQueue: vi.fn(async () => ({ ok: true as const, data: [] })) };
    render(<RevenueApp initialData={viewedRequests()} initialSearch={search} today="2026-10-05" source={live} />);
    expect(await screen.findByRole("heading", { name: "Waiting list & replacements" })).toBeInTheDocument();
    await waitFor(() => expect(live.waitingQueue).toHaveBeenCalledWith({ staffId: "anthony" }));
    fireEvent.click(await screen.findByRole("button", { name: /Amelia Tan · Waiting List/ }));
    const sheet = within(screen.getByRole("dialog", { name: "Amelia Tan · Waiting List" }));
    expect(sheet.queryByRole("button", { name: "Edit request" })).not.toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
  });
});

// The food claim (2026-10-13): Fair's only, for the titles HR ticked — in View as, the viewed person's title.
describe("a food claim", () => {
  const FOOD = (titles: string[], subDepartmentId = "fair") => ({ ...RATES, food: { subDepartmentId, perDay: 20, titles } });
  async function open(make: () => MemberData, search: string, rates: ReturnType<typeof FOOD>) {
    window.history.replaceState({}, "", `/member${search}`);
    const live = { ...source(make), claimRates: vi.fn(async () => ({ ok: true as const, data: rates })) };
    render(<RevenueApp initialData={make()} initialSearch={search} today="2026-10-05" source={live} />);
    expect(await screen.findByRole("heading", { name: "Requests" })).toBeInTheDocument();
    await waitFor(() => expect(live.claimRates).toHaveBeenCalled());
    await waitFor(() => expect(live.arena).toHaveBeenCalled());
    await act(async () => {});
    return live;
  }

  it("a Team Leader in Fair, a title HR ticked, opens it on their month — sent once the month is over", async () => {
    const live = await open(memberData, "?page=account&view=requests&department=fair", FOOD(["Team Leader"]));
    fireEvent.click(await screen.findByRole("button", { name: /Submit food claim/ }));
    const food = within(form("Submit food claim"));
    expect(food.getByRole("button", { name: "Oct 2026" })).toHaveAttribute("aria-pressed", "true");
    const card = food.getByRole("button", { name: /Akemi week · 2–4 Oct/ });
    expect(card).toHaveTextContent("3 days");
    fireEvent.click(card);
    fireEvent.click(food.getByRole("button", { name: /^Sat 3 Oct/ }));
    expect(food.getByText("RM 40.00")).toBeInTheDocument();
    expect(food.getByText("Claimed once the month is over, from 1 Nov.")).toBeInTheDocument();
    fireEvent.click(food.getByRole("button", { name: "Review & submit claim" }));
    expect(food.getByRole("alert")).toHaveTextContent("Food for Oct 2026 is claimed once the month is over, from 1 Nov.");
    expect(live.submitRequest).not.toHaveBeenCalled();
  });

  it("is not offered to a title HR did not tick, nor outside Fair", async () => {
    await open(memberData, "?page=account&view=requests&department=fair", FOOD(["Revenue Specialist"]));
    expect(screen.getByRole("button", { name: /Submit claim/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit food claim/ })).not.toBeInTheDocument();
    cleanup();
    // Jia En is a Revenue Specialist in IR: ticked, but IR has no food claim.
    await open(memberData, "?page=account&view=requests&department=ir", FOOD(["Revenue Specialist"]));
    expect(screen.queryByRole("button", { name: /Submit food claim/ })).not.toBeInTheDocument();
  });

  it("in View as follows the viewed person's title, and sends nothing", async () => {
    const live = await open(principalData, "?page=account&view=requests&department=fair&staff=anthony", FOOD(["Team Leader"]));
    fireEvent.click(await screen.findByRole("button", { name: /Submit food claim/ }));
    expect(within(form("Submit food claim")).getByRole("button", { name: "Read-only while viewing as" })).toBeDisabled();
    expect(live.submitRequest).not.toHaveBeenCalled();
    cleanup();
    await open(principalData, "?page=account&view=requests&department=fair&staff=yuny", FOOD(["Team Leader"]));
    expect(screen.queryByRole("button", { name: /Submit food claim/ })).not.toBeInTheDocument();
  });

  it("one sent is listed under Food claim and opens on its days", async () => {
    const SENT_FOOD: MemberRequest = {
      id: "f1", kind: "claim", title: "Food claim · Sep 2026", status: "submitted", createdAt: "2026-10-05T04:00:00Z",
      submittedAt: "2026-10-05T04:00:00Z", requestNo: "RQ-2610-009", staffId: "jia",
      detail: { claimType: "food", category: "Food", month: "2026-09", monthLabel: "Sep 2026",
        weeks: [{ week: "2026-09-25", location: "PENANG WATERFRONT", days: ["2026-09-25", "2026-09-26"] }],
        days: ["2026-09-25", "2026-09-26"], dayCount: 2, rate: 20, amount: 40 },
    };
    const withFood = () => ({ ...memberData(), requests: [SENT_FOOD, { ...SENT, id: "r2", requestNo: "RQ-2610-002" }] });
    await open(withFood, "?page=account&view=requests&department=fair", FOOD(["Team Leader"]));
    fireEvent.click(screen.getByRole("button", { name: "Food claim" }));
    const list = screen.getByRole("heading", { name: "My requests" }).closest("section")!;
    expect(within(list).queryByText("Outstation claim")).not.toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: /Food claim · Sep 2026/ }));
    const sheet = within(screen.getByRole("dialog", { name: "Food claim · Sep 2026" }));
    expect(sheet.getByText("Sep 2026")).toBeInTheDocument();
    expect(sheet.getByText("25, 26 Sep · 2 days")).toBeInTheDocument();
    expect(sheet.getByText("PENANG WATERFRONT")).toBeInTheDocument();
    expect(sheet.getByText("RM 20.00")).toBeInTheDocument();
    expect(sheet.getByText("RM 40.00")).toBeInTheDocument();
    expect(sheet.getByRole("button", { name: "Cancel request" })).toBeInTheDocument();
  });
});
