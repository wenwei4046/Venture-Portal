/**
 * The Team side tells only of what is about oneself (the owner, 2026-10-16: "principal assign 名單給 peter，peter 需要收到
 * 通知；但如果 principal 給 anthony assign 名單，peter 就不會收到，不單單只是 chat").
 */
import { describe, expect, it } from "vitest";
import type { PanelCtx } from "./ctx";
import { panelNotifs } from "./notifs";

const now = new Date("2026-10-16T10:00:00Z");
const customer = (id: string, owner: string, waitedH = 0) => ({ id, name: id, assignedTo: owner, status: "follow_up", channel: "whatsapp",
  messages: waitedH ? [{ id: id + "m", from: "lead", text: "hi", at: new Date(now.getTime() - waitedH * 3_600_000).toISOString() }] : [],
  lastCustomerAt: waitedH ? new Date(now.getTime() - waitedH * 3_600_000).toISOString() : null, createdAt: "2026-10-10T00:00:00Z" });
const ev = (id: number, kind: string, customerId: string, data: Record<string, unknown>, owner: string) =>
  ({ id, kind, customerId, data, owner, actor: "principal", at: "2026-10-16T09:00:00Z" });

function ctxFor(me: string) {
  return {
    me: { id: me }, now, nameOf: (id: string | null) => id ?? "—",
    data: {
      customers: [customer("toPeter", "peter"), customer("toAnthony", "anthony"), customer("waitsPeter", "peter", 12), customer("waitsAnthony", "anthony", 12)],
      events: [
        ev(1, "moved", "toPeter", { to: "peter", by_manager: true }, "peter"),
        ev(2, "moved", "toAnthony", { to: "anthony", from: "kris", by_manager: true }, "anthony"),
        ev(3, "won", "toAnthony", { amount: 1000 }, "anthony"),
      ],
      notifDeleted: [], notifRead: [],
    },
  } as unknown as PanelCtx;
}

describe("Team notifications are one's own", () => {
  it("PETER is told of the customer handed to him and his own overdue chat — never ANTHONY's", () => {
    const keys = panelNotifs(ctxFor("peter")).map(n => n.customerId);
    expect(keys).toContain("toPeter");
    expect(keys).toContain("waitsPeter");
    expect(keys).not.toContain("toAnthony");
    expect(keys).not.toContain("waitsAnthony");
  });
  it("the one a customer was taken from is told too", () => {
    expect(panelNotifs(ctxFor("kris")).map(n => n.customerId)).toEqual(["toAnthony"]);
  });
  it("the Principal, with no customers of their own, is told of nothing", () => {
    expect(panelNotifs(ctxFor("principal"))).toEqual([]);
  });
});

describe("Team inbox alerts (v2 frame 10, a setting)", () => {
  const withTeam = (me: string, viewAll: boolean) => {
    const c = ctxFor(me) as unknown as { data: Record<string, unknown> };
    c.data.settings = { teamAlerts: true };
    c.data.can = { viewAll };
    c.data.people = [{ id: "peter", role: "hod", uplineId: null }, { id: "anthony", role: "tl", uplineId: "peter" }, { id: "kris", role: "tl", uplineId: null }];
    return c as unknown as PanelCtx;
  };
  it("on: a leader also hears of their own people's chats — ANTHONY's for PETER, not KRIS's", () => {
    const keys = panelNotifs(withTeam("peter", false)).map(n => n.customerId);
    expect(keys).toEqual(expect.arrayContaining(["toAnthony", "waitsAnthony", "toPeter", "waitsPeter"]));
  });
  it("on: View at All hears of everybody's, as the Team inbox shows them", () => {
    expect(panelNotifs(withTeam("kris", true)).map(n => n.customerId)).toEqual(expect.arrayContaining(["toPeter", "waitsPeter", "toAnthony"]));
  });
});
