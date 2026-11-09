// The owner, 2026-11-09: Reports' overall report — each ad, who has its leads, their average reply, and each customer.
import { describe, expect, it } from "vitest";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { overviewReport, replyWaits } from "./reports";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 6, h, m)).toISOString();
const c = (id: string, adId: string | null, who: string | null, msgs: [ "lead" | "me", number, number, boolean? ][]) =>
  ({ id, name: `C${id}`, adId, ad: adId ? `Ad ${adId}` : "", assignedTo: who, createdAt: at(1), status: "follow_up",
    messages: msgs.map(([from, h, m, auto], i) => ({ id: `${id}${i}`, kind: "text", text: "", from, at: at(h, m), ...(auto ? { auto: true } : {}) })) }) as unknown as CrmCustomer;

describe("the overall report", () => {
  it("measures every reply wait, not auto-replies, not one still open", () => {
    expect(replyWaits(c("1", "A", "a", [["lead", 2, 0], ["me", 2, 1, true], ["me", 2, 30], ["lead", 3, 0], ["lead", 3, 5], ["me", 4, 0], ["lead", 5, 0]]))).toEqual([30, 60]);
  });
  it("groups the period's leads by ad, then by who has them, then each customer", () => {
    const cs = [c("1", "A", "a", [["lead", 2, 0], ["me", 2, 10]]), c("2", "A", "a", [["lead", 2, 0], ["me", 2, 30]]), c("3", "A", "b", [["lead", 2, 0]]),
      c("4", "B", "b", [["lead", 2, 0], ["me", 3, 0]]), c("5", null, null, [["lead", 2, 0]])];
    const r = overviewReport(cs, [0, Date.UTC(2027, 0, 1)], x => x.ad, id => id.toUpperCase(), () => "Follow up");
    expect(r.map(x => [x.name, x.n, x.avgMin])).toEqual([["Ad A", 3, 20], ["Ad B", 1, 60], ["No ad", 1, null]]);
    expect(r[0].people.map(p => [p.name, p.n, p.avgMin])).toEqual([["A", 2, 20], ["B", 1, null]]);
    expect(r[0].people[0].customers.map(x => [x.name, x.status, x.avgMin, x.ad])).toEqual([["C1", "Follow up", 10, "Ad A"], ["C2", "Follow up", 30, "Ad A"]]);
    expect(r[2].people[0].name).toBe("Nobody yet");
  });
});
