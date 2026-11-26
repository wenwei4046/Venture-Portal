import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMM_RATIO_REFUSED, loadCommRatioContext, saveCommRatio } from "./comm-ratio-server";

// A bill's commission ratio (2026-11-27): the ACCOUNT's Commission ratio cells first, then the database under the
// caller's own session — its refusals said in words, never thrown.
const mocks = vi.hoisted(() => ({ getAccountUser: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getAccountUser: mocks.getAccountUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

const ORDER = "4c8e4f1e-7a0b-4c55-9f0a-1d2e3f4a5b6c";
const director = { id: "kris", is_active: true, permissions: ["comm_ratio", "member_portal"], actions: { "comm_ratio.view": "all", "comm_ratio.edit": "all" } };
const reader = { ...director, actions: { "comm_ratio.view": "all" } };
const member = { id: "anthony", is_active: true, permissions: ["member_portal"], actions: { "revenue_app.view": "own" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAccountUser.mockResolvedValue(director);
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
});

describe("the sheet's read", () => {
  it("asks member_comm_ratio_context for the bill, and reads its answer", async () => {
    mocks.rpc.mockResolvedValue({ data: { orderId: ORDER, orderNo: "HC-SO-2611-006", month: "2026-11", margin: 26.5,
      ladder: { label: "Below margin Tier 3", multiplier: 0.25 }, ratio: null, refusal: null }, error: null });
    expect(await loadCommRatioContext(ORDER)).toMatchObject({ ok: true, data: { orderNo: "HC-SO-2611-006", margin: 26.5 } });
    expect(mocks.rpc).toHaveBeenCalledWith("member_comm_ratio_context", { p_order: ORDER });
  });

  it("is open to Commission ratio · View — and to nobody without it", async () => {
    mocks.getAccountUser.mockResolvedValue(reader);
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "That bill is not there." } });
    expect(await loadCommRatioContext(ORDER)).toEqual({ ok: false, error: "That bill is not there." });
    mocks.getAccountUser.mockResolvedValue(member);
    expect(await loadCommRatioContext(ORDER)).toEqual({ ok: false, error: COMM_RATIO_REFUSED });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("asks nothing for an id that is none", async () => {
    expect(await loadCommRatioContext("HC-SO-2611-006")).toEqual({ ok: false, error: "That bill is not there." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("the write", () => {
  it("sends the ratio to the hundredth of a percent, and why", async () => {
    mocks.rpc.mockResolvedValue({ data: { orderId: ORDER, orderNo: "HC-SO-2611-006", ratio: 0.3333, changed: true }, error: null });
    expect(await saveCommRatio(ORDER, 1 / 3, "  Customer is a repeat buyer ")).toEqual({
      ok: true, data: { orderId: ORDER, orderNo: "HC-SO-2611-006", ratio: 0.3333, changed: true },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("member_comm_ratio_set", { p_order: ORDER, p_ratio: 0.3333, p_note: "Customer is a repeat buyer" });
  });

  it("takes the ratio off with no why", async () => {
    mocks.rpc.mockResolvedValue({ data: { orderId: ORDER, orderNo: "HC-SO-2611-006", ratio: null, changed: true }, error: null });
    await saveCommRatio(ORDER, null, "ignored");
    expect(mocks.rpc).toHaveBeenCalledWith("member_comm_ratio_set", { p_order: ORDER, p_ratio: null, p_note: null });
  });

  it("refuses before the database what it would refuse", async () => {
    expect(await saveCommRatio(ORDER, 1.5, null)).toEqual({ ok: false, error: "A ratio is 0% to 100% of the commission." });
    expect(await saveCommRatio(ORDER, 0.5, "x".repeat(501))).toEqual({ ok: false, error: "Keep why to 500 characters." });
    mocks.getAccountUser.mockResolvedValue(reader);
    expect(await saveCommRatio(ORDER, 0.5, null)).toEqual({ ok: false, error: COMM_RATIO_REFUSED });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("says the database's refusals in its words — and nothing else it says", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "You cannot adjust the commission of your own bill." } });
    expect(await saveCommRatio(ORDER, 0.5, null)).toEqual({ ok: false, error: "You cannot adjust the commission of your own bill." });
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "relation does not exist" } });
    expect(await saveCommRatio(ORDER, 0.5, null)).toEqual({ ok: false, error: "The commission could not be changed. Please try again." });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Read-only while viewing as somebody — nothing is saved." } });
    expect(await saveCommRatio(ORDER, 0.5, null)).toEqual({ ok: false, error: "Read-only while viewing as somebody — nothing is saved." });
  });
});
