/**
 * Status › Unread on the phone (the owner, 2026-11-27, the phone's Filter chats beside the desktop's Status with Unread
 * circled: "in phone view, it should have unread status pick as well"). The desktop's rule since 2026-11-16 — the chats
 * with the red count (crm_contacts.unread) or marked unread (one's own mark) — now on the Team inbox's Filter chats sheet
 * (first among the statuses, a narrowing: alone every unread chat, with statuses the unread ones among them) and on Mine's
 * chip row (after All; MINE AND TEAM SHOW THE SAME CATEGORIES). The same data gives the same count on all three.
 */
import { describe, expect, it } from "vitest";
import type { CrmCustomer, CrmData } from "@/lib/member/crm-data";
import { inboxVM as salesInbox } from "../sales/vm/inbox";
import { inboxVM as panelInbox, UNREAD_PICK } from "../panel/vm/inbox";
import { inboxVM as deskInbox, UNREAD } from "../desk/vm/inbox";
import type { SalesCtx } from "../sales/vm/common";
import type { PanelCtx } from "../panel/vm/common";
import type { PanelUi } from "../panel/ui";
import type { DeskCtx } from "../desk/vm/ctx";

const now = new Date("2026-11-27T04:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
type Msg = ["lead" | "me", number];
/** A WhatsApp customer of "me": its messages (who, hours ago), its status, its unread count. */
const cust = (id: string, status: string, unread: number, msgs: Msg[]) => ({
  id, name: id.toUpperCase(), phone: "", channel: "whatsapp", status, ad: "Ad", assignedTo: "me", teamId: null, assignedAt: null,
  createdAt: ago(msgs[0][1]), lastCustomerAt: ago(Math.min(...msgs.filter(m => m[0] === "lead").map(m => m[1]))), unread, details: {},
  messages: msgs.map(([from, h], i) => ({ id: `${id}-${i}`, from, kind: "text", text: from === "lead" ? "hi" : "hello", at: ago(h) })),
}) as unknown as CrmCustomer;

const customers = [
  cust("aisha", "new", 2, [["lead", 1]]),                                  // New, unread
  cust("ben", "follow_up", 1, [["lead", 10], ["me", 9], ["lead", 1]]),       // Follow up, unread
  cust("chen", "follow_up", 0, [["lead", 10], ["me", 9], ["lead", 8], ["me", 7]]), // Follow up, read
  cust("dev", "follow_up", 1, [["lead", 40], ["me", 39], ["lead", 30]]),     // Cold leads (WhatsApp past 24 h), unread
  cust("eva", "won", 0, [["lead", 20], ["me", 19], ["lead", 6], ["me", 5]]), // Won, read — but marked unread
  cust("fay", "lost", 0, [["lead", 20], ["me", 19], ["lead", 12], ["me", 11]]), // Lost, read
];
const UNREAD_IDS = ["aisha", "ben", "dev", "eva"];
const pref = { pinned: false, muted: false, hidden: false, blocked: false, pinnedMessageId: null };
const dataOf = (cs: CrmCustomer[]) => ({
  customers: cs, prefs: { eva: { ...pref, markedUnread: true }, chen: { ...pref } }, messengerBlocked: [], labels: [], customerLabels: {}, visits: [], people: [], can: { manage: false },
}) as unknown as CrmData;
const data = dataOf(customers);
const sorted = (a: string[]) => [...a].sort();

/** The Team inbox with its ui kept here, so the sheet's picks and Show N chats act as on the phone. */
function team(d = data) {
  let ui = { tab: "inbox", lead: null, inbTeam: "", inbWho: "", inbCol: 0, inbQ: "" } as unknown as PanelUi;
  const set = (f: PanelUi | ((u: PanelUi) => PanelUi)) => { ui = typeof f === "function" ? f(ui) : f; };
  const vm = () => panelInbox({ data: d, now, me: { id: "p", role: "boss" }, directors: [], teams: [], teamOfStaff: () => null, nameOf: () => "ME",
    ui, set, patch: (p: Partial<PanelUi>) => { ui = { ...ui, ...p }; } } as unknown as PanelCtx).t2;
  return { vm, ui: () => ui };
}
const ids = (cards: { id: string }[]) => sorted(cards.map(c => c.id));

describe("the Team inbox's Filter chats › Status › Unread", () => {
  it("is offered first, its count every unread chat (one marked unread too), in the hot colour", () => {
    const t = team();
    t.vm().openStatus();
    const s = t.vm().sheet!;
    expect(s.statuses.map(x => x.label)).toEqual(["Unread", "New", "Attention", "Follow up", "Appointment", "Won", "Lost", "Cold leads", "Blocked", "Replied", "No reply"]); // + Replied / No reply after our template (2026-11-28)
    expect(s.statuses[0]).toMatchObject({ key: UNREAD_PICK, n: UNREAD_IDS.length, hot: true, dot: "var(--crm-rust)", on: false });
    // The statuses still count as before: every chat in one.
    expect(s.statuses.slice(1, -2).reduce((n, x) => n + x.n, 0)).toBe(customers.length);
  });

  it("alone keeps every unread chat, each card saying its status; Show N chats, the tag and the Status button follow it", () => {
    const t = team();
    t.vm().openStatus();
    t.vm().sheet!.statuses[0].toggle();
    expect(t.vm().sheet!.statuses[0].on).toBe(true);
    expect(t.vm().sheet!.applyLabel).toBe(`Show ${UNREAD_IDS.length} chats`);
    t.vm().sheet!.apply();
    const v = t.vm();
    expect(v.sheet).toBeNull();
    expect(ids(v.cards)).toEqual(sorted(UNREAD_IDS));
    expect(v.count).toBe(`${UNREAD_IDS.length} chats`);
    expect(v.of).toBe(`of ${customers.length}`);
    expect(v.statusN).toBe(1);
    expect(v.tags).toEqual([expect.objectContaining({ key: `st:${UNREAD_PICK}`, label: "Unread", dot: "var(--crm-rust)", square: true })]);
    // Several statuses in view, so each card says its own.
    expect(v.cards.every(c => c.stShow)).toBe(true);
    expect(Object.fromEntries(v.cards.map(c => [c.id, c.st]))).toEqual({ aisha: "New", ben: "Follow up", dev: "Cold leads", eva: "Won" });
  });

  it("with statuses keeps only their unread chats (Unread + Follow up = the unread Follow-up chats), and the tag takes it off", () => {
    const t = team();
    t.vm().openStatus();
    const s = t.vm().sheet!;
    s.statuses.find(x => x.label === "Unread")!.toggle();
    t.vm().sheet!.statuses.find(x => x.label === "Follow up")!.toggle();
    expect(t.vm().sheet!.applyLabel).toBe("Show 1 chat");
    t.vm().sheet!.apply();
    expect(ids(t.vm().cards)).toEqual(["ben"]);
    expect(t.vm().statusN).toBe(2);
    // One status in view: the card does not repeat it (its tag says Follow up).
    expect(t.vm().cards[0].stShow).toBe(false);
    // Unread + Cold leads + Won: the statuses still OR among themselves.
    t.vm().openStatus();
    t.vm().sheet!.statuses.find(x => x.label === "Follow up")!.toggle();
    t.vm().sheet!.statuses.find(x => x.label === "Cold leads")!.toggle();
    t.vm().sheet!.statuses.find(x => x.label === "Won")!.toggle();
    t.vm().sheet!.apply();
    expect(ids(t.vm().cards)).toEqual(["dev", "eva"]);
    // Removing Unread's tag leaves the two statuses, read chats and all.
    t.vm().tags.find(g => g.label === "Unread")!.remove();
    expect(t.ui().inbSt).toEqual(["cold", "won"]);
    expect(ids(t.vm().cards)).toEqual(["dev", "eva"]);
    t.vm().clearAll();
    expect(t.vm().count).toBe(`${customers.length} chats`);
  });

  it("a chat one marked unread shows the badge as a dot and reads as unread; a read one does not", () => {
    const cards = Object.fromEntries(team().vm().cards.map(c => [c.id, c]));
    expect(cards.eva).toMatchObject({ unread: "\u00a0", nameW: 600, whenC: "var(--crm-rust)" });
    expect(cards.ben).toMatchObject({ unread: "1", nameW: 600 });
    expect(cards.chen).toMatchObject({ unread: "", nameW: 500, whenC: "var(--crm-faint)" });
  });

  it("nothing unread: Unread counts 0 and Show 0 chats", () => {
    const quiet = dataOf(customers.map(c => ({ ...c, unread: 0 })));
    (quiet.prefs as Record<string, { markedUnread?: boolean }>).eva.markedUnread = false;
    const t = team(quiet);
    t.vm().openStatus();
    t.vm().sheet!.statuses[0].toggle();
    expect(t.vm().sheet!.statuses[0].n).toBe(0);
    expect(t.vm().sheet!.applyLabel).toBe("Show 0 chats");
    t.vm().sheet!.apply();
    expect(t.vm().empty).toBe(true);
  });
});

const salesCtx = (filter: { type: string; v: string } | null, d = data) => ({
  data: d, now, mine: d.customers, owner: { id: "me", role: "rs" }, me: { id: "me", role: "rs" }, viewingOther: false, embedded: null,
  ui: { filter, adSel: [], adSheet: null, q: "", swipe: null, swipeR: null, moreLead: null, moreView: "main", labelForm: null },
  set: () => {}, patch: () => {}, refs: {}, act: {}, nameOf: () => "",
}) as unknown as SalesCtx;

describe("Mine's chip row › Unread", () => {
  it("sits right after All with its count, in the hot colour as Attention's", () => {
    const chips = salesInbox(salesCtx(null)).chips3b;
    expect(chips.map(c => c.label)).toEqual(["All", "Unread", "New", "Attention", "Follow up", "Appointment", "Won", "Lost", "Cold leads", "Blocked", "Replied"]); // + Replied once a chat answered our first message (2026-11-28)
    const n = Object.fromEntries(chips.map(c => [c.label, c.n]));
    // All is the warm chats (Cold leads and Blocked have their own chips); Unread is every unread one, the cold one too.
    expect(n).toMatchObject({ All: customers.length - 1, Unread: UNREAD_IDS.length });
    expect(chips.filter(c => c.hot).map(c => c.label)).toEqual(["Unread", "Attention"]);
  });

  it("picked, shows every unread chat — a cold one and one marked unread too — and is the chip lit", () => {
    const v = salesInbox(salesCtx({ type: "unread", v: "Unread" }));
    expect(sorted(v.leadsView.map(r => r.name))).toEqual(sorted(UNREAD_IDS.map(x => x.toUpperCase())));
    expect(v.chips3b.find(c => c.label === "Unread")!.on).toBe(true);
    expect(v.chips3b.find(c => c.label === "All")!.on).toBe(false);
    expect(v.empty4).toBeNull();
  });

  it("with nothing unread says so, and offers every chat again", () => {
    const quiet = dataOf(customers.map(c => ({ ...c, unread: 0 })));
    (quiet.prefs as Record<string, { markedUnread?: boolean }>).eva.markedUnread = false;
    const v = salesInbox(salesCtx({ type: "unread", v: "Unread" }, quiet));
    expect(v.leadsView).toEqual([]);
    expect(v.empty4).toMatchObject({ icon: "mail-open", title: "No unread chats" });
    expect(typeof v.empty4!.all).toBe("function");
  });
});

describe("one Unread on every screen", () => {
  it("the desktop's Status › Unread counts and lists the same chats as the phone's", () => {
    const ctx = {
      data, now, me: { id: "p", role: "boss" }, directors: [], teams: [], W: 1440, nameOf: () => "ME",
      ui: { tab: "inbox", whoSel: [], inbF: "All", ibQ: "", ibLabel: null, pane: "docked", chat: null },
      set: () => {}, patch: () => {},
    } as unknown as DeskCtx;
    const desk = deskInbox(ctx).list4.filter.statuses[0];
    expect(desk).toMatchObject({ label: UNREAD, n: UNREAD_IDS.length });
    const deskRows = deskInbox({ ...ctx, ui: { ...ctx.ui, inbF: UNREAD } } as DeskCtx).list4.rows;
    expect(sorted(deskRows.map(r => r.id))).toEqual(sorted(UNREAD_IDS));
    const t = team();
    t.vm().openStatus();
    expect(t.vm().sheet!.statuses[0].n).toBe(desk.n);
    expect(salesInbox(salesCtx(null)).chips3b.find(c => c.label === "Unread")!.n).toBe(desk.n);
  });
});
