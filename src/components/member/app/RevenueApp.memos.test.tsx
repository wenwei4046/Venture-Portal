import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import type { MemberData, MemberMemo } from "@/lib/member/types";
import { PNG, padPicture, sign } from "@/test/signature";
import type { RevenueSource } from "./source";
import RevenueApp from "./RevenueApp";

// A memo or letter addressed to PEOPLE (People › Documentation, 2026-10-11) is the member's own:
// the Principal's View as shows it only for one of its recipients.
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

class NoResize { observe() {} unobserve() {} disconnect() {} }

const memo = (id: string, title: string, departments: string[], recipients?: string[]): MemberMemo => ({
  id, title, body: "Please read.", sender: "People & Culture", publishedAt: "2026-10-05T02:00:00Z", effectiveAt: "2026-10-05T02:00:00Z",
  version: 1, requiresAck: true, readAt: null, acknowledgedAt: null, departments, ...(recipients ? { recipients } : {}),
});

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
    memos: [
      memo("m-fair", "October brand weeks", [demo.memberships[0].name]),
      memo("m-anthony", "Offer letter", [], ["anthony"]),
      memo("m-yuny", "Warning letter", [], ["yuny"]),
    ],
    requests: [], incomes: [],
  };
}

function source(make: () => MemberData) {
  const none = vi.fn(async () => ({ ok: false as const, error: "not in this test" }));
  return {
    refresh: vi.fn(async () => ({ ok: true as const, data: make() })),
    insight: none, kpi: none, orgMap: none, insightRange: none, quote: none, memo: none, requestHistory: none, orderBook: none, arena: none,
    cancelRequest: none, income: none, departmentIncome: none, honours: none, claimRates: none, submitRequest: none,
    memoReceipts: vi.fn(async () => ({ ok: true as const, data: [] })),
  } satisfies RevenueSource;
}

beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); padPicture(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function open(search: string, make: () => MemberData) {
  window.history.replaceState({}, "", `/member${search}`);
  render(<RevenueApp initialData={make()} initialSearch={search} today="2026-10-05" source={source(make)} />);
  await act(async () => {});
}

describe("memos addressed to people, in View as", () => {
  it("viewing a member: their sub-department's memos and what was addressed to them — not somebody else's letter", async () => {
    await open("?page=account&view=memos&staff=anthony", principalData);
    expect((await screen.findAllByText("October brand weeks")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Offer letter").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Warning letter")).toHaveLength(0);
  });

  it("viewing nobody: only what went to a sub-department", async () => {
    await open("?page=account&view=memos", principalData);
    expect((await screen.findAllByText("October brand weeks")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Offer letter")).toHaveLength(0);
    expect(screen.queryAllByText("Warning letter")).toHaveLength(0);
  });

  it("a member's own snapshot holds only theirs, and shows it", async () => {
    const own = (): MemberData => ({ ...memberDemo(), demo: false, requests: [], incomes: [], memos: [memo("m-own", "Increment letter", [])] });
    await open("?page=account&view=memos", own);
    expect((await screen.findAllByText("Increment letter")).length).toBeGreaterThan(0);
  });
});

// 2026-10-12 — the user: Kris "在打开 memo 时是看不到附件的". The file sent with a memo is a row of its sheet — its tile,
// its name, View and a download — each a short link made at the tap.
describe("a memo's file", () => {
  const withFile = (): MemberData => ({
    ...memberDemo(), demo: false, requests: [], incomes: [],
    memos: [{ ...memo("m-file", "House rules", []), attachmentName: "20261011_161025.jpg.jpeg", attachmentType: "image/jpeg", kind: "Memo" }],
  });

  it("shows in the memo, and View opens its link in a tab readied at the tap", async () => {
    window.history.replaceState({}, "", "/member?page=account&view=memos");
    const src = source(withFile);
    const memoFile = vi.fn(async () => ({ ok: true as const, data: { url: "https://files.example/rules.jpeg", fileName: "20261011_161025.jpg.jpeg" } }));
    const tab = { opener: {} as unknown, location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    render(<RevenueApp initialData={withFile()} initialSearch="?page=account&view=memos" today="2026-10-05" source={{ ...src, memo: vi.fn(async () => ({ ok: true as const, data: { acknowledgedAt: null } })), memoFile }} />);
    await act(async () => {});
    (await screen.findAllByText("House rules"))[0].closest("button")!.click();
    await act(async () => {});
    expect(screen.getByText("20261011_161025.jpg.jpeg")).toBeInTheDocument();
    expect(screen.getByText("JPEG")).toBeInTheDocument();
    screen.getByRole("button", { name: "View" }).click();
    await act(async () => {});
    expect(memoFile).toHaveBeenCalledWith("m-file", "view");
    expect(tab.location.href).toBe("https://files.example/rules.jpeg");
  });
});

// 2026-10-12 — a memo reaches its person in every view: a Principal whose login a People record names reads their OWN
// memos in the Revenue app while viewing nobody, and acknowledges them there (the login's receipt).
describe("the Principal's own memos", () => {
  it("viewing nobody: their own, which they may acknowledge", async () => {
    window.history.replaceState({}, "", "/member?page=account&view=memos");
    const src = source(principalData);
    const ack = vi.fn(async () => ({ ok: true as const, data: { acknowledgedAt: "2026-10-12T10:01:00Z" } }));
    render(<RevenueApp initialData={principalData()} initialSearch="?page=account&view=memos" today="2026-10-05" source={{ ...src, memo: ack }}
      own={{ memos: [memo("m-mine", "Director memo", [], undefined)] }} />);
    await act(async () => {});
    expect((await screen.findAllByText("Director memo")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Offer letter")).toHaveLength(0);
    screen.getAllByText("Director memo")[0].closest("button")!.click();
    await act(async () => {});
    sign(screen.getByLabelText("Sign here"));
    screen.getByRole("button", { name: "Acknowledge" }).click();
    await act(async () => {});
    expect(ack).toHaveBeenCalledWith("m-mine", true, PNG);
    expect(screen.getByText(/You acknowledged this memo/)).toBeInTheDocument();
  });

  it("viewing a member: no pad, nothing to acknowledge", async () => {
    window.history.replaceState({}, "", "/member?page=account&view=memos&staff=anthony");
    const memoSignature = vi.fn(async () => ({ ok: true as const, data: PNG }));
    render(<RevenueApp initialData={principalData()} initialSearch="?page=account&view=memos&staff=anthony" today="2026-10-05"
      source={{ ...source(principalData), memoSignature }} />);
    await act(async () => {});
    (await screen.findAllByText("Offer letter"))[0].closest("button")!.click();
    await act(async () => {});
    expect(screen.queryByLabelText("Sign here")).toBeNull();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
    expect(memoSignature).not.toHaveBeenCalled();
  });

  it("viewing a member: theirs, read-only, as before", async () => {
    await act(async () => {});
    window.history.replaceState({}, "", "/member?page=account&view=memos&staff=anthony");
    render(<RevenueApp initialData={principalData()} initialSearch="?page=account&view=memos&staff=anthony" today="2026-10-05" source={source(principalData)}
      own={{ memos: [memo("m-mine", "Director memo", [], undefined)] }} />);
    await act(async () => {});
    expect(screen.getAllByText("Offer letter").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Director memo")).toHaveLength(0);
  });
});

// 2026-10-20 — the user: "点进去的时候，应该要有一个 signature，也就是他自己手绘签名的那种，签完之后再来点那个 Acknowledge
// button". A memo waiting for the member carries a signature pad; Acknowledge waits for a signature and sends it; one
// they acknowledged shows the signature they gave, read back once when it is opened.
describe("a memo is acknowledged with the member's own signature", () => {
  const own = (): MemberData => ({ ...memberDemo(), demo: false, requests: [], incomes: [], memos: [memo("m-sign", "House rules", [])] });

  it("Acknowledge waits for a signature, then sends it — and the memo shows it", async () => {
    window.history.replaceState({}, "", "/member?page=account&view=memos");
    const ack = vi.fn(async (_id: string, isAck: boolean) => ({ ok: true as const, data: { acknowledgedAt: isAck ? "2026-10-20T10:01:00Z" : null } }));
    render(<RevenueApp initialData={own()} initialSearch="?page=account&view=memos" today="2026-10-20" source={{ ...source(own), memo: ack }} />);
    await act(async () => {});
    (await screen.findAllByText("House rules"))[0].closest("button")!.click();
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeDisabled();
    expect(screen.getByText("Sign above to acknowledge.")).toBeInTheDocument();
    screen.getByRole("button", { name: "Acknowledge" }).click();
    await act(async () => {});
    expect(ack).not.toHaveBeenCalledWith("m-sign", true, expect.anything());
    sign(screen.getByLabelText("Sign here"));
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeEnabled();
    expect(screen.getByText("Your signature, name and time are recorded for HR.")).toBeInTheDocument();
    screen.getByRole("button", { name: "Acknowledge" }).click();
    await act(async () => {});
    expect(ack).toHaveBeenCalledWith("m-sign", true, PNG);
    expect(screen.getByText(/You acknowledged this memo/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Your signature" })).toHaveAttribute("src", PNG);
    expect(screen.queryByLabelText("Sign here")).toBeNull();
  });

  it("a refusal keeps the signature, says why, and sends nothing more", async () => {
    window.history.replaceState({}, "", "/member?page=account&view=memos");
    const ack = vi.fn(async (_id: string, isAck: boolean) => (isAck
      ? { ok: false as const, error: "Sign in the box before you acknowledge." }
      : { ok: true as const, data: { acknowledgedAt: null } }));
    render(<RevenueApp initialData={own()} initialSearch="?page=account&view=memos" today="2026-10-20" source={{ ...source(own), memo: ack }} />);
    await act(async () => {});
    (await screen.findAllByText("House rules"))[0].closest("button")!.click();
    await act(async () => {});
    sign(screen.getByLabelText("Sign here"));
    screen.getByRole("button", { name: "Acknowledge" }).click();
    await act(async () => {});
    expect(screen.getByText("Sign in the box before you acknowledge.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeEnabled();
    expect(screen.queryByText(/You acknowledged this memo/)).toBeNull();
  });

  it("an acknowledged memo, opened, reads its signature back once", async () => {
    const acked = (): MemberData => ({ ...own(), memos: [{ ...memo("m-done", "Old rules", []), readAt: "2026-10-19T02:00:00Z", acknowledgedAt: "2026-10-19T02:05:00Z" }] });
    window.history.replaceState({}, "", "/member?page=account&view=memos");
    const memoSignature = vi.fn(async () => ({ ok: true as const, data: PNG }));
    render(<RevenueApp initialData={acked()} initialSearch="?page=account&view=memos" today="2026-10-20" source={{ ...source(acked), memoSignature }} />);
    await act(async () => {});
    (await screen.findAllByText("Old rules"))[0].closest("button")!.click();
    await act(async () => {});
    expect(memoSignature).toHaveBeenCalledWith("m-done");
    expect(screen.getByRole("img", { name: "Your signature" })).toHaveAttribute("src", PNG);
    expect(screen.queryByLabelText("Sign here")).toBeNull();
    expect(memoSignature).toHaveBeenCalledTimes(1);
  });
});
