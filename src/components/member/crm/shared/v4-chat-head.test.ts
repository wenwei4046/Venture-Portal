/**
 * CRM redesign v4 (docs/design_handoff_crm_redesign_v4): notes/12 (a Messenger send refused past the window is drawn as
 * sent, and the strip says only the status, until Human Agent), notes/15 (the chat's ⋮ › Label — the Inbox's label logic,
 * one code path), notes/24 §3 (the desktop chat's ⋮ = the phone's items + Block NAME), §4 (short dates), §5 (one
 * audit-log format: oldest first, a dot by the kind of change).
 */
import { describe, expect, it, vi } from "vitest";
import type { CrmChatMessage, CrmCustomer, CrmData, CrmPerson } from "@/lib/member/crm-data";
import { shownStatus, quietFailure } from "../sales/vm/chat";
import { chatStripOf } from "../sales/vm/common";
import { labelSheetVM, labelSub } from "./label-sheet";
import { deskChatMenu } from "../desk/vm/chat-menu";
import { chatMenuVM } from "../desk/vm/inbox";
import { auditLines, auditTone } from "../desk/vm/audit";
import { shortDateOf } from "../desk/vm/app";
import type { DeskCtx } from "../desk/vm/ctx";

const now = new Date("2026-11-10T04:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const WINDOW = "More than 24 hours since the customer’s last message — Messenger allows no message from the Page.";
const msg = (status: string, error: string | null = null) => ({ id: "m", from: "me", text: "hi", at: ago(1), status, error }) as unknown as CrmChatMessage;
const cust = (channel: "messenger" | "whatsapp", lastH: number, extra: Partial<CrmCustomer> = {}) => ({
  id: "c1", name: "Daniel Lim", phone: "", channel, status: "follow_up", ad: "Ad", assignedTo: "me", teamId: null, createdAt: "2026-11-08T05:34:00Z",
  lastCustomerAt: ago(lastH), unread: 0, details: {}, messages: [{ id: "x", from: "lead", text: "hi", at: ago(lastH) }], ...extra,
}) as unknown as CrmCustomer;

describe("notes/12 · a Messenger failure past the window looks sent until Human Agent", () => {
  it("draws the quiet failure as sent — its tick — and every other failure as failed", () => {
    expect(quietFailure("failed", WINDOW, false)).toBe(true);
    expect(shownStatus(msg("failed", WINDOW), false)).toBe("sent");
    expect(shownStatus(msg("failed", WINDOW), true)).toBe("failed");
    expect(shownStatus(msg("failed", "131053 could not open"), false)).toBe("failed");
    expect(shownStatus(msg("read"), false)).toBe("read");
  });
  it("the strip says only the status for a Messenger chat — no window — until Human Agent; WhatsApp's keeps it", () => {
    expect(chatStripOf(cust("messenger", 30), now, false, false).right).toBe("");
    expect(chatStripOf(cust("messenger", 5), now, false, false).right).toBe("");
    expect(chatStripOf(cust("messenger", 5), now, false, true).right).toBe("Reply window · 19 h left");
    expect(chatStripOf(cust("whatsapp", 5), now, false, false).right).toBe("Reply window · 19 h left");
    expect(chatStripOf(cust("whatsapp", 30), now, false, false).right).toBe("Window closed");
  });
});

describe("notes/15 · the Label sheet is one code path", () => {
  const labels = [{ id: "l1", name: "Hot lead", color: "#BD4A19" }, { id: "l2", name: "VIP", color: "#6F402C" }];
  const data = { labels, customerLabels: { c1: ["l2", "l1"] } } as unknown as CrmData;
  it("names the chat's labels in the ⋮ menu, or offers to add one", () => {
    expect(labelSub(data, "c1")).toBe("VIP · Hot lead");
    expect(labelSub(data, "c2")).toBe("Add a label");
  });
  it("ticks put a label on or take it off at once; the pencil and New label open the form; Save keeps the list", async () => {
    const act = { setLabel: vi.fn(async () => {}), saveLabels: vi.fn(async () => labels) };
    const put = vi.fn();
    const vm = labelSheetVM({ data, act, customerId: "c1", form: null, put });
    expect(vm.labelItems.map(l => [l.label, l.on])).toEqual([["Hot lead", true], ["VIP", true]]);
    await vm.labelItems[0].go();
    expect(act.setLabel).toHaveBeenCalledWith("c1", "l1", false);
    vm.labelItems[1].edit({ stopPropagation: () => {} } as never);
    expect(put).toHaveBeenLastCalledWith({ view: "labelEdit", form: { key: "l2", name: "VIP", color: "#6F402C" } });
    const form = labelSheetVM({ data, act, customerId: "c1", form: { key: null, name: "Price check", color: "#FFA91F" }, put });
    await form.labelSave?.();
    expect(act.saveLabels).toHaveBeenCalledWith([...labels.map(l => ({ id: l.id, name: l.name, color: l.color })), { id: null, name: "Price check", color: "#FFA91F" }]);
    expect(put).toHaveBeenLastCalledWith({ view: "labels", form: null });
    expect(labelSheetVM({ data, act, customerId: "c1", form: { key: null, name: "vip", color: "#FFA91F" }, put }).labelSave).toBeUndefined();
  });
  it("before one's own list is saved, a tick saves the design's four first", async () => {
    const empty = { labels: [], customerLabels: {} } as unknown as CrmData;
    const act = { setLabel: vi.fn(async () => {}), saveLabels: vi.fn(async () => [{ id: "n1", name: "Hot lead", color: "#BD4A19" }]) };
    const vm = labelSheetVM({ data: empty, act, customerId: "c1", form: null, put: () => {} });
    await vm.labelItems.find(l => l.label === "Hot lead")!.go();
    expect(act.saveLabels).toHaveBeenCalledTimes(1);
    expect(act.setLabel).toHaveBeenCalledWith("c1", "n1", true);
  });
});

describe("notes/24 §3 · the desktop chat's ⋮ is the phone's + Block", () => {
  const P = (id: string, role: CrmPerson["role"], uplineId: string | null) => ({ id, name: id.toUpperCase(), role, uplineId, fullTime: false, title: "" }) as CrmPerson;
  const ctxOf = (me: CrmPerson, manage: boolean) => {
    const act = { setPref: vi.fn(async () => {}), invite: vi.fn() };
    const patch = vi.fn();
    const people = [P("boss", "boss", null), P("peter", "hod", "boss"), P("ben", "rs", "peter")];
    const data = { people, customers: [cust("whatsapp", 2, { assignedTo: me.id })], labels: [], customerLabels: {}, shares: [], invites: [], prefs: {},
      can: { viewAll: manage, editOwn: true, editAll: manage, manage } } as unknown as CrmData;
    return { ctx: { data, me, act, patch, set: vi.fn(), teams: [], directors: [], nameOf: () => "", ui: { chat: "c1", kind: "chat" } } as unknown as DeskCtx, act, patch };
  };
  it("lists Assign to (if allowed) · Share · Move (if allowed) · Customer info · Appointment · Label, a divider, Block NAME", () => {
    const { ctx } = ctxOf(P("ben", "rs", "peter"), false);
    const items = chatMenuVM(ctx, { starCount: 0, starredOpen: () => {} }).chatMenuItems;
    expect(items.map(i => i.label)).toEqual(["Share", "Move", "Customer info", "Appointment", "Label", "Block Daniel Lim"]);
    expect(items.map(i => i.sub)).toEqual(["Invite a teammate", "Hand over to PETER", null, null, "Add a label", null]);
    expect(items.filter(i => i.sep).map(i => i.label)).toEqual(["Block Daniel Lim"]);
    expect(items.at(-1)).toMatchObject({ danger: true, fg: "var(--crm-oxblood)" });
    const mgr = chatMenuVM(ctxOf(P("peter", "hod", "boss"), true).ctx, { starCount: 0, starredOpen: () => {} }).chatMenuItems;
    expect(mgr[0]).toMatchObject({ label: "Assign to", sub: "Give this customer to anyone" });
  });
  it("Block is the Inbox's More › Block; Label opens the Label sheet", async () => {
    const { ctx, act, patch } = ctxOf(P("ben", "rs", "peter"), false);
    const items = deskChatMenu(ctx, ctx.data.customers[0], { assign: false, assignSub: "", move: false, moveSub: "" });
    items.find(i => i.label === "Label")!.run();
    expect(patch).toHaveBeenLastCalledWith({ menu: false, labPop: { view: "labels", form: null } });
    items.at(-1)!.run();
    expect(act.setPref).toHaveBeenCalledWith("c1", { blocked: true, hidden: true });
    await Promise.resolve(); await Promise.resolve();
    expect(patch).toHaveBeenLastCalledWith({ chat: null, toast: "Daniel Lim blocked · removed from your Inbox" });
  });
});

describe("notes/24 §4–§5 · Customer info's short dates and one audit-log format", () => {
  it("First contact and Last chat read as a day and a month", () => {
    expect(shortDateOf(cust("messenger", 2), "first")).toMatch(/^8 Nov, /);
    expect(shortDateOf(cust("messenger", 2), "ads")).toBeNull();
  });
  it("Settings › Audit log: oldest first (the newest at the bottom), before → after, a dot by the kind of change", () => {
    const rows = [
      { cat: "chat" as const, at: "2026-11-09T07:20:00Z", who: "PETER", action: "Appointment cancelled", target: "Daniel Lim", detail: "Puchong" },
      { cat: "chat" as const, at: "2026-11-08T00:40:00Z", who: "AINA", action: "Lead reassigned", target: "Daniel Lim → CYRUS", detail: "Ad" },
    ];
    const lines = auditLines(rows);
    expect(lines.map(l => [l.date, l.time, l.title, l.tone])).toEqual([
      ["8 Nov", "8:40", "Lead reassigned · Daniel Lim", "ink"],
      ["9 Nov", "15:20", "Appointment cancelled · Daniel Lim", "oxblood"],
    ]);
    expect(lines[0].detail).toBe("CYRUS · AINA · Inbox");
    expect([auditTone("Appointment booked"), auditTone("Marked as won"), auditTone("Marked as lost"), auditTone("Work type changed")]).toEqual(["green", "green", "oxblood", "ink"]);
  });
});
