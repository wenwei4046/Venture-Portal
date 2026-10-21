import { describe, expect, it } from "vitest";
import { readInsightRange, readOrderBook } from "./order-book";

const raw = () => ({
  from: "2026-09", through: "2026-09", asOf: "2026-10-04T12:00:00Z", paysFrom: "2026-09", closedMonths: ["2026-08", "bad"],
  costDivisor: 0.7, brandWeeks: { "2026-09-11": "akemi", junk: "X" },
  orders: [{
    id: "o1", number: "HC-SO-2609-219", ref: "HC11523", customer: "FARAH", date: "2026-09-25", sourceMonth: "2026-09", recognitionMonth: "2026-09",
    brand: "AKEMI", booth: "AKEMI", venue: "IOI MALL PUTRAJAYA", fairStart: "2026-09-25", fairEnd: "2026-09-27", organiser: "MEGAHOME",
    week: "2026-09-25", revenue: 1000, margin: null, kpiQty: 0, cleared: true, carried: false, manual: false, total: 1000, paid: 1000, depositNeeded: 300,
    cost: 450, // a key the app must never carry
    lines: [{ name: "DIVAN", code: "DIVAN-K", qty: 1, amount: 1000, goods: true, kpiQty: 0, cost_amount: 450 }],
  }],
});

describe("readOrderBook", () => {
  it("projects the bills field by field — a cost the RPC might add stays behind", () => {
    const book = readOrderBook(raw())!;
    expect(book.orders[0]).not.toHaveProperty("cost");
    expect(book.orders[0].lines[0]).not.toHaveProperty("cost_amount");
    expect(book.orders[0]).toMatchObject({ number: "HC-SO-2609-219", ref: "HC11523", margin: null, booth: "AKEMI" });
    expect(book.closedMonths).toEqual(["2026-08"]);
    expect(book.brandWeeks).toEqual({ "2026-09-11": "AKEMI" });
  });
  // 2026-10-05 (user): the RPC still hands back the scheme's cost ratio; the
  // phone must never receive it.
  it("keeps the cost ratio the RPC returns on the server", () => {
    const book = readOrderBook(raw())!;
    expect(book).not.toHaveProperty("costDivisor");
    expect(JSON.stringify(book)).not.toContain("0.7");
  });
  it("refuses a shape it does not read", () => {
    const broken = raw();
    (broken.orders[0] as Record<string, unknown>).lines = null;
    expect(readOrderBook(broken)).toBeNull();
    expect(readOrderBook({ ...raw(), from: "Sep" })).toBeNull();
  });
  // Shared bills in the Revenue app (2026-10-21, mig 20261021150000): a bill somebody shared with the reader is not
  // theirs to share, and says who holds it.
  it("reads whose bill it is and who holds a shared one — an answer from before both is the reader's own, unshared", () => {
    expect(readOrderBook(raw())!.orders[0]).toMatchObject({ own: true, share: null });
    const shared = raw();
    Object.assign(shared.orders[0], {
      own: false,
      share: { part: 0.5, holders: [{ id: "lucas", name: "LUCAS", pct: 0.5, owner: true }, { id: "me", name: "ANTHONY", pct: 0.5, owner: false }] },
    });
    expect(readOrderBook(shared)!.orders[0]).toMatchObject({
      own: false,
      share: { part: 0.5, holders: [{ id: "lucas", name: "LUCAS", pct: 0.5, owner: true }, { id: "me", name: "ANTHONY", pct: 0.5, owner: false }] },
    });
  });
});

describe("readInsightRange", () => {
  const score = { staffId: "s1", sales: 10, held: 0, orders: 1, kpiQty: 0, marginRevenue: 10, marginCost: 6, blindOrders: 0, lastOrder: "2026-09-30" };
  it("reads me and the downline", () => {
    const r = readInsightRange({ from: "2026-07", through: "2026-09", asOf: "x", me: { ...score, name: "ETHAN" }, downline: [{ ...score, staffId: "s2", name: "A", title: "RS", uplineId: "s1", depth: 1 }] })!;
    expect(r.me.name).toBe("ETHAN");
    expect(r.downline[0]).toMatchObject({ staffId: "s2", depth: 1, uplineId: "s1" });
  });
  it("refuses a score with a missing number", () => {
    expect(readInsightRange({ from: "2026-07", through: "2026-09", asOf: "x", me: { ...score, sales: "10" }, downline: [] })).toBeNull();
  });
});
