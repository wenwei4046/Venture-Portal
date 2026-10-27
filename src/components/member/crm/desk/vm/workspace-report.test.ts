import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import { changeOf, crmFigures, leadsByRep, periodRanges, propertyOfAd, propertyRanking, questionTopics, repsOfAd } from "./workspace-report";

const day = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
const cust = (id: string, at: string, more: Partial<CrmCustomer> = {}) =>
  ({ id, createdAt: `${at}T10:00:00`, channel: "whatsapp", status: "new", assignedTo: null, details: { loc: "" }, messages: [], ...more }) as unknown as CrmCustomer;
const visit = (customerId: string, state: string) => ({ customerId, state, start: "2026-10-22T11:00:00" }) as unknown as CrmVisit;

describe("Workspace's reports (2026-10-27)", () => {
  it("a week runs Monday to today, against the same days the week before", () => {
    const { cur, prev } = periodRanges("week", new Date("2026-10-28T15:00:00")); // a Wednesday
    expect([cur.a, cur.b]).toEqual([day("2026-10-26"), day("2026-10-28")]);
    expect([prev.a, prev.b]).toEqual([day("2026-10-19"), day("2026-10-21")]);
    const last = periodRanges("lastweek", new Date("2026-10-28T15:00:00"));
    expect([last.cur.a, last.cur.b]).toEqual([day("2026-10-19"), day("2026-10-25")]);
  });
  it("a month runs from the 1st, the one before as many days", () => {
    const { cur, prev } = periodRanges("month", new Date("2026-10-10T09:00:00"));
    expect([cur.a, cur.b]).toEqual([day("2026-10-01"), day("2026-10-10")]);
    expect([prev.a, prev.b]).toEqual([day("2026-09-01"), day("2026-09-10")]);
    const last = periodRanges("lastmonth", new Date("2026-10-10T09:00:00"));
    expect([last.cur.a, last.cur.b, last.prev.b]).toEqual([day("2026-09-01"), day("2026-09-30"), day("2026-08-30")]);
  });
  it("counts a customer once for appointments and show-ups", () => {
    const cs = [cust("a", "2026-10-20"), cust("b", "2026-10-21")];
    const f = crmFigures(cs, [visit("a", "no_show"), visit("a", "attended"), visit("b", "booked")], { a: day("2026-10-19"), b: day("2026-10-25") });
    expect(f).toMatchObject({ leads: 2, appt: 2, showup: 1, apptrate: 100, showrate: 50 });
  });
  it("names who the leads went to, most first", () => {
    const cs = [cust("a", "2026-10-20", { assignedTo: "p1" }), cust("b", "2026-10-20", { assignedTo: "p1" }), cust("c", "2026-10-20")];
    const nameOf = (id: string | null | undefined) => (id === "p1" ? "Hector" : "?");
    expect(leadsByRep(cs, [], nameOf).map(r => [r.name, r.leads])).toEqual([["Hector", 2], ["No one yet", 1]]);
    expect(repsOfAd(cs, nameOf)).toBe("Hector 2 · No one yet 1");
  });
  it("ranks the properties as written, case and spaces aside", () => {
    const cs = [cust("a", "2026-10-20", { details: { loc: "KL48" } as CrmCustomer["details"] }), cust("b", "2026-10-20", { details: { loc: " kl48 " } as CrmCustomer["details"] }), cust("c", "2026-10-20")];
    expect(propertyRanking(cs)).toEqual({ rows: [{ label: "KL48", n: 2, fromAd: 0 }], notFilled: 1 });
  });
  it("counts each topic once a customer, by keywords", () => {
    const r = { a: day("2026-10-19"), b: day("2026-10-25") };
    const msg = (text: string) => ({ id: text, from: "lead", kind: "text", text, at: "2026-10-20T10:00:00" });
    const cs = [cust("a", "2026-10-20", { messages: [msg("设计费多少？"), msg("设计费包含什么")] as CrmCustomer["messages"] }), cust("b", "2026-10-20", { messages: [msg("How much is the design fee?")] as CrmCustomer["messages"] })];
    const q = questionTopics(cs, r);
    expect(q.find(x => x.label === "Design fee")?.n).toBe(2);
    expect(q.find(x => x.label === "Price / quotation")?.n).toBe(1); // "how much"; 设计费多少 is the design fee
  });
  it("says the change from before, a cost going down being good", () => {
    expect(changeOf("leads", 12, 10)).toEqual({ t: "+20%", good: true });
    expect(changeOf("cpl", 8, 10)).toEqual({ t: "−20%", good: true });
    expect(changeOf("leads", 3, 0)).toEqual({ t: "New", good: true });
    expect(changeOf("leads", null, 2)).toBeNull();
  });
});

describe("a property read off an ad's name", () => {
  it("takes the last brackets, else a short place after the tag", () => {
    expect(propertyOfAd("[产品USP] 投资型装修 - 3-in-1 一站式装修到出租 (Skyline Embassy)")).toBe("Skyline Embassy");
    expect(propertyOfAd("【介绍型短视频】Astrum Ampang")).toBe("Astrum Ampang");
    expect(propertyOfAd("[产品USP] 要住十年的房子, 我们不用三年的标准装修")).toBeNull();
    expect(propertyOfAd("Messenger · no ad")).toBeNull();
  });
  it("ranks by the ad when no Location is filled, joining a short name to the longer", () => {
    const cs = [cust("a", "2026-10-20", { ad: "[x] y (Astrum)" }), cust("b", "2026-10-20", { ad: "【z】Astrum Ampang" }), cust("c", "2026-10-20", { ad: "Messenger · no ad" })];
    expect(propertyRanking(cs)).toEqual({ rows: [{ label: "Astrum Ampang", n: 2, fromAd: 2 }], notFilled: 1 });
  });
});
