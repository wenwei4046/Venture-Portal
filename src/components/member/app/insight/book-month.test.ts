import { describe, expect, it, vi } from "vitest";
import type { MemberBookOrder, MemberOrderBook } from "@/lib/member/order-book";
import { bookMonth } from "./useInsightData";

// The hook's reads go through the app's source, whose actions are server-only; cutting a book reads none of them.
vi.mock("../source", () => ({ ask: {}, untracked: () => undefined }));

const order = (id: string, recognitionMonth: string): MemberBookOrder => ({
  id, number: `HC-SO-${id}`, ref: null, customer: "Mdm Lee", date: `${recognitionMonth}-12`, sourceMonth: recognitionMonth, recognitionMonth,
  brand: "AKEMI", booth: "AKEMI", venue: "MVEC", fairStart: null, fairEnd: null, organiser: null, week: `${recognitionMonth}-11`,
  revenue: 1000, margin: 40, kpiQty: 0, cleared: true, carried: false, manual: false, total: 1000, paid: 1000, depositNeeded: 300,
  lines: [], own: true, share: null,
});
const twoMonths = (margins?: MemberOrderBook["margins"]): MemberOrderBook => ({
  from: "2026-09", through: "2026-10", asOf: "2026-10-30T00:00:00Z", paysFrom: "2026-09", closedMonths: [], brandWeeks: {},
  orders: [order("1", "2026-09"), order("2", "2026-10")], ...(margins ? { margins } : {}),
});

// Today and Insight cut one month out of the two-month book (2026-10-30): the month's own margins come with it, a
// no-sales bill's cost in them — never both months' together.
describe("bookMonth", () => {
  const margins = {
    overall: 43.7, brands: { AKEMI: 43.7 },
    months: { "2026-09": { overall: 50, brands: { AKEMI: 50 } }, "2026-10": { overall: 42.1, brands: { AKEMI: 42.1 } } },
  };
  it("keeps the month's bills and the month's own margins", () => {
    const oct = bookMonth(twoMonths(margins), "2026-10");
    expect([oct.from, oct.through, oct.orders.map(o => o.id)]).toEqual(["2026-10", "2026-10", ["2"]]);
    expect(oct.margins).toEqual({ overall: 42.1, brands: { AKEMI: 42.1 } });
  });
  it("reads a month the server gave no margins for as nothing costed", () => {
    expect(bookMonth(twoMonths(margins), "2026-08").margins).toEqual({ overall: null, brands: {} });
  });
  it("leaves an answer from before the server worked margins out to the app's own adding up", () => {
    expect(bookMonth(twoMonths(), "2026-10")).not.toHaveProperty("margins");
  });
});
