/**
 * The owner, 2026-11-10, on Team activity's lead drawer (Stanlie Chee, opened under Hector: "Moved to Harm Hao Hong Hector
 * · from Cyrus · by Peter", "First reply · 8m"): "同一个客户应该只有一个 audit log，也就是说我们可以看到这个客户原本从谁给到谁，
 * 然后回复的状态时间怎么样". Every screen draws the customer's whole story from one builder.
 */
import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmData, CrmEvent } from "@/lib/member/crm-data";
import { customerLog, waitWords } from "./customer-audit";

const NAMES: Record<string, string> = { cyrus: "Cyrus", hector: "Harm Hao Hong Hector", peter: "Peter" };
const nameOf = (id: string | null | undefined) => (id ? NAMES[id] ?? id : "—");
const at = (hhmm: string, day = "06") => `2026-11-${day}T${hhmm}:00+08:00`;
const iso = (s: string) => new Date(s).toISOString();

const customer = (over: Partial<CrmCustomer> = {}): CrmCustomer => ({
  id: "sc", name: "Stanlie Chee", phone: "60123", channel: "whatsapp", adId: "ad1", ad: "Video Ads-15/10", status: "follow_up",
  wonAmount: null, assignedTo: "hector", teamId: null, lastCustomerAt: iso(at("14:01")), createdAt: iso(at("14:00")), unread: 0,
  messages: [
    { id: "m1", from: "lead", text: "Hi", at: iso(at("14:00")) },
    { id: "m2", from: "me", text: "Hello!", at: iso(at("14:12")), status: "read" },
    { id: "m3", from: "me", text: "Hi, I'm Hector", at: iso(at("16:29")), status: "read" },
  ],
  details: { type: "", size: "", loc: "", req: "", budget: "" }, detailsSaved: false, ...over,
} as unknown as CrmCustomer);
const ev = (kind: string, when: string, actor: string | null, data: Record<string, unknown>): CrmEvent =>
  ({ id: Math.random(), kind, customerId: "sc", actor, owner: null, data, at: iso(when) }) as unknown as CrmEvent;
const DATA = (events: CrmEvent[]) => ({ events, visits: [], notes: [] }) as unknown as Pick<CrmData, "events" | "visits">;
const NOW = new Date(at("18:00"));

describe("one audit log per customer", () => {
  it("shows whom it first went to, every hand-over and each holder's first reply with its time", () => {
    const lines = customerLog({ data: DATA([
      ev("assigned", at("14:00"), null, { to: "cyrus" }),
      ev("assigned", at("16:21"), "peter", { to: "hector", from: "cyrus" }),
    ]), customer: customer(), nameOf, now: NOW });
    expect(lines.map(l => [l.title, l.detail ?? ""])).toEqual([
      ["Lead arrived", "Video Ads-15/10 · WhatsApp"],
      ["Given to Cyrus", "automatically"],
      ["First reply · 12m", "Cyrus"],
      ["Moved to Harm Hao Hong Hector", "from Cyrus · by Peter"],
      ["First reply · 8m", "Harm Hao Hong Hector"],
    ]);
    expect(lines.map(l => l.tone)).toEqual(["ink", "ink", "green", "ink", "green"]);
  });

  it("the one holding it now with no reply yet: how long the customer has waited", () => {
    const c = customer({ messages: [{ id: "m1", from: "lead", text: "Hi", at: iso(at("14:00")) }] as CrmCustomer["messages"], assignedTo: "cyrus" });
    const lines = customerLog({ data: DATA([ev("assigned", at("14:00"), null, { to: "cyrus" })]), customer: c, nameOf, now: NOW });
    expect(lines.at(-1)).toMatchObject({ title: "No reply yet · waiting 4h 00m", detail: "Cyrus", tone: "oxblood" });
  });

  it("Team activity's own assigned rows (the phone's read) join the events, each hand-over once", () => {
    const rows = [{ at: iso(at("14:00")), actor: null, data: { to: "cyrus" } }, { at: iso(at("16:21")), actor: "peter", data: { to: "hector", from: "cyrus" } }];
    const lines = customerLog({ data: DATA([ev("assigned", at("16:21"), "peter", { to: "hector", from: "cyrus" })]), customer: customer(), nameOf, now: NOW, assigned: rows });
    expect(lines.filter(l => /^(Given|Moved) to/.test(l.title)).map(l => l.title)).toEqual(["Given to Cyrus", "Moved to Harm Hao Hong Hector"]);
  });

  it("visits, Won and Lost read in the same log", () => {
    const lines = customerLog({ data: DATA([
      ev("assigned", at("14:00"), null, { to: "cyrus" }),
      ev("appt_booked", at("15:00"), "cyrus", { when: "Sat 14 Nov, 11:00", room: "HOUZS Puchong" }),
      ev("won", at("17:00", "14"), "cyrus", { amount: 12000 }),
    ]), customer: customer({ assignedTo: "cyrus", status: "won" }), nameOf, now: new Date(at("18:00", "14")) });
    expect(lines.map(l => l.title)).toContain("Visit booked");
    expect(lines.find(l => l.title === "Visit booked")!.detail).toBe("Sat 14 Nov, 11:00 · HOUZS Puchong · by Cyrus");
    expect(lines.at(-1)).toMatchObject({ title: "Won", detail: "RM 12,000 · by Cyrus", tone: "green" });
  });

  it("one time format", () => {
    expect([waitWords(4), waitWords(65), waitWords(585), waitWords(1620)]).toEqual(["4m", "1h 05m", "9h 45m", "1d 3h"]);
  });
});
