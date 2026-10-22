/**
 * Inbox (design 1a): every member's chats on one status board — New · Needs a
 * reply · Follow up · Appointment · Won · Lost — filtered by team (Director,
 * each team) and then by member. A chat opens in its owner's own CRM, where
 * the Principal / Director can answer. Contacts is the same people A–Z.
 */
import type { ChangeEvent, MouseEvent, PointerEvent } from "react";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { STATUS_LABEL, isCold, lastChat, lastReal, urgencyOf } from "../../sales/vm/common";
import { phoneLabel, telHref } from "../../sales/vm/customer";
import { first, ini, NO_SEAT, seatOf, type PanelCtx } from "./common";

const UC = { urgent: "var(--crm-brown)", soon: "var(--crm-muted)", overdue: "var(--crm-oxblood)", none: "var(--crm-muted)" } as const;

/**
 * A card's long press, or a swipe to the left, opens Send to — assigning that customer (user 2026-10-13: "咨詢名單進來，按
 * 久久跳出功能鍵（可assign）, inbox的咨詢左滑也能assign"). Only for whoever may assign (CRM · Manage). One gesture at a
 * time, held here; the tap that ends a gesture does not also open the chat.
 */
const g: { x: number; y: number; t?: ReturnType<typeof setTimeout>; done?: number } = { x: 0, y: 0 };
function gestures(ctx: PanelCtx, c: CrmCustomer) {
  if (!ctx.data.can.manage) return { down: undefined, move: undefined, up: undefined, cancel: undefined, guard: undefined, noMenu: undefined };
  const assign = () => { clearTimeout(g.t); g.done = Date.now(); navigator.vibrate?.(10); ctx.patch({ sendFor: c.id, sdSel: null }); };
  return {
    down: (e: PointerEvent<HTMLElement>) => { g.x = e.clientX; g.y = e.clientY; g.done = undefined; clearTimeout(g.t); g.t = setTimeout(assign, 500); },
    move: (e: PointerEvent<HTMLElement>) => {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearTimeout(g.t);
      if (!g.done && dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) assign();
    },
    up: () => clearTimeout(g.t),
    cancel: () => clearTimeout(g.t),
    guard: (e: MouseEvent<HTMLElement>) => { if (g.done && Date.now() - g.done < 600) { e.stopPropagation(); e.preventDefault(); } },
    noMenu: (e: MouseEvent<HTMLElement>) => e.preventDefault(),
  };
}

/** One chat as the panel lists it: who has it, its state, its last line. */
function chatRow(ctx: PanelCtx, c: CrmCustomer) {
  const { now, nameOf } = ctx, u = urgencyOf(c, now), seat = (c.assignedTo ? seatOf(ctx, c.assignedTo) : c.teamId ? seatOf(ctx, c.teamId) : null) ?? NO_SEAT;
  const last = lastReal(c), needs = u.level !== "none";
  const state = needs ? u.label : STATUS_LABEL[c.status];
  return {
    c, seat, needs, name: c.name, ini: ini(c.name), ad: c.ad, state, uc: UC[u.level],
    // 4a (T02): the customer's tint; a lead waiting for a team in oxblood.
    avBg: avatarTint(c.name)[0], avFg: avatarTint(c.name)[1], toAssign: !c.assignedTo,
    who: c.assignedTo ? nameOf(c.assignedTo) : `${seat.name || "Team"} · to assign`, wc: seat.c, ownBg: seat.own,
    preview: last ? (last.from === "me" ? "You: " : "") + (last.text || mediaWord(last)) : "", at: last ? lastChat(last.at, now) : "",
    // Its unread messages on the card, so the Inbox badge's number can be found (the owner, 2026-10-14: "inbox 2 是誰？").
    unread: c.unread ? String(c.unread) : "",
    stBg: u.level === "overdue" ? "var(--crm-tint-attention)" : u.level === "urgent" ? "var(--crm-tint-appt)" : u.level === "soon" ? "var(--crm-field)" : "transparent", hasSt: !!state,
    // rev 1011 §1.1: a chat opens here, as the Principal / Director, whoever has it (as Calendar and Awaiting reply do);
    // acting as a salesperson is Profile › View as only.
    open: () => ctx.patch({ lead: c.id, pick: "", toast: "" }),
    ...gestures(ctx, c),
  };
}

export { isNewChat } from "../../shared/new-chat";
import { mediaWord } from "../../shared/chat-media";
import { isNewChat } from "../../shared/new-chat";
import { STATUS, avatarTint } from "../../shared/palette";

/** The chats the panel shows: everyone's, and those waiting in a team. Organic Leads are Assignment's. */
const listed = (ctx: PanelCtx) => ctx.data.customers.filter(c => c.assignedTo || c.teamId);

export function inboxVM(ctx: PanelCtx) {
  const { ui, set, me } = ctx;
  const all = listed(ctx).map(c => chatRow(ctx, c)).sort((a, b) => (lastReal(b.c)?.at ?? b.c.createdAt).localeCompare(lastReal(a.c)?.at ?? a.c.createdAt));
  const f = ui.inbTeam, who = ui.inbWho;
  const list = all.filter(r => (!f || r.seat.id === f) && (!who || r.c.assignedTo === who));
  // The Director's own customers are "Director" to the Principal; to the Director they are theirs (My CRM).
  const chipDefs: [string, string, string][] = [["", "All", "transparent"], ...(me.role === "hod" ? [] : ctx.directors.length ? [["hod", "Director", "var(--crm-brown)"] as [string, string, string]] : []), ...ctx.teams.map(t => [t.id, t.name, t.c] as [string, string, string])];
  const tSel = f && f !== "hod" ? ctx.teams.find(t => t.id === f) : null;
  const need = list.filter(r => r.needs);
  // The same categories as everybody's Mine inbox, in its order (the owner, 2026-10-14: "只要在 mine 有的，team 也要有"):
  // a Cold lead (the window shut, we wrote last) is its own column and nowhere else, as in Mine.
  const col = (r: typeof all[number]) => (isCold(r.c, ctx.now) ? "cold" : isNewChat(r.c) ? "new" : r.needs ? "need" : r.c.status === "appointment" ? "appt" : r.c.status === "won" ? "won" : r.c.status === "lost" ? "lost" : "fup");
  return {
    onInbox: ui.tab === "inbox" && !ui.lead,
    inbSummary: `${list.length} chats · ${need.length} need attention`,
    inbHasChips: chipDefs.length > 1,
    inbChips: chipDefs.map(([id, label, dot]) => ({ label, dot, on: f === id, n: all.filter(r => !id || r.seat.id === id).length,
      bg: f === id ? "var(--crm-rust)" : "#fff", fg: f === id ? "#fff" : "var(--crm-ink)", bd: f === id ? "var(--crm-rust)" : "var(--crm-rule)", pick: () => set(u => ({ ...u, inbTeam: id, inbWho: "" })) })),
    inbHasWho: !!tSel,
    inbWhoChips: tSel ? [["", "Everyone"], ...tSel.people.map(p => [p.id, first(p.name)])].map(([id, label]) => {
      const on = who === id;
      return { label, on, n: all.filter(r => r.seat.id === f && (!id || r.c.assignedTo === id)).length, bg: on ? "var(--crm-ink)" : "transparent", fg: on ? "#fff" : "var(--crm-muted)", bd: on ? "var(--crm-ink)" : "var(--crm-line)", pick: () => set(u => ({ ...u, inbWho: id })) };
    }) : [],
    inbCols: (([["new", "New"], ["need", "Attention"], ["fup", "Follow up"], ["appt", "Appointment"], ["won", "Won"], ["lost", "Lost"], ["cold", "Cold leads"]] as const).map(([k, t]) => [k, t, STATUS[t].dot, STATUS[t].tint] as const))
      .map(([k, title, c, bg], i) => { const rows = list.filter(r => col(r) === k); return { title, c, bg, n: rows.length, rows, empty: !rows.length, on: (ui.inbCol ?? 0) === i, hot: k === "need",
        // The chip above the board slides it to this column.
        jump: () => { set(u => ({ ...u, inbCol: i })); const b = document.querySelector<HTMLElement>("[data-inb-board]"), el = b?.children[i] as HTMLElement | undefined; if (b && el) b.scrollTo({ left: el.offsetLeft - b.offsetLeft - 20, behavior: "smooth" }); } }; }),
    openPc: () => set(u => ({ ...u, pcOpen: true })),
  };
}
export type InboxVM = ReturnType<typeof inboxVM>;

/** Contacts (from the Inbox): everyone's customers A–Z under letter heads; a row opens the chat in its owner's CRM. */
export function contactsVM(ctx: PanelCtx) {
  const { ui, set } = ctx, q = ui.pcQ.trim().toLowerCase();
  const rows = listed(ctx).map(c => chatRow(ctx, c)).filter(r => !q || r.name.toLowerCase().includes(q) || r.who.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  return {
    pcOpen: ui.pcOpen, pcQ: ui.pcQ, pcEmpty: !rows.length,
    closePc: () => set(u => ({ ...u, pcOpen: false, pcQ: "" })), setPcQ: (e: ChangeEvent<HTMLInputElement>) => { const v = e.target.value; set(u => ({ ...u, pcQ: v })); },
    pcRows: rows.map((r, k) => {
      const L = (r.name[0] ?? "#").toUpperCase(), prev = k ? (rows[k - 1].name[0] ?? "#").toUpperCase() : "";
      return { head: L !== prev ? L : "", hasHead: L !== prev, name: r.name, ini: r.ini, phone: phoneLabel(r.c.phone) || "—", tel: telHref(r.c.phone),
        status: r.needs ? "Follow up" : STATUS_LABEL[r.c.status], who: r.who, wc: r.wc, ownBg: r.ownBg, rule: L !== prev ? "0" : "1px solid var(--crm-rule-soft)",
        open: () => { set(u => ({ ...u, pcOpen: false })); r.open(); } };
    }),
  };
}
