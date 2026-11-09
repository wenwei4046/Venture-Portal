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
});
