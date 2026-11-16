/**
 * The owner, 2026-11-09: "assign 的 activity 加入可以筛选广告，这样我才能看到总体，或单独的广告分配" — Team activity by one ad.
 */
import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmData, CrmPerson } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { peopleBook } from "./people-book";
import { activityVM, type ActivityUi, type AssignedRow } from "./team-activity";

const P = (id: string, name: string, uplineId: string | null, role: CrmPerson["role"] = "rs"): CrmPerson => ({ id, name, role, uplineId, fullTime: true, login: true });
const people = [P("tl", "Stanley", null, "tl"), P("a", "Chea Huan", "tl"), P("b", "Alvin", "tl")];
const at = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00+08:00`).toISOString();
const cust = (id: string, adId: string | null, ad: string) => ({ id, name: `Cust ${id}`, ad, adId, status: "new", messages: [{ id: `${id}0`, kind: "text", text: "", from: "lead", at: at("10:00") }] } as unknown as CrmCustomer);
const d = { people, customers: [cust("1", "AD1", "Skyline"), cust("2", "AD2", "Astrum"), cust("3", "AD1", "Skyline"), cust("4", null, "")], visits: [], events: [], leaves: [], ftRules: [], lockedStaff: [],
  settings: DEFAULT_CRM_SETTINGS, adNames: { AD1: { name: "Skyline Embassy" } }, can: { viewAll: true, editAll: true, editOwn: true, manage: true } } as unknown as CrmData;
const rows: AssignedRow[] = [
  { contact_id: "1", actor: null, data: { to: "a" }, at: at("10:00") }, { contact_id: "2", actor: null, data: { to: "b" }, at: at("10:00") },
  { contact_id: "3", actor: null, data: { to: "b" }, at: at("10:00") }, { contact_id: "4", actor: null, data: { to: "a" }, at: at("10:00") },
];
const vm = (ad?: string) => activityVM({ data: d, book: peopleBook(d, [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }], []), rows, now: new Date(at("18:00")),
  ui: { team: "all", who: null, menu: false, per: "Today", from: "2026-11-06", to: "2026-11-06", open: {}, lead: null, sort: null, pMenu: false, pOpen: {}, pLead: null, ...(ad ? { ad } : {}) } as ActivityUi,
  set: () => {}, nameOf: id => people.find(p => p.id === id)?.name ?? "", roleOf: () => "", openChat: () => {} });
const leads = (v: ReturnType<typeof vm>) => Object.fromEntries(v.groups.flatMap(g => g.rows).map(r => [r.name, r.leads]));

describe("Team activity by ad", () => {
  it("lists the period's ads, most leads first, no-ad last", () => {
    expect(vm().ads.map(a => a.label)).toEqual(["All ads · 4", "Skyline Embassy · 2", "Astrum · 1", "No ad · 1"]);
  });
  it("counts every lead on All ads, and only that ad's when one is picked", () => {
    expect(leads(vm())).toMatchObject({ "Chea Huan": 2, Alvin: 2 });
    expect(leads(vm("AD1"))).toMatchObject({ "Chea Huan": 1, Alvin: 1 });
    expect(vm("AD1").tiles.find(t => t.k === "Leads")?.v).toBe("2");
    expect(leads(vm("none"))).toMatchObject({ "Chea Huan": 1, Alvin: 0 });
  });
  // 2026-11-16 (the owner, Team activity's 155 leads beside Ads Performance's 129, 25 of them hand-overs: "改成只算一次"):
  // a customer handed on is one lead, the last holder's; the earlier stint stays listed as Handed away.
  it("counts a customer handed on once, for whoever has it now", () => {
    const moved = activityVM({ data: d, book: peopleBook(d, [{ id: "tl", name: "Team Stanley", tl: people[0], people: people.slice(1) }], []),
      rows: [...rows, { contact_id: "1", actor: "tl", data: { from: "a", to: "b" }, at: at("12:00") }], now: new Date(at("18:00")),
      ui: { team: "all", who: null, menu: false, per: "Today", from: "2026-11-06", to: "2026-11-06", open: {}, lead: null, sort: null, pMenu: false, pOpen: {}, pLead: null } as ActivityUi,
      set: () => {}, nameOf: id => people.find(p => p.id === id)?.name ?? "", roleOf: () => "", openChat: () => {} });
    const by = Object.fromEntries(moved.groups.flatMap(g => g.rows).map(r => [r.name, r]));
    expect(by["Chea Huan"].leads).toBe(1); // only Cust 4 now
    expect(by.Alvin.leads).toBe(3); // Cust 1 joins Cust 2 and 3
    expect(moved.tiles.find(t => t.k === "Leads")?.v).toBe("4"); // four customers, not five hand-overs
    expect(moved.ads[0].label).toBe("All ads · 4");
    expect(by["Chea Huan"].list.find(l => l.name === "Cust 1")?.status).toBe("Handed away");
  });
  // 2026-11-16 (the owner, of the leads under a person: "增加广告来源"): each lead says the ad it came from.
  it("names each lead's ad, or its channel with no ad", () => {
    const list = (who: string) => vm().groups.flatMap(g => g.rows).find(r => r.name === who)!.list.map(l => [l.name, l.ad]);
    expect(list("Chea Huan").sort()).toEqual([["Cust 1", "Skyline"], ["Cust 4", "WhatsApp · no ad"]]);
    expect(list("Alvin").sort()).toEqual([["Cust 2", "Astrum"], ["Cust 3", "Skyline"]]);
  });
});
