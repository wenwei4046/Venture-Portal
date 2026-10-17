import { beforeEach, describe, expect, it, vi } from "vitest";
import { crmDemoData } from "@/lib/member/crm-demo-data";
import type { CrmData } from "@/lib/member/crm-data";

// Only the owner reads a chat (the owner, 2026-10-17: "如果是在 Team 那边，我点进去任意的 chat 都不应该标记为已读 … 如果我在
// Team 那边点进我自己的 chat，它要能变成已读"): readChat — what Mine, Team and the desktop call once a chat's newest
// message is on screen — clears one's own chat's unread and tells the database; anybody else's it leaves.
const net = vi.hoisted(() => ({ crmWrite: vi.fn(async () => ({ ok: true as const, data: null })) }));
vi.mock("@/app/(member)/member/crm-actions", () => ({ crmWrite: net.crmWrite }));

import { makeSalesActions } from "./actions";

function setup() {
  const base = crmDemoData("You");
  const me = base.viewerId ?? "a1";
  let data: CrmData = {
    ...base,
    customers: base.customers.map((c, i) => (i === 0 ? { ...c, assignedTo: me, unread: 3 } : i === 1 ? { ...c, assignedTo: "someone-else", unread: 2 } : i === 2 ? { ...c, assignedTo: me, unread: 0 } : c)),
  };
  const setData = vi.fn((f: CrmData | ((d: CrmData) => CrmData)) => { data = typeof f === "function" ? f(data) : f; });
  const act = makeSalesActions({ live: true, me, data: () => data, setData, toast: vi.fn() });
  const [own, other, read] = data.customers;
  return { act, own: own.id, other: other.id, read: read.id, unread: (id: string) => data.customers.find(c => c.id === id)!.unread, setData };
}

beforeEach(() => { net.crmWrite.mockClear(); });

describe("reading a chat", () => {
  it("one's own: its unread clears on screen and in the database", () => {
    const s = setup();
    s.act.readChat(s.own);
    expect(s.unread(s.own)).toBe(0);
    expect(net.crmWrite).toHaveBeenCalledWith("crm_mark_read", { p_contact: s.own });
  });
  it("anybody else's — a downline's, on the Team side: left unread, nothing sent", () => {
    const s = setup();
    s.act.readChat(s.other);
    expect(s.unread(s.other)).toBe(2);
    expect(net.crmWrite).not.toHaveBeenCalled();
    expect(s.setData).not.toHaveBeenCalled();
  });
  it("nothing unread: nothing sent", () => {
    const s = setup();
    s.act.readChat(s.read);
    expect(net.crmWrite).not.toHaveBeenCalled();
  });
  it("opening one's own chat still reads it", () => {
    const s = setup();
    s.act.openChat(s.own);
    expect(s.unread(s.own)).toBe(0);
    expect(net.crmWrite).toHaveBeenCalledWith("crm_mark_read", { p_contact: s.own });
  });
});
