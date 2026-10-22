import { describe, expect, it } from "vitest";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { leadsByAd } from "./leads-by-ad";

const c = (adId: string, assignedTo: string | null, createdAt: string) => ({ adId, assignedTo, createdAt }) as unknown as CrmCustomer;
const now = new Date("2026-10-22T12:00:00+08:00");

describe("leads by ad", () => {
  it("counts each ad's leads by who holds them, busiest first, nobody's last", () => {
    const cs = [c("A", "p1", "2026-10-02"), c("A", "p1", "2026-10-03"), c("A", "p2", "2026-10-05"), c("A", null, "2026-10-06"), c("B", "p2", "2026-10-07"), c("A", "p2", "2026-09-20")];
    const out = leadsByAd(cs, ["B", "A", "C"], id => `Ad ${id}`, id => id.toUpperCase(), () => "Team X", "month", now);
    expect(out.map(a => [a.id, a.total])).toEqual([["A", 4], ["B", 1], ["C", 0]]);
    expect(out[0].rows.map(r => [r.name, r.n])).toEqual([["P1", 2], ["P2", 1], ["Not assigned yet", 1]]);
    expect(leadsByAd(cs, ["A"], id => id, id => id, () => null, "all", now)[0].total).toBe(5);
  });
});
