import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shareRequestFromRow, type ShareContext, type ShareRequest } from "@/lib/member/share-requests";
import { OrderSheet } from "../InsightSheets";
import type { OrderSheetVM } from "../insight-model";
import ShareOrderSheet from "./ShareOrderSheet";
import ShareRequestSheet from "./ShareRequestSheet";

// Share order (2026-10-21 — the user, circling the bill's deposit chip: "加一个三点，可以 share order request … 我可以把这个
// order allocation 分在不同的 sales 之间 … 先 notify 被 share 的那个人 … Accept 之后，才会去到 HR").
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const LUCAS = "29161184-da38-4c9a-b869-b2c7fba86aeb";
const ANTHONY = "79516ca3-333e-420d-988a-bef4228a178a";
const BEN = "5b0a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
const ORDER = "9561b2c9-5b7f-4228-9378-286ff4ff2b44";

const vm = (over: Partial<OrderSheetVM> = {}): OrderSheetVM => ({
  no: "HC-SO-2610-004", ref: null, cust: "Mdm Tan", where: "Week 1 · MITEC", status: "Deposit cleared", statusTone: "good",
  amt: "RM 4,300", margin: "38.0%", marginInk: "", tier: "Incentive Tier 1", kpi: "2", lines: [], own: true, share: null, ...over,
});

const request = (over: Record<string, unknown> = {}): ShareRequest => shareRequestFromRow({
  id: "r1", status: "partner", orderId: ORDER, orderNo: "HC-SO-2610-004", periodMonth: "2026-10", subDepartmentId: "fair",
  owner: { id: LUCAS, name: "LUCAS" }, note: "Closed it together", createdAt: "2026-10-21T02:00:00Z", updatedAt: "2026-10-21T02:00:00Z",
  decidedAt: null, decidedByName: null, decisionNote: null, mine: "partner",
  bill: { date: "2026-10-04", customer: "Mdm Tan", venue: "MITEC", total: 4300, ownerId: LUCAS, counts: true, periodMonth: "2026-10" },
  parts: [{ id: ANTHONY, name: "ANTHONY", pct: 0.5, answer: "pending", answeredAt: null, note: null }],
  holders: [{ id: LUCAS, name: "LUCAS", pct: 1, owner: true }],
  events: [{ step: "sent", name: "LUCAS", at: "2026-10-21T02:00:00Z", note: "Closed it together" }],
  ...over,
})!;

const context = (over: Partial<ShareContext> = {}): ShareContext => ({
  orderId: ORDER, orderNo: "HC-SO-2610-004", total: 4300, blocked: null, request: null,
  holders: [{ id: LUCAS, name: "LUCAS", pct: 1, owner: true }],
  team: [
    { id: ANTHONY, name: "ANTHONY", title: "Sales Executive", unavailable: null },
    { id: BEN, name: "BEN", title: "Sales Executive", unavailable: null },
    { id: "teng", name: "TENG YIK", title: null, unavailable: "No Revenue app login yet" },
  ],
  ...over,
});

describe("the bill's ⋯", () => {
  it("shares the reader's own bill", () => {
    const onShare = vi.fn();
    render(<OrderSheet open vm={vm()} onClose={() => {}} canShare onShare={onShare} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Share order" }));
    expect(onShare).toHaveBeenCalled();
  });

  it("opens the request already open on it instead — and says where it stands", () => {
    const onRequest = vi.fn();
    render(<OrderSheet open vm={vm()} onClose={() => {}} canShare request={{ id: "r1", status: "Waiting for ANTHONY" }} onRequest={onRequest} />);
    expect(screen.getByText("Waiting for ANTHONY")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Share request" }));
    expect(onRequest).toHaveBeenCalledWith("r1");
  });

  it("is not on a bill somebody shared with the reader, which says whose it is", () => {
    render(<OrderSheet open vm={vm({ own: false, share: { line: "LUCAS 50% · ANTHONY 50%", sub: "LUCAS’s bill · your part 50% · RM 2,150 in your sales" } })} onClose={() => {}} canShare />);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(screen.getByText("LUCAS 50% · ANTHONY 50%")).toBeTruthy();
    expect(screen.getByText("LUCAS’s bill · your part 50% · RM 2,150 in your sales")).toBeTruthy();
  });

  it("is not there for an account whose Requests box is closed", () => {
    render(<OrderSheet open vm={vm()} onClose={() => {}} canShare={false} />);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });
});

describe("Share order", () => {
  // 2026-10-21 — the user: "only can share one pax, then percentage for them request is fix with 50% 50%".
  it("shares with the one colleague picked — half each — and sends their half", async () => {
    const load = vi.fn(async () => ({ ok: true as const, data: context() }));
    const onSend = vi.fn(async () => ({ ok: true as const, data: request() }));
    const onOpenRequest = vi.fn();
    render(<ShareOrderSheet open orderId={ORDER} ownerName="LUCAS" readOnly={false} load={load} onSend={onSend} onOpenRequest={onOpenRequest} onClose={() => {}} />);
    const split = (await screen.findByText("SPLIT · HALF EACH")).parentElement!;
    expect(split).toHaveTextContent("LUCAS (you)RM 2,150.0050%Your colleagueRM 2,150.0050%");
    expect((screen.getByRole("button", { name: "Pick who sold it with you" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /^ANTHONY/ }));
    expect(split).toHaveTextContent("LUCAS (you)RM 2,150.0050%ANTHONYRM 2,150.0050%");
    fireEvent.click(screen.getByRole("radio", { name: /^BEN/ }));
    expect(screen.getByRole("radio", { name: /^BEN/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /^ANTHONY/ }).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("button", { name: /More for|Less for/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /^ANTHONY/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Closed it together" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to ANTHONY" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith({ orderId: ORDER, parts: [{ staffId: ANTHONY, pct: 0.5 }], note: "Closed it together" }));
    expect(onOpenRequest).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
  });

  it("names who cannot take a part, and why", async () => {
    render(<ShareOrderSheet open orderId={ORDER} ownerName="LUCAS" readOnly={false} load={async () => ({ ok: true, data: context() })}
      onSend={vi.fn()} onOpenRequest={vi.fn()} onClose={() => {}} />);
    const teng = await screen.findByRole("radio", { name: /TENG YIK/ });
    expect((teng as HTMLButtonElement).disabled).toBe(true);
    expect(teng).toHaveTextContent("No Revenue app login yet");
  });

  it("says why the bill cannot be shared now, with no form", async () => {
    render(<ShareOrderSheet open orderId={ORDER} ownerName="LUCAS" readOnly={false}
      load={async () => ({ ok: true, data: context({ blocked: "Oct 2026 is in payroll, so who shares HC-SO-2610-004 cannot change." }) })}
      onSend={vi.fn()} onOpenRequest={vi.fn()} onClose={() => {}} />);
    expect(await screen.findByText("Oct 2026 is in payroll, so who shares HC-SO-2610-004 cannot change.")).toBeTruthy();
    expect(screen.queryByText("WHO SOLD IT WITH YOU")).toBeNull();
  });

  it("View as shows the form and sends nothing", async () => {
    render(<ShareOrderSheet open orderId={ORDER} ownerName="LUCAS" readOnly load={async () => ({ ok: true, data: context() })}
      onSend={vi.fn()} onOpenRequest={vi.fn()} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("radio", { name: /^ANTHONY/ }));
    expect((screen.getByRole("button", { name: "Read-only while viewing as" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the database's refusal in words", async () => {
    render(<ShareOrderSheet open orderId={ORDER} ownerName="LUCAS" readOnly={false} load={async () => ({ ok: true, data: context() })}
      onSend={async () => ({ ok: false, error: "ANTHONY’s Oct 2026 is closed on Comm Cal, so they cannot take a part of this bill now." })}
      onOpenRequest={vi.fn()} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("radio", { name: /^ANTHONY/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send to ANTHONY" }));
    expect(await screen.findByText("ANTHONY’s Oct 2026 is closed on Comm Cal, so they cannot take a part of this bill now.")).toBeTruthy();
  });
});

describe("a share request", () => {
  it("lets the colleague named accept or decline, with a note", async () => {
    const onAnswer = vi.fn(async () => ({ ok: true as const, data: request({ status: "hr" }) }));
    render(<ShareRequestSheet open request={request()} staffId={ANTHONY} readOnly={false} onAnswer={onAnswer} onWithdraw={vi.fn()} onClose={() => {}} />);
    const sheet = screen.getByRole("dialog", { name: "Share request HC-SO-2610-004" });
    expect(sheet).toHaveTextContent("Waiting for ANTHONY");
    expect(sheet).toHaveTextContent("SplitLUCAS 50% · ANTHONY 50%");
    expect(within(sheet).getByText("ANTHONY").parentElement).toHaveTextContent("ANTHONY50% · RM 2,150.00Waiting");
    expect(sheet).toHaveTextContent("Share request sent21 Oct, 10:00LUCAS");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Yes, we closed it together" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith("r1", true, "Yes, we closed it together"));
  });

  it("lets its salesperson withdraw it — on a second tap", async () => {
    const onWithdraw = vi.fn(async () => ({ ok: true as const, data: request({ status: "cancelled" }) }));
    render(<ShareRequestSheet open request={request({ mine: "owner" })} staffId={LUCAS} readOnly={false} onAnswer={vi.fn()} onWithdraw={onWithdraw} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw request" }));
    expect(onWithdraw).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tap again to withdraw" }));
    await waitFor(() => expect(onWithdraw).toHaveBeenCalledWith("r1"));
  });

  it("reads only, viewed as", () => {
    render(<ShareRequestSheet open request={request()} staffId={ANTHONY} readOnly onAnswer={vi.fn()} onWithdraw={vi.fn()} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });

  it("says why it is not there", () => {
    render(<ShareRequestSheet open request={null} error="That share request is not there any more." staffId={ANTHONY} readOnly={false} onAnswer={vi.fn()} onWithdraw={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText("That share request is not there any more.")).toBeTruthy();
  });
});
