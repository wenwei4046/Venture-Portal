import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommRatioContext, CommRatioSaved } from "@/lib/member/comm-ratio";
import { OrderSheet } from "../InsightSheets";
import type { OrderSheetVM } from "../insight-model";
import CommRatioSheet, { openingPick, pickedRatio } from "./CommRatioSheet";

// A bill's commission ratio (2026-11-27 — the user, on a bill's sheet: a Revenue Director "点三个点后可以调动 commission：
// 1. 他可以选 ratio 自己填（25%、50%、75% 都可以调）2. … below margin 的 … 改成 [standard] margin，不用扣 50% … 同理 … 他可以调成
// 50%").
class NoResize { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => { vi.stubGlobal("ResizeObserver", NoResize); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ORDER = "4c8e4f1e-7a0b-4c55-9f0a-1d2e3f4a5b6c";

const context = (over: Partial<CommRatioContext> = {}): CommRatioContext => ({
  orderId: ORDER, orderNo: "HC-SO-2611-006", month: "2026-11", margin: 26.5,
  ladder: { label: "Below margin Tier 3", multiplier: 0.25 }, ratio: null, refusal: null, ...over,
});
const saved = (ratio: number | null): CommRatioSaved => ({ orderId: ORDER, orderNo: "HC-SO-2611-006", ratio, changed: true });

type Save = (orderId: string, ratio: number | null, note: string | null) => Promise<{ ok: true; data: CommRatioSaved } | { ok: false; error: string }>;

function sheet(ctx: CommRatioContext, onSave: Save = vi.fn(async (_o: string, r: number | null) => ({ ok: true as const, data: saved(r) })), readOnly = false) {
  const onSaved = vi.fn();
  render(<CommRatioSheet open orderId={ORDER} readOnly={readOnly} load={async () => ({ ok: true, data: ctx })} onSave={onSave}
    onSaved={onSaved} onClose={() => {}} />);
  return { onSave, onSaved };
}

const pressed = () => screen.getAllByRole("button", { pressed: true }).map(b => b.textContent);

describe("the bill's ⋯ for a Revenue Director", () => {
  const vm = (over: Partial<OrderSheetVM> = {}): OrderSheetVM => ({
    no: "HC-SO-2611-006", ref: null, cust: "ANTHONY · Lee", where: "Week 1 · MITEC", status: "Deposit cleared", statusTone: "good",
    amt: "RM 10,000", margin: "26.5%", marginInk: "", tier: "Below margin Tier 3", kpi: "0", lines: [], own: false, share: null, ...over,
  });

  it("has Adjust commission on a bill that is not theirs", () => {
    const onAdjust = vi.fn();
    render(<OrderSheet open vm={vm()} onClose={() => {}} canAdjust onAdjust={onAdjust} />);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getAllByRole("menuitem").map(m => m.textContent)).toEqual(["Adjust commission"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Adjust commission" }));
    expect(onAdjust).toHaveBeenCalled();
  });

  it("has no ⋯ without it — and Share order stays the reader's own bill's", () => {
    render(<OrderSheet open vm={vm()} onClose={() => {}} canShare canNotMine />);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("says the ratio set on the bill under its head", () => {
    render(<OrderSheet open vm={vm({ ratio: { line: "75% · KRIS", sub: "Set 27 Nov · repeat customer" } })} onClose={() => {}} />);
    expect(screen.getByText("COMMISSION")).toBeTruthy();
    expect(screen.getByText("75% · KRIS")).toBeTruthy();
    expect(screen.getByText("Set 27 Nov · repeat customer")).toBeTruthy();
  });
});

describe("Adjust commission", () => {
  it("opens on its margin, and says what its ladder alone pays", async () => {
    sheet(context());
    await screen.findByText("HC-SO-2611-006 · Nov 2026");
    expect(screen.getByText("26.5% · Below margin Tier 3")).toBeTruthy();
    expect(screen.getByText("Its margin pays 25%")).toBeTruthy();
    expect(pressed()).toEqual(["Follow margin · 25%"]);
    expect((screen.getByRole("button", { name: "Follow its margin" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("raises a below-margin bill to its full commission", async () => {
    const { onSave, onSaved } = sheet(context());
    fireEvent.click(await screen.findByRole("button", { name: "100%" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Customer is a repeat buyer " } });
    fireEvent.click(screen.getByRole("button", { name: "Set to 100%" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved(1)));
    expect(onSave).toHaveBeenCalledWith(ORDER, 1, "Customer is a repeat buyer");
  });

  it("cuts a normal bill to half", async () => {
    const { onSave } = sheet(context({ margin: 40, ladder: { label: null, multiplier: 1 } }));
    expect(await screen.findByText("40.0%")).toBeTruthy();
    expect(screen.getByText("Its margin pays 100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "50%" }));
    fireEvent.click(screen.getByRole("button", { name: "Set to 50%" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(ORDER, 0.5, null));
  });

  it("takes any percentage typed, and refuses what is none", async () => {
    const { onSave } = sheet(context());
    fireEvent.click(await screen.findByRole("button", { name: "Other" }));
    const field = screen.getByRole("textbox", { name: "Commission %" });
    fireEvent.change(field, { target: { value: "abc" } });
    expect((screen.getByRole("button", { name: "Set to …" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Set to 60%" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(ORDER, 0.6, null));
  });

  it("opens on the ratio set, and Follow margin takes it off", async () => {
    const { onSave } = sheet(context({ ratio: { pct: 0.75, by: "KRIS", at: "2026-11-27T02:00:00Z", note: "Repeat customer" } }));
    expect(await screen.findByText("SET NOW")).toBeTruthy();
    expect(screen.getByText("75% · KRIS")).toBeTruthy();
    expect(screen.getByText("Set 27 Nov · Repeat customer")).toBeTruthy();
    expect(pressed()).toEqual(["75%"]);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Repeat customer");
    fireEvent.click(screen.getByRole("button", { name: "Follow margin · 25%" }));
    // Nothing asked of why: the margin decides again.
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Follow its margin" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(ORDER, null, null));
  });

  it("opens a typed ratio under Other", () => {
    expect(openingPick(context({ ratio: { pct: 0.6, by: null, at: null, note: null } }))).toEqual({ kind: "other", text: "60" });
    expect(openingPick(context({ ratio: { pct: 0, by: null, at: null, note: null } }))).toEqual({ kind: "step", ratio: 0 });
    expect(pickedRatio({ kind: "other", text: "33.33" })).toBe(0.3333);
    expect(pickedRatio({ kind: "other", text: "101" })).toBeUndefined();
  });

  it("says why it cannot change, and offers nothing", async () => {
    sheet(context({ refusal: "HC-SO-2611-006 is KRIS's own bill — a Revenue Director's own bills are never cut." }));
    expect(await screen.findByText("HC-SO-2611-006 is KRIS's own bill — a Revenue Director's own bills are never cut.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "100%" })).toBeNull();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("changes nothing while viewing as", async () => {
    const { onSave } = sheet(context(), undefined, true);
    fireEvent.click(await screen.findByRole("button", { name: "100%" }));
    const button = screen.getByRole("button", { name: "Read-only while viewing as" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("says the database's refusal where it stands", async () => {
    const onSave = vi.fn(async () => ({ ok: false as const, error: "The run for November 2026 has paid — what its bills pay cannot change." }));
    const { onSaved } = sheet(context(), onSave);
    fireEvent.click(await screen.findByRole("button", { name: "75%" }));
    fireEvent.click(screen.getByRole("button", { name: "Set to 75%" }));
    expect(await screen.findByText("The run for November 2026 has paid — what its bills pay cannot change.")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
