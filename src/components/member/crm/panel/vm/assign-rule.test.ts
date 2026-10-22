/**
 * A chat's ⋮ Assign to is Mine's rule on the Team side too (2026-10-23 — the owner: "照「同一套规则」，跟 Mine 一样。leader 按
 * Assign to 就是交给自己 team 的下属，Principal / Director 照旧可以给任何人", then "ta can assign as well"): CRM · Manage gives
 * anyone at once (crm_send_to, 30 s to undo); a TL / STL / TA their own people in the customer's team (crm_assign_member);
 * anybody else has no Assign to — it showed to every leader, and the database refused all but CRM · Manage. "Move" is only
 * ever a request to one's direct superior, so the words for handing a customer on at once are Assign's.
 */
import { describe, expect, it, vi } from "vitest";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import type { CrmCustomer, CrmEvent, CrmPerson } from "@/lib/member/crm-data";
import { personOf, teamAssignees } from "../../shared/people";
import { initialPanelUi, type PanelUi } from "../ui";
import { teamsOf, type PanelCtx } from "./common";
import { leadVM } from "./lead";
import { panelNotifs } from "./notifs";

const person = (id: string, name: string, role: CrmPerson["role"], uplineId: string | null): CrmPerson => ({ id, name, role, uplineId, fullTime: true });
// LOO (Principal) → PETER (Director) → SAM (Senior TL) → ANTHONY (TL) → CHEA HUAN (TA) → RITA, RAY; ANTHONY → ANN;
// PETER → STANLEY (TL) → BEN.
const PEOPLE = [
  person("loo", "LOO WEN WEI", "boss", null), person("peter", "PETER", "hod", "loo"), person("sam", "SAM", "stl", "peter"),
  person("anthony", "ANTHONY", "tl", "sam"), person("chea", "CHEA HUAN", "ta", "anthony"),
  person("rita", "RITA", "rs", "chea"), person("ray", "RAY", "rs", "chea"), person("ann", "ANN", "rs", "anthony"),
  person("stanley", "STANLEY", "tl", "peter"), person("ben", "BEN", "rs", "stanley"),
];
const who = (id: string) => personOf(id, PEOPLE)!;
const names = (ps: CrmPerson[]) => ps.map(p => p.name).sort();
const at = (assignedTo: string | null, teamId: string | null = "anthony") => ({ assignedTo, teamId });

describe("whom a leader may give a customer to (teamAssignees — crm_assign_member's twin)", () => {
  it("a TA: their own people, for a customer with them or somebody below them", () => {
    expect(names(teamAssignees(who("chea"), PEOPLE, at("rita")))).toEqual(["RAY"]);
    expect(names(teamAssignees(who("chea"), PEOPLE, at("chea")))).toEqual(["RAY", "RITA"]);
  });

  it("a TA: never a customer outside their line — another's in the team, the team's waiting enquiry, another team's", () => {
    expect(teamAssignees(who("chea"), PEOPLE, at("ann"))).toEqual([]);
    expect(teamAssignees(who("chea"), PEOPLE, at(null))).toEqual([]);
    expect(teamAssignees(who("chea"), PEOPLE, at("ben", "stanley"))).toEqual([]);
  });

  it("a TL and a Senior TL: everybody below them in the customer's team, as before", () => {
    expect(names(teamAssignees(who("anthony"), PEOPLE, at("ann")))).toEqual(["CHEA HUAN", "RAY", "RITA"]);
    expect(names(teamAssignees(who("anthony"), PEOPLE, at(null)))).toEqual(["ANN", "CHEA HUAN", "RAY", "RITA"]);
    expect(teamAssignees(who("anthony"), PEOPLE, at("ben", "stanley"))).toEqual([]);
    expect(names(teamAssignees(who("sam"), PEOPLE, at("ann")))).toEqual(["ANTHONY", "CHEA HUAN", "RAY", "RITA"]);
  });

  it("a Revenue Specialist, the Director, the Principal: none — theirs is CRM · Manage's Assign to, or nothing", () => {
    for (const id of ["rita", "peter", "loo"]) expect(teamAssignees(who(id), PEOPLE, at("rita"))).toEqual([]);
  });

  it("a customer of no team: none", () => {
    expect(teamAssignees(who("anthony"), PEOPLE, at("ann", null))).toEqual([]);
  });
});

// The Team side's chat, as CrmApp builds its context: the demo's rooms and the like, these people and customers.
function ctxOf(me: string, assign: PanelCtx["assign"], customer: Pick<CrmCustomer, "assignedTo" | "teamId">) {
  const base = crmDemoData("a1", "boss");
  const c: CrmCustomer = { ...base.customers[0], id: "c1", name: "Tan Mei Ling", messages: [], ...customer };
  const data = { ...base, viewerId: me, people: PEOPLE, customers: [c], visits: [],
    can: assign === "any" ? { viewAll: true, editOwn: true, editAll: true, manage: true } : { viewAll: false, editOwn: true, editAll: false, manage: false } };
  const spies = { assignMember: vi.fn(async () => true), sendTo: vi.fn(async () => true), toast: vi.fn() };
  const act = new Proxy(spies, { get: (t, k: string) => (k in t ? t[k as keyof typeof t] : () => Promise.resolve(true)) }) as unknown as PanelCtx["act"];
  let ui: PanelUi = { ...initialPanelUi(), tab: "inbox", lead: "c1" };
  const set: PanelCtx["set"] = f => { ui = typeof f === "function" ? f(ui) : f; };
  const teams = teamsOf(data);
  const ctx: PanelCtx = {
    data, me: who(me), now: new Date("2026-10-23T12:00:00+08:00"), live: false, ui, set, patch: () => {}, act,
    nameOf: id => personOf(id, PEOPLE)?.name ?? "—", teams, directors: PEOPLE.filter(p => p.role === "hod"),
    teamOfStaff: id => teams.find(t => t.id === id || t.people.some(p => p.id === id)), openCrmOf: () => {}, exitApp: () => {}, slotCounts: {},
    assign,
  };
  return { ctx, spies, ui: () => ui };
}
const menu = (ctx: PanelCtx) => leadVM(ctx).lx.menu.map(m => m.label);
const offered = (ctx: PanelCtx) => leadVM(ctx).ld.groups.flatMap(g => g.people.map(p => p.label));

describe("the Team side's ⋮ Assign to", () => {
  it("a TA, their own person's customer: Assign to their own people only, at once, with no undo — as in Mine", async () => {
    const { ctx, spies, ui } = ctxOf("chea", "team", at("rita"));
    expect(menu(ctx)).toContain("Assign to");
    expect(offered(ctx)).toEqual(["RAY"]);
    leadVM(ctx).ld.groups[0].people[0].pick();
    await vi.waitFor(() => expect(spies.toast).toHaveBeenCalledWith("Tan Mei Ling assigned to RAY"));
    expect(spies.assignMember).toHaveBeenCalledWith("c1", "ray");
    expect(spies.sendTo).not.toHaveBeenCalled();
    expect(ui().undo).toBeNull();
  });

  it("a TA, a customer outside their line: no Assign to (the database would refuse it)", () => {
    const { ctx } = ctxOf("chea", "team", at("ann"));
    expect(menu(ctx)).not.toContain("Assign to");
    expect(offered(ctx)).toEqual([]);
  });

  it("a TL: their team's people, the one who has it left out", () => {
    const { ctx } = ctxOf("anthony", "team", at("ann"));
    expect(menu(ctx)).toContain("Assign to");
    expect(offered(ctx).sort()).toEqual(["CHEA HUAN", "RAY", "RITA"]);
  });

  it("nobody who may not: no Assign to", () => {
    expect(menu(ctxOf("rita", undefined, at("rita")).ctx)).not.toContain("Assign to");
  });

  it("CRM · Manage: anybody — the Principal and the Director too — at once, with 30 s to undo, in Assign's words", async () => {
    const { ctx, spies, ui } = ctxOf("loo", "any", at("ann"));
    expect(menu(ctx)).toContain("Assign to");
    expect(offered(ctx)).toEqual(expect.arrayContaining(["LOO WEN WEI", "PETER", "BEN", "CHEA HUAN"]));
    expect(offered(ctx)).not.toContain("ANN");
    const ben = leadVM(ctx).ld.groups.flatMap(g => g.people).find(p => p.label === "BEN")!;
    ben.pick();
    await vi.waitFor(() => expect(ui().undo).not.toBeNull());
    expect(spies.sendTo).toHaveBeenCalledWith("c1", "ben");
    expect(spies.assignMember).not.toHaveBeenCalled();
    expect(ui().undo).toMatchObject({ kind: "assign", verb: "assigned to", to: "BEN", left: 30 });
  });
});

describe("the Team side's notifications say Assign for a customer handed on at once", () => {
  const ev = (id: number, data: Record<string, unknown>): CrmEvent =>
    ({ id, kind: "moved", customerId: "c1", data, owner: "chea", actor: "loo", at: "2026-10-23T03:00:00Z" }) as unknown as CrmEvent;
  const notifs = (events: CrmEvent[]) => {
    const { ctx } = ctxOf("chea", "team", at("chea"));
    return panelNotifs({ ...ctx, data: { ...ctx.data, events, notifDeleted: [], notifRead: [] } });
  };

  it("by CRM · Manage (crm_send_to): Assign, “assigned”", () => {
    expect(notifs([ev(1, { to: "chea", from: "ann", by_manager: true })]).map(n => [n.kind, n.text, n.tail, n.extra]))
      .toEqual([["assign", "assigned", " to CHEA HUAN", ""]]);
  });

  it("a Move request the superior accepted: Move, “Accepted by …”", () => {
    expect(notifs([ev(2, { to: "chea", from: "rita" })]).map(n => [n.kind, n.text, n.extra]))
      .toEqual([["move", "moved", "Accepted by CHEA HUAN"]]);
  });
});
