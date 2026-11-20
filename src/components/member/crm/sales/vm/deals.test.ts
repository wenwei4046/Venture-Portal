import { describe, expect, it } from "vitest";
import { closedDeals, dealsByMonth, dealsIn } from "./deals";
import type { CrmData } from "@/lib/member/crm-data";

// The owner, 2026-11-20: "在 crm profile 里面设计一个是可以让业务看到自己过往的成交记录".
const C = (id: string, status: string, assignedTo: string, wonAmount: number | null) => ({ id, name: id.toUpperCase(), status, assignedTo, wonAmount });
const data = {
  customers: [C("a", "won", "me", 12000), C("b", "won", "me", 30000), C("c", "won", "other", 5000), C("d", "follow_up", "me", null), C("e", "won", "other", 8000)],
  visits: [
    { id: "v1", customerId: "a", start: "2026-11-18T06:00:00Z", outcome: "won", wonFiles: { quote: { path: "a/q.pdf", name: "Q" }, slip: { path: "a/s.jpg", name: "S" } } },
    { id: "v2", customerId: "b", start: "2026-09-02T06:00:00Z", outcome: "won" },
  ],
  events: [
    { id: 1, kind: "status", customerId: "b", actor: "me", owner: "me", data: { to: "won" }, at: "2026-09-03T02:00:00Z" },
    // e was won while it was mine, then moved on: it stays my deal.
    { id: 2, kind: "status", customerId: "e", actor: "me", owner: "me", data: { to: "won" }, at: "2026-10-10T02:00:00Z" },
  ],
} as unknown as CrmData;

describe("Profile › Closed deals", () => {
  it("lists my Won customers — whoever held each when won — newest first, dated by the win", () => {
    const d = closedDeals(data, "me");
    expect(d.map(x => x.customerId)).toEqual(["a", "e", "b"]);
    expect(d[0].at).toBe("2026-11-18T06:00:00Z");
    expect(d[0].visit?.wonFiles?.quote.name).toBe("Q");
    expect(d[2].at).toBe("2026-09-03T02:00:00Z");
  });

  it("keeps a period and groups by month with totals", () => {
    const now = new Date("2026-11-20T04:00:00Z"), d = closedDeals(data, "me");
    expect(dealsIn(d, "month", now).map(x => x.customerId)).toEqual(["a"]);
    expect(dealsIn(d, "3m", now).map(x => x.customerId)).toEqual(["a", "e", "b"]);
    expect(dealsIn(d, "all", now).length).toBe(3);
    const m = dealsByMonth(d);
    expect(m.map(g => [g.key, g.deals.length, g.total])).toEqual([["2026-11", 1, 12000], ["2026-10", 1, 8000], ["2026-09", 1, 30000]]);
    expect(m[0].label).toBe("November 2026");
  });
});
