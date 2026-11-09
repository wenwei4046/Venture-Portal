/**
 * Blocked on Facebook (the owner, 2026-11-08: "若我在 fb 已经 block 了这个人，对话框写 block, 并放到 block 分类里"): a
 * Messenger customer listed in CrmData.messengerBlocked is in the Blocked category and in no other — Mine's chips, the
 * Team inbox's columns, the desktop's tabs, after Cold leads — and every chat says "Blocked on Facebook" with no composer.
 */
import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmData } from "@/lib/member/crm-data";
import { FB_BLOCKED, FB_BLOCKED_NOTE, isFbBlocked } from "./fb-blocked";
import { inboxVM as salesInbox } from "../sales/vm/inbox";
import { inboxVM as panelInbox } from "../panel/vm/inbox";
import { inboxVM as deskInbox } from "../desk/vm/inbox";
import { chatStripOf, type SalesCtx } from "../sales/vm/common";
import { composerVM, initialComposer, type ComposerDom, type ComposerIn } from "../sales/vm/composer";
import type { PanelCtx } from "../panel/vm/common";
import type { DeskCtx } from "../desk/vm/ctx";

const now = new Date("2026-11-08T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
/** A customer whose last message is theirs, `h` hours ago, never answered: New and (from 3 h) Attention. */
const cust = (id: string, channel: "messenger" | "whatsapp", h: number) => ({
  id, name: id.toUpperCase(), phone: "", channel, status: "new", ad: "Ad", assignedTo: "me", teamId: null, assignedAt: null,
  createdAt: ago(h), lastCustomerAt: ago(h), unread: 1, details: {},
  messages: [{ id: `${id}-m`, from: "lead", kind: "text", text: "hi", at: ago(h) }],
}) as unknown as CrmCustomer;

const blocked = cust("blk", "messenger", 5);   // would be New and Attention
const waiting = cust("wait", "messenger", 5);  // New and Attention
const cold = cust("cold", "whatsapp", 30);     // WhatsApp past 24 h: Cold leads
const customers = [blocked, waiting, cold];
const data = {
  customers, messengerBlocked: ["blk"], prefs: {}, labels: [], customerLabels: {}, visits: [], people: [], can: { manage: false },
} as unknown as CrmData;

const salesCtx = (filter: { type: string; v: string } | null) => ({
  data, now, mine: customers, owner: { id: "me", role: "rs" }, me: { id: "me", role: "rs" }, viewingOther: false, embedded: null,
  ui: { filter, adSel: [], adSheet: null, q: "", swipe: null, swipeR: null, moreLead: null, moreView: "main", labelForm: null },
  set: () => {}, patch: () => {}, refs: {}, act: {}, nameOf: () => "",
}) as unknown as SalesCtx;

describe("isFbBlocked", () => {
  it("is the customer's id in CrmData.messengerBlocked", () => {
    expect(isFbBlocked(blocked, data)).toBe(true);
    expect(isFbBlocked(waiting, data)).toBe(false);
  });
  it("is nobody before the database has the column", () => {
    expect(isFbBlocked(blocked, { messengerBlocked: undefined })).toBe(false);
    expect(isFbBlocked(blocked, { messengerBlocked: [] })).toBe(false);
  });
});

describe("a blocked chat lands only in Blocked", () => {
  it("Mine: a Blocked chip after Cold leads, and the chat in it alone", () => {
    const chips = salesInbox(salesCtx(null)).chips3b;
    const labels = chips.map(c => c.label);
    expect(labels.indexOf("Blocked")).toBe(labels.indexOf("Cold leads") + 1);
    const n = Object.fromEntries(chips.map(c => [c.label, c.n]));
    expect(n).toMatchObject({ All: 1, New: 1, Attention: 1, "Cold leads": 1, Blocked: 1 });
    const names = (f: { type: string; v: string } | null) => salesInbox(salesCtx(f)).leadsView.map(r => r.name);
    expect(names({ type: "blocked", v: "Blocked" })).toEqual(["BLK"]);
    expect(names(null)).not.toContain("BLK");
    expect(names({ type: "new", v: "New" })).toEqual(["WAIT"]);
    expect(names({ type: "urgency", v: "Attention" })).toEqual(["WAIT"]);
    expect(names({ type: "cold", v: "Cold leads" })).toEqual(["COLD"]);
  });

  it("Team: a Blocked column after Cold leads, the card saying so", () => {
    const ctx = {
      data, now, me: { id: "p", role: "boss" }, directors: [], teams: [], teamOfStaff: () => null, nameOf: () => "ME",
      ui: { tab: "inbox", lead: null, inbTeam: "", inbWho: "", inbCol: 0 }, set: () => {}, patch: () => {},
    } as unknown as PanelCtx;
    const cols = panelInbox(ctx).inbCols;
    expect(cols.map(c => c.title).slice(-2)).toEqual(["Cold leads", "Blocked"]);
    const of = Object.fromEntries(cols.map(c => [c.title, c.rows.map(r => r.name)]));
    expect(of.Blocked).toEqual(["BLK"]);
    for (const [t, rows] of Object.entries(of)) if (t !== "Blocked" && t !== "All") expect(rows).not.toContain("BLK");
    expect(of.All).toHaveLength(3); // All lists every chat, Blocked included (2026-11-09).
    expect(of.Blocked.length + of.New.length + of["Cold leads"].length).toBe(3);
    expect(cols.find(c => c.title === "Blocked")!.rows[0].state).toBe(FB_BLOCKED);
    expect(cols.find(c => c.title === "Blocked")!.rows[0].needs).toBe(false);
  });

  it("Desktop: a Blocked tab after Cold leads, counted alone", () => {
    const ctx = {
      data, now, me: { id: "p", role: "boss" }, directors: [], teams: [], W: 1440, nameOf: () => "ME",
      ui: { tab: "inbox", whoSel: [], inbF: "All", ibQ: "", ibLabel: null, pane: "docked", chat: null },
      set: () => {}, patch: () => {},
    } as unknown as DeskCtx;
    const tabs = deskInbox(ctx).list4.tabs;
    const labels = tabs.map(t => t.label);
    expect(labels.indexOf("Blocked")).toBe(labels.indexOf("Cold leads") + 1);
    const n = Object.fromEntries(tabs.map(t => [t.label, t.count]));
    expect(n).toMatchObject({ All: 3, New: 1, Attention: 1, "Cold leads": 1, Blocked: 1 });
    const rows = deskInbox({ ...ctx, ui: { ...ctx.ui, inbF: "Blocked" } } as DeskCtx).list4.rows;
    expect(rows.map(r => r.name)).toEqual(["BLK"]);
    expect(rows[0].note).toBe(FB_BLOCKED);
  });
});

describe("a blocked chat says so and offers no composer", () => {
  it("the strip says Blocked on Facebook in place of the wait and the window", () => {
    expect(chatStripOf(blocked, now, true)).toEqual({ cold: true, left: FB_BLOCKED, right: "", dot: "var(--crm-faint-2)" });
    expect(chatStripOf(waiting, now).left).toMatch(/^Attention/);
  });
  it("the composer is the cold card, titled Blocked on Facebook, with no template button", () => {
    const dom = { shown: null, taH: 22, taRef: null, panelH: 280 } as unknown as ComposerDom;
    const vm = (blockedChat: boolean) => composerVM({
      key: "c", state: initialComposer(), set: () => {}, placeholder: "", draft: "", setDraft: () => {}, canSend: false, send: () => {},
      warm: !blockedChat, blocked: blockedChat, openTpl: () => {}, tplOn: true, coldSub: "x", recents: [], saveRecents: () => {},
    } as unknown as ComposerIn, dom);
    const b = vm(true);
    expect(b).toMatchObject({ isA: false, chatCold: true, coldTitle: FB_BLOCKED, tplOn: false });
    expect(vm(false)).toMatchObject({ isA: true, chatCold: false });
    expect(FB_BLOCKED_NOTE).toBe("Blocked on Facebook — they can't receive messages");
  });
});
