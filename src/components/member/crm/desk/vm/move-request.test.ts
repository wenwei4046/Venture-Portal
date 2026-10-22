/**
 * The desktop's Move is the phone's (2026-10-23 — the owner: "桌面版的 move follow 和 手机版，本质上他们是同一套规则的 by
 * right 是要一样的"): a request to the direct superior of whoever has the customer (crm_invite's own rule), answered with
 * Accept / Decline — on the computer too, in CRM alerts' Invitations. It moved the customer at once (crm_send_to) to the
 * Principal until then.
 */
import { describe, expect, it, vi } from "vitest";
import type { CrmCustomer, CrmData, CrmInvite, CrmPerson } from "@/lib/member/crm-data";
import type { DeskCtx } from "./ctx";
import { alertsVM, chatMenuVM, moveHolder } from "./inbox";

const person = (id: string, name: string, role: CrmPerson["role"], uplineId: string | null, title = ""): CrmPerson => ({ id, name, role, uplineId, fullTime: false, title });
const BOSS = person("boss", "LOO WEN WEI", "boss", null, "CHIEF EXECUTIVE OFFICER");
const PETER = person("peter", "PETER", "hod", "boss", "Revenue Director");
const ANNA = person("anna", "ANNA", "tl", "peter", "Team Leader");
const BEN = person("ben", "BEN", "rs", "anna", "Revenue Specialist");

const customer = (id: string, assignedTo: string | null): CrmCustomer => ({
  id, name: `Customer ${id}`, phone: "60123456789", channel: "whatsapp", adId: null, ad: "WhatsApp · no ad", status: "follow_up",
  wonAmount: null, assignedTo, teamId: null, lastCustomerAt: null, createdAt: "2026-10-20T02:00:00Z", unread: 0, messages: [],
  details: { type: "", size: "", loc: "", req: "", budget: "" }, detailsSaved: false,
});

function ctxOf(me: CrmPerson, opts: { chat?: string; kind?: string; invites?: CrmInvite[]; alR?: "all" | "unread" | "read" } = {}) {
  const act = { invite: vi.fn(async () => true), sendTo: vi.fn(async () => true), answerInvite: vi.fn(async () => {}), readNotifs: vi.fn(), setPref: vi.fn(), openChat: vi.fn() };
  const patch = vi.fn();
  const people = [BOSS, PETER, ANNA, BEN];
  const data = {
    people, customers: [customer("own", me.id), customer("annas", "anna"), customer("bens", "ben"), customer("nobody", null)],
    shares: [], invites: opts.invites ?? [], prefs: {}, events: [], notifRead: [], notifsSeenAt: null, notifDeleted: [],
    can: { viewAll: true, editOwn: true, editAll: true, manage: true },
  } as unknown as CrmData;
  const ctx = {
    data, me, now: new Date("2026-10-23T04:00:00Z"), live: true, act, patch, set: vi.fn(), teams: [], directors: [PETER],
    nameOf: (id: string | null | undefined) => people.find(p => p.id === id)?.name ?? "—",
    ui: { chat: opts.chat ?? null, kind: opts.kind ?? "chat", alR: opts.alR },
    exit: () => {},
  } as unknown as DeskCtx;
  return { ctx, act, patch };
}
const STAR = { starCount: 0, starredOpen: () => {} };
const menuLabels = (ctx: DeskCtx) => chatMenuVM(ctx, STAR).chatMenuItems.map(i => i.label);

describe("the desktop's Move is a request, as the phone's", () => {
  it("the Director's own customer: to their direct superior, as a request — never at once", async () => {
    const { ctx, act, patch } = ctxOf(PETER, { chat: "own", kind: "move" });
    const vm = chatMenuVM(ctx, STAR);
    expect([vm.kPick, vm.kTopMove, vm.pickBtn]).toEqual([true, false, "Request"]);
    expect(vm.pickGroups.map(g => [g.label, g.people.map(p => [p.name, p.sub, p.btn])])).toEqual([["YOUR DIRECT UPLINE", [["LOO WEN WEI", "CHIEF EXECUTIVE OFFICER", "Request"]]]]);
    vm.pickGroups[0].people[0].pick();
    await Promise.resolve();
    expect(act.invite).toHaveBeenCalledWith("move", "own", "boss");
    expect(act.sendTo).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(patch).toHaveBeenCalledWith({ kind: "chat", toast: "Move request sent to LOO WEN WEI" }));
    expect(patch.mock.calls.some(([p]) => "undo" in p)).toBe(false);
  });

  it("somebody else's customer: to THEIR direct superior, as crm_invite asks of Edit · All", () => {
    const { ctx } = ctxOf(BOSS, { chat: "bens", kind: "move" });
    const vm = chatMenuVM(ctx, STAR);
    expect(vm.pickGroups.map(g => [g.label, g.people.map(p => p.name)])).toEqual([["BEN'S DIRECT UPLINE", ["ANNA"]]]);
    expect(menuLabels(ctx)).toContain("Move");
  });

  it("nobody above: the Principal's own customer keeps the top-level page; anybody else has no Move", () => {
    const top = chatMenuVM(ctxOf(BOSS, { chat: "own", kind: "move" }).ctx, STAR);
    expect([top.kTopMove, top.kPick, top.pickGroups]).toEqual([true, false, []]);
    expect(menuLabels(ctxOf(BOSS, { chat: "own" }).ctx)).toContain("Move");
    // ANNA's customer, opened by PETER: her superior is PETER himself — nobody to hand it to, so no Move (the phone's rule).
    expect(menuLabels(ctxOf(PETER, { chat: "annas" }).ctx)).not.toContain("Move");
    expect(menuLabels(ctxOf(PETER, { chat: "annas" }).ctx)).toEqual(expect.arrayContaining(["Assign to", "Share"]));
  });

  it("whose superior it asks — the pane's head says so (moveHolder)", () => {
    expect(moveHolder(ctxOf(PETER).ctx, customer("own", "peter"))).toBe("peter");
    expect(moveHolder(ctxOf(BOSS).ctx, customer("bens", "ben"))).toBe("ben");
    expect(moveHolder(ctxOf(BOSS).ctx, customer("nobody", null))).toBe("boss");
  });

  it("a request already waiting reads Requested and is not sent twice", () => {
    const waiting: CrmInvite = { id: "i1", kind: "move", customerId: "own", customerName: "Customer own", from: "peter", to: "boss", state: "pending", createdAt: "2026-10-23T03:00:00Z", decidedAt: null };
    const { ctx, act } = ctxOf(PETER, { chat: "own", kind: "move", invites: [waiting] });
    const vm = chatMenuVM(ctx, STAR);
    expect(vm.pickGroups[0].people[0].btn).toBe("Requested");
    vm.pickGroups[0].people[0].pick();
    expect(act.invite).not.toHaveBeenCalled();
  });
});

describe("CRM alerts' Invitations: answered on the computer too", () => {
  const invite = (id: string, kind: CrmInvite["kind"], from: string, to: string, state: CrmInvite["state"] = "pending", createdAt = "2026-10-23T03:00:00Z"): CrmInvite =>
    ({ id, kind, customerId: "annas", customerName: "Customer annas", from, to, state, createdAt, decidedAt: null });

  it("lists the requests to me, newest first, with Accept and Decline (crm_answer_invite)", () => {
    const { ctx, act } = ctxOf(BOSS, { invites: [
      invite("m1", "move", "peter", "boss", "pending", "2026-10-23T02:00:00Z"), invite("s1", "share", "anna", "boss", "pending", "2026-10-23T03:00:00Z"),
      invite("x1", "move", "ben", "anna"), invite("x2", "move", "boss", "peter"), invite("x3", "move", "peter", "boss", "declined"),
    ] });
    const p = alertsVM(ctx).alertsP;
    expect(p.invites.map(i => [i.kind, i.title, i.sub])).toEqual([
      ["Share", "ANNA invited you to a chat", "Customer annas · WhatsApp"],
      ["Move", "PETER wants to move a lead to you", "Customer annas · WhatsApp"],
    ]);
    p.invites[1].accept();
    p.invites[0].decline();
    expect(act.answerInvite.mock.calls).toEqual([["m1", true], ["s1", false]]);
  });

  it("are unread until answered — the badge and the tabs count them; Read never shows them", () => {
    const invites = [invite("m1", "move", "peter", "boss")];
    const vm = alertsVM(ctxOf(BOSS, { invites }).ctx);
    expect(vm.alertsUnread).toBe(1);
    expect(vm.alertsP.tabs.map(t => t.label)).toEqual(["All 1", "Unread 1", "Read"]);
    expect(alertsVM(ctxOf(BOSS, { invites, alR: "read" }).ctx).alertsP.invites).toEqual([]);
    expect(alertsVM(ctxOf(PETER, { invites }).ctx).alertsP.invites).toEqual([]);
  });
});
