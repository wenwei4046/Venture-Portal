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

describe("Profile › Closed deals on the Team side (the owner, 2026-11-20: \"principal 也能看到\")", () => {
  it("lists everybody's deals with who closed each, and narrows to one seller", async () => {
    const { allClosedDeals, dealsView } = await import("./deals");
    const withC = { ...data, events: [...data.events, { id: 3, kind: "status", customerId: "c", actor: "other", owner: "other", data: { to: "won" }, at: "2026-11-01T02:00:00Z" }] } as unknown as typeof data;
    const all = allClosedDeals(withC);
    expect(all.map(d => [d.customerId, d.seller])).toEqual([["a", "me"], ["c", "other"], ["e", "me"], ["b", "me"]]);
    const names = (id: string | null | undefined) => (id === "me" ? "Jia Hui" : "Kelvin");
    const base = { deals: all, per: "all" as const, setPer: () => {}, now: new Date("2026-11-20T04:00:00Z"), roomName: () => "KL", fileUrl: async () => null, openChat: () => null, back: () => {}, nameOf: names, setWho: () => {} };
    const v = dealsView({ ...base, who: null });
    expect(v.people?.map(p => p.label)).toEqual(["Everyone", "Jia Hui", "Kelvin"]);
    expect(v.count).toBe("4");
    expect(v.months[0].rows[0].when).toContain("· Jia Hui");
    expect(dealsView({ ...base, who: "other" }).count).toBe("1");
  });
});

describe("Closed deals' periods and how long a deal took (the owner, 2026-11-23)", () => {
  it("reads Today, This week and a Custom range of days", async () => {
    const { dealsIn } = await import("./deals");
    const ds = [{ at: "2026-11-23T03:00:00Z" }, { at: "2026-11-18T03:00:00Z" }, { at: "2026-11-10T03:00:00Z" }, { at: "2026-10-30T03:00:00Z" }];
    const now = new Date(2026, 10, 23, 15); // Mon 23 Nov
    expect(dealsIn(ds, "today", now).length).toBe(1);
    expect(dealsIn(ds, "week", now).length).toBe(1);
    expect(dealsIn(ds, "custom", now, { a: new Date(2026, 10, 10).getTime(), b: new Date(2026, 10, 18).getTime() }).map(d => d.at)).toEqual(["2026-11-18T03:00:00Z", "2026-11-10T03:00:00Z"]);
  });
  it("counts the days from first contact to won", async () => {
    const { tookOf } = await import("./deals");
    expect(tookOf("2026-11-01T02:00:00Z", "2026-11-18T06:00:00Z")).toBe("17 days");
    expect(tookOf("2026-11-18T01:00:00Z", "2026-11-18T09:00:00Z")).toBe("Same day");
    expect(tookOf(undefined, "2026-11-18T09:00:00Z")).toBe("");
  });
});
