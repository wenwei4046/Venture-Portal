import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notMineRequestFromRow, type NotMineContext, type NotMineRequest } from "@/lib/member/not-mine-requests";
import { OrderSheet } from "../InsightSheets";
import type { OrderSheetVM } from "../insight-model";
import NotMineSheet from "./NotMineSheet";
import NotMineRequestSheet from "./NotMineRequestSheet";
import { notMineRequestVM } from "./not-mine-model";

// Not my order (2026-11-14 — the user: "如果同时他们能够来 select 他们的 sales order，就是 press 在电话的时候，then 他可以写
// request 'not my order'，and then HR approve … 现在他们那边本来就有一个 function（比如三个点之类的），按他们的 sales order 可以
// share 单，现在是多了一个 function").
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ORDER = "9561b2c9-5b7f-4228-9378-286ff4ff2b44";

const vm = (over: Partial<OrderSheetVM> = {}): OrderSheetVM => ({
  no: "HC-SO-2611-044", ref: null, cust: "Tan May Yi", where: "Week 1 · MID VALLEY", status: "Deposit cleared", statusTone: "good",
  amt: "RM 2,700", margin: "11.8%", marginInk: "", tier: "Below margin Tier 3", kpi: "0", lines: [], own: true, share: null, ...over,
});

const request = (over: Record<string, unknown> = {}): NotMineRequest => notMineRequestFromRow({
  id: "r1", status: "hr", orderId: ORDER, orderNo: "HC-SO-2611-044", periodMonth: "2026-11", subDepartmentId: "fair",
  staff: { id: "shawn", name: "SHAWN" }, reason: "Keyed for ANTHONY", createdAt: "2026-11-14T02:00:00Z", updatedAt: "2026-11-14T02:00:00Z",
  decidedAt: null, decidedByName: null, decisionNote: null,
  bill: { date: "2026-11-03", customer: "Tan May Yi", venue: "MID VALLEY", total: 2700, ownerId: "shawn", counts: true, periodMonth: "2026-11" },
  ...over,
})!;

const context = (over: Partial<NotMineContext> = {}): NotMineContext => ({
  orderId: ORDER, orderNo: "HC-SO-2611-044", total: 2700, customer: "Tan May Yi", blocked: null, request: null, ...over,
});

describe("the bill's ⋯", () => {
  it("has Not my order beside Share order, on the reader's own bill", () => {
    const onNotMine = vi.fn();
    render(<OrderSheet open vm={vm()} onClose={() => {}} canShare canNotMine onShare={() => {}} onNotMine={onNotMine} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getAllByRole("menuitem").map(m => m.textContent)).toEqual(["Share order", "Not my order"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Not my order" }));
    expect(onNotMine).toHaveBeenCalled();
  });

  it("alone when the reader may not share — and never on somebody else's bill", () => {
    render(<OrderSheet open vm={vm()} onClose={() => {}} canNotMine />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getAllByRole("menuitem").map(m => m.textContent)).toEqual(["Not my order"]);
    cleanup();
    render(<OrderSheet open vm={vm({ own: false })} onClose={() => {}} canShare canNotMine />);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("opens the request already with HR instead — and says where it stands under the head", () => {
    const onNotMineRequest = vi.fn();
    render(<OrderSheet open vm={vm()} onClose={() => {}} canNotMine notMine={{ id: "r1", status: "Waiting for HR" }}
      onNotMineRequest={onNotMineRequest} />);
    expect(screen.getByText("NOT MY ORDER")).toBeTruthy();
    expect(screen.getByText("Waiting for HR")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Not my order request" }));
    expect(onNotMineRequest).toHaveBeenCalledWith("r1");
  });
});

describe("Not my order sheet", () => {
  it("sends the reason to HR, then opens the request", async () => {
    const onSend = vi.fn(async (_orderId: string, _reason: string) => ({ ok: true as const, data: request() }));
    const onOpenRequest = vi.fn();
    render(<NotMineSheet open orderId={ORDER} readOnly={false} load={async () => ({ ok: true, data: context() })}
      onSend={onSend} onOpenRequest={onOpenRequest} onClose={() => {}} />);
    await screen.findByText("HC-SO-2611-044 · Tan May Yi · RM 2,700.00");
    const send = screen.getByRole("button", { name: "Send to HR" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Keyed for ANTHONY " } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(onOpenRequest).toHaveBeenCalledWith(request()));
    expect(onSend).toHaveBeenCalledWith(ORDER, "Keyed for ANTHONY");
  });

  it("says the database's refusal, and keeps what was typed", async () => {
    const onSend = vi.fn(async () => ({ ok: false as const, error: "A share request for HC-SO-2611-044 is open — withdraw it first." }));
    render(<NotMineSheet open orderId={ORDER} readOnly={false} load={async () => ({ ok: true, data: context() })}
      onSend={onSend} onOpenRequest={() => {}} onClose={() => {}} />);
    await screen.findByRole("button", { name: "Send to HR" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keyed for ANTHONY" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to HR" }));
    await screen.findByText("A share request for HC-SO-2611-044 is open — withdraw it first.");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keyed for ANTHONY");
  });

  it("says why it cannot be sent now — no form", async () => {
    render(<NotMineSheet open orderId={ORDER} readOnly={false}
      load={async () => ({ ok: true, data: context({ blocked: "Oct 2026 is in payroll, so HC-SO-2611-044 cannot be taken out now." }) })}
      onSend={vi.fn()} onOpenRequest={() => {}} onClose={() => {}} />);
    await screen.findByText("Oct 2026 is in payroll, so HC-SO-2611-044 cannot be taken out now.");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("the request already with HR is a row that opens it", async () => {
    const onOpenRequest = vi.fn();
    render(<NotMineSheet open orderId={ORDER} readOnly={false} load={async () => ({ ok: true, data: context({ request: request() }) })}
      onSend={vi.fn()} onOpenRequest={onOpenRequest} onClose={() => {}} />);
    fireEvent.click(await screen.findByText("NOT MY ORDER"));
    expect(onOpenRequest).toHaveBeenCalledWith(request());
  });

  it("View as reads it and sends nothing", async () => {
    render(<NotMineSheet open orderId={ORDER} readOnly load={async () => ({ ok: true, data: context() })}
      onSend={vi.fn()} onOpenRequest={() => {}} onClose={() => {}} />);
    fireEvent.change(await screen.findByRole("textbox"), { target: { value: "x" } });
    expect((screen.getByRole("button", { name: "Read-only while viewing as" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("a Not my order request's sheet", () => {
  it("shows the reason and the trail; its salesperson withdraws it on a second tap", async () => {
    const onWithdraw = vi.fn(async (id: string) => ({ ok: true as const, data: request({ id, status: "cancelled" }) }));
    render(<NotMineRequestSheet open request={request()} readOnly={false} onWithdraw={onWithdraw} onClose={() => {}} />);
    expect(screen.getByText("Waiting for HR")).toBeTruthy();
    expect(screen.getByText("Keyed for ANTHONY")).toBeTruthy();
    expect(screen.getByText("Sent to HR")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw request" }));
    expect(onWithdraw).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tap again to withdraw" }));
    await waitFor(() => expect(onWithdraw).toHaveBeenCalledWith("r1"));
  });

  it("HR's answer is in it; a decided one cannot be withdrawn; View as never can", () => {
    render(<NotMineRequestSheet open readOnly={false} onWithdraw={vi.fn()} onClose={() => {}}
      request={request({ status: "rejected", decidedAt: "2026-11-15T03:00:00Z", decidedByName: "LI SEAN", decisionNote: "You sold it." })} />);
    // The status beside the bill, and the trail's last step.
    expect(screen.getAllByText("Rejected by HR").length).toBe(2);
    expect(screen.getAllByText("You sold it.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Withdraw request" })).toBeNull();
    cleanup();
    render(<NotMineRequestSheet open request={request()} readOnly onWithdraw={vi.fn()} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Withdraw request" })).toBeNull();
  });
});

describe("notMineRequestVM", () => {
  it("the facts and the trail, in words", () => {
    const approved = notMineRequestVM(request({ status: "approved", decidedAt: "2026-11-15T03:00:00Z", decidedByName: "LI SEAN" }), false);
    expect(approved.status).toBe("Not counted");
    expect(approved.facts.map(f => f.l)).toEqual(["Bill total", "Reason"]);
    expect(approved.log.map(e => [e.what, e.who, e.dot])).toEqual([["Sent to HR", "SHAWN", null], ["Approved by HR · not counted", "LI SEAN", "good"]]);
    expect(approved.canWithdraw).toBe(false);
    const withdrawn = notMineRequestVM(request({ status: "cancelled" }), false);
    expect(withdrawn.log.map(e => e.what)).toEqual(["Sent to HR", "Withdrawn"]);
    const rejected = notMineRequestVM(request({ status: "rejected", decisionNote: "You sold it." }), false);
    expect(rejected.facts.at(-1)).toEqual({ l: "HR’s reason", v: "You sold it." });
    expect(notMineRequestVM(request(), false).canWithdraw).toBe(true);
    expect(notMineRequestVM(request(), true).canWithdraw).toBe(false);
  });
});
