// The owner, 2026-11-09: Reports' overall report — each ad, who has its leads, their figures and each customer; then one
// report with two views (by ad, by salesperson) and an ad picker.
import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import { overviewReport, replyWaits } from "./reports";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 6, h, m)).toISOString();
const c = (id: string, adId: string | null, who: string | null, msgs: ["lead" | "me", number, number, boolean?][], status = "follow_up") =>
  ({ id, name: `C${id}`, adId, ad: adId ? `Ad ${adId}` : "", assignedTo: who, createdAt: at(1), status,
    messages: msgs.map(([from, h, m, auto], i) => ({ id: `${id}${i}`, kind: "text", text: "", from, at: at(h, m), ...(auto ? { auto: true } : {}) })) }) as unknown as CrmCustomer;
const cs = [c("1", "A", "a", [["lead", 2, 0], ["me", 2, 10]], "won"), c("2", "A", "a", [["lead", 2, 0], ["me", 2, 30]]), c("3", "A", "b", [["lead", 2, 0]], "lost"),
  c("4", "B", "b", [["lead", 2, 0], ["me", 3, 0]]), c("5", null, null, [["lead", 2, 0]])];
const visits = [{ customerId: "2", state: "attended" }, { customerId: "4", state: "booked" }, { customerId: "3", state: "cancelled" }] as unknown as CrmVisit[];
const run = (ad = "all") => overviewReport(cs, [0, Date.UTC(2027, 0, 1)], x => x.ad, id => id.toUpperCase(), () => "Follow up", visits, ad);

describe("the overall report", () => {
  it("measures every reply wait, not auto-replies, not one still open", () => {
    expect(replyWaits(c("1", "A", "a", [["lead", 2, 0], ["me", 2, 1, true], ["me", 2, 30], ["lead", 3, 0], ["lead", 3, 5], ["me", 4, 0], ["lead", 5, 0]]))).toEqual([30, 60]);
  });
  it("by ad: each ad's figures, then who has its leads, then each customer", () => {
    const r = run().byAd;
    expect(r.map(x => [x.name, x.n, x.avgMin, x.appt, x.show, x.won, x.lost])).toEqual([["Ad A", 3, 20, 1, 1, 1, 1], ["Ad B", 1, 60, 1, 0, 0, 0], ["No ad", 1, null, 0, 0, 0, 0]]);
    expect(r[0].people.map(p => [p.name, p.n, p.avgMin])).toEqual([["A", 2, 20], ["B", 1, null]]);
    expect(r[0].people[0].customers.map(x => [x.name, x.status, x.avgMin, x.ad])).toEqual([["C1", "Follow up", 10, "Ad A"], ["C2", "Follow up", 30, "Ad A"]]);
  });
  it("by salesperson, and one ad picked", () => {
    expect(run().byRep.map(p => [p.name, p.n])).toEqual([["A", 2], ["B", 2], ["Nobody yet", 1]]);
    expect(run("B").byRep.map(p => [p.name, p.n, p.customers[0].ad])).toEqual([["B", 1, "Ad B"]]);
  });
});
