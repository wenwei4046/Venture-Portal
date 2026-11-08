import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmData, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "./people-book";
import { activityVM, periodDays, stintsOf, type ActivityUi, type AssignedRow } from "./team-activity";

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chea Huan", "tl"), P("b", "Alvin", "tl"), P("c", "Jason", "tl")];
const cust = (id: string, msgs: { from: "lead" | "me"; at: string; auto?: boolean }[], status: CrmCustomer["status"] = "new") =>
  ({ id, name: `Cust ${id}`, ad: "Raya Promo", status, messages: msgs.map((m, i) => ({ id: `${id}${i}`, kind: "text", text: "", ...m })) } as unknown as CrmCustomer);
// 6 Nov 2026, office time = UTC+8.
const at = (hhmm: string, day = "2026-11-06") => new Date(`${day}T${hhmm}:00+08:00`).toISOString();
const data = (customers: CrmCustomer[], extra: Partial<CrmData> = {}) => ({
  people, customers, visits: [], events: [], leaves: [], ftRules: [], lockedStaff: [], settings: DEFAULT_CRM_SETTINGS,
  can: { viewAll: true, editAll: true, editOwn: true, manage: true }, ...extra,
} as unknown as CrmData);
const ui = (p: Partial<ActivityUi> = {}): ActivityUi => ({ team: "all", who: null, menu: false, per: "Today", from: "2026-11-01", to: "2026-11-06", open: {}, lead: null, sort: null, pMenu: false, pOpen: {}, pLead: null, ...p });
const teams = [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }];

describe("Team activity", () => {
  it("counts a lead got, its first reply (no auto-reply) and a handover", () => {
    const c1 = cust("1", [{ from: "lead", at: at("10:00") }, { from: "me", at: at("10:01"), auto: true }, { from: "me", at: at("10:07") }]);
    const c2 = cust("2", [{ from: "lead", at: at("12:00") }]);
    const rows: AssignedRow[] = [
      { contact_id: "1", actor: null, data: { to: "a" }, at: at("10:00") },
      { contact_id: "2", actor: null, data: { to: "a" }, at: at("12:00") },
      { contact_id: "2", actor: "tl", data: { to: "b", from: "a" }, at: at("14:30") },
    ];
    const s = stintsOf(data([c1, c2]), rows, { a: "2026-11-06", b: "2026-11-06" }, at("18:02"));
    expect(s.map(x => [x.customer.id, x.who, x.reply, x.to])).toEqual([["1", "a", 7, null], ["2", "a", null, "b"], ["2", "b", null, null]]);
  });

  it("waits only on a lead still theirs with no reply, coloured by the reply lines", () => {
    const c2 = cust("2", [{ from: "lead", at: at("08:50") }]);
    const rows: AssignedRow[] = [{ contact_id: "2", actor: null, data: { to: "a" }, at: at("08:50") }];
    const d = data([c2]);
    const v = activityVM({ data: d, book: peopleBook(d, teams, []), rows, now: new Date(at("18:02")), ui: ui(), set: () => {}, nameOf: id => people.find(p => p.id === id)?.name ?? "", roleOf: () => "", openChat: () => {} });
    const row = v.groups[0].rows.find(r => r.id === "a")!;
    expect(row.leads).toBe(1);
    expect(row.wait).toBe("9h 12m");
    expect(row.waitFg).toBe("var(--crm-oxblood)"); // past 9 h: Overdue
    expect(v.tiles.find(t => t.k === "Waiting")).toMatchObject({ v: "1", c: "var(--crm-rust)" });
  });

  it("says why somebody is out of today's turn — the same facts the dealer reads", () => {
    const d = data([], { lockedStaff: ["b"], leaves: [{ id: "l", staffId: "c", from: "2026-11-05", to: "2026-11-08", note: "", fromAt: "2026-11-05T09:00", toAt: "2026-11-08T18:00", reason: "Sick" }] });
    const book = peopleBook(d, teams, []);
    expect(book.turn("b", "2026-11-06T18:00")).toEqual({ on: false, why: "Locked" });
    expect(book.turn("c", "2026-11-06T18:00")).toEqual({ on: false, why: "Sick leave" });
    expect(book.turn("a", "2026-11-06T18:00").on).toBe(true);
  });

  it("only Full time people are in turn on a Full time day", () => {
    const d = data([], { ftRules: [{ tlId: "tl", mode: "turns", days: [4], vals: { a: { "4": 1 } } }] });
    const book = peopleBook(d, teams, []);
    expect(book.turn("a", "2026-11-06T10:00")).toEqual({ on: true, why: "" }); // Friday, ticked
    expect(book.turn("b", "2026-11-06T10:00")).toEqual({ on: false, why: "Not Full time" });
    expect(book.turn("b", "2026-11-05T10:00").on).toBe(true); // Thursday: nobody's Full time day
  });

  it("the period's days", () => {
    expect(periodDays(ui({ per: "Week" }), "2026-11-06")).toEqual({ a: "2026-11-02", b: "2026-11-06" });
    expect(periodDays(ui({ per: "Month" }), "2026-11-06")).toEqual({ a: "2026-11-01", b: "2026-11-06" });
    expect(periodDays(ui({ per: "Custom", from: "2026-10-20", to: "2026-10-03" }), "2026-11-06")).toEqual({ a: "2026-10-03", b: "2026-10-20" });
  });
});
