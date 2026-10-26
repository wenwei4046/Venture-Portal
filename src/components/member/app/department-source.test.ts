import { describe, expect, it, vi } from "vitest";
import type { DepartmentInsight } from "@/lib/member/order-book";
import type { MemberRead, RevenueSource } from "./source";

vi.mock("@/app/(member)/member/actions", () => ({}));
vi.mock("@/app/(member)/member/rooms-actions", () => ({}));
vi.mock("@/app/(member)/member/docs-actions", () => ({}));
vi.mock("@/app/(member)/member/it-actions", () => ({}));
vi.mock("@/app/(member)/member/share-actions", () => ({}));
vi.mock("@/app/(member)/member/batch-actions", () => ({ readMemberBatch: vi.fn() }));

const { departmentSource } = await import("./department-source");
const { ask } = await import("./source");

// The Principal's own app, viewing nobody (2026-10-25): the reads Today, Insight and the Arena make, answered for the
// whole sub-department — and only those.
const whole: DepartmentInsight = {
  membershipId: "fair", schemeId: "s-fair", department: "Fair", from: "2026-10", through: "2026-10", asOf: "x", live: true,
  team: { sales: 1_489_210, held: 0, orders: 267, kpiQty: 7, marginRevenue: 10, marginCost: 6, blindOrders: 0 },
  people: [{ staffId: "lucas", name: "LUCAS", title: "TL", uplineId: null, depth: 1, sales: 144_064, held: 0, orders: 9, kpiQty: 2, marginRevenue: 1, marginCost: 1, blindOrders: 0, lastOrder: null }],
  kpi: { enabled: true, threshold: 30 },
};

function base() {
  const none = vi.fn(async () => ({ ok: false as const, error: "a member's read" }));
  return {
    refresh: none, insight: none, kpi: none, arena: none, orgMap: none, orderBook: none, insightRange: none, quote: none, memo: none,
    requestHistory: none, submitRequest: none, cancelRequest: none, claimRates: none, memoReceipts: none, income: none, honours: none,
    departmentIncome: none,
    departmentInsight: vi.fn(async () => ({ ok: true as const, data: whole })),
    departmentBook: vi.fn(async () => ({ ok: true as const, data: { from: "2026-10", through: "2026-10", asOf: "x", paysFrom: null, closedMonths: [], brandWeeks: {}, orders: [] } })),
    departmentArena: vi.fn(async () => ({ ok: false as const, error: "boards" })),
    none,
  };
}

describe("departmentSource", () => {
  it("answers a month's block and its KPI with ONE read of the whole sub-department", async () => {
    const b = base();
    const s = departmentSource(b, "fair");
    const [insight, kpi] = await Promise.all([s.insight("2026-10", undefined), s.kpi("s-fair", undefined, "2026-10")]);
    expect(b.departmentInsight).toHaveBeenCalledTimes(1);
    expect(b.departmentInsight).toHaveBeenCalledWith("fair", "2026-10", "2026-10");
    const block = insight.ok ? insight.data.blocks[0] : null;
    expect(block).toMatchObject({ membershipId: "fair", whole: true, target: null, team: whole.team, me: { staffId: "", sales: 0 } });
    expect(block?.downline.map(r => r.name)).toEqual(["LUCAS"]);
    // KPI counts everybody's items; nothing is "hit" for a sub-department — a threshold is a person's.
    expect(kpi.ok && kpi.data).toMatchObject({ enabled: true, total: 7, threshold: 30, hit: null, items: [] });
    // Answered: the next pull asks again.
    await s.insight("2026-10", undefined);
    expect(b.departmentInsight).toHaveBeenCalledTimes(2);
    expect(b.none).not.toHaveBeenCalled();
  });

  it("a quarter's team, the bills and the boards are the whole sub-department's own reads", async () => {
    const b = base();
    const s = departmentSource(b, "fair");
    const range = await s.insightRange("fair", "2026-07", "2026-09", undefined);
    expect(b.departmentInsight).toHaveBeenCalledWith("fair", "2026-07", "2026-09");
    expect(range.ok && range.data).toMatchObject({ me: { staffId: "" }, downline: whole.people });
    await s.orderBook("fair", "2026-10", "2026-10", undefined);
    expect(b.departmentBook).toHaveBeenCalledWith("fair", "2026-10", "2026-10");
    expect(await s.arena("fair", "2026-10", "annual", undefined, { history: false })).toEqual({ ok: false, error: "boards" });
    expect(b.departmentArena).toHaveBeenCalledWith("fair", "2026-10", "annual", { history: false });
    // Everything else stays the source's own.
    expect(s.departmentIncome).toBe(b.departmentIncome);
    expect(b.none).not.toHaveBeenCalled();
  });

  it("shows what the phone kept for the department's reads, in the shape the page asked for", () => {
    const kept = new Map<string, unknown>([
      [JSON.stringify(ask.departmentInsight("fair", "2026-10", "2026-10")), whole],
      [JSON.stringify(ask.departmentArena("fair", "2026-10", "monthly")), { people: [] }],
    ]);
    const peek = vi.fn((read: MemberRead) => kept.get(JSON.stringify(read)));
    const s = departmentSource({ ...base(), peek: peek as unknown as NonNullable<RevenueSource["peek"]> }, "fair");
    expect(s.peek!<{ blocks: { whole?: boolean }[] }>(ask.insight("2026-10"))?.blocks[0].whole).toBe(true);
    expect(s.peek!<{ total: number }>(ask.kpi("s-fair", undefined, "2026-10"))?.total).toBe(7);
    expect(s.peek!(ask.arena("fair", "2026-10", "monthly"))).toEqual({ people: [] });
    expect(s.peek!(ask.orderBook("fair", "2026-10", "2026-10"))).toBeUndefined();
    // A read the department does not answer is the phone's own.
    s.peek!(ask.claimRates());
    expect(peek).toHaveBeenLastCalledWith(ask.claimRates());
  });
});
