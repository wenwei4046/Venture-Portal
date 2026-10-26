import { describe, expect, it } from "vitest";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { lbaRange, lbaStatus, leadsByAd } from "./leads-by-ad";

let n = 0;
const c = (adId: string, assignedTo: string | null, createdAt: string) => ({ id: `c${++n}`, name: `Cust ${n}`, adId, assignedTo, createdAt, phone: "012" }) as unknown as CrmCustomer;
const now = new Date("2026-10-22T12:00:00+08:00");
const teamX = () => ({ id: "tx", name: "Team X" });

describe("leads by ad", () => {
  it("counts each ad's leads by who holds them, busiest first, nobody's last", () => {
    const cs = [c("A", "p1", "2026-10-02"), c("A", "p1", "2026-10-03"), c("A", "p2", "2026-10-05"), c("A", null, "2026-10-06"), c("B", "p2", "2026-10-07"), c("A", "p2", "2026-09-20")];
    const out = leadsByAd(cs, ["B", "A", "C"], id => `Ad ${id}`, id => id.toUpperCase(), teamX, lbaRange("month", now));
    expect(out.map(a => [a.id, a.total])).toEqual([["A", 4], ["B", 1], ["C", 0]]);
    expect(out[0].rows.map(r => [r.name, r.n])).toEqual([["P1", 2], ["P2", 1], ["Not assigned yet", 1]]);
    expect(out[0].teams).toEqual(["tx"]);
    expect(leadsByAd(cs, ["A"], id => id, id => id, () => null, lbaRange("all", now))[0].total).toBe(5);
  });

  it("lists the leads each person got, newest first (2026-10-23: a tap on the person opens them)", () => {
    const cs = [c("A", "p1", "2026-10-02"), c("A", "p1", "2026-10-09"), c("A", "p2", "2026-10-05")];
    const [a] = leadsByAd(cs, ["A"], id => id, id => id, () => null, lbaRange("month", now));
    expect(a.rows[0]).toMatchObject({ who: "p1", n: 2 });
    expect(a.rows[0].leads.map(l => l.at)).toEqual(["2026-10-09", "2026-10-02"]);
    expect(a.rows[1].leads.map(l => l.name)).toEqual([cs[2].name]);
  });

  it("v2 periods: last month, and a custom range including its last day", () => {
    const cs = [c("A", "p1", "2026-09-10T10:00:00"), c("A", "p1", "2026-10-05T10:00:00"), c("A", "p1", "2026-10-18T20:00:00"), c("A", "p1", "2026-10-19T10:00:00")];
    expect(leadsByAd(cs, ["A"], id => id, id => id, () => null, lbaRange("last", now))[0].total).toBe(1);
    expect(leadsByAd(cs, ["A"], id => id, id => id, () => null, lbaRange("custom", now, { from: "2026-10-05", to: "2026-10-18" }))[0].total).toBe(2);
  });

  it("an ad has ended when its end date passed or Meta archived it", () => {
    expect(lbaStatus({ endAt: "2026-10-01" }, "Paused", now)).toBe("Ended");
    expect(lbaStatus({ status: "ARCHIVED" }, "Paused", now)).toBe("Ended");
    expect(lbaStatus({ status: "ACTIVE" }, "Running", now)).toBe("Running");
  });
});
