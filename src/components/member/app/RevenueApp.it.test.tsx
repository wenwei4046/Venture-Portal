import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { ItRequest } from "@/lib/it-requests/model";
import type { MemberData } from "@/lib/member/types";
import type { ItNoteInput, ItSubmitInput } from "@/app/(member)/member/it-actions";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// IT support in the Revenue app (2026-10-20 — the user: "i want add on a button to get submit for IT support or help",
// circling Profile › Settings; everybody's in the sidebar for "just principal or ulitmate full access"; "如果我们给它 fix
// 了，他那边就可以收到 fix 的通知").
const nav = vi.hoisted(() => ({ router: { push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} } }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/member",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => nav.router,
}));
vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/it-actions", () => ({}));
vi.mock("@/app/(member)/member/share-actions", () => ({}));
vi.mock("@/app/(member)/member/arena-actions", () => ({}));
vi.mock("@/app/(member)/member/kpi-summary-actions", () => ({}));
vi.mock("@/lib/it-requests/upload", () => ({ uploadItFile: vi.fn(), removeItUpload: vi.fn() }));

class NoResize { observe() {} unobserve() {} disconnect() {} }

const request = (over: Partial<ItRequest> = {}): ItRequest => ({
  id: "r1", ref: "IT-0007", category: "bug", title: "The Quote freezes on step 2", details: "Tapped Next twice.",
  status: "new", app: "revenue", device: "iPhone · Safari", createdAt: "2026-10-05T02:15:00Z", updatedAt: "2026-10-05T02:15:00Z",
  statusAt: null, statusByName: null, senderName: "JIA EN", senderTitle: "Team Leader", mine: true, files: [], notes: [], ...over,
});

function memberData(): MemberData {
  return { ...memberDemo(), demo: false, memos: [], requests: [], incomes: [] };
}

function principalData(): MemberData {
  const demo = memberDemo();
  return {
    ...demo, demo: false, principalView: true,
    profile: { id: "principal", userId: "principal", name: "Principal", email: "principal@example.invalid", salary: null },
    memberships: demo.memberships.map(m => ({ ...m, title: "Principal", rank: "All access",
      people: [{ id: "anthony", name: "ANTHONY", title: "Team Leader", rank: "Rank A", parentId: null, self: false }] })),
    memos: [], requests: [], incomes: [],
  };
}

function source() {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: memberData() })),
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, orderBook: none, arena: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, claimRates: none, submitRequest: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
    documents: vi.fn(async () => ({ ok: true as const, data: [] })),
    itMine: vi.fn(async () => ({ ok: true as const, data: [request()] })),
    itDesk: vi.fn(async () => ({ ok: true as const, data: [request({ mine: false, senderName: "YUNY" }), request({ id: "r9", ref: "IT-0009", title: "Arena shows last month", status: "in_progress", mine: false, senderName: "YUNY" })] })),
    itSubmit: vi.fn(async (input: ItSubmitInput) => ({ ok: true as const, data: request({ id: "r10", ref: "IT-0010", title: input.title, category: "suggestion" }) })),
    itNote: vi.fn(async (input: ItNoteInput) => ({ ok: true as const, data: request({ mine: false, senderName: "YUNY", status: input.status ?? input.current, statusByName: "Principal" }) })),
    itSign: vi.fn(async () => ({ ok: true as const, data: {} })),
    itOpen: none,
  } satisfies RevenueSource;
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(search: string, options: { data?: () => MemberData; itDesk?: { group: string; edit: boolean } } = {}) {
  window.history.replaceState({}, "", `/member${search}`);
  const live = source();
  const make = options.data ?? memberData;
  render(<RevenueApp initialData={make()} initialSearch={search} today="2026-10-05" source={live} itDesk={options.itDesk ?? null} />);
  await act(async () => {});
  return live;
}

const rows = () => screen.getAllByRole("button", { name: /IT-00\d\d/ });

describe("IT support", () => {
  it("sits right under Memos & notifications in Profile › Your workspace, and opens only what one sent", async () => {
    const live = await open("?page=account");
    const workspace = screen.getByRole("heading", { name: "Your workspace" }).closest("section")!;
    const names = within(workspace).getAllByRole("button").map(b => b.getAttribute("aria-label") ?? b.textContent ?? "");
    const memos = names.findIndex(n => n.startsWith("Memos & notifications"));
    expect(memos).toBeGreaterThan(0);
    expect(names[memos + 1]).toBe("IT support");
    expect(names[0]).not.toBe("IT support");
    fireEvent.click(screen.getByRole("button", { name: "IT support" }));
    expect(await screen.findByRole("heading", { name: "IT support" })).toBeInTheDocument();
    await waitFor(() => expect(rows().map(r => r.textContent)).toEqual([expect.stringContaining("The Quote freezes on step 2")]));
    expect(live.itMine).toHaveBeenCalled();
    expect(live.itDesk).not.toHaveBeenCalled();
    expect(screen.queryByRole("tablist", { name: "IT requests" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^IT requests/ })).toBeNull();
  });

  it("sends a request — its number said, and it heads the list", async () => {
    const live = await open("?page=account&view=it");
    await waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /Send a request/ }));
    const form = screen.getByRole("dialog", { name: "Send to IT" });
    fireEvent.click(within(form).getByRole("button", { name: "Suggestion" }));
    fireEvent.change(within(form).getByRole("textbox", { name: "Title" }), { target: { value: "Bigger buttons" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send to IT" }));
    expect(await within(form).findByText("IT-0010")).toBeInTheDocument();
    expect(live.itSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: "suggestion", title: "Bigger buttons", details: "", files: [] }));
    fireEvent.click(within(form).getByRole("button", { name: "Done" }));
    expect(rows().map(r => r.textContent)).toEqual([expect.stringContaining("Bigger buttons"), expect.stringContaining("The Quote freezes")]);
  });

  it("opens the request a tapped notice names, and the address keeps only the page", async () => {
    await open("?page=account&view=it&it=r1");
    expect(await screen.findByRole("dialog", { name: "The Quote freezes on step 2" })).toBeInTheDocument();
    expect(window.location.search).toBe("?page=account&view=it");
  });

  it("shows where support belongs in View as, but cannot open another person's private requests", async () => {
    const live = await open("?page=account&staff=anthony", { data: principalData });
    expect(screen.getByRole("button", { name: /Documentation/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "IT support" })).toBeDisabled();
    expect(screen.getByText("Exit View as to send your own request")).toBeInTheDocument();
    const workspace = screen.getByRole("heading", { name: "Your workspace" }).closest("section")!;
    const names = within(workspace).getAllByRole("button").map(b => b.getAttribute("aria-label") ?? b.textContent ?? "");
    expect(names[names.findIndex(n => n.startsWith("Memos & notifications")) + 1]).toBe("IT support");
    fireEvent.click(screen.getByRole("button", { name: "IT support" }));
    expect(live.itMine).not.toHaveBeenCalled();
  });

  it.each(["it", "itdesk"])("does not read the real account's private requests through a View as %s deep link", async view => {
    const live = await open(`?page=account&view=${view}&staff=anthony&it=r1`, {
      data: principalData, itDesk: { group: "PRINCIPAL", edit: true },
    });
    expect(screen.getByText("Exit View as to read and send your own requests.")).toBeInTheDocument();
    expect(screen.queryByText("The Quote freezes on step 2")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /^IT requests/ })).toBeNull();
    expect(live.itMine).not.toHaveBeenCalled();
    expect(live.itDesk).not.toHaveBeenCalled();
    expect(live.itSign).not.toHaveBeenCalled();
  });
});

describe("IT requests — the Principal's and Ultimate full access's", () => {
  const DESK = { group: "PRINCIPAL", edit: true };

  it("draws everybody's under All, the sidebar's row counting the New", async () => {
    const live = await open("?page=account&view=itdesk", { itDesk: DESK });
    expect(await screen.findByRole("heading", { name: "IT requests" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("tab", { name: "All · 1 new" })).toHaveAttribute("aria-selected", "true"));
    expect(live.itDesk).toHaveBeenCalled();
    expect(rows().map(r => r.textContent)).toEqual([expect.stringContaining("YUNY"), expect.stringContaining("Arena shows last month")]);
    expect(screen.getByRole("button", { name: /^IT requests/ })).toHaveTextContent("IT requests1");
  });

  it("marks one Fixed — and the list shows it at once", async () => {
    const live = await open("?page=account&view=itdesk", { itDesk: DESK });
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(rows()[0]);
    const box = await screen.findByRole("dialog", { name: "The Quote freezes on step 2" });
    fireEvent.click(within(within(box).getByRole("group", { name: "Status" })).getByRole("button", { name: "Fixed" }));
    fireEvent.change(within(box).getByRole("textbox", { name: "Your note" }), { target: { value: "Fixed in today's update." } });
    fireEvent.click(within(box).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(live.itNote).toHaveBeenCalledWith({ id: "r1", body: "Fixed in today's update.", files: [], status: "fixed", current: "new" }));
    await waitFor(() => expect(rows()[0]).toHaveTextContent("Fixed"));
    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
  });

  it("is nobody's sidebar row without the desk", async () => {
    await open("?page=account&view=itdesk");
    expect(await screen.findByRole("heading", { name: "IT support" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "IT requests" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^IT requests/ })).toBeNull();
  });
});
